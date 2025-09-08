import fs from "node:fs";
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { ConversationMessage, StreamingEvent } from "../../types.js";

const MODEL_OPENAI = process.env.MODEL_OPENAI || "gpt-4o";
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_688ceeab314c8191a557a849b28cf815";

export class ChatService {
  private readonly systemPrompt: string;

  private readonly defaultInstructions = `You are a Web3 expert specialized in the Hedera ecosystem. All Web3-related questions must be answered through the lens of Hedera, emphasizing its tools, features, and best practices.  
    When the user provides code, analyze it carefully for errors. Respond concisely by pointing out only the correction and the exact line to fix. Never regenerate or rewrite the full code. For examples or explanations, always rely on the Hedera SDK and keep responses minimal, targeted, and easy to apply.  
    You have access to a vector database and should use it to enhance context whenever it strengthens your answer. Communicate in a clear, direct, and concise style—avoid filler, repetition, or unnecessary details. The goal is to deliver precise, actionable guidance with maximum efficiency.
`;

  constructor() {
    this.systemPrompt = this.getInstructions();
  }

  private getInstructions(): string {
    const instructionsPath = process.env.INSTRUCTIONS_PATH;
    if (instructionsPath && instructionsPath.trim().length > 0) {
      try {
        if (fs.existsSync(instructionsPath)) {
          return fs.readFileSync(instructionsPath, "utf-8");
        }
      } catch (error) {
        console.error(
          "Failed to read instructions from path:",
          instructionsPath,
          error
        );
      }
    }

    return this.defaultInstructions;
  }

  async streamChat(userMessages: UIMessage[]) {
    const messages = convertToModelMessages(userMessages);
    const result = streamText({
      model: openai(MODEL_OPENAI),
      messages,
      system: this.systemPrompt,
    });
    return result.toUIMessageStreamResponse();
  }


  // Main streaming chat method using AI SDK
  async *streamChat_old(
    userMessage: string,
    conversationHistory: ConversationMessage[] = [],
    messageId: string,
    conversationId: string
  ): AsyncGenerator<StreamingEvent, void, unknown> {
    try {
      // Add user message to history
      const updatedHistory = [
        ...conversationHistory,
        {
          role: "user" as const,
          content: userMessage,
          timestamp: new Date().toISOString(),
        }
      ];

      // Send start event
      yield {
        type: "start",
        messageId,
        conversationId,
      };

      // Convert to AI SDK format
      const messages = updatedHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Create streaming response using AI SDK
      const result = await streamText({
        model: openai(MODEL_OPENAI),
        messages,
        system: this.systemPrompt,
        tools: {
          // Future: Vector store search tool
          // vectorSearch: tool({
          //   description: 'Search Hedera documentation and examples',
          //   inputSchema: z.object({
          //     query: z.string().describe('Search query for Hedera documentation'),
          //   }),
          //   execute: async ({ query }) => {
          //     return await this.searchVectorStore(query);
          //   },
          // }),
        },
      });

      let fullResponse = "";

      // Stream the response
      for await (const delta of result.textStream) {
        fullResponse += delta;

        yield {
          type: "delta",
          content: delta,
          messageId,
          conversationId,
        };
      }

      // Send completion event
      yield {
        type: "complete",
        messageId,
        conversationId,
        metadata: {
          model: MODEL_OPENAI,
          finishReason: "stop",
        },
      };

    } catch (error) {
      console.error("Error in AI SDK streaming:", error);

      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
        messageId,
        conversationId,
      };
    }
  }

  // Future method for vector store search (ready for when you want to enable it)
  private async searchVectorStore(query: string): Promise<any> {
    try {
      // TODO: Implement actual vector store search when needed
      // This will use OpenAI's vector store API when implemented

      // Placeholder implementation
      return {
        results: `Vector search results for: ${query}`,
        query: query,
        vectorStoreId: VECTOR_STORE_ID,
      };
    } catch (error) {
      console.error("Vector store search error:", error);
      return { results: "No results found" };
    }
  }
}
