import { convertToModelMessages, UIMessage } from 'ai';
import { createLogger, AppLogger } from '../../utils/logger.js';
import { UserMetadata, UserMetadataType, ExecutionContext } from '../../types.js';
import { CodeReviewAgent, GeneralAssistantAgent, ExecutionAnalyzerAgent, IMockAgent } from '../agents/index.js';
import { MockAgent } from '../agents/implementations/MockAgent.js';
import { CacheClient } from '../../infrastructure/persistence/RedisConnector.js';
import { 
  AuthenticationError, 
  UsageLimitError, 
  ValidationError, 
  ErrorReason 
} from '../../utils/errors.js';
import { UserAIKeyService } from './UserAIKeyService.js';
import { UserAIKeyRepositoryImpl } from '../../infrastructure/repositories/impl/UserAIKeyRepositoryImpl.js';

const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || 'vs_688ceeab314c8191a557a849b28cf815';
const TOKENS_LIMIT_PER_MONTH = Number(process.env.TOKENS_LIMIT_PER_MONTH) || 100000;
const CODE_REVIEW_MODEL = process.env.CODE_REVIEW_MODEL || 'gpt-4o-mini';
const CODE_INTEGRATION_MODEL = process.env.CODE_INTEGRATION_MODEL || 'gpt-4o-mini';
const GENERAL_ASSISTANT_MODEL = process.env.GENERAL_ASSISTANT_MODEL || 'gpt-4o-mini';
const EXECUTION_ANALYZER_MODEL = process.env.EXECUTION_ANALYZER_MODEL || 'gpt-4o-mini';

export class ChatService {
  private mockMode: boolean = false;
  private logger: AppLogger;

  private codeReviewAgent: CodeReviewAgent;
  private generalAssistantAgent: GeneralAssistantAgent;
  private executionAnalyzerAgent: ExecutionAnalyzerAgent;
  private mockAgent: IMockAgent | null = null;
  private userAIKeyService: UserAIKeyService;

  constructor() {
    this.mockMode = process.env.ENABLE_MOCK_MODE === 'true';
    this.logger = createLogger();

    this.codeReviewAgent = new CodeReviewAgent(CODE_REVIEW_MODEL, CODE_INTEGRATION_MODEL);
    this.generalAssistantAgent = new GeneralAssistantAgent(GENERAL_ASSISTANT_MODEL);
    this.executionAnalyzerAgent = new ExecutionAnalyzerAgent(EXECUTION_ANALYZER_MODEL);
    this.userAIKeyService = new UserAIKeyService(new UserAIKeyRepositoryImpl());

    if (this.mockMode) {
      this.mockAgent = new MockAgent();
      this.logger.info('Mock mode enabled');
    }
  }

  async streamChat(userMessages: UIMessage[], userId: string, sessionId: string) {
    const requestLogger = this.logger.child({ userId, sessionId });

    const metadata = this.getMetadata(userMessages);

    if (!metadata) {
      requestLogger.error('No metadata found in request');
      throw new ValidationError('No metadata found in request', ErrorReason.MISSING_METADATA);
    }

    let model: string | undefined;
    let apiKey: string | undefined;
    if (metadata.useCustomKey) {
      apiKey = await this.getCustomApiKey(userId);
      model = metadata.model;
      if (!apiKey) {
        requestLogger.warn('Custom key requested but not found for user', { userId });
        throw new AuthenticationError('Custom key not found for user', ErrorReason.CUSTOM_KEY_NOT_FOUND);
      }
    } else {
      const tokenUsed = await CacheClient.getNumber(userId);
      requestLogger.debug('Token used', { tokenUsed: tokenUsed, tokenLimit: TOKENS_LIMIT_PER_MONTH });
      if (Number(tokenUsed) > Number(TOKENS_LIMIT_PER_MONTH)) {
        requestLogger.error('Token limit exceeded', undefined, {
          tokenUsed,
          limit: TOKENS_LIMIT_PER_MONTH
        });
        throw new UsageLimitError('Token limit exceeded', ErrorReason.TOKEN_LIMIT_EXCEEDED, {
          tokenUsed,
          limit: TOKENS_LIMIT_PER_MONTH
        });
      }
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

    requestLogger.debug('Full user input', { userInput, metadata, apiKeyFound: Boolean(apiKey) });

    if (this.isMockMode()) {
      requestLogger.info('Returning saved mock response');
      return this.mockAgent?.streamMockResponse();
    }

    const userModelMessages = convertToModelMessages(userMessages);
    // Create execution context
    const context: ExecutionContext = {
      userId,
      sessionId,
      model,
      userApiKey: apiKey
    };

    try {
      switch (metadata.type) {
        case UserMetadataType.CODE_REVIEW:
          return this.codeReviewAgent.streamCodeProposal(userModelMessages, metadata, context);
        case UserMetadataType.EXECUTION_ANALYSIS:
          return this.executionAnalyzerAgent.streamText(userModelMessages, metadata, context);
        case UserMetadataType.GENERAL_ASSISTANT:
          return this.generalAssistantAgent.streamText(userModelMessages, metadata, context);
        default:
          requestLogger.error('Unknown metadata type', undefined, { type: metadata.type });
          throw new ValidationError('Unknown metadata type', ErrorReason.UNKNOWN_METADATA_TYPE, { type: metadata.type });
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

  private async getCustomApiKey(userId: string): Promise<string | undefined> {
    let userApiKey: string | undefined;
    try {
      const hasKey = await this.userAIKeyService.hasKey(userId);
      if (hasKey) {
        const keyData = await this.userAIKeyService.retrieveKey(userId);
        userApiKey = keyData.apiKey;
        this.logger.info('Using user BYOK API key');
      }
    } catch (error) {
      // If key retrieval fails, continue with system key
      this.logger.warn('Failed to retrieve user API key, using system key');
    }
    return userApiKey;
  }
}
