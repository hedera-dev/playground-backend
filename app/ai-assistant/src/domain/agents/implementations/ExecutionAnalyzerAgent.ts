import { ModelMessage, streamText } from 'ai';
import { IExecutionAnalyzerAgent } from '../types/Agent.js';
import { UserMetadata } from '../../../types.js';
import { BASE_INSTRUCTIONS } from '../../../utils/prompts.js';
import { openai } from '@ai-sdk/openai';

export class ExecutionAnalyzerAgent implements IExecutionAnalyzerAgent {
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  async streamText(userMessages: ModelMessage[], metadata: UserMetadata): Promise<Response> {
    const metadataMessages = this.createContextMessages(metadata);
    const messages = [...metadataMessages, ...userMessages];

    const result = streamText({
      model: openai(this.model),
      messages,
      system: BASE_INSTRUCTIONS,
    });

    return result.toUIMessageStreamResponse();
  }

  private createContextMessages(metadata: UserMetadata): ModelMessage[] {
    const messages: ModelMessage[] = [];

    if (metadata.output) {
      messages.push({
        role: "user",
        content: `Execution output to analyze:\n\`\`\`\n${metadata.output}\n\`\`\``
      });
    }

    return messages;
  }
}