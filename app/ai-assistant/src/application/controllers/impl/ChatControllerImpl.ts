import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ChatService } from '../../../domain/services/ChatService.js';
import { ChatRequestSchema, ChatSession } from '../../../types.js';
import { UIMessage } from 'ai';
import { th } from 'zod/v4/locales';

export class ChatControllerImpl {
  private basePath = '/api/playground/assistant';
  private chatService: ChatService;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(private fastify: FastifyInstance) {
    this.chatService = new ChatService();
  }

  async registerRoutes(): Promise<void> {
    this.fastify.post(`${this.basePath}/chat`, this.startConversation.bind(this));
    this.fastify.get(`${this.basePath}/chat/history/:conversationId`, this.getConversationHistory.bind(this));
  }

  private async startConversation(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as { messages: UIMessage[] };
    const userId = (request.headers['x-user-id'] as string) || 'unknown';
    const { messages } = body;
    return this.chatService.streamChat(messages, userId);
  }

  private async getConversationHistory(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { conversationId } = request.params as { conversationId: string };

    const session = this.sessions.get(conversationId);
    if (!session) {
      reply.status(404).send({ message: 'Conversation not found' });
      return;
    }

    return {
      conversationId: session.id,
      history: session.conversationHistory,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    };
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
