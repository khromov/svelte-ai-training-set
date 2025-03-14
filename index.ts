// Load environment variables from .env file
import "dotenv/config";

import { getQuestionsForEntry } from "./src/generate";
import type { QAPair } from "./src/generate";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Minimum content size (in characters) to consider a documentation page valid
const MIN_CONTENT_SIZE = 100;

/**
 * Fetches the Svelte documentation from the specified URL
 * @returns The Svelte documentation as a string
 */
async function fetchSvelteDocs(): Promise<string> {
  try {
    console.log("📚 Fetching Svelte documentation...");
    const response = await fetch("https://svelte-llm.khromov.se/svelte");

    if (!response.ok) {
      throw new Error(`Failed to fetch Svelte docs: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error("Error fetching Svelte documentation:", error);
    throw error;
  }
}

/**
 * Parses the Svelte documentation into individual entries
 * @param docsContent The raw Svelte documentation content
 * @returns An array of entries with the structure { entry: 'docs/...', content: '....' }
 */
function parseSvelteDocs(
  docsContent: string
): Array<{ entry: string; content: string }> {
  // Split by the ## docs/ delimiter
  const parts = docsContent.split(/^## (docs\/[^\n]+)/m);

  const entries: Array<{ entry: string; content: string }> = [];

  // Skip the first part (it's empty or doesn't start with ## docs/)
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      entries.push({
        entry: parts[i],
        content: parts[i + 1].trim(),
      });
    }
  }

  return entries;
}

/**
 * Ensures the output directory exists
 * @param dirPath Path to the directory
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Writes question-answer pairs to a JSONL file
 * @param outputPath Path to the output file
 * @param entries Array of entries with question-answer pairs
 */
async function writeToJSONL(
  outputPath: string,
  entries: Array<{ entry: string; qaPairs: QAPair[] }>
): Promise<void> {
  try {
    // Ensure the output directory exists
    await ensureDirectoryExists(path.dirname(outputPath));

    // Create the JSONL content
    const jsonlContent = entries
      .flatMap(({ entry, qaPairs }) =>
        qaPairs.map((qa) => ({
          source: entry,
          question: qa.question,
          answer: qa.answer,
        }))
      )
      .map((item) => JSON.stringify(item))
      .join("\n");

    // Write to the file
    await fs.writeFile(outputPath, jsonlContent, "utf-8");
    console.log(`✅ Successfully wrote results to ${outputPath}`);
  } catch (error) {
    console.error(`Error writing to JSONL file:`, error);
    throw error;
  }
}

/**
 * Main function to run the training set generation
 */
async function start() {
  console.log("🚀 Starting Svelte AI Training Set Generator...");

  try {
    // Fetch the Svelte documentation
    const svelteDocsContent = await fetchSvelteDocs();

    // Parse the documentation into entries
    let docsEntries = parseSvelteDocs(svelteDocsContent);

    // Filter out entries with small content size
    const validEntries = docsEntries.filter(
      (entry) => entry.content.length >= MIN_CONTENT_SIZE
    );
    console.log(
      `📊 Found ${docsEntries.length} total entries, ${validEntries.length} valid entries after filtering.`
    );

    // Limit to the first 10 entries for testing
    const limitedEntries = validEntries.slice(0, 10);
    console.log(
      `🔍 Processing first ${limitedEntries.length} entries for testing.`
    );

    // Generate question-answer pairs for each entry
    const results: Array<{ entry: string; qaPairs: QAPair[] }> = [];

    for (const [index, entry] of limitedEntries.entries()) {
      console.log(
        `📝 Processing entry ${index + 1}/${limitedEntries.length}: ${
          entry.entry
        }`
      );

      try {
        const qaPairs = await getQuestionsForEntry(
          entry.entry,
          entry.content,
          3
        ); // Generate 3 QA pairs per entry
        console.log(
          `✓ Generated ${qaPairs.length} QA pairs for ${entry.entry}`
        );

        results.push({
          entry: entry.entry,
          qaPairs,
        });
      } catch (error) {
        console.error(`Error generating QA pairs for ${entry.entry}:`, error);
        console.log(`⚠️ Skipping entry ${entry.entry} due to error`);
      }
    }

    // Write the results to a JSONL file
    const outputPath = path.join(
      process.cwd(),
      "output",
      "svelte-training-set.jsonl"
    );
    await writeToJSONL(outputPath, results);

    console.log("🎉 Training set generation completed successfully!");
  } catch (error) {
    console.error("Error processing Svelte documentation:", error);
    process.exit(1);
  }
}

// Run the generation process
start().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
