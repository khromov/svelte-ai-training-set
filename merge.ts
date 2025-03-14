// Load environment variables from .env file
import "dotenv/config";

import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";

// Paths
const OUTPUT_DIR = path.join(process.cwd(), "output");
const MERGED_OUTPUT_PATH = path.join(OUTPUT_DIR, "merged.jsonl");

/**
 * Interface for a QA pair entry in the JSONL files
 */
interface QAPairEntry {
  source: string;
  question: string;
  answer: string;
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
 * Reads all JSONL files from the output directory, except merged.jsonl
 * @returns Array of file paths
 */
async function getJsonlFilePaths(): Promise<string[]> {
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    return files
      .filter((file) => file.endsWith(".jsonl") && file !== "merged.jsonl")
      .map((file) => path.join(OUTPUT_DIR, file));
  } catch (error) {
    console.error(`Error reading output directory:`, error);
    throw error;
  }
}

/**
 * Reads and parses a JSONL file
 * @param filePath Path to the JSONL file
 * @returns Array of parsed objects
 */
async function readJsonlFile(filePath: string): Promise<QAPairEntry[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as QAPairEntry);
  } catch (error) {
    console.error(`Error reading JSONL file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Writes the merged data to a JSONL file
 * @param entries Array of entries to write
 */
async function writeToMergedJsonl(entries: QAPairEntry[]): Promise<void> {
  try {
    const jsonlContent = entries
      .map((entry) => JSON.stringify(entry))
      .join("\n");

    await fs.writeFile(MERGED_OUTPUT_PATH, jsonlContent, "utf-8");
    console.log(
      `✅ Successfully wrote merged results to ${MERGED_OUTPUT_PATH}`
    );
  } catch (error) {
    console.error(`Error writing to merged JSONL file:`, error);
    throw error;
  }
}

/**
 * Main function to merge all JSONL files
 */
async function mergeJsonlFiles(): Promise<void> {
  console.log("🔄 Starting JSONL file merge process...");

  try {
    // Ensure output directory exists
    await ensureOutputDirectory();

    // Get all JSONL files except merged.jsonl
    const jsonlFiles = await getJsonlFilePaths();
    console.log(`📊 Found ${jsonlFiles.length} JSONL files to merge`);

    if (jsonlFiles.length === 0) {
      console.log("⚠️ No JSONL files found to merge");
      return;
    }

    // Read and parse all files
    let allEntries: QAPairEntry[] = [];
    for (const file of jsonlFiles) {
      console.log(`📖 Reading ${file}...`);
      const entries = await readJsonlFile(file);
      allEntries = [...allEntries, ...entries];
    }

    console.log(`📊 Total entries found: ${allEntries.length}`);

    // Sort by source alphabetically
    allEntries.sort((a, b) => a.source.localeCompare(b.source));

    // Write the merged file
    await writeToMergedJsonl(allEntries);

    console.log("🎉 JSONL file merge completed successfully!");
  } catch (error) {
    console.error("Error merging JSONL files:", error);
    process.exit(1);
  }
}

// Run the merge process
mergeJsonlFiles().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
