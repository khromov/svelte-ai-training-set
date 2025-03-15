// Load environment variables from .env file
import "dotenv/config";

import { getQuestionsForEntry } from "./src/generate";
import type { QAPair } from "./src/generate";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Minimum content size (in characters) to consider a documentation page valid
const MIN_CONTENT_SIZE = 100;

// Run missing items, that have less than QUESTIONS_TO_GENERATE questions? or just 0
// TODO: Allow temperature control
// TODO: Save to dated file + temperature in filename
// TODO: Merge utility npm run merge from output/*.jsonl to output/merged.json

// Do multiple runs to generate more diverse data
const QUESTIONS_TO_GENERATE = 10;

// Paths for resumability
const INPUT_DIR = path.join(process.cwd(), "input");
const OUTPUT_DIR = path.join(process.cwd(), "output");
const SVELTE_DOC_PATH = path.join(INPUT_DIR, "svelte.md");

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
 * Reads the existing JSONL file and counts the number of questions per entry
 * @param outputPath The path to the JSONL file
 * @returns A map of entry paths to the number of questions they have
 */
async function getExistingQuestionCounts(outputPath: string): Promise<Map<string, number>> {
  const questionCounts = new Map<string, number>();
  
  try {
    // Check if the file exists
    await fs.access(outputPath);
    
    // Read the file content
    const content = await fs.readFile(outputPath, 'utf-8');
    
    // Split into lines and parse each line
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Increment the count for this entry source
        const count = questionCounts.get(entry.source) || 0;
        questionCounts.set(entry.source, count + 1);
      } catch (error) {
        console.warn(`Warning: Could not parse line in JSONL file: ${line}`);
      }
    }
    
    console.log(`📊 Found ${lines.length} existing QA pairs across ${questionCounts.size} entries`);
  } catch (error) {
    // If the file doesn't exist or there's another error, return an empty map
    console.log(`📊 No existing output file found or couldn't read it: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return questionCounts;
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

    // Get counts of existing questions per entry
    const existingCounts = await getExistingQuestionCounts(outputPath);

    // Filter entries that need more questions
    const entriesToProcess = validEntries.filter(entry => {
      const existingCount = existingCounts.get(entry.entry) || 0;
      return existingCount < QUESTIONS_TO_GENERATE;
    });

    console.log(`📊 Found ${entriesToProcess.length} entries that need more questions`);

    // Process each entry that needs more questions
    for (let i = 0; i < entriesToProcess.length; i++) {
      const entry = entriesToProcess[i];
      const existingCount = existingCounts.get(entry.entry) || 0;
      const questionsNeeded = QUESTIONS_TO_GENERATE - existingCount;
      
      console.log(
        `📝 Processing entry ${i + 1}/${entriesToProcess.length}: ${entry.entry} (generating ${questionsNeeded} more questions)`
      );

      try {
        // Only generate the number of questions needed
        const qaPairs = await getQuestionsForEntry(
          entry.entry,
          entry.content,
          questionsNeeded
        );
        console.log(
          `✓ Generated ${qaPairs.length} QA pairs for ${entry.entry}`
        );

        // Write to file (always append if the file exists)
        const fileExists = existingCounts.size > 0;
        await writeToJSONL(
          outputPath,
          [{ entry: entry.entry, qaPairs }],
          fileExists
        );
      } catch (error) {
        console.error(`Error generating QA pairs for ${entry.entry}:`, error);
        console.log(`⚠️ Skipping entry ${entry.entry} due to error`);
      }
    }

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