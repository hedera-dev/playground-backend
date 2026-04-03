import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ChatService } from '../../../domain/services/ChatService.js';
import { ChatSession, PortalType } from '../../../types.js';
import { UIMessage } from 'ai';
import { NotFoundError, ErrorReason } from '../../../utils/errors.js';
import { BASE_PATH } from '../../../utils/constants.js';

export class ChatControllerImpl {
  private basePath = BASE_PATH;
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
    const body = request.body as { 
      messages: UIMessage[], 
      userId: string, 
      id: string, 
      model?: string, 
      useCustomKey?: boolean,
      type?: PortalType
    };
    const userId = (request.headers['x-user-id'] as string) || 'unknown';
    const sessionId = body.id;
    const { messages, type } = body;
    return this.chatService.streamChat(messages, userId, sessionId, type);
  }

  private async getConversationHistory(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const { conversationId } = request.params as { conversationId: string };

    const session = this.sessions.get(conversationId);
    if (!session) {
      throw new NotFoundError('Conversation not found', ErrorReason.CONVERSATION_NOT_FOUND);
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
