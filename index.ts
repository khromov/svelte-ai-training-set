// Load environment variables from .env file
import "dotenv/config";

import { getAllLLMProviders } from "./src/llms";
import process from "node:process";

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
 * Main function to run the benchmark
 */
async function start() {
  console.log("🚀 Starting...");

  try {
    // Fetch the Svelte documentation
    const svelteDocsContent = await fetchSvelteDocs();

    // Parse the documentation into entries
    const docsEntries = parseSvelteDocs(svelteDocsContent);

    // Print the number of entries
    console.log(`📊 Found ${docsEntries.length} documentation entries.`);

    // list entries
    //console.log(docsEntries.map((entry) => entry.entry));
  } catch (error) {
    console.error("Error processing Svelte documentation:", error);
    process.exit(1);
  }
}

// Run the benchmark
start().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
