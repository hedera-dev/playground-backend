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
    // CORS is handled by HAProxy

    this.fastify.post(`${this.basePath}/chat`, async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { messages: UIMessage[] };
      const { messages, ...rest } = body;
      console.log('messages', messages);
      console.log('rest', rest);
      return this.chatService.streamChat(messages);
    });

    // Get conversation history
    this.fastify.get(`${this.basePath}/chat/history/:conversationId`, async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getConversationHistory(request, reply);
    });

    console.log("Chat HTTP routes registered successfully");
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
