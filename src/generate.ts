import { getLLMProvider } from "./llms";
import type { LLMProvider } from "./llms";
import { AnthropicProvider } from "./llms/anthropic";

/**
 * Interface for a Question-Answer pair
 */
export interface QAPair {
  question: string;
  answer: string;
}

/**
 * Interface for a batch processing request
 */
export interface BatchProcessRequest {
  entry: string;
  content: string;
  questionsNeeded: number;
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
 * Sanitize an entry path to create a valid custom_id
 * Only allows alphanumeric characters, underscores, and hyphens
 * Truncates if longer than 64 characters
 */
function sanitizeCustomId(entry: string, index: number): string {
  // Replace all non-allowed characters with underscores
  const sanitized = entry.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/__+/g, "_"); // Collapse multiple underscores

  // Create a custom ID that includes the index to ensure uniqueness
  const customId = `entry_${sanitized}_${index}`;

  // Truncate if too long (max 64 chars)
  if (customId.length > 64) {
    // Keep the beginning, the index, and enough context
    const prefix = "entry_";
    const suffix = `_${index}`;
    const maxMiddleLength = 64 - prefix.length - suffix.length;

    // Take some characters from the beginning and end of sanitized
    const halfLength = Math.floor(maxMiddleLength / 2);
    const start = sanitized.substring(0, halfLength);
    const end = sanitized.substring(sanitized.length - halfLength);

    return `${prefix}${start}_${end}${suffix}`.substring(0, 64);
  }

  return customId;
}

/**
 * Process multiple entries in a batch using the Anthropic Batch API
 * @param requests Array of batch process requests
 * @returns Array of entries with their QA pairs
 */
export async function batchProcessEntries(
  requests: BatchProcessRequest[]
): Promise<Array<{ entry: string; qaPairs: QAPair[] }>> {
  try {
    // Check if we have any requests to process
    if (requests.length === 0) {
      return [];
    }

    // Get the Anthropic provider
    const provider = (await getLLMProvider("anthropic")) as AnthropicProvider;
    console.log(
      `🤖 Using Anthropic Batch API to process ${requests.length} entries`
    );

    // Create an ID map to track which custom_id corresponds to which original entry
    const idMap = new Map<string, string>();

    // Create batch requests
    const batchRequests = requests.map((request, index) => {
      // Create a valid custom_id that conforms to Anthropic's requirements
      const customId = sanitizeCustomId(request.entry, index);
      console.log(`📝 Custom ID: ${customId}`);

      // Store the mapping for later retrieval
      idMap.set(customId, request.entry);

      const prompt = createQAPrompt(
        request.entry,
        request.content,
        request.questionsNeeded
      );

      return {
        custom_id: customId,
        request_data: {
          entry: request.entry,
          questionsNeeded: request.questionsNeeded,
        },
        params: {
          model: provider.getModelIdentifier(),
          max_tokens: 16384,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        },
      };
    });

    // Submit the batch
    console.log(
      `📤 Submitting batch of ${batchRequests.length} requests to Anthropic...`
    );
    const batchResult = await provider.createBatch(batchRequests);
    console.log(`✅ Batch created with ID: ${batchResult.id}`);

    // Poll for completion
    let batchStatus = await provider.getBatchStatus(batchResult.id);

    console.log(
      `⏳ Batch processing status: ${batchStatus.processing_status} (${batchStatus.request_counts.processing} processing, ${batchStatus.request_counts.succeeded} succeeded, ${batchStatus.request_counts.errored} errored)`
    );

    while (batchStatus.processing_status === "in_progress") {
      // Wait for 30 seconds before checking again
      console.log(
        `⏳ Waiting for batch to complete (${batchStatus.request_counts.processing} requests still processing)...`
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));

      batchStatus = await provider.getBatchStatus(batchResult.id);
      console.log(
        `⏳ Batch processing status: ${batchStatus.processing_status} (${batchStatus.request_counts.processing} processing, ${batchStatus.request_counts.succeeded} succeeded, ${batchStatus.request_counts.errored} errored)`
      );
    }

    // Process results
    if (batchStatus.results_url) {
      console.log(`📥 Batch processing complete. Fetching results...`);
      const results = await provider.getBatchResults(batchStatus.results_url);

      // Map results back to entries
      const entriesWithQaPairs: Array<{ entry: string; qaPairs: QAPair[] }> =
        [];

      for (const result of results) {
        if (result.result.type === "succeeded") {
          try {
            // Extract the entry from request_data or from our id map as fallback
            let entry = batchRequests.find(
              (req) => req.custom_id === result.custom_id
            )?.request_data?.entry;

            // If request_data is missing, use our ID map
            if (!entry && idMap.has(result.custom_id)) {
              entry = idMap.get(result.custom_id);
            }

            if (!entry) {
              console.warn(
                `⚠️ Could not find entry for result with custom_id: ${result.custom_id}`
              );
              continue;
            }

            // Parse the response content
            const responseText = result.result.message.content[0].text;
            const qaPairs = parseQAPairsFromText(responseText);

            console.log(
              `✓ Successfully parsed ${qaPairs.length} QA pairs for entry ${entry}`
            );

            entriesWithQaPairs.push({
              entry,
              qaPairs,
            });
          } catch (error) {
            console.error(`Error processing batch result:`, error);
          }
        } else if (result.result.type === "errored") {
          console.error(
            `❌ Error in batch request ${result.custom_id}: ${JSON.stringify(
              result.result.error
            )}`
          );
        } else {
          console.warn(
            `⚠️ Unexpected result type for ${result.custom_id}: ${result.result.type}`
          );
        }
      }

      console.log(
        `📊 Successfully processed ${entriesWithQaPairs.length} entries from batch`
      );
      return entriesWithQaPairs;
    } else {
      throw new Error(
        `Batch completed but no results URL provided. Status: ${batchStatus.processing_status}`
      );
    }
  } catch (error) {
    console.error(`Error in batch processing:`, error);
    throw new Error(
      `Failed to process batch: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Creates a prompt for QA generation
 * @param entry Documentation entry path
 * @param content Documentation content
 * @param count Number of QA pairs to generate
 * @returns Formatted prompt
 */
function createQAPrompt(entry: string, content: string, count: number): string {
  return `
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
  const prompt = createQAPrompt(entry, content, count);
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
