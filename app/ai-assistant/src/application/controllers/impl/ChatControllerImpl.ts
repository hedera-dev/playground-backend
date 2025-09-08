import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ChatService } from "../../../domain/services/ChatService.js";
import { ChatRequestSchema, ChatSession } from "../../../types.js";
import { UIMessage } from "ai";

export class ChatControllerImpl {
  private basePath = "/api/playground/assistant";
  private chatService: ChatService;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(private fastify: FastifyInstance) {
    this.chatService = new ChatService();
  }

  async registerRoutes(): Promise<void> {
    // Register CORS for streaming
    await this.fastify.register((await import('@fastify/cors')).default, {
      origin: true,
      credentials: true,
    });

    // Chat streaming endpoint -old method without ai sdk
    this.fastify.post(`${this.basePath}/chat/stream`, async (request: FastifyRequest, reply: FastifyReply) => {
      return this.handleChatStream(request, reply);
    });

    this.fastify.post(`${this.basePath}/chat`, async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { messages: UIMessage[] };
      const { messages } = body;

      return this.chatService.streamChat(messages);
    });

    // Get conversation history
    this.fastify.get(`${this.basePath}/chat/history/:conversationId`, async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getConversationHistory(request, reply);
    });

    console.log("Chat HTTP routes registered successfully");
  }

  private async handleChatStream(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      // Validate request body
      const parseResult = ChatRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400).send({
          error: "Invalid request format",
          details: parseResult.error.errors,
        });
        return;
      }

      const { message, conversationId, messageId } = parseResult.data;

      // Generate IDs if not provided
      const finalConversationId = conversationId || this.generateId("conv");
      const finalMessageId = messageId || this.generateId("msg");

      // Get or create session
      let session = this.sessions.get(finalConversationId);
      if (!session) {
        session = {
          id: finalConversationId,
          conversationHistory: [],
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        this.sessions.set(finalConversationId, session);
      }

      // Set up Server-Sent Events
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Handle client disconnect
      request.raw.on('close', () => {
        console.log('Client disconnected from stream');
      });

      // Stream the chat response
      let fullAssistantResponse = "";

      for await (const event of this.chatService.streamChat(
        message,
        session.conversationHistory,
        finalMessageId,
        finalConversationId
      )) {
        // Send SSE event
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

        // Accumulate assistant response
        if (event.type === "delta" && event.content) {
          fullAssistantResponse += event.content;
        }

        // Update session history when complete
        if (event.type === "complete") {
          session.conversationHistory.push(
            {
              role: "user",
              content: message,
              timestamp: new Date().toISOString(),
            },
            {
              role: "assistant",
              content: fullAssistantResponse,
              timestamp: new Date().toISOString(),
            }
          );
          session.lastActivity = new Date();
        }
      }

      // Close the stream
      reply.raw.end();

    } catch (error) {
      console.error("Error in chat stream:", error);

      const errorEvent = {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };

      reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
      reply.raw.end();
    }
  }

  private async getConversationHistory(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { conversationId } = request.params as { conversationId: string };

    const session = this.sessions.get(conversationId);
    if (!session) {
      reply.status(404).send({ error: "Conversation not found" });
      return;
    }

    return {
      conversationId: session.id,
      history: session.conversationHistory,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }

  // Clean up old sessions (call this periodically)
  public cleanupOldSessions(maxAgeHours: number = 24): void {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    for (const [id, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoff) {
        this.sessions.delete(id);
      }
    }
  }

  public getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}
