import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsStreaming, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { ResponseCreateParamsStreaming, ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { TokenUsageService } from './TokenUsageService.js';
import { UserAIKeyService } from './UserAIKeyService.js';
import { createLogger, AppLogger } from '../../utils/logger.js';

export class OpenAIProxyService {
    private logger: AppLogger = createLogger(undefined, 'OpenAIProxyService');
    private readonly systemOpenAI: OpenAI;

    constructor(
        private tokenUsageService: TokenUsageService,
        private userAIKeyService: UserAIKeyService
    ) {
        this.systemOpenAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    /**
     * Resolves which OpenAI client to use for a request
     * @param userId - The user ID to check for a custom API key
     * @returns OpenAI client instance (user's BYOK or system key)
     */
    protected async resolveOpenAIClient(userId: string): Promise<OpenAI> {
        let openaiClient = this.systemOpenAI;

        try {
            const hasKey = await this.userAIKeyService.hasKey(userId);
            if (hasKey) {
                const keyData = await this.userAIKeyService.retrieveKey(userId);
                openaiClient = new OpenAI({ apiKey: keyData.apiKey });
                this.logger.debug('Using user BYOK API key for proxy');
            }
        } catch (error) {
            this.logger.warn('Failed to check/retrieve user key, falling back to system key', {
                userId,
                error: (error as Error).message
            });
        }

        return openaiClient;
    }

    /**
     * Validates if the user is allowed to make a request
     * @param userId - The user ID to validate against usage limits
     * @throws Error if user has exceeded their usage limit
     */
    async validateRequest(userId: string): Promise<void> {
        await this.tokenUsageService.checkUsageLimit(userId);
    }

    /**
     * Creates a stream for chat completions
     * @param userId - The user ID making the request
     * @param body - Chat completion parameters with streaming enabled
     * @param options - Optional request configuration (e.g. AbortSignal)
     * @returns Async iterable stream of chat completion chunks
     */
    async createChatCompletionStream(
        userId: string,
        body: ChatCompletionCreateParamsStreaming,
        options?: { signal?: AbortSignal }
    ): Promise<AsyncIterable<any>> {
        await this.validateRequest(userId);
        const openaiClient = await this.resolveOpenAIClient(userId);

        // Ensure usage tracking is enabled for compatible models
        if (!body.stream_options) {
            body.stream_options = { include_usage: true };
        }

        // casting `as any` is necessary. OpenAI SDK has overloaded create() signatures but TypeScript
        // can't properly infer streaming vs non-streaming based on params type alone
        return await openaiClient.chat.completions.create(body as any, options) as AsyncIterable<any>;
    }

    /**
     * Creates a non-streaming chat completion
     * @param userId - The user ID making the request
     * @param body - Chat completion parameters without streaming
     * @param options - Optional request configuration (e.g. AbortSignal)
     * @returns Complete chat completion response with usage data
     */
    async createChatCompletion(
        userId: string,
        body: ChatCompletionCreateParamsNonStreaming,
        options?: { signal?: AbortSignal }
    ): Promise<any> {
        await this.validateRequest(userId);
        const openaiClient = await this.resolveOpenAIClient(userId);
        const completion = await openaiClient.chat.completions.create(body, options);

        if (completion.usage) {
            await this.trackUsage(userId, body.model, completion.usage);
        }

        return completion;
    }

    /**
     * Creates a stream for responses API
     * @param userId - The user ID making the request
     * @param body - Response creation parameters with streaming enabled
     * @param options - Optional request configuration (e.g. AbortSignal)
     * @returns Async iterable stream of response chunks
     */
    async createResponseStream(
        userId: string,
        body: ResponseCreateParamsStreaming,
        options?: { signal?: AbortSignal }
    ): Promise<AsyncIterable<any>> {
        await this.validateRequest(userId);
        const openaiClient = await this.resolveOpenAIClient(userId);

        // casting `as any` is necessary. OpenAI SDK has overloaded create() signatures but TypeScript
        // can't properly infer streaming vs non-streaming based on params type alone
        return await openaiClient.responses.create(body as any, options) as AsyncIterable<any>;
    }

    /**
     * Creates a non-streaming response for responses API
     * @param userId - The user ID making the request
     * @param body - Response creation parameters without streaming
     * @param options - Optional request configuration (e.g. AbortSignal)
     * @returns Complete response with usage data
     */
    async createResponse(
        userId: string,
        body: ResponseCreateParamsNonStreaming,
        options?: { signal?: AbortSignal }
    ): Promise<any> {
        await this.validateRequest(userId);
        const openaiClient = await this.resolveOpenAIClient(userId);
        const response = await openaiClient.responses.create(body, options);

        if (response.usage) {
            await this.trackUsage(userId, (response.model || body.model) as string, response.usage);
        }

        return response;
    }

    /**
     * Safely tracks token usage
     * @param userId - The user ID to track usage for
     * @param model - The AI model used for the request
     * @param usage - Usage data containing token counts
     */
    async trackUsage(userId: string, model: string, usage: any): Promise<void> {
        if (!usage) {
            this.logger.warn('No usage data to track', { userId, model });
            return;
        }

        try {
            const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
            const completionTokens = usage.completion_tokens || usage.output_tokens || 0;

            await this.tokenUsageService.incrementUsage(
                userId,
                promptTokens,
                completionTokens,
                model
            );
        } catch (error) {
            // Log but don't fail the request
            this.logger.error('Failed to track token usage', error, { userId, model });
        }
    }

    /**
     * Extracts usage data from a chunk
     * Handles nested usage objects (e.g. Responses API)
     * @param chunk - Stream chunk that may contain usage data
     * @returns Usage object or null if not found
     */
    extractUsage(chunk: any): any {
        return chunk.usage || chunk.response?.usage || (chunk as any).usage || null;
    }
}
