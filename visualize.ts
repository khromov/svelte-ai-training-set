import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

interface QAPairEntry {
  source: string;
  question: string;
  answer: string;
}

/**
 * Reads the JSONL file and returns the data as an array of objects
 */
async function readJSONLFile(filePath: string): Promise<QAPairEntry[]> {
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
 * Groups QA pairs by their source document
 */
function groupBySource(entries: QAPairEntry[]): Record<string, QAPairEntry[]> {
  const groups: Record<string, QAPairEntry[]> = {};

  for (const entry of entries) {
    if (!groups[entry.source]) {
      groups[entry.source] = [];
    }
    groups[entry.source].push(entry);
  }

  return groups;
}

/**
 * Escapes HTML in a string to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates HTML content for the visualization
 */
function generateHtml(groupedEntries: Record<string, QAPairEntry[]>): string {
  const sources = Object.keys(groupedEntries).sort();

  let contentHtml = "";

  // Generate static HTML for all content
  sources.forEach((source, index) => {
    contentHtml += `<h2>${escapeHtml(source)}</h2>`;

    const entries = groupedEntries[source];

    entries.forEach((entry) => {
      contentHtml += `
        <div class="qa-pair">
          <div class="question">
            <strong>Q:</strong> ${escapeHtml(entry.question)}
          </div>
          <div class="answer">
            <strong>A:</strong> ${escapeHtml(entry.answer)}
          </div>
        </div>
      `;
    });

    // Add separator between sections
    if (index < sources.length - 1) {
      contentHtml += "<hr>";
    }
  });

  // Create complete HTML with simple styling
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Svelte Training Data Visualization</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    
    h1 {
      color: #ff3e00;
      text-align: center;
    }
    
    h2 {
      color: #ff3e00;
      margin-top: 30px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
    }
    
    .qa-pair {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 5px;
    }
    
    .question {
      margin-bottom: 10px;
    }
    
    .answer {
      background-color: #f9f9f9;
      padding: 10px;
      border-radius: 5px;
    }
    
    hr {
      margin: 30px 0;
      border: none;
      border-top: 1px dashed #ddd;
    }
  </style>
</head>
<body>
  <h1>Svelte Training Data Visualization</h1>
  
  ${contentHtml}
  
  <div style="text-align: center; margin-top: 30px; color: #666; font-size: 0.9rem;">
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`;
}

/**
 * Main function to run the visualization generator
 */
async function visualize() {
  try {
    // Paths
    const inputDir = path.join(process.cwd(), "output");
    const inputPath = path.join(inputDir, "svelte-training-set.jsonl");
    const outputPath = path.join(inputDir, "visualize.html");

    console.log("📊 Starting visualization generation...");
    console.log(`📂 Reading from: ${inputPath}`);

    // Read the JSONL file
    const entries = await readJSONLFile(inputPath);
    console.log(`✓ Loaded ${entries.length} QA pairs from JSONL file`);

    // Group entries by source
    const groupedEntries = groupBySource(entries);
    const sourceCount = Object.keys(groupedEntries).length;
    console.log(`✓ Found ${sourceCount} unique source documents`);

    // Generate HTML
    const html = generateHtml(groupedEntries);

    // Write the HTML file
    await fs.writeFile(outputPath, html, "utf-8");
    console.log(`✅ Successfully wrote visualization to ${outputPath}`);
  } catch (error) {
    console.error("Error generating visualization:", error);
    process.exit(1);
  }
}

// Run the visualization generator
visualize().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
