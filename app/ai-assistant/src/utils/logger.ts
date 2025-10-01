import pino from 'pino';

// Centralized logger configuration for the entire application
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create single logger instance that serves both Fastify and agents
export const logger = pino({
  name: 'ai-assistant',
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// Agent-specific logging utilities using the main logger
export class AgentLogger {
  private sessionId: string;
  private startTime: number;

  constructor() {
    this.sessionId = Math.random().toString(36).substring(2, 8);
    this.startTime = Date.now();
  }

  private getElapsed(): number {
    return Date.now() - this.startTime;
  }

  logSession(message: string) {
    logger.info({
      agent: 'SESSION',
      sessionId: this.sessionId,
      elapsed: this.getElapsed()
    }, `🚀 [SESSION-${this.sessionId}] ${message}`);
  }

  logAgent1Start(userInput: string) {
    const truncatedInput = userInput.length > 100 ? userInput.substring(0, 100) + '...' : userInput;

    logger.info({
      agent: 'AGENT-1',
      sessionId: this.sessionId,
      elapsed: this.getElapsed(),
      phase: 'START',
      userInput: truncatedInput
    }, `📝 [AGENT-1] Analyzing user request`);

    // Debug level for full input visibility
    logger.debug({
      agent: 'AGENT-1',
      sessionId: this.sessionId,
      fullUserInput: userInput
    }, `🔍 [AGENT-1-DEBUG] Full user input`);
  }

  logAgent1Output(proposedChanges: any) {
    const changes = proposedChanges?.changes || [];

    logger.info({
      agent: 'AGENT-1',
      sessionId: this.sessionId,
      elapsed: this.getElapsed(),
      phase: 'OUTPUT',
      changeCount: changes.length,
      changes: changes.map((change: any, idx: number) => ({
        index: idx + 1,
        mode: change.mode?.toUpperCase(),
        description: change.description
      }))
    }, `✅ [AGENT-1] Changes proposed (${changes.length})`);

    // Debug level for full proposed changes (entrada al Agent 2)
    logger.debug({
      agent: 'AGENT-1',
      sessionId: this.sessionId,
      fullProposedChanges: proposedChanges
    }, `🔍 [AGENT-1→AGENT-2] Full proposed changes`);
  }

  logAgent2Start(changes: any[], codeLength: number) {
    logger.info({
      agent: 'AGENT-2',
      sessionId: this.sessionId,
      elapsed: this.getElapsed(),
      phase: 'START',
      changesToProcess: changes.length,
      originalCodeLines: codeLength
    }, `🎯 [AGENT-2] Determining exact locations (${changes.length} changes, ${codeLength} lines)`);

    // Debug level for complete input from Agent 1
    logger.debug({
      agent: 'AGENT-2',
      sessionId: this.sessionId,
      inputFromAgent1: changes,
      codeLength
    }, `🔍 [AGENT-2-DEBUG] Full input from Agent 1`);
  }

  logAgent2Output(appliedChanges: any[]) {
    logger.info({
      agent: 'AGENT-2',
      sessionId: this.sessionId,
      elapsed: this.getElapsed(),
      phase: 'OUTPUT',
      appliedCount: appliedChanges.length,
      locations: appliedChanges.map((change: any, idx: number) => ({
        index: idx + 1,
        mode: change.mode?.toUpperCase(),
        startLine: change.startLine,
        endLine: change.endLine
      }))
    }, `✅ [AGENT-2] Locations determined (${appliedChanges.length} changes)`);

    // Debug level for full applied changes
    logger.debug({
      agent: 'AGENT-2',
      sessionId: this.sessionId,
      fullAppliedChanges: appliedChanges
    }, `🔍 [AGENT-2-DEBUG] Full applied changes`);
  }

  logTokenUsage(agent: string, usage: any) {
    if (usage) {
      const total = usage.totalTokens || 0;
      const prompt = usage.promptTokens || 0;
      const completion = usage.completionTokens || 0;

      logger.info({
        agent,
        sessionId: this.sessionId,
        elapsed: this.getElapsed(),
        tokenUsage: {
          promptTokens: prompt,
          completionTokens: completion,
          totalTokens: total
        }
      }, `💰 [${agent}] Tokens: ${total} (P:${prompt} + C:${completion})`);
    }
  }

  logError(agent: string, error: any) {
    logger.error({
      agent,
      sessionId: this.sessionId,
      elapsed: this.getElapsed(),
      error: {
        message: error.message || error,
        stack: error.stack
      }
    }, `❌ [${agent}] Error: ${error.message || error}`);
  }

  logFinalResult(status: string, changeCount: number) {
    const totalElapsed = this.getElapsed();

    logger.info({
      agent: 'FINAL',
      sessionId: this.sessionId,
      elapsed: totalElapsed,
      status,
      changesApplied: changeCount,
      totalDuration: totalElapsed
    }, `🎉 [FINAL] Session completed: ${status} | Changes: ${changeCount} | Duration: ${totalElapsed}ms`);
  }

  // Reset for new session
  resetSession() {
    this.sessionId = Math.random().toString(36).substring(2, 8);
    this.startTime = Date.now();
    logger.info({
      agent: 'SESSION',
      sessionId: this.sessionId
    }, `🔄 [SESSION-${this.sessionId}] New session started`);
  }

  // Direct access to the main logger for advanced usage
  getPinoLogger(): pino.Logger {
    return logger;
  }
}

// Convenience function to create agent loggers
export const createAgentLogger = () => new AgentLogger();
