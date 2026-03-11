import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionCreateParamsStreaming
} from 'openai/resources/chat/completions';
import type {
    ResponseCreateParamsNonStreaming,
    ResponseCreateParamsStreaming
} from 'openai/resources/responses/responses';
import { createLogger } from '../../../utils/logger.js';
import { AuthenticationError, ErrorReason } from '../../../utils/errors.js';
import { OpenAIProxyService } from '../../../domain/services/OpenAIProxyService.js';

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
    private basePath = '/api/playground/assistant/openai/v1';
    /** Logger instance for tracking operations */
    private logger = createLogger(undefined, 'OpenAIProxyController');

    /**
     * Initializes the OpenAI proxy controller
     * @param fastify - Fastify server instance for route registration
     * @param openAIProxyService - Service for OpenAI interactions
     */
    constructor(
        private fastify: FastifyInstance,
        private openAIProxyService: OpenAIProxyService
    ) { }

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
        this.fastify.post<{ Body: ResponseCreateParamsStreaming | ResponseCreateParamsNonStreaming }>(
            `${this.basePath}/responses`,
            this.handleResponses.bind(this)
        );
    }

    /**
     * Configures HTTP headers required for Server-Sent Events (SSE) streaming
     * @param reply - Fastify reply object to configure headers on
     */
    private setupStreamHeaders(reply: FastifyReply): void {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
        // Prevent buffering in proxies
        reply.raw.setHeader('X-Accel-Buffering', 'no');
    }

    /**
     * Handles streaming responses from OpenAI API
     * Streams chunks to the client as SSE and tracks token usage.
     * Owns the full client-disconnect lifecycle: listens on both the
     * incoming request and outgoing reply sockets and aborts the
     * upstream OpenAI stream when the client goes away.
     *
     * @param stream - Async iterable stream from OpenAI
     * @param request - Fastify request (used to detect client disconnect)
     * @param reply - Fastify reply object for writing response
     * @param abortController - Controller whose signal was passed to the OpenAI SDK call
     * @param userId - User identifier for usage tracking
     * @param model - Model name for usage tracking
     */
    private async handleStreamingRequest(
        stream: AsyncIterable<any>,
        request: FastifyRequest,
        reply: FastifyReply,
        abortController: AbortController,
        userId: string,
        model: string
    ): Promise<void> {
        // Manually hijack the response to handle streaming directly
        reply.hijack();
        this.setupStreamHeaders(reply);

        // ── Client-disconnect detection ──────────────────────────
        let isClientConnected = true;

        const onDisconnect = () => {
            if (!isClientConnected) return; // already handled
            isClientConnected = false;
            this.logger.debug('Client disconnected during stream', { userId });

            // 1. Signal the upstream HTTP request to abort
            abortController.abort();

            // 2. OpenAI SDK streams expose a `.controller` – try aborting it too
            try {
                (stream as any).controller?.abort?.();
            } catch { /* best-effort */ }
        };

        // Listen on the *incoming* request socket (client hung up / network drop)
        request.raw.on('close', onDisconnect);
        // Listen on the *outgoing* reply socket (write errors)
        reply.raw.on('close', onDisconnect);
        reply.raw.on('error', onDisconnect);

        let accumulatedUsage: any = null;

        try {
            // Stream each chunk to the client
            for await (const chunk of stream) {
                if (!isClientConnected) {
                    break;
                }

                // Extract usage data if present
                // Handles both Chat Completions (chunk.usage) and
                // Responses API (chunk.response?.usage) formats
                const usage = this.openAIProxyService.extractUsage(chunk);
                if (usage) {
                    accumulatedUsage = usage;
                }

                // Send chunk as the SSE data event
                const jsonString = JSON.stringify(chunk);
                reply.raw.write(`data: ${jsonString}\n\n`);

                // Attempt to flush if method exists (e.g. compression middleware might add it)
                if (typeof (reply.raw as any).flush === 'function') {
                    (reply.raw as any).flush();
                }
            }

            if (isClientConnected) {
                // Send completion signal
                reply.raw.write('data: [DONE]\n\n');
                reply.raw.end();
            }
        } catch (error: any) {
            // Abort errors are expected when client disconnects
            if (error?.name === 'AbortError' || abortController.signal.aborted) {
                this.logger.debug('Stream aborted (client disconnect)', { userId });
            } else {
                this.logger.error('Error during streaming', error, { userId });
            }

            if (isClientConnected) {
                reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`);
                reply.raw.end();
            }
        } finally {
            request.raw.removeListener('close', onDisconnect);
            reply.raw.removeListener('close', onDisconnect);
            reply.raw.removeListener('error', onDisconnect);

            // Track token usage after stream completes
            if (accumulatedUsage) {
                await this.openAIProxyService.trackUsage(userId, model, accumulatedUsage);
            }
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

        // If headers are already sent, we can't send a JSON response
        if (reply.raw.headersSent) {
            return;
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
        const body = request.body as ResponseCreateParamsStreaming | ResponseCreateParamsNonStreaming;

        this.logger.info('Processing OpenAI proxy request (Responses API)', { userId, model: body.model });

        // AbortController is used for the initial SDK call AND
        // passed into handleStreamingRequest for ongoing disconnect handling
        const abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                const stream = await this.openAIProxyService.createResponseStream(
                    userId,
                    body as ResponseCreateParamsStreaming,
                    { signal }
                );
                // handleStreamingRequest owns the full disconnect lifecycle
                return await this.handleStreamingRequest(
                    stream, request, reply, abortController, userId, body.model as string
                );
            } else {
                // Handle non-streaming response
                return await this.openAIProxyService.createResponse(
                    userId,
                    body as ResponseCreateParamsNonStreaming,
                    { signal }
                );
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

        // AbortController is used for the initial SDK call AND
        // passed into handleStreamingRequest for ongoing disconnect handling
        const abortController = new AbortController();
        const signal = abortController.signal;

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                const stream = await this.openAIProxyService.createChatCompletionStream(
                    userId,
                    body as ChatCompletionCreateParamsStreaming,
                    { signal }
                );
                // handleStreamingRequest owns the full disconnect lifecycle
                await this.handleStreamingRequest(
                    stream, request, reply, abortController, userId, body.model
                );
            } else {
                // Handle non-streaming response
                return await this.openAIProxyService.createChatCompletion(
                    userId,
                    body as ChatCompletionCreateParamsNonStreaming,
                    { signal }
                );
            }
        } catch (error: any) {
            return this.handleOpenAIError(error, reply, 'Chat Completion');
        }
    }
}
