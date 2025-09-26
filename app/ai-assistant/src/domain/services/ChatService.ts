import fs from "node:fs";
import { convertToModelMessages, UIMessage } from 'ai';
import { createAgentLogger } from "../../utils/logger.js";
import { UserMetadata, UserMetadataType } from "../../types.js";
import { INSTRUCTIONS_1_B } from "../../utils/prompts.js";
import {
  CodeReviewAgent,
  GeneralAssistantAgent,
  ExecutionAnalyzerAgent,
  IMockAgent
} from "../agents/index.js";
import { MockAgent } from "../agents/implementations/MockAgent.js";

const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_688ceeab314c8191a557a849b28cf815";
export class ChatService {
  private mockMode: boolean = false;
  private logger: ReturnType<typeof createAgentLogger>;

  private codeReviewAgent: CodeReviewAgent;
  private generalAssistantAgent: GeneralAssistantAgent;
  private executionAnalyzerAgent: ExecutionAnalyzerAgent;
  private mockAgent: IMockAgent | null = null;

  private readonly defaultInstructions = INSTRUCTIONS_1_B;
  private readonly twoAgentMode: boolean;

  constructor() {
    this.twoAgentMode = process.env.ENABLE_TWO_AGENT_MODE === 'true';
    this.mockMode = process.env.ENABLE_MOCK_MODE === 'true';
    this.logger = createAgentLogger();

    this.codeReviewAgent = new CodeReviewAgent('gpt-4o-mini', 'gpt-4o-mini');
    this.generalAssistantAgent = new GeneralAssistantAgent('gpt-4o-mini');
    this.executionAnalyzerAgent = new ExecutionAnalyzerAgent('gpt-4o-mini');

    if (this.mockMode) {
      this.mockAgent = new MockAgent();
      this.logger.logSession('Mock mode enabled');
    }
    if (this.twoAgentMode) {
      this.logger.logSession('Two-agent mode enabled');
    }
  }

  async streamChat(userMessages: UIMessage[]) {
    // Extract user input for logging
    const lastMessage = userMessages[userMessages.length - 1];
    // UIMessage has parts array, extract text from text parts
    const userInput = lastMessage ?
      lastMessage.parts
        .filter(part => part.type === 'text')
        .map(part => (part as any).text)
        .join(' ') || 'No text content'
      : 'No content';
    this.logger.logSession(`Processing chat request`);

    if (this.isMockMode()) {
      this.logger.logSession('Returning saved mock response');
      return this.mockAgent?.streamMockResponse();
    }

    const userModelMessages = convertToModelMessages(userMessages);
    const metadata = this.getMetadata(userMessages);

    this.logger.logSession(`Metadata: ${JSON.stringify(metadata, null, 2)}`);

    if (this.twoAgentMode) {
      this.logger.logAgent1Start(userInput);
    }

    if (!metadata) {
      this.logger.logError('SYSTEM', 'No metadata found');
      return null; // TODO: Handle this case
    }

    switch (metadata.type) {
      case UserMetadataType.CODE_REVIEW:
        return this.codeReviewAgent.streamCodeProposal(userModelMessages, metadata);
      case UserMetadataType.EXECUTION_ANALYSIS:
        return this.executionAnalyzerAgent.streamText(userModelMessages, metadata);
      case UserMetadataType.GENERAL_ASSISTANT:
        return this.generalAssistantAgent.streamText(userModelMessages, metadata);
      default:
        this.logger.logError('SYSTEM', `Unknown metadata type: ${metadata.type}`);
        return null;
    }
  }

  // Future method for vector store search (ready for when you want to enable it)
  private async searchVectorStore(query: string): Promise<any> {
    try {
      // TODO: Implement actual vector store search when needed
      // This will use OpenAI's vector store API when implemented

      // Placeholder implementation
      return {
        results: `Vector search results for: ${query}`,
        query: query,
        vectorStoreId: VECTOR_STORE_ID,
      };
    } catch (error) {
      this.logger.logError('VECTOR-STORE', error);
      return { results: "No results found" };
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
