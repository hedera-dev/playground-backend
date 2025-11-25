import { openai, createOpenAI } from '@ai-sdk/openai';
import { ModelMessage, streamText } from 'ai';
import { ICodeReviewAgent } from '../types/index.js';
import { proposeCodeTool } from '../tools/CodeTools.js';
import { PROPMT_CODE_REVIEW_TWO_AGENT } from '../../../utils/prompts.js';
import { UserMetadata, ExecutionContext } from '../../../types.js';
import { CodeIntegrationAgent } from './CodeIntegrationAgent.js';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';
import { createLogger } from '../../../utils/logger.js';

export class CodeReviewAgent implements ICodeReviewAgent {
  private model: string;
  private applyCodeAgent: CodeIntegrationAgent;
  private logger = createLogger(undefined, 'CodeReviewAgent');

  constructor(model: string, integrationModel: string) {
    this.model = model;
    this.applyCodeAgent = new CodeIntegrationAgent(integrationModel);
  }

  async streamCodeProposal(
    userMessages: ModelMessage[],
    metadata: UserMetadata,
    context: ExecutionContext
  ): Promise<Response> {
    const requestLogger = this.logger.child({ userId: context.userId, sessionId: context.sessionId });

    requestLogger.info('Starting', {
      messageCount: userMessages.length,
      hasCode: !!metadata.code,
      language: metadata.language,
      model: context.model || this.model,
      usingCustomKey: Boolean(context.userApiKey)
    });

    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    try {
      // Use user's API key if provided (BYOK), otherwise use system key
      const openaiProvider = context.userApiKey ? createOpenAI({ apiKey: context.userApiKey }) : openai;

      const result = streamText({
        model: openaiProvider(context.model || this.model),
        messages,
        system: PROPMT_CODE_REVIEW_TWO_AGENT,
        tools: {
          proposeCode: proposeCodeTool(this.applyCodeAgent, metadata.code, context)
        }
      });

      const tokens = await result.usage;

      requestLogger.info('Token usage', {
        tokens_i_o: `${tokens.inputTokens} + ${tokens.outputTokens} = ${tokens.totalTokens}`,
        isCustomKey: Boolean(context.userApiKey),
        model: Boolean(context.userApiKey) ? context.model : undefined
      });

      if (!context.userApiKey) {
        await CacheClient.incrementNumber('CODE_REVIEW_INPUT_TOKENS', tokens.inputTokens!);
        await CacheClient.incrementNumber('CODE_REVIEW_OUTPUT_TOKENS', tokens.outputTokens!);
        await CacheClient.incrementNumberUntilEndOfMonth(context.userId, tokens.totalTokens!);
      }

      return result.toUIMessageStreamResponse();
    } catch (error) {
      requestLogger.error('Error streaming code proposal', error);
      throw error;
    }
  }

  private createContextMessages(metadata: UserMetadata): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (metadata.language) {
      messages.push({ role: 'user', content: `<lang>${metadata.language}</lang>` });
    }

    if (metadata.currentLine) {
      messages.push({ role: 'user', content: `Current cursor line: ${metadata.currentLine}` });
    }

    if (metadata.code) {
      messages.push({
        role: 'user',
        content: `<code>${metadata.code}</code>`
      });
    }

    return messages;
  }
}
