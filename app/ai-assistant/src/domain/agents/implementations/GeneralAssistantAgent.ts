import { ModelMessage, streamText } from 'ai';
import { IGeneralAssistantAgent } from '../types/Agent.js';
import { UserMetadata } from '../../../types.js';
import { PROMPT_GENERAL } from '../../../utils/prompts.js';
import { openai } from '@ai-sdk/openai';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';
import { createLogger } from '../../../utils/logger.js';

export class GeneralAssistantAgent implements IGeneralAssistantAgent {
  private model: string;
  private logger = createLogger(undefined, 'GeneralAssistantAgent');

  constructor(model: string) {
    this.model = model;
  }

  async streamText(userMessages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string): Promise<Response> {
    const requestLogger = this.logger.child({ userId, sessionId });
    requestLogger.info('Starting', {
      messageCount: userMessages.length,
      hasLanguage: !!metadata.language
    });

    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    const result = streamText({
      model: openai(this.model),
      messages,
      system: PROMPT_GENERAL
    });
    const tokens = await result.usage;
    requestLogger.info('Token usage', {
      tokens_i_o: `${tokens.inputTokens} + ${tokens.outputTokens} = ${tokens.totalTokens}`,
    });

    await CacheClient.incrementNumber('GENERAL_ASSISTANT_INPUT_TOKENS', tokens.inputTokens!);
    await CacheClient.incrementNumber('GENERAL_ASSISTANT_OUTPUT_TOKENS', tokens.outputTokens!);
    await CacheClient.incrementNumberUntilEndOfMonth(userId, tokens.totalTokens!);
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
