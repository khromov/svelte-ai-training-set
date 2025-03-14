// Load environment variables from .env file
import "dotenv/config";

import { getQuestionsForEntry } from "./src/generate";
import type { QAPair } from "./src/generate";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Minimum content size (in characters) to consider a documentation page valid
const MIN_CONTENT_SIZE = 100;

const QUESTIONS_TO_GENERATE = 20;

// Paths for resumability
const INPUT_DIR = path.join(process.cwd(), "input");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const SVELTE_DOC_PATH = path.join(INPUT_DIR, "svelte.md");
const CURRENT_PROGRESS_PATH = path.join(OUTPUT_DIR, "current.txt");

/**
 * Ensures the required directories exist
 */
async function ensureDirectories(): Promise<void> {
  try {
    await fs.mkdir(INPUT_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating directories:`, error);
    throw error;
  }
}

/**
 * Fetches the Svelte documentation from the specified URL and saves it to disk
 * @returns The path to the saved documentation file
 */
async function fetchSvelteDocs(): Promise<string> {
  try {
    // Check if we already have the documentation file
    try {
      const stats = await fs.stat(SVELTE_DOC_PATH);
      if (stats.isFile() && stats.size > 0) {
        console.log(
          `📚 Using existing Svelte documentation from ${SVELTE_DOC_PATH}`
        );
        return SVELTE_DOC_PATH;
      }
    } catch (error) {
      // File doesn't exist, we'll download it
    }

    console.log("📚 Fetching Svelte documentation...");
    const response = await fetch("https://svelte-llm.khromov.se/svelte");

    if (!response.ok) {
      throw new Error(`Failed to fetch Svelte docs: ${response.statusText}`);
    }

    const content = await response.text();

    // Save the documentation to disk
    await fs.writeFile(SVELTE_DOC_PATH, content, "utf-8");
    console.log(`📦 Saved Svelte documentation to ${SVELTE_DOC_PATH}`);

    return SVELTE_DOC_PATH;
  } catch (error) {
    console.error("Error fetching Svelte documentation:", error);
    throw error;
  }
}

/**
 * Reads the Svelte documentation from disk
 * @param filePath Path to the documentation file
 * @returns The Svelte documentation as a string
 */
async function readSvelteDocs(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error(
      `Error reading Svelte documentation from ${filePath}:`,
      error
    );
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
  if (!docsContent || typeof docsContent !== "string") {
    console.warn("Invalid documentation content provided to parser");
    return [];
  }

  // Split by the ## docs/ delimiter
  const parts = docsContent.split(/^## (docs\/[^\n]+)/m);

  const entries: Array<{ entry: string; content: string }> = [];

  // Skip the first part (it's empty or doesn't start with ## docs/)
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length && parts[i].trim()) {
      const entry = parts[i].trim();
      const content = parts[i + 1].trim();

      if (entry && content) {
        entries.push({ entry, content });
      }
    }
  }

  // Log a warning if no entries were found
  if (entries.length === 0) {
    console.warn(
      "No documentation entries found - check format of the source document"
    );
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
 * @param append Whether to append to the file (true) or overwrite it (false)
 */
async function writeToJSONL(
  outputPath: string,
  entries: Array<{ entry: string; qaPairs: QAPair[] }>,
  append: boolean = false
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
    if (append) {
      // Add a newline if the file exists and is not empty
      try {
        const stats = await fs.stat(outputPath);
        if (stats.size > 0) {
          await fs.appendFile(outputPath, "\n" + jsonlContent, "utf-8");
        } else {
          await fs.writeFile(outputPath, jsonlContent, "utf-8");
        }
      } catch (error) {
        // File doesn't exist, write it
        await fs.writeFile(outputPath, jsonlContent, "utf-8");
      }
    } else {
      await fs.writeFile(outputPath, jsonlContent, "utf-8");
    }

    console.log(
      `✅ Successfully ${
        append ? "appended" : "wrote"
      } results to ${outputPath}`
    );
  } catch (error) {
    console.error(`Error writing to JSONL file:`, error);
    throw error;
  }
}

/**
 * Saves the current progress to a file
 * @param currentIndex The current index being processed
 */
async function saveProgress(currentIndex: number): Promise<void> {
  try {
    await fs.writeFile(CURRENT_PROGRESS_PATH, currentIndex.toString(), "utf-8");
  } catch (error) {
    console.error("Error saving progress:", error);
    // Continue processing even if we can't save progress
  }
}

/**
 * Reads the current progress from the file
 * @returns The current index or null if no progress file exists
 */
async function readProgress(): Promise<number | null> {
  try {
    const content = await fs.readFile(CURRENT_PROGRESS_PATH, "utf-8");
    const index = parseInt(content.trim(), 10);
    return isNaN(index) ? null : index;
  } catch (error) {
    // File doesn't exist or other error
    return null;
  }
}

/**
 * Clears the progress file
 */
async function clearProgress(): Promise<void> {
  try {
    await fs.unlink(CURRENT_PROGRESS_PATH);
  } catch (error) {
    // File doesn't exist or other error, can be ignored
  }
}

/**
 * Main function to run the training set generation
 */
async function start() {
  console.log("🚀 Starting Svelte AI Training Set Generator...");

  try {
    // Ensure directories exist
    await ensureDirectories();

    // Fetch and save the Svelte documentation
    const svelteDocsPath = await fetchSvelteDocs();

    // Read the documentation from disk
    const svelteDocsContent = await readSvelteDocs(svelteDocsPath);

    // Parse the documentation into entries
    let docsEntries = parseSvelteDocs(svelteDocsContent);

    // Filter out entries with small content size
    const validEntries = docsEntries.filter(
      (entry) => entry.content.length >= MIN_CONTENT_SIZE
    );
    console.log(
      `📊 Found ${docsEntries.length} total entries, ${validEntries.length} valid entries after filtering.`
    );

    // Output file path
    const outputPath = path.join(OUTPUT_DIR, "svelte-training-set.jsonl");

    // Check for existing progress
    const startIndex = await readProgress();
    const shouldAppend = startIndex !== null;

    if (startIndex !== null) {
      console.log(`🔄 Resuming from entry index ${startIndex}`);
    } else {
      console.log(`🆕 Starting a new processing run`);
    }

    // Process entries starting from the saved index or from 0
    for (
      let i = startIndex !== null ? startIndex : 0;
      i < validEntries.length;
      i++
    ) {
      const entry = validEntries[i];
      console.log(
        `📝 Processing entry ${i + 1}/${validEntries.length}: ${entry.entry}`
      );

      // Save current progress
      await saveProgress(i);

      try {
        const qaPairs = await getQuestionsForEntry(
          entry.entry,
          entry.content,
          QUESTIONS_TO_GENERATE
        );
        console.log(
          `✓ Generated ${qaPairs.length} QA pairs for ${entry.entry}`
        );

        // Write each entry immediately to avoid losing progress
        await writeToJSONL(
          outputPath,
          [{ entry: entry.entry, qaPairs }],
          shouldAppend || i > 0 // Append if resuming or not the first entry
        );
      } catch (error) {
        console.error(`Error generating QA pairs for ${entry.entry}:`, error);
        console.log(`⚠️ Skipping entry ${entry.entry} due to error`);
      }
    }

    // Clear progress file when done
    await clearProgress();
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
