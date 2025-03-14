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
 * @param filePath Path to the JSONL file
 * @returns Array of QA pair entries
 */
async function readJSONLFile(filePath: string): Promise<QAPairEntry[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Split by newlines and parse each line as JSON
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
 * @param entries Array of QA pair entries
 * @returns Object with source documents as keys and arrays of QA pairs as values
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
 * @param str String to escape
 * @returns Escaped string
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
 * Formats code blocks in Markdown
 * @param text Text potentially containing code blocks
 * @returns HTML with code blocks formatted
 */
function formatMarkdown(text: string): string {
  // Format code blocks
  let formatted = text.replace(
    /```([a-z]*)([\s\S]*?)```/g,
    (_, language, code) => {
      const langClass = language ? ` class="language-${language}"` : "";
      return `<pre><code${langClass}>${escapeHtml(code.trim())}</code></pre>`;
    }
  );

  // Format inline code
  formatted = formatted.replace(
    /`([^`]+)`/g,
    (_, code) => `<code>${escapeHtml(code)}</code>`
  );

  // Format paragraphs
  formatted = formatted
    .split("\n\n")
    .map((para) => {
      // Skip if it's already a pre/code block
      if (para.startsWith("<pre>")) return para;
      return `<p>${para}</p>`;
    })
    .join("");

  return formatted;
}

/**
 * Generates HTML content for the visualization
 * @param groupedEntries Object with source documents as keys and arrays of QA pairs as values
 * @returns HTML content as string
 */
function generateHtml(groupedEntries: Record<string, QAPairEntry[]>): string {
  const sources = Object.keys(groupedEntries).sort();

  let tabsHtml = "";
  let tabContentHtml = "";

  // Generate tabs and content
  sources.forEach((source, index) => {
    const isActive = index === 0;
    const sourceId = `source-${index}`;
    const entries = groupedEntries[source];

    // Create tab
    tabsHtml += `
      <button class="tab-button ${isActive ? "active" : ""}" 
              onclick="openTab(event, '${sourceId}')">
        ${escapeHtml(source.split("/").pop() || source)}
      </button>
    `;

    // Create tab content
    tabContentHtml += `
      <div id="${sourceId}" class="tab-content ${isActive ? "active" : ""}">
        <h2>${escapeHtml(source)}</h2>
        <div class="qa-list">
    `;

    // Add QA pairs
    entries.forEach((entry, qaIndex) => {
      const qaId = `qa-${index}-${qaIndex}`;
      tabContentHtml += `
        <div class="qa-pair">
          <div class="question" onclick="toggleAnswer('${qaId}')">
            <div class="question-header">
              <span class="q-marker">Q:</span>
              <h3>${escapeHtml(entry.question)}</h3>
              <span class="toggle-icon">▼</span>
            </div>
          </div>
          <div id="${qaId}" class="answer">
            <div class="answer-content">
              <span class="a-marker">A:</span>
              <div class="answer-text">${formatMarkdown(entry.answer)}</div>
            </div>
          </div>
        </div>
      `;
    });

    tabContentHtml += `
        </div>
      </div>
    `;
  });

  // Create complete HTML
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Svelte Training Data Visualization</title>
  <style>
    :root {
      --primary-color: #ff3e00;
      --primary-color-light: #ff5722;
      --text-color: #333;
      --light-gray: #f5f5f5;
      --border-color: #ddd;
      --answer-bg: #f9f9f9;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-color);
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      margin-bottom: 30px;
      text-align: center;
    }
    
    h1 {
      color: var(--primary-color);
      margin-bottom: 10px;
    }
    
    .tabs {
      display: flex;
      flex-wrap: wrap;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 20px;
      gap: 2px;
    }
    
    .tab-button {
      background-color: var(--light-gray);
      border: 1px solid var(--border-color);
      border-bottom: none;
      border-radius: 5px 5px 0 0;
      padding: 10px 15px;
      cursor: pointer;
      transition: background-color 0.3s;
      font-size: 14px;
    }
    
    .tab-button:hover {
      background-color: #e9e9e9;
    }
    
    .tab-button.active {
      background-color: var(--primary-color);
      color: white;
      border-color: var(--primary-color);
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    h2 {
      font-size: 1.5rem;
      margin-bottom: 20px;
      color: var(--primary-color);
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .qa-list {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .qa-pair {
      border: 1px solid var(--border-color);
      border-radius: 5px;
      overflow: hidden;
    }
    
    .question {
      padding: 15px;
      background-color: white;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .question:hover {
      background-color: var(--light-gray);
    }
    
    .question-header {
      display: flex;
      align-items: flex-start;
    }
    
    .q-marker, .a-marker {
      font-weight: bold;
      font-size: 1.1rem;
      color: var(--primary-color);
      margin-right: 10px;
      flex-shrink: 0;
      margin-top: 3px;
    }
    
    h3 {
      flex-grow: 1;
      font-size: 1.1rem;
      font-weight: 500;
    }
    
    .toggle-icon {
      margin-left: 10px;
      transition: transform 0.3s;
    }
    
    .answer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.5s ease;
    }
    
    .answer.expanded {
      max-height: 2000px;
    }
    
    .answer-content {
      padding: 15px;
      display: flex;
      background-color: var(--answer-bg);
      border-top: 1px solid var(--border-color);
    }
    
    .answer-text {
      flex-grow: 1;
    }
    
    code {
      font-family: Menlo, Monaco, "Courier New", monospace;
      background-color: #f0f0f0;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    
    pre {
      background-color: #282c34;
      color: #abb2bf;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      margin: 10px 0;
    }
    
    pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
      font-size: 0.9rem;
      line-height: 1.5;
      display: block;
    }
    
    p {
      margin-bottom: 15px;
    }
    
    p:last-child {
      margin-bottom: 0;
    }
    
    .meta-info {
      margin-top: 30px;
      color: #666;
      font-size: 0.9rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <h1>Svelte Training Data Visualization</h1>
    <p>Interactive viewer for the Svelte AI Training Set</p>
  </header>
  
  <div class="tabs">
    ${tabsHtml}
  </div>
  
  ${tabContentHtml}
  
  <div class="meta-info">
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>
  
  <script>
    function openTab(evt, tabId) {
      // Hide all tab contents
      const tabContents = document.getElementsByClassName("tab-content");
      for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
      }
      
      // Deactivate all tab buttons
      const tabButtons = document.getElementsByClassName("tab-button");
      for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active");
      }
      
      // Show the selected tab and activate the button
      document.getElementById(tabId).classList.add("active");
      evt.currentTarget.classList.add("active");
    }
    
    function toggleAnswer(answerId) {
      const answer = document.getElementById(answerId);
      answer.classList.toggle("expanded");
      
      // Toggle the arrow icon
      const questionEl = answer.previousElementSibling;
      const toggleIcon = questionEl.querySelector(".toggle-icon");
      
      if (answer.classList.contains("expanded")) {
        toggleIcon.textContent = "▲";
        toggleIcon.style.transform = "rotate(0deg)";
      } else {
        toggleIcon.textContent = "▼";
        toggleIcon.style.transform = "rotate(0deg)";
      }
    }
    
    // Expand the first QA pair in the active tab
    document.addEventListener("DOMContentLoaded", function() {
      const firstTab = document.querySelector(".tab-content.active");
      if (firstTab) {
        const firstQA = firstTab.querySelector(".qa-pair");
        if (firstQA) {
          const answerId = firstQA.querySelector(".answer").id;
          toggleAnswer(answerId);
        }
      }
    });
  </script>
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
