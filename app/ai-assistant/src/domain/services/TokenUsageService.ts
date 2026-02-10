import { CacheClient } from '../../infrastructure/persistence/RedisConnector.js';
import { UsageLimitError, ErrorReason } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const TOKENS_LIMIT_PER_MONTH = Number(process.env.TOKENS_LIMIT_PER_MONTH) || 100000;

export class TokenUsageService {
    private logger = createLogger(undefined, 'TokenUsageService');

    /**
     * Checks if the user has exceeded their monthly token limit.
     * Throws UsageLimitError if limit is reached.
     * @param userId The user ID to check
     */
    async checkUsageLimit(userId: string): Promise<void> {
        const tokenUsed = await CacheClient.getNumber(userId);
        this.logger.debug('Token used', { userId, tokenUsed, tokenLimit: TOKENS_LIMIT_PER_MONTH });

        if (Number(tokenUsed) > TOKENS_LIMIT_PER_MONTH) {
            this.logger.error('Token limit exceeded', undefined, {
                userId,
                tokenUsed,
                limit: TOKENS_LIMIT_PER_MONTH
            });
            throw new UsageLimitError('Token limit exceeded', ErrorReason.TOKEN_LIMIT_EXCEEDED, {
                tokenUsed,
                limit: TOKENS_LIMIT_PER_MONTH
            });
        }
    }

    /**
     * Increments the token usage for a user.
     * @param userId The user ID
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @param model Optional model name for tracking
     */
    async incrementUsage(userId: string, inputTokens: number, outputTokens: number, model?: string): Promise<void> {
        const totalTokens = inputTokens + outputTokens;

        await CacheClient.incrementNumberUntilEndOfMonth(userId, totalTokens);

        this.logger.info('Token usage updated', {
            userId,
            added: totalTokens,
            model
        });
    }
}
