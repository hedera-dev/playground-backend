import { ModelMessage } from 'ai';
import { UserMetadata } from '../../../types.js';
import { ProposeCodeChange } from '../tools/CodeTools.js';
export * from './Agent.js';
export * from './AgentConfig.js';

export interface ICodeReviewAgent {
  streamCodeProposal(userMessages: ModelMessage[], metadata: UserMetadata, userId: string, sessionId: string, model?: string, apiKey?: string): Promise<Response>;
}

export interface ICodeIntegrationAgent {
  generateCodeChanges(proposedChanges: ProposeCodeChange, code: string, userId: string, sessionId: string, model?: string, apiKey?: string): Promise<any[]>;
}
