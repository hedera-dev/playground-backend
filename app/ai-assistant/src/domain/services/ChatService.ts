import fs from 'node:fs';
import { convertToModelMessages, UIMessage } from 'ai';
import { createLogger, AppLogger } from '../../utils/logger.js';
import { UserMetadata, UserMetadataType } from '../../types.js';
import { INSTRUCTIONS_1_B } from '../../utils/prompts.js';
import { CodeReviewAgent, GeneralAssistantAgent, ExecutionAnalyzerAgent, IMockAgent } from '../agents/index.js';
import { MockAgent } from '../agents/implementations/MockAgent.js';
import { CacheClient } from '../../infrastructure/persistence/RedisConnector.js';
import { APIError } from '../../utils/errors.js';

const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || 'vs_688ceeab314c8191a557a849b28cf815';
const TOKENS_LIMIT_PER_MONTH = Number(process.env.TOKENS_LIMIT_PER_MONTH) || 100000;
export class ChatService {
  private mockMode: boolean = false;
  private logger: AppLogger;

  private codeReviewAgent: CodeReviewAgent;
  private generalAssistantAgent: GeneralAssistantAgent;
  private executionAnalyzerAgent: ExecutionAnalyzerAgent;
  private mockAgent: IMockAgent | null = null;

  constructor() {
    this.mockMode = process.env.ENABLE_MOCK_MODE === 'true';
    this.logger = createLogger();

    this.codeReviewAgent = new CodeReviewAgent('gpt-4o-mini', 'gpt-4o-mini');
    this.generalAssistantAgent = new GeneralAssistantAgent('gpt-4o-mini');
    this.executionAnalyzerAgent = new ExecutionAnalyzerAgent('gpt-4o-mini');

    if (this.mockMode) {
      this.mockAgent = new MockAgent();
      this.logger.info('Mock mode enabled');
    }
  }

  async streamChat(userMessages: UIMessage[], userId: string, sessionId: string) {
    const requestLogger = this.logger.child({ userId, sessionId });

    const tokenUsed = await CacheClient.getNumber(userId);
    if (Number(tokenUsed) > TOKENS_LIMIT_PER_MONTH) {
      requestLogger.error('Token limit exceeded', undefined, {
        tokenUsed,
        limit: TOKENS_LIMIT_PER_MONTH
      });
      throw new APIError('Token limit exceeded', 429);
    }

    // Extract user input for logging
    const lastMessage = userMessages[userMessages.length - 1];
    const userInput = lastMessage
      ? lastMessage.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as any).text)
        .join(' ') || 'No text content'
      : 'No content';

    requestLogger.info('Processing chat request', {
      messageCount: userMessages.length,
      inputLength: userInput.length
    });

    requestLogger.debug('Full user input', { userInput });

    if (this.isMockMode()) {
      requestLogger.info('Returning saved mock response');
      return this.mockAgent?.streamMockResponse();
    }

    const userModelMessages = convertToModelMessages(userMessages);
    const metadata = this.getMetadata(userMessages);

    requestLogger.debug('Metadata received', { metadata });

    if (!metadata) {
      requestLogger.error('No metadata found in request');
      return null; // TODO: Handle this case
    }

    try {
      switch (metadata.type) {
        case UserMetadataType.CODE_REVIEW:
          return this.codeReviewAgent.streamCodeProposal(userModelMessages, metadata, userId, sessionId);
        case UserMetadataType.EXECUTION_ANALYSIS:
          return this.executionAnalyzerAgent.streamText(userModelMessages, metadata, userId, sessionId);
        case UserMetadataType.GENERAL_ASSISTANT:
          return this.generalAssistantAgent.streamText(userModelMessages, metadata, userId, sessionId);
        default:
          requestLogger.error('Unknown metadata type', undefined, { type: metadata.type });
          return null;
      }
    } catch (error) {
      requestLogger.error('Error processing chat request', error);
      throw error;
    }
  }

  // Future method for vector store search (ready for when you want to enable it)
  private async searchVectorStore(query: string): Promise<any> {
    try {
      this.logger.debug('Searching vector store', { query, vectorStoreId: VECTOR_STORE_ID });

      // TODO: Implement actual vector store search when needed
      // This will use OpenAI's vector store API when implemented

      // Placeholder implementation
      return {
        results: `Vector search results for: ${query}`,
        query: query,
        vectorStoreId: VECTOR_STORE_ID
      };
    } catch (error) {
      this.logger.error('Vector store search failed', error, { query });
      return { results: 'No results found' };
    }
  }

  private getMetadata(userMessages: UIMessage[]): UserMetadata | null {
    const lastMessage = userMessages[userMessages.length - 1];
    if (lastMessage.metadata) {
      return lastMessage.metadata as UserMetadata;
    }

    return null;
  }

  private isMockMode(): boolean {
    return this.mockMode;
  }
}
