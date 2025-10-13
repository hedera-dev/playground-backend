import { ModelMessage, streamText } from 'ai';
import { IExecutionAnalyzerAgent } from '../types/Agent.js';
import { UserMetadata } from '../../../types.js';
import { PROMPT_EXECUTION_ANALYSIS } from '../../../utils/prompts.js';
import { openai } from '@ai-sdk/openai';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';
import { createLogger } from '../../../utils/logger.js';
export class ExecutionAnalyzerAgent implements IExecutionAnalyzerAgent {
  private model: string;
  private logger = createLogger(undefined, 'ExecutionAnalyzerAgent');
  constructor(model: string) {
    this.model = model;
  }

  async streamText(userMessages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string): Promise<Response> {
    const requestLogger = this.logger.child({ userId, sessionId });
    requestLogger.info('Starting', {
      messageCount: userMessages.length,
      hasOutput: !!metadata.output
    });

    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    const result = streamText({
      model: openai(this.model),
      messages,
      system: PROMPT_EXECUTION_ANALYSIS
    });

    const tokens = await result.usage;
    requestLogger.debug('Token usage', {
      tokens_i_o: `${tokens.inputTokens} + ${tokens.outputTokens} = ${tokens.totalTokens}`,
    });

    await CacheClient.incrementNumber('EXECUTION_ANALYSIS_INPUT_TOKENS', tokens.inputTokens!);
    await CacheClient.incrementNumber('EXECUTION_ANALYSIS_OUTPUT_TOKENS', tokens.outputTokens!);
    await CacheClient.incrementNumberUntilEndOfMonth(userId, tokens.totalTokens!);

    return result.toUIMessageStreamResponse();
  }

  private createContextMessages(metadata: UserMetadata): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (metadata.output) {
      messages.push({
        role: 'user',
        content: `<output>${metadata.output}</output>`
      });
    }

    return messages;
  }
}
