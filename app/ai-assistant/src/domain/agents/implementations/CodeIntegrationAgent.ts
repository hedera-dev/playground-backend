import { openai, createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { ICodeIntegrationAgent } from '../types/index.js';
import { ApplyCodeChangesSchema, ProposeCodeChange } from '../tools/CodeTools.js';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';
import { AppLogger, createLogger } from '../../../utils/logger.js';
import { PROMPT_CODE_INTEGRATION } from '../../../utils/prompts.js';
import { ExecutionContext } from '../../../types.js';

export class CodeIntegrationAgent implements ICodeIntegrationAgent {
  private model: string;
  private logger: AppLogger;

  constructor(model: string) {
    this.model = model;
    this.logger = createLogger(undefined, 'CodeIntegrationAgent');
  }

  async generateCodeChanges(
    proposedChanges: ProposeCodeChange,
    code: string,
    context: ExecutionContext
  ): Promise<any[]> {
    const requestLogger = this.logger.child({ userId: context.userId, sessionId: context.sessionId });
    if (!code || !proposedChanges.changes || proposedChanges.changes.length === 0) {
      return [];
    }

    const numberedCode = code
      .split('\n')
      .map((line, index) => `${(index + 1).toString().padStart(3, ' ')}| ${line}`)
      .join('\n');

    const changes = JSON.stringify(proposedChanges.changes);

    requestLogger.debug('Proposed changes', proposedChanges);

    const prompt = `
Code:<code>${numberedCode}</code>
Changes:<changes>${changes}</changes>
`;

    try {
      // Use user's API key if provided (BYOK), otherwise use system key
      const openaiProvider = context.userApiKey ? createOpenAI({ apiKey: context.userApiKey }) : openai;

      const result = await generateObject({
        model: openaiProvider(context.model || this.model),
        prompt: prompt,
        system: PROMPT_CODE_INTEGRATION,
        schema: ApplyCodeChangesSchema,
        schemaName: 'CodeChanges',
        schemaDescription: 'Array of code changes with exact line numbers'
      });
      const tokens = result.usage;
      requestLogger.info('Token usage', {
        tokens_i_o: `${tokens.inputTokens} + ${tokens.outputTokens} = ${tokens.totalTokens}`,
        usingBYOK: !!context.userApiKey
      });

      if (!context.userApiKey) {
        await CacheClient.incrementNumber('CODE_TOOL_INTEGRATION_INPUT_TOKENS', tokens.inputTokens!);
        await CacheClient.incrementNumber('CODE_TOOL_INTEGRATION_OUTPUT_TOKENS', tokens.outputTokens!);
        await CacheClient.incrementNumberUntilEndOfMonth(context.userId, tokens.totalTokens!);
      }

      requestLogger.debug('Code changes generated', {
        codeChanges: result?.object?.appliedChanges
      });

      return result?.object?.appliedChanges || [];
    } catch (error) {
      requestLogger.error('Error generating code changes:', error);
      return [];
    }
  }
}
