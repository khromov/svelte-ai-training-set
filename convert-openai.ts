// Load environment variables from .env file
import "dotenv/config";

import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Paths
const OUTPUT_DIR = path.join(process.cwd(), "output");
const INPUT_PATH = path.join(OUTPUT_DIR, "merged.jsonl"); // Try the merged file first
const BACKUP_INPUT_PATH = path.join(OUTPUT_DIR, "svelte-training-set.jsonl"); // Fallback to this file
const OUTPUT_PATH = path.join(OUTPUT_DIR, "openai.jsonl");

// Interface for our format
interface SvelteQAPair {
  source: string;
  question: string;
  answer: string;
}

// Interface for OpenAI format
interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIFineTuningExample {
  messages: OpenAIMessage[];
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
 * Converts a QA pair from our format to OpenAI's format
 */
function convertToOpenAIFormat(qaPair: SvelteQAPair): OpenAIFineTuningExample {
  return {
    messages: [
      {
        role: "system",
        content: "You are an expert in Svelte 5 and web development, providing helpful and accurate answers to questions about Svelte.",
      },
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
 * Writes the OpenAI format data to a JSONL file
 */
async function writeOpenAIJSONL(
  outputPath: string,
  entries: OpenAIFineTuningExample[]
): Promise<void> {
  try {
    const jsonlContent = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await fs.writeFile(outputPath, jsonlContent, "utf-8");
    console.log(`✅ Successfully wrote OpenAI format to ${outputPath}`);
  } catch (error) {
    console.error(`Error writing to OpenAI JSONL file:`, error);
    throw error;
  }
}

/**
 * Main function to convert the JSONL files
 */
async function convertToOpenAI(): Promise<void> {
  console.log("🔄 Starting conversion to OpenAI fine-tuning format...");

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

    // Convert to OpenAI format
    const openAIEntries = entries.map(convertToOpenAIFormat);
    console.log(`🔄 Converted ${openAIEntries.length} entries to OpenAI format`);

    // Write the converted data
    await writeOpenAIJSONL(OUTPUT_PATH, openAIEntries);

    console.log("🎉 Conversion to OpenAI format completed successfully!");
  } catch (error) {
    console.error("Error converting to OpenAI format:", error);
    process.exit(1);
  }
}

// Run the conversion process
convertToOpenAI().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});