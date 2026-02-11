import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OpenAI } from 'openai';
import type { ChatCompletionCreateParamsStreaming, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { TokenUsageService } from '../../../domain/services/TokenUsageService.js';
import { UserAIKeyService } from '../../../domain/services/UserAIKeyService.js';
import { createLogger } from '../../../utils/logger.js';
import { AuthenticationError, ErrorReason } from '../../../utils/errors.js';

import IOpenAIProxyController from '../OpenAIProxyController.js';

/**
 * Controller implementation that acts as a proxy for OpenAI API requests.
 * Handles chat completion and responses endpoints with support for:
 * - User-specific API keys (BYOK - Bring Your Own Key)
 * - Token usage tracking and limits
 * - Streaming and non-streaming responses
 */
export class OpenAIProxyControllerImpl implements IOpenAIProxyController {
    /** Base path for all OpenAI proxy endpoints */
    private basePath = '/api/openai/v1';
    /** Logger instance for tracking operations */
    private logger = createLogger(undefined, 'OpenAIProxyController');
    /** System-wide OpenAI client using a default API key */
    private readonly systemOpenAI: OpenAI;

    /**
     * Initializes the OpenAI proxy controller
     * @param fastify - Fastify server instance for route registration
     * @param tokenUsageService - Service for tracking and limiting token usage
     * @param userAIKeyService - Service for managing user-specific API keys
     */
    constructor(
        private fastify: FastifyInstance,
        private tokenUsageService: TokenUsageService,
        private userAIKeyService: UserAIKeyService
    ) {
        // Initialize the system-wide OpenAI client with a default API key
        this.systemOpenAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    /**
     * Registers API routes for OpenAI proxy endpoints
     * Routes:
     * - POST /api/openai/v1/chat/completions - Proxies chat completion requests (used by Langchain based agents)
     * - POST /api/openai/v1/responses - Proxies response API requests (used by Vercel AI-SDK based agents)
     */
    async registerRoutes(): Promise<void> {
        this.fastify.post<{ Body: ChatCompletionCreateParamsStreaming | ChatCompletionCreateParamsNonStreaming }>(
            `${this.basePath}/chat/completions`,
            this.handleChatCompletion.bind(this)
        );
        this.fastify.post<{ Body: Record<string, any> }>(
            `${this.basePath}/responses`,
            this.handleResponses.bind(this)
        );
    }

    /**
     * Resolves which OpenAI client to use for a request
     * Checks if the user has a custom API key (BYOK), otherwise falls back to system key
     * @param userId - User identifier to check for custom API key
     * @returns OpenAI client instance (either user-specific or system-wide)
     */
    private async resolveOpenAIClient(userId: string): Promise<OpenAI> {
        let openaiClient = this.systemOpenAI;

        try {
            // Check if the user has their own API key configured
            const hasKey = await this.userAIKeyService.hasKey(userId);

            if (hasKey) {
                // Use the user's custom API key if available
                const keyData = await this.userAIKeyService.retrieveKey(userId);
                openaiClient = new OpenAI({ apiKey: keyData.apiKey });
                this.logger.debug('Using user BYOK API key for proxy');
            }
        } catch (error) {
            // If key retrieval fails, gracefully fall back to the system key
            this.logger.warn('Failed to check/retrieve user key, falling back to system key', {
                userId,
                error: (error as Error).message
            });
        }

        return openaiClient;
    }

    /**
     * Configures HTTP headers required for Server-Sent Events (SSE) streaming
     * @param reply - Fastify reply object to configure headers on
     */
    private setupStreamHeaders(reply: FastifyReply): void {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
    }

    /**
     * Handles streaming responses from OpenAI API
     * Streams chunks to the client as SSE and tracks token usage
     * @param stream - Async iterable stream from OpenAI
     * @param reply - Fastify reply object for writing response
     * @param userId - User identifier for usage tracking
     * @param model - Model name for usage tracking
     */
    private async handleStreamingRequest(
        stream: AsyncIterable<any>,
        reply: FastifyReply,
        userId: string,
        model: string
    ): Promise<void> {
        this.setupStreamHeaders(reply);

        let accumulatedUsage: any = null;

        // Stream each chunk to the client
        for await (const chunk of stream) {
            // Extract usage data if present in chunk
            if (chunk.usage || (chunk as any).usage) {
                accumulatedUsage = chunk.usage || (chunk as any).usage;
            }

            // Send chunk as the SSE data event
            const jsonString = JSON.stringify(chunk);
            reply.raw.write(`data: ${jsonString}\n\n`);
        }

        // Send completion signal
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();

        // Track token usage after stream completes
        await this.trackUsage(userId, model, accumulatedUsage);
    }

    /**
     * Records token usage for a request
     * Supports different token field names from various OpenAI endpoints
     * @param userId - User identifier for tracking
     * @param model - Model name used
     * @param usage - Usage object containing token counts
     */
    private async trackUsage(userId: string, model: string, usage: any): Promise<void> {
        if (usage) {
            // Handle different token field names across OpenAI endpoints
            const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
            const completionTokens = usage.completion_tokens || usage.output_tokens || 0;

            await this.tokenUsageService.incrementUsage(
                userId,
                promptTokens,
                completionTokens,
                model
            );
        } else {
            this.logger.warn('No usage data received from OpenAI stream', { userId });
        }
    }

    /**
     * Centralized error handler for OpenAI API errors
     * Logs errors and returns appropriate HTTP responses
     * @param error - Error object from OpenAI or internal error
     * @param reply - Fastify reply object for sending error response
     * @param apiType - Type of API call (e.g., 'Chat Completion', 'Responses')
     * @returns Error response sent to a client
     */
    private handleOpenAIError(error: any, reply: FastifyReply, apiType: string): any {
        this.logger.error(`Error in OpenAI proxy (${apiType})`, error);

        // Re-throw authentication errors to be handled by auth middleware
        if (error instanceof AuthenticationError) {
            throw new AuthenticationError('OpenAI API Error', ErrorReason.EXTERNAL_SERVICE_ERROR);
        }

        // Extract error details with fallbacks
        const status = error.status || 500;
        const message = error.message || 'Error communicating with OpenAI';

        return reply.status(status).send({
            error: {
                message: message,
                type: error.type || 'internal_server_error',
                code: error.code || null
            }
        });
    }

    /**
     * Handles OpenAI Responses API requests
     * Supports both streaming and non-streaming responses
     * @param request - Fastify request object
     * @param reply - Fastify reply object
     * @returns Response from OpenAI or streams response to a client
     */
    private async handleResponses(request: FastifyRequest, reply: FastifyReply) {
        // Extract user ID from the header, fallback to 'unknown'
        const userId = (request.headers['x-user-id'] as string) || 'unknown';
        const body = request.body as Record<string, any>;

        this.logger.info('Processing OpenAI proxy request (Responses API)', { userId, model: body.model });

        // Check if a user has exceeded usage limits
        await this.tokenUsageService.checkUsageLimit(userId);

        // Get the appropriate OpenAI client (user's key or system key)
        const openaiClient = await this.resolveOpenAIClient(userId);

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                // Handle streaming response
                const stream = await openaiClient.responses.create(body as any) as any;
                await this.handleStreamingRequest(stream, reply, userId, body.model);
            } else {
                // Handle non-streaming response
                const response = await openaiClient.responses.create(body as any);

                if (response.usage) {
                    await this.trackUsage(userId, response.model || body.model, response.usage);
                }

                return response;
            }
        } catch (error: any) {
            return this.handleOpenAIError(error, reply, 'Responses');
        }
    }

    /**
     * Handles OpenAI Chat Completion API requests
     * Supports both streaming and non-streaming chat completions
     * @param request - Fastify request object
     * @param reply - Fastify reply object
     * @returns Chat completion response from OpenAI or streams response to a client
     */
    private async handleChatCompletion(request: FastifyRequest, reply: FastifyReply) {
        // Extract user ID from the header, fallback to 'unknown'
        const userId = (request.headers['x-user-id'] as string) || 'unknown';
        const body = request.body as ChatCompletionCreateParamsStreaming | ChatCompletionCreateParamsNonStreaming;

        this.logger.info('Processing OpenAI proxy request', { userId, model: body.model });

        // Check if a user has exceeded usage limits
        await this.tokenUsageService.checkUsageLimit(userId);

        // Get the appropriate OpenAI client (user's key or system key)
        const openaiClient = await this.resolveOpenAIClient(userId);

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                // Enable usage tracking in streaming responses
                body.stream_options = { include_usage: true };
                const stream = await openaiClient.chat.completions.create(body) as any;
                await this.handleStreamingRequest(stream, reply, userId, body.model);
            } else {
                // Handle non-streaming response
                const completion = await openaiClient.chat.completions.create(body) as any;

                // Track token usage if available
                if (completion.usage) {
                    await this.trackUsage(userId, body.model, completion.usage);
                }

                return completion;
            }
        } catch (error: any) {
            return this.handleOpenAIError(error, reply, 'Chat Completion');
        }
    }
}
