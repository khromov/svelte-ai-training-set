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
 * Convert string to Base64
 */
function toBase64(str: string): string {
  return Buffer.from(str).toString("base64");
}

/**
 * Generates HTML content for the visualization
 */
function generateHtml(groupedEntries: Record<string, QAPairEntry[]>): string {
  const sources = Object.keys(groupedEntries).sort();

  let tabsHtml = "";
  let tabContentHtml = "";

  // Generate tabs and content
  sources.forEach((source, index) => {
    const sourceId = `source-${index}`;
    const entries = groupedEntries[source];
    const fileName = source.split("/").pop() || source;

    // Create tab button
    tabsHtml += `<button class="tab-button" data-tab="${sourceId}">${escapeHtml(
      fileName
    )}</button>`;

    // Create tab content
    tabContentHtml += `<div id="${sourceId}" class="tab-content">`;
    tabContentHtml += `<h2>${escapeHtml(source)}</h2>`;

    entries.forEach((entry, qaIndex) => {
      // Base64 encode the answer to avoid HTML parsing issues
      const encodedAnswer = toBase64(entry.answer);

      tabContentHtml += `
        <div class="qa-pair">
          <div class="question" data-qa-id="${index}-${qaIndex}">
            <div class="question-header">
              <strong class="q-marker">Q:</strong>
              <span class="question-text">${escapeHtml(entry.question)}</span>
              <span class="toggle-icon">▼</span>
            </div>
          </div>
          <div class="answer" id="qa-${index}-${qaIndex}">
            <strong class="a-marker">A:</strong>
            <div class="answer-text" data-encoded="${encodedAnswer}"></div>
          </div>
        </div>
      `;
    });

    tabContentHtml += `</div>`;
  });

  // Create complete HTML with tabs and JavaScript
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
      color: #333;
    }
    
    h1 {
      color: #ff3e00;
      text-align: center;
      margin-bottom: 30px;
    }
    
    h2 {
      color: #ff3e00;
      margin-top: 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
    }
    
    /* Tab styles */
    .tab-container {
      display: flex;
      flex-wrap: wrap;
      border-bottom: 1px solid #ddd;
      margin-bottom: 20px;
    }
    
    .tab-button {
      background-color: #f5f5f5;
      border: 1px solid #ddd;
      border-bottom: none;
      padding: 10px 15px;
      cursor: pointer;
      margin-right: 2px;
      border-radius: 5px 5px 0 0;
      outline: none;
    }
    
    .tab-button:hover {
      background-color: #eaeaea;
    }
    
    .tab-button.active {
      background-color: #ff3e00;
      color: white;
      border-color: #ff3e00;
    }
    
    .tab-content {
      display: none;
      padding: 20px 0;
    }
    
    .tab-content.active {
      display: block;
    }
    
    /* QA pair styles */
    .qa-pair {
      margin-bottom: 20px;
      border: 1px solid #ddd;
      border-radius: 5px;
      overflow: hidden;
    }
    
    .question {
      padding: 15px;
      background-color: white;
      cursor: pointer;
    }
    
    .question:hover {
      background-color: #f9f9f9;
    }
    
    .question-header {
      display: flex;
      align-items: flex-start;
    }
    
    .question-text {
      flex-grow: 1;
    }
    
    .q-marker, .a-marker {
      color: #ff3e00;
      margin-right: 10px;
      font-weight: bold;
    }
    
    .toggle-icon {
      margin-left: 10px;
    }
    
    .answer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
      background-color: #f9f9f9;
      padding: 0 15px;
      display: flex;
    }
    
    .answer.expanded {
      max-height: 5000px;
      padding: 15px;
    }
    
    .answer-text {
      flex-grow: 1;
      white-space: pre-wrap;
    }
    
    /* Code styles */
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
    }
  </style>
</head>
<body>
  <h1>Svelte Training Data Visualization</h1>
  
  <div class="tab-container" id="source-tabs">
    ${tabsHtml}
  </div>
  
  <div id="tab-contents">
    ${tabContentHtml}
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #666; font-size: 0.9rem;">
    <p>Generated on ${new Date().toLocaleString()}</p>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Helper functions
      function decodeBase64(str) {
        try {
          return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
        } catch (e) {
          return atob(str);
        }
      }
      
      function escapeHtml(str) {
        return str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }
      
      function processCodeBlocks(text) {
        // Format code blocks
        let formatted = text.replace(/\`\`\`([a-z]*)([\s\S]*?)\`\`\`/g, 
          function(match, language, code) {
            return '<pre><code class="language-' + (language || 'plaintext') + '">' + 
              escapeHtml(code) + '</code></pre>';
          }
        );
        
        // Format inline code
        formatted = formatted.replace(/\`([^\`]+)\`/g, 
          function(match, code) {
            return '<code>' + escapeHtml(code) + '</code>';
          }
        );
        
        return formatted;
      }
      
      // Initialize tabs
      const tabButtons = document.querySelectorAll('.tab-button');
      const tabContents = document.querySelectorAll('.tab-content');
      
      // Add click event to all tab buttons
      tabButtons.forEach(function(button) {
        button.addEventListener('click', function() {
          // Remove active class from all buttons and contents
          tabButtons.forEach(btn => btn.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));
          
          // Add active class to clicked button
          button.classList.add('active');
          
          // Show corresponding content
          const tabId = button.getAttribute('data-tab');
          document.getElementById(tabId).classList.add('active');
        });
      });
      
      // Activate first tab by default
      if (tabButtons.length > 0) {
        tabButtons[0].classList.add('active');
        const firstTabId = tabButtons[0].getAttribute('data-tab');
        document.getElementById(firstTabId).classList.add('active');
      }
      
      // Add click event to questions to toggle answers
      document.querySelectorAll('.question').forEach(function(question) {
        question.addEventListener('click', function() {
          const qaId = question.getAttribute('data-qa-id');
          const answer = document.getElementById('qa-' + qaId);
          
          // Toggle expanded class
          answer.classList.toggle('expanded');
          
          // Change toggle icon
          const icon = question.querySelector('.toggle-icon');
          icon.textContent = answer.classList.contains('expanded') ? '▲' : '▼';
          
          // Decode and render answer text if it's not been done yet
          const answerTextElement = answer.querySelector('.answer-text');
          if (answerTextElement.innerHTML === '') {
            const encodedText = answerTextElement.getAttribute('data-encoded');
            const decodedText = decodeBase64(encodedText);
            
            // Process and insert the text
            answerTextElement.innerHTML = processCodeBlocks(decodedText);
          }
        });
      });
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
