import { getLLMProvider } from "./llms";
import type { LLMProvider } from "./llms";

/**
 * Interface for a Question-Answer pair
 */
export interface QAPair {
  question: string;
  answer: string;
}

/**
 * Gets an array of question/answer pairs for a given documentation entry
 *
 * @param entry The documentation entry path (e.g., 'docs/svelte/01-introduction/01-overview.md')
 * @param content The content of the documentation entry
 * @param count Optional number of QA pairs to generate (default: 5)
 * @returns An array of question/answer pairs
 */
export async function getQuestionsForEntry(
  entry: string,
  content: string,
  count: number = 5
): Promise<QAPair[]> {
  // Get the provider from environment variable or default to Anthropic
  const providerName = process.env.PROVIDER?.toLowerCase() || "anthropic";

  try {
    // Get the LLM provider
    const provider = await getLLMProvider(providerName);
    console.log(
      `🤖 Using ${
        provider.name
      } (${provider.getModelIdentifier()}) to generate questions for ${entry}`
    );

    // Generate question/answer pairs using the provider
    const qaText = await generateQAPairsWithProvider(
      provider,
      entry,
      content,
      count
    );

    // Parse the response
    return parseQAPairsFromText(qaText);
  } catch (error) {
    console.error(`Error generating questions for ${entry}:`, error);
    throw new Error(
      `Failed to generate QA pairs: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Generates question/answer pairs using the specified LLM provider
 *
 * @param provider The LLM provider to use
 * @param entry The documentation entry path
 * @param content The content of the documentation entry
 * @param count Number of QA pairs to generate
 * @returns The raw text response from the LLM
 */
async function generateQAPairsWithProvider(
  provider: LLMProvider,
  entry: string,
  content: string,
  count: number
): Promise<string> {
  const prompt = `
You are an expert in Svelte 5 and web development. Based on the following Svelte documentation, 
create ${count} question and answer pairs that would be useful for training an AI to answer 
questions about Svelte development. Each question should be challenging but answerable
from the provided documentation. Feel free to use large parts of the documentation and answer at length
with many code examples, however, you may ONLY use direct code examples from the documentation, you may NEVER invent
new code examples - this is crucial!

Use \`\`\`svelte code blocks to highlight code examples, and use \`\`\` to mark the end of the code block.

Focus on questions that:
- Cover key concepts from the documentation
- Include practical code examples where appropriate
- Vary in difficulty (some basic, some advanced)
- Demonstrate understanding of Svelte's reactivity, components, and other unique features

Documentation path: ${entry}

Documentation content:
${content}

Format your response as follows:

Q1: [Question text]
A1: [Detailed answer with code examples when relevant]

Q2: [Question text]
A2: [Detailed answer with code examples when relevant]

...and so on until Q${count}.
`;

  return await provider.generateResponse(prompt);
}

/**
 * Parses the QA pairs from the raw text response from the LLM
 *
 * @param text The raw text response from the LLM
 * @returns An array of question/answer pairs
 */
function parseQAPairsFromText(text: string): QAPair[] {
  const pairs: QAPair[] = [];

  // Split the text by Q1, Q2, etc. to get individual QA blocks
  const qaBlocks = text.split(/\nQ\d+:/);

  // Start from index 1 to skip the initial empty string if the text starts with Q1:
  for (let i = 1; i < qaBlocks.length; i++) {
    const block = qaBlocks[i].trim();

    // Split each block into question and answer
    const parts = block.split(/\nA\d+:/);

    if (parts.length >= 2) {
      const question = parts[0].trim();
      // Combine all remaining parts in case there are multiple A1: in the text
      const answer = parts.slice(1).join("\nA:").trim();

      pairs.push({ question, answer });
    }
  }

  return pairs;
}
