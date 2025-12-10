import { ModelMessage, streamText } from 'ai';
import { IGeneralAssistantAgent } from '../types/Agent.js';
import { UserMetadata, ExecutionContext } from '../../../types.js';
import { PROMPT_GENERAL } from '../../../utils/prompts.js';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';
import { createLogger } from '../../../utils/logger.js';

export class GeneralAssistantAgent implements IGeneralAssistantAgent {
  private model: string;
  private logger = createLogger(undefined, 'GeneralAssistantAgent');

  constructor(model: string) {
    this.model = model;
  }

  async streamText(userMessages: ModelMessage[], metadata: UserMetadata, context: ExecutionContext): Promise<Response> {
    const requestLogger = this.logger.child({ userId: context.userId, sessionId: context.sessionId });
    requestLogger.info('Starting', {
      messageCount: userMessages.length,
      hasLanguage: !!metadata.language,
      model: context.model || this.model,
      usingCustomKey: Boolean(context.userApiKey)
    });

    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    // Use user's API key if provided (BYOK), otherwise use system key
    const openaiProvider = context.userApiKey ? createOpenAI({ apiKey: context.userApiKey }) : openai;

    const result = streamText({
      model: openaiProvider(context.model || this.model),
      messages,
      system: PROMPT_GENERAL
    });
    const tokens = await result.usage;
    requestLogger.info('Token usage', {
      tokens_i_o: `${tokens.inputTokens} + ${tokens.outputTokens} = ${tokens.totalTokens}`
    });

    if (!context.userApiKey) {
      await CacheClient.incrementNumber('GENERAL_ASSISTANT_INPUT_TOKENS', tokens.inputTokens!);
      await CacheClient.incrementNumber('GENERAL_ASSISTANT_OUTPUT_TOKENS', tokens.outputTokens!);
      await CacheClient.incrementNumberUntilEndOfMonth(context.userId, tokens.totalTokens!);
    }
    return result.toUIMessageStreamResponse();
  }

  private createContextMessages(metadata: UserMetadata): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (metadata.language) {
      messages.push({
        role: 'user',
        content: `The user is working with: ${metadata.language}`
      });
    }

    return messages;
  }
}
