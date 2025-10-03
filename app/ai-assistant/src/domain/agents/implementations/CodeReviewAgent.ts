import { openai } from '@ai-sdk/openai';
import { ModelMessage, streamText } from 'ai';
import { ICodeReviewAgent } from '../types/index.js';
import { proposeCodeTool } from '../tools/CodeTools.js';
import { PROPMT_CODE_REVIEW_TWO_AGENT } from '../../../utils/prompts.js';
import { UserMetadata } from '../../../types.js';
import { CodeIntegrationAgent } from './CodeIntegrationAgent.js';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';

export class CodeReviewAgent implements ICodeReviewAgent {
  private model: string;
  private applyCodeAgent: CodeIntegrationAgent;

  constructor(model: string, integrationModel: string) {
    this.model = model;
    this.applyCodeAgent = new CodeIntegrationAgent(integrationModel);
  }

  async streamCodeProposal(userMessages: ModelMessage[], metadata: UserMetadata, userId: string): Promise<Response> {
    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    const result = streamText({
      model: openai(this.model),
      messages,
      system: PROPMT_CODE_REVIEW_TWO_AGENT,
      tools: {
        proposeCode: proposeCodeTool(this.applyCodeAgent, metadata.code, userId)
      }
    });
    const tokens = await result.usage;
    await CacheClient.incrementNumber('CODE_REVIEW_INPUT_TOKENS', tokens.inputTokens!);
    await CacheClient.incrementNumber('CODE_REVIEW_OUTPUT_TOKENS', tokens.outputTokens!);
    await CacheClient.incrementNumberUntilEndOfMonth(userId, tokens.totalTokens!);
    return result.toUIMessageStreamResponse();
  }

  private createContextMessages(metadata: UserMetadata): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (metadata.language) {
      messages.push({ role: 'user', content: `Programming language: ${metadata.language}` });
    }

    if (metadata.currentLine) {
      messages.push({ role: 'user', content: `Current cursor line: ${metadata.currentLine}` });
    }

    if (metadata.code) {
      messages.push({
        role: 'user',
        content: `Code to review:\n\`\`\`\n${metadata.code}\n\`\`\``
      });
    }

    return messages;
  }
}
