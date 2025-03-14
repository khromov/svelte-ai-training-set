import type { LLMProvider } from "./index";
import OpenAI from "openai";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private modelId: string;
  name = "OpenAI";
  private readonly availableModels = [
    "gpt-4o",
    //"o1-mini",
    //"o1-preview",
    "o3-mini",
    //"o1-mini",
  ];

  constructor(modelId?: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({ apiKey });
    this.modelId = modelId || this.availableModels[0];
  }

  /**
   * Generate code from a prompt using OpenAI
   * @param prompt The prompt to send to the LLM
   * @returns The generated code
   */
  async generateCode(prompt: string): Promise<string | null> {
    try {
      console.log(
        `🤖 Generating code with OpenAI using model: ${this.modelId}...`
      );

      const completion = await this.client.chat.completions.create({
        model: this.modelId,
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant.",
          },
          { role: "user", content: prompt },
        ],
        // temperature: 0.7,
      });

      const generatedCode = completion.choices[0]?.message.content || "";

      return completion.choices[0]?.message.content;
    } catch (error) {
      console.error("Error generating code with OpenAI:", error);
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
