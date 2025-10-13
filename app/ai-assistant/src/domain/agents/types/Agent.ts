import { ModelMessage, UIMessage } from 'ai';
import { ProposeCodeChange } from '../tools/CodeTools.js';
import { UserMetadata } from '../../../types.js';

export interface ICodeReviewAgent {
  streamCodeProposal(messages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string): Promise<Response>;
}

export interface ICodeIntegrationAgent {
  generateCodeChanges(proposedChanges: ProposeCodeChange, code: string, userId: string, sessionId: string): Promise<any>;
}

export interface IExecutionAnalyzerAgent {
  streamText(messages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string): Promise<Response>;
}

export interface IGeneralAssistantAgent {
  streamText(messages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string): Promise<Response>;
}

export interface IMockAgent {
  streamMockResponse(): Promise<Response>;
}
