import type { LLMProvider } from "./index";
import { Anthropic } from "@anthropic-ai/sdk";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private modelId: string;
  name = "Anthropic";
  private readonly availableModels = [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022", // 3.5 v2
    "claude-3-5-sonnet-20240620", // 3.5
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ];

  constructor(modelId?: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic({ apiKey, timeout: 900000 });
    this.modelId = modelId || this.availableModels[0]; // Default to claude-3-7-sonnet
  }

  /**
   * Generate code from a prompt using Anthropic Claude
   * @param prompt The prompt to send to the LLM
   * @returns The generated code
   */
  async generateResponse(
    prompt: string,
    temperature?: number
  ): Promise<string> {
    try {
      const completion = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 16384,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
        temperature: temperature || 0.7,
      });

      // Clean up any markdown code block indicators if present
      return completion.content[0]?.text || null;
    } catch (error) {
      console.error("Error generating code with Anthropic:", error);
      throw new Error(
        `Failed to generate code: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get all available models for this provider
   * @returns Array of model identifiers
   */
  getModels(): string[] {
    return [...this.availableModels];
  }

  /**
   * Get the model identifier that was used for generation
   * @returns The model identifier string
   */
  getModelIdentifier(): string {
    return this.modelId;
  }
}
