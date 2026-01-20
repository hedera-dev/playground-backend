import pino from 'pino';
import { isDevelopment, isLocal } from './environment.js';

// Create single logger instance that serves both Fastify and agents
export const logger = pino({
  name: 'ai-assistant',
  level: process.env.LOG_LEVEL || (isDevelopment || isLocal ? 'debug' : 'info'),
  transport:
    isDevelopment || isLocal
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined
});

/**
 * Context information for logging
 */
export interface LogContext {
  userId?: string; // User identifier
  sessionId?: string; // Session identifier
  [key: string]: any; // Additional custom fields
}

/**
 * Generic logger wrapper that adds context and timing to Pino logs
 * Compatible with Fastify and can be used across the application
 */
export class AppLogger {
  private context: LogContext;
  private startTime: number;
  private agent?: string;

  constructor(context: LogContext = {}, agent?: string) {
    this.agent = agent;
    this.context = context;
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time since logger creation in milliseconds
   */
  private getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Build log object with context and elapsed time
   */
  private buildLogObject(additionalContext?: Record<string, any>): Record<string, any> {
    return {
      ...this.context,
      elapsed: this.getElapsed(),
      ...additionalContext
    };
  }

  /**
   * Format message with agent prefix if available
   */
  private formatMessage(message: string): string {
    if (this.agent) {
      return `[${this.agent}] ${message}`;
    }
    return message;
  }

  /**
   * Log info level message
   */
  info(message: string, additionalContext?: Record<string, any>): void {
    logger.info(this.buildLogObject(additionalContext), this.formatMessage(message));
  }

  /**
   * Log debug level message
   */
  debug(message: string, additionalContext?: Record<string, any>): void {
    logger.debug(this.buildLogObject(additionalContext), this.formatMessage(message));
  }

  /**
   * Log warning level message
   */
  warn(message: string, additionalContext?: Record<string, any>): void {
    logger.warn(this.buildLogObject(additionalContext), this.formatMessage(message));
  }

  /**
   * Log error level message
   */
  error(message: string, error?: Error | any, additionalContext?: Record<string, any>): void {
    const errorContext = error
      ? {
          error: {
            message: error.message || String(error),
            stack: error.stack,
            ...error
          }
        }
      : {};

    logger.error(this.buildLogObject({ ...errorContext, ...additionalContext }), this.formatMessage(message));
  }

  /**
   * Update context (useful for adding userId or sessionId later)
   */
  setContext(newContext: Partial<LogContext>): void {
    this.context = { ...this.context, ...newContext };
  }

  /**
   * Get current context
   */
  getContext(): LogContext {
    return { ...this.context };
  }

  /**
   * Reset timer (useful for measuring specific operations)
   */
  resetTimer(): void {
    this.startTime = Date.now();
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): AppLogger {
    return new AppLogger({ ...this.context, ...additionalContext }, this.agent);
  }

  /**
   * Direct access to the underlying Pino logger for advanced usage
   */
  getPinoLogger(): pino.Logger {
    return logger;
  }
}

/**
 * Create a new logger instance with optional context
 */
export const createLogger = (context?: LogContext, agent?: string): AppLogger => {
  return new AppLogger(context, agent);
};
