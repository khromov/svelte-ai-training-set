// Load environment variables from .env file
import "dotenv/config";

import { getAllLLMProviders } from "./src/llms";
import process from "node:process";

/**
 * Main function to run the benchmark
 */
async function start() {
  console.log("🚀 Starting...");
}

// Run the benchmark
start().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
