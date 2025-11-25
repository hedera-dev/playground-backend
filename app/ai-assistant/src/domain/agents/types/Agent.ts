import { ModelMessage, UIMessage } from 'ai';
import { ProposeCodeChange } from '../tools/CodeTools.js';
import { UserMetadata, ExecutionContext } from '../../../types.js';

export interface ICodeReviewAgent {
  streamCodeProposal(messages: ModelMessage[], metadata: UserMetadata, context: ExecutionContext): Promise<Response>;
}

export interface ICodeIntegrationAgent {
  generateCodeChanges(proposedChanges: ProposeCodeChange, code: string, context: ExecutionContext): Promise<any>;
}

export interface IExecutionAnalyzerAgent {
  streamText(messages: ModelMessage[], metadata: UserMetadata, context: ExecutionContext): Promise<Response>;
}

export interface IGeneralAssistantAgent {
  streamText(messages: ModelMessage[], metadata: UserMetadata, context: ExecutionContext): Promise<Response>;
}

export interface IMockAgent {
  streamMockResponse(): Promise<Response>;
}
