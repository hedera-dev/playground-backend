import fs from "node:fs";
import path from "node:path";
import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, ModelMessage, streamText, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { createAgentLogger } from "../../utils/logger.js";
import { ConversationMessage, StreamingEvent } from "../../types.js";
import { INSTRUCTIONS_1, INSTRUCTIONS_1_B, INSTRUCTIONS_2, INSTRUCTIONS_TWO_AGENT } from "../../utils/prompts.js";

const MODEL_OPENAI = process.env.MODEL_OPENAI || "gpt-4o";
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_688ceeab314c8191a557a849b28cf815";

// Schema original para compatibilidad
const ProposeEditSchema = z.object({
  mode: z.enum(["add", "replace", "delete"]),
  code: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});

// Nuevo schema para el primer agente - propone cambios con contexto
const ProposeCodeChangeSchema = z.object({
  changes: z.array(z.object({
    mode: z.enum(["add", "replace", "delete"]),
    code: z.string().describe("The new/modified code with proper indentation"),
    contextBefore: z.string().describe("Code lines before the change for location identification"),
    contextAfter: z.string().describe("Code lines after the change for location identification"),
    // description: z.string().describe("Description of what this change does")
  }))
});

// Schema para el segundo agente (mantener el original)
const ApplyCodeChangeSchema = z.object({
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
  private logger: ReturnType<typeof createAgentLogger>;

  private readonly defaultInstructions = INSTRUCTIONS_1_B;
  private readonly twoAgentMode: boolean;

  constructor() {
    this.twoAgentMode = process.env.ENABLE_TWO_AGENT_MODE === 'true';
    this.systemPrompt = this.getInstructions();
    this.mockFilePath = path.join(process.cwd(), 'mock-response.json');
    this.mockMode = process.env.ENABLE_MOCK_MODE === 'true';
    this.logger = createAgentLogger();

    if (this.mockMode) {
      this.loadMockResponse();
      this.logger.logSession('Mock mode enabled');
    }
    if (this.twoAgentMode) {
      this.logger.logSession('Two-agent mode enabled');
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
        this.logger.logError('SYSTEM', `Failed to read instructions from path: ${instructionsPath} - ${error}`);
      }
    }

    return this.twoAgentMode ? INSTRUCTIONS_TWO_AGENT : this.defaultInstructions;
  }

  private getLastMetadata(userMessages: UIMessage[]): ModelMessage | null {
    const lastMessage = userMessages[userMessages.length - 1];
    if (lastMessage) {
      const { language, currentLine, code } = lastMessage.metadata as { language: string, currentLine: number, code: string } || {};
      let content = "";
      if (language) content += `Language: ${language}\n`
      if (currentLine) content += `Current line: ${currentLine}\n`
      if (code) content += `Code:\`\`\`${code}\`\`\``;
      if (content) {
        return { role: "user", content };
      }
    }

    return null;
  }

  // Métodos para manejar el sistema de mock simple
  private loadMockResponse(): void {
    try {
      if (fs.existsSync(this.mockFilePath)) {
        const data = fs.readFileSync(this.mockFilePath, 'utf-8');
        this.mockResponse = JSON.parse(data);
        this.logger.logSession('Mock response loaded successfully');
      }
    } catch (error) {
      this.logger.logError('SYSTEM', error);
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
    // Extract user input for logging
    const lastMessage = userMessages[userMessages.length - 1];
    // UIMessage has parts array, extract text from text parts
    const userInput = lastMessage ?
      lastMessage.parts
        .filter(part => part.type === 'text')
        .map(part => (part as any).text)
        .join(' ') || 'No text content'
      : 'No content';
    this.logger.logSession(`Processing chat request`);

    if (this.mockMode && this.mockResponse) {
      this.logger.logSession('Returning saved mock response');
      return this.createMockStreamResponse();
    }

    const userModelMessages = convertToModelMessages(userMessages);
    const metadataMessage = this.getLastMetadata(userMessages);

    if (this.twoAgentMode) {
      this.logger.logAgent1Start(userInput);
    }

    const messages = metadataMessage ? [metadataMessage, ...userModelMessages] : userModelMessages;

    // @ts-ignore
    const result = streamText({
      model: openai(MODEL_OPENAI),
      messages,
      system: this.systemPrompt,
      onFinish: (result) => {
        if (result.usage) {
          this.logger.logTokenUsage('AGENT-1', result.usage);
        }
      },
      tools: {
        // @ts-ignore
        proposeCode: tool({
          description: "Propose code changes with context - automatically determines exact locations using second agent",
          inputSchema: ProposeCodeChangeSchema,
          execute: async (args: any) => {
            this.logger.logAgent1Output(args);

            if (!args || !args.changes) {
              this.logger.logError('AGENT-1', 'Invalid arguments provided');
              return {
                error: "Invalid arguments provided",
                proposedChanges: []
              };
            }

            try {
              // Ejecutar automáticamente el segundo agente
              const originalCode = this.extractCodeFromMessages(userMessages);
              const secondAgentChanges = await this.runSecondAgent(args, originalCode);

              this.logger.logFinalResult('complete', secondAgentChanges.length);
              return {
                // message: "Code changes proposed and locations determined",
                // @ts-ignore - args is validated above
                proposedChanges: args.changes,
                appliedChanges: secondAgentChanges,
                status: "code_generated"
              };
            } catch (error) {
              this.logger.logError('AGENT-1', error);
              this.logger.logFinalResult('partial', 0);
              return {
                // message: "Code changes proposed but failed to determine locations",
                // @ts-ignore - args is validated above
                proposedChanges: args.changes,
                error: "Failed to determine exact locations",
                status: "code_generated"
              };
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  }

  // Segundo agente que se ejecuta cuando se llama proposeCode
  private async runSecondAgent(proposedChanges: any, originalCode: string): Promise<any[]> {
    const codeLines = originalCode.split('\n').length;
    this.logger.logAgent2Start(proposedChanges.changes || [], codeLines);

    // Debug log: entrada completa del Agent 1 al Agent 2
    this.logger.getPinoLogger().debug({
      agent: 'AGENT-2',
      phase: 'INPUT-PROCESSING',
      fullInputFromAgent1: {
        proposedChanges,
        originalCodeSnippet: originalCode.substring(0, 200) + (originalCode.length > 200 ? '...' : ''),
        totalCodeLength: originalCode.length,
        totalLines: codeLines
      }
    }, '🔍 Processing complete input from Agent 1');

    if (!originalCode || !proposedChanges.changes || proposedChanges.changes.length === 0) {
      this.logger.logError('AGENT-2', 'Missing code or changes');
      return [];
    }

    // Agregar numeración de líneas al código original
    const numberedCode = originalCode.split('\n').map((line, index) =>
      `${(index + 1).toString().padStart(3, ' ')}| ${line}`
    ).join('\n');

    const prompt = `
You are a code placement specialist. Your task is to find exact line numbers for proposed changes.

Original code with line numbers:
\`\`\`
${numberedCode}
\`\`\`

Proposed changes:
${JSON.stringify(proposedChanges.changes, null, 2)}

INSTRUCTIONS:
1. Find the EXACT contextBefore text in the numbered code above
2. Find the EXACT contextAfter text in the numbered code above  
3. The target line is between these two contexts
4. Keep the indentation of the original code
5. Use applyCode tool with precise startLine and endLine numbers
6. Use 1-based line numbering (as shown in the numbered code)
7. Call applyCode ONLY ONCE per change

Process each change one by one carefully.
`;

    // Debug log: prompt completo que se envía al Agent 2
    this.logger.getPinoLogger().debug({
      agent: 'AGENT-2',
      phase: 'PROMPT-GENERATION',
      fullPrompt: prompt,
      // numberedCodePreview: numberedCode.substring(0, 500) + (numberedCode.length > 500 ? '...' : '')
      numberedCodePreview: numberedCode
    }, '📝 Generated prompt for Agent 2');

    try {
      // @ts-ignore
      const result = await streamText({
        model: openai(MODEL_OPENAI),
        messages: [{ role: 'user', content: prompt }],
        system: this.getSecondAgentInstructions(),
        tools: {
          // @ts-ignore
          applyCode: tool({
            description: "Apply code change with exact line numbers",
            inputSchema: ApplyCodeChangeSchema,
            execute: async (args: any) => {
              return args;
            },
          }),
        },
      });

      // Esperar a que termine el stream y recopilar tool calls
      const appliedChanges = [];
      const seenChanges = new Set(); // Para evitar duplicados
      let tokenUsage = null;

      try {
        for await (const delta of result.fullStream) {
          // Capturar token usage
          if (delta.type === 'finish' && delta.totalUsage) {
            tokenUsage = delta.totalUsage;
          }

          // Buscar diferentes tipos de eventos de tool calls
          if (delta.type === 'tool-call') {
            if (delta.toolName === 'applyCode') {
              // @ts-ignore - delta structure varies
              const change = delta.args || delta.input;
              const changeKey = `${change.mode}-${change.startLine}-${change.endLine}`;
              if (!seenChanges.has(changeKey)) {
                seenChanges.add(changeKey);
                appliedChanges.push(change);
              }
            }
          } else if (delta.type === 'tool-result') {
            if (delta.toolName === 'applyCode') {
              // @ts-ignore - delta structure varies
              const change = delta.result || delta.output;
              const changeKey = `${change.mode}-${change.startLine}-${change.endLine}`;
              if (!seenChanges.has(changeKey)) {
                seenChanges.add(changeKey);
                appliedChanges.push(change);
              }
            }
          }
        }
      } catch (streamError) {
        this.logger.logError('AGENT-2', streamError);
      }

      // Log token usage if available
      if (tokenUsage) {
        this.logger.logTokenUsage('AGENT-2', tokenUsage);
      }

      this.logger.logAgent2Output(appliedChanges);
      return appliedChanges;
    } catch (error) {
      this.logger.logError('AGENT-2', error);
      return [];
    }
  }

  private getSecondAgentInstructions(): string {
    return `
You are a code placement specialist - the second agent in a two-agent system.

Your task:
- Receive proposed changes with contextBefore and contextAfter
- Find the exact location in the original code by matching the context
- Use applyCode tool ONCE for each change with precise startLine and endLine

CRITICAL MATCHING PROCESS:
1. Look for the EXACT contextBefore text in the original code
2. Find the line that comes AFTER contextBefore
3. Verify that contextAfter appears AFTER that line
4. The target line is the one BETWEEN contextBefore and contextAfter

EXAMPLE:
If contextBefore is "console.log('Transfer HBAR');" (line 30)
And contextAfter is "console.log('Transaction ID');" (line 32)
Then the target line is 31 (the line between them)

Rules:
1. Use 1-based line numbering (first line = 1)
2. For "replace" mode: startLine = endLine = the line to replace
3. For "add" mode: startLine = endLine = insertion point
4. For "delete" mode: startLine and endLine define range to delete
5. ONLY call applyCode ONCE per change - no duplicates
6. Match context text EXACTLY, including whitespace and indentation

Process each change separately with applyCode tool. Be very careful with line counting.
`;
  }

  private extractCodeFromMessages(userMessages: UIMessage[]): string {
    const lastMessage = userMessages[userMessages.length - 1];
    if (lastMessage) {
      const metadata = lastMessage.metadata as { code?: string };
      if (metadata?.code) {
        return metadata.code;
      }
    }
    return '';
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
      this.logger.logError('VECTOR-STORE', error);
      return { results: "No results found" };
    }
  }
}
