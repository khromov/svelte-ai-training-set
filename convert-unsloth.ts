// Load environment variables from .env file
import "dotenv/config";

import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Paths
const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_PATH = path.join(OUTPUT_DIR, "merged.jsonl"); // Try the merged file first
const BACKUP_INPUT_PATH = path.join(OUTPUT_DIR, "svelte-training-set.jsonl"); // Fallback to this file
const OUTPUT_PATH = path.join(OUTPUT_DIR, "unsloth.jsonl");

// Interface for our format
interface SvelteQAPair {
  source: string;
  question: string;
  answer: string;
}

// Interface for Unsloth format
interface UnslothMessage {
  role: "user" | "assistant";
  content: string;
}

interface UnslothExample {
  conversations: UnslothMessage[];
}

/**
 * Ensures the output directory exists
 */
async function ensureOutputDirectory(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating output directory:`, error);
    throw error;
  }
}

/**
 * Reads the JSONL file and returns the data as an array of objects
 */
async function readJSONLFile(filePath: string): Promise<SvelteQAPair[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as SvelteQAPair);
  } catch (error) {
    console.error(`Error reading JSONL file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Converts a QA pair from our format to Unsloth's format
 */
function convertToUnslothFormat(qaPair: SvelteQAPair): UnslothExample {
  return {
    conversations: [
      {
        role: "user",
        content: qaPair.question,
      },
      {
        role: "assistant",
        content: qaPair.answer,
      },
    ],
  };
}

/**
 * Writes the Unsloth format data to a JSONL file
 */
async function writeUnslothJSONL(
  outputPath: string,
  entries: UnslothExample[]
): Promise<void> {
  try {
    const jsonlContent = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await fs.writeFile(outputPath, jsonlContent, "utf-8");
    console.log(`✅ Successfully wrote Unsloth format to ${outputPath}`);
  } catch (error) {
    console.error(`Error writing to Unsloth JSONL file:`, error);
    throw error;
  }
}

/**
 * Main function to convert the JSONL files
 */
async function convertToUnsloth(): Promise<void> {
  console.log("🔄 Starting conversion to Unsloth fine-tuning format...");

  try {
    // Ensure output directory exists
    await ensureOutputDirectory();

    // Try to read from merged.jsonl first, fall back to svelte-training-set.jsonl
    let inputPath = INPUT_PATH;
    let entries: SvelteQAPair[] = [];

    try {
      // Try to read the merged file first
      console.log(`📖 Attempting to read from ${INPUT_PATH}...`);
      entries = await readJSONLFile(INPUT_PATH);
    } catch (error) {
      // If merged file doesn't exist, try the backup file
      console.log(`⚠️ Couldn't read from ${INPUT_PATH}, trying ${BACKUP_INPUT_PATH}...`);
      try {
        entries = await readJSONLFile(BACKUP_INPUT_PATH);
        inputPath = BACKUP_INPUT_PATH;
      } catch (backupError) {
        console.error(`Error reading input files:`, backupError);
        throw backupError;
      }
    }

    console.log(`📊 Read ${entries.length} entries from ${inputPath}`);

    // Convert to Unsloth format
    const unslothEntries = entries.map(convertToUnslothFormat);
    console.log(`🔄 Converted ${unslothEntries.length} entries to Unsloth format`);

    // Write the converted data
    await writeUnslothJSONL(OUTPUT_PATH, unslothEntries);

    console.log("🎉 Conversion to Unsloth format completed successfully!");
  } catch (error) {
    console.error("Error converting to Unsloth format:", error);
    process.exit(1);
  }
}

// Run the conversion process
convertToUnsloth().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});