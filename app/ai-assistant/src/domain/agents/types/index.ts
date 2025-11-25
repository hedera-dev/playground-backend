import { ModelMessage } from 'ai';
import { ExecutionContext, UserMetadata } from '../../../types.js';
import { ProposeCodeChange } from '../tools/CodeTools.js';
export * from './Agent.js';
export * from './AgentConfig.js';

export interface ICodeReviewAgent {
  streamCodeProposal(
    userMessages: ModelMessage[],
    metadata: UserMetadata,
    context: ExecutionContext
  ): Promise<Response>;
}

export interface ICodeIntegrationAgent {
  generateCodeChanges(proposedChanges: ProposeCodeChange, code: string, context: ExecutionContext): Promise<any[]>;
}
