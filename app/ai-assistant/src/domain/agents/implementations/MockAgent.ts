import fs from "node:fs";
import path from "node:path";
import { IMockAgent } from "../types/Agent.js";

export class MockAgent implements IMockAgent {
  private mockResponse: any = null;
  private mockFilePath: string;

  constructor() {
    this.mockFilePath = path.join(process.cwd(), 'mock-response.json');
    this.loadMockResponse();
  }

  private loadMockResponse(): void {
    try {
      if (fs.existsSync(this.mockFilePath)) {
        const data = fs.readFileSync(this.mockFilePath, 'utf-8');
        this.mockResponse = JSON.parse(data);
      }
    } catch (error) {
    }
  }

  private parseMockResponseData(): { textContent: string, toolCalls: any[] } {
    if (!this.mockResponse) {
      return { textContent: '', toolCalls: [] };
    }

    let textContent = '';
    const toolCalls: any[] = [];

    // Parse the mock response array to extract text deltas, tool calls, and outputs
    for (const event of this.mockResponse) {
      if (event.type === 'text-delta' && event.delta) {
        textContent += event.delta;
      } else if (event.type === 'tool-input-available') {
        // Find the corresponding tool-output-available event
        const outputEvent = this.mockResponse.find((e: any) =>
          e.type === 'tool-output-available' && e.toolCallId === event.toolCallId
        );

        toolCalls.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          output: outputEvent ? outputEvent.output : event.input // Use actual output if available, fallback to input
        });
      }
    }

    return { textContent, toolCalls };
  }


  async streamMockResponse(): Promise<Response> {
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
          output: toolCall.output // Use the actual output from the mock data
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
}