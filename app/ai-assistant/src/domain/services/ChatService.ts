import fs from "node:fs";
import path from "node:path";
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, ModelMessage, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { INSTRUCTIONS_1, INSTRUCTIONS_1_B, INSTRUCTIONS_2 } from "../../utils/prompts.js";

const MODEL_OPENAI = process.env.MODEL_OPENAI || "gpt-4o";
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_688ceeab314c8191a557a849b28cf815";


const ProposeEditSchema = z.object({
  mode: z.enum(["add", "replace", "delete"]),
  code: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});

export type ProposeEditInput = z.infer<typeof ProposeEditSchema>;

export class ChatService {
  private readonly systemPrompt: string;
  private mockMode: boolean = false;
  private mockResponse: any = null;
  private mockFilePath: string;

  private readonly defaultInstructions = INSTRUCTIONS_1_B;

  constructor() {
    this.systemPrompt = this.getInstructions();
    this.mockFilePath = path.join(process.cwd(), 'mock-response.json');
    this.mockMode = process.env.ENABLE_MOCK_MODE === 'true';
    if (this.mockMode) {
      this.loadMockResponse();
      console.log('Mock mode enabled via environment variable');
    }
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

  private getMetadatasMessages(userMessages: UIMessage[]): ModelMessage[] {
    let metadataMessages: ModelMessage[] = [];
    for (const message of userMessages) {
      const { language, currentLine, code } = message.metadata as { language: string, currentLine: number, code: string } || {};
      let content = "";
      if (language) content += `Language: ${language}\n`
      if (currentLine) content += `Current line: ${currentLine}\n`
      if (code) content += `Code:\`\`\`${code}\`\`\``;
      if (content) {
        metadataMessages.push({ role: "user", content });
      }
    }
    return metadataMessages;
  }

  // Métodos para manejar el sistema de mock simple
  private loadMockResponse(): void {
    try {
      if (fs.existsSync(this.mockFilePath)) {
        const data = fs.readFileSync(this.mockFilePath, 'utf-8');
        this.mockResponse = JSON.parse(data);
        console.log('Mock response loaded');
      }
    } catch (error) {
      console.error('Error loading mock response:', error);
    }
  }


  public isMockMode(): boolean {
    return this.mockMode;
  }

  private parseMockResponseData(): { textContent: string, toolCalls: any[] } {
    if (!this.mockResponse) {
      return { textContent: '', toolCalls: [] };
    }

    let textContent = '';
    const toolCalls: any[] = [];

    // Parse the mock response array to extract text deltas and tool calls
    for (const event of this.mockResponse) {
      if (event.type === 'text-delta' && event.delta) {
        textContent += event.delta;
      } else if (event.type === 'tool-input-available') {
        toolCalls.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input
        });
      }
    }

    return { textContent, toolCalls };
  }

  private createMockStreamResponse() {
    const { textContent, toolCalls } = this.parseMockResponseData();

    // Create a mock response that simulates the AI SDK's toUIMessageStreamResponse format
    // We'll create an async generator that yields the events
    const mockEvents = async function* () {
      // Send start event
      yield `data: ${JSON.stringify({ type: 'start' })}\n\n`;

      // Send start-step event
      yield `data: ${JSON.stringify({ type: 'start-step' })}\n\n`;

      // Send text-start event
      yield `data: ${JSON.stringify({
        type: 'text-start',
        id: 'mock_message_id'
      })}\n\n`;

      // Send text content in chunks to simulate streaming
      const chunkSize = 5; // Characters per chunk
      for (let i = 0; i < textContent.length; i += chunkSize) {
        const chunk = textContent.slice(i, i + chunkSize);
        yield `data: ${JSON.stringify({
          type: 'text-delta',
          id: 'mock_message_id',
          delta: chunk
        })}\n\n`;

        // Add small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Send text-end event
      yield `data: ${JSON.stringify({
        type: 'text-end',
        id: 'mock_message_id'
      })}\n\n`;

      // Send tool calls if any
      for (const toolCall of toolCalls) {
        yield `data: ${JSON.stringify({
          type: 'tool-input-start',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName
        })}\n\n`;

        yield `data: ${JSON.stringify({
          type: 'tool-input-available',
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input
        })}\n\n`;

        yield `data: ${JSON.stringify({
          type: 'tool-output-available',
          toolCallId: toolCall.toolCallId,
          output: toolCall.input // Mock: output same as input
        })}\n\n`;
      }

      // Send finish-step event
      yield `data: ${JSON.stringify({ type: 'finish-step' })}\n\n`;

      // Send finish event
      yield `data: ${JSON.stringify({ type: 'finish' })}\n\n`;
    };

    // Create a ReadableStream from the async generator
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of mockEvents()) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    // Return a Response object that mimics the AI SDK's toUIMessageStreamResponse
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }

  async streamChat(userMessages: UIMessage[]) {
    if (this.mockMode && this.mockResponse) {
      console.log('Returning saved mock response');
      return this.createMockStreamResponse();
    }

    const messages = convertToModelMessages(userMessages);
    const metadataMessages = this.getMetadatasMessages(userMessages);

    const result = streamText({
      model: openai(MODEL_OPENAI),
      messages: [
        ...metadataMessages,
        ...messages],
      system: this.systemPrompt,
      tools: {
        // @ts-ignore
        proposeEdit: tool({
          description: "Propose an edit of the code to apply in the editor",
          inputSchema: ProposeEditSchema,
          execute: async (args: ProposeEditInput) => args,
        }),
      },
    });


    console.log('result\n\n', result)
    return result.toUIMessageStreamResponse();
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
