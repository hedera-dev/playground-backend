import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OpenAI } from 'openai';
import { TokenUsageService } from '../../../domain/services/TokenUsageService.js';
import { UserAIKeyService } from '../../../domain/services/UserAIKeyService.js';
import { createLogger } from '../../../utils/logger.js';
import { AuthenticationError, ErrorReason } from '../../../utils/errors.js';

import IOpenAIProxyController from '../OpenAIProxyController.js';

export class OpenAIProxyControllerImpl implements IOpenAIProxyController {
    private basePath = '/api/openai/v1';
    private logger = createLogger(undefined, 'OpenAIProxyController');
    private readonly systemOpenAI: OpenAI;

    constructor(
        private fastify: FastifyInstance,
        private tokenUsageService: TokenUsageService,
        private userAIKeyService: UserAIKeyService
    ) {
        this.systemOpenAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async registerRoutes(): Promise<void> {
        this.fastify.post(`${this.basePath}/chat/completions`, this.handleChatCompletion.bind(this));
        this.fastify.post(`${this.basePath}/responses`, this.handleResponses.bind(this));
    }

    private async resolveOpenAIClient(userId: string): Promise<OpenAI> {
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

    private setupStreamHeaders(reply: FastifyReply): void {
        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache');
        reply.raw.setHeader('Connection', 'keep-alive');
    }

    private async handleStreamingRequest(
        stream: AsyncIterable<any>,
        reply: FastifyReply,
        userId: string,
        model: string
    ): Promise<void> {
        this.setupStreamHeaders(reply);

        let accumulatedUsage: any = null;

        for await (const chunk of stream) {
            if (chunk.usage || (chunk as any).usage) {
                accumulatedUsage = chunk.usage || (chunk as any).usage;
            }

            const jsonString = JSON.stringify(chunk);
            reply.raw.write(`data: ${jsonString}\n\n`);
        }

        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();

        await this.trackUsage(userId, model, accumulatedUsage);
    }

    private async trackUsage(userId: string, model: string, usage: any): Promise<void> {
        if (usage) {
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

    private handleOpenAIError(error: any, reply: FastifyReply, apiType: string): any {
        this.logger.error(`Error in OpenAI proxy (${apiType})`, error);

        if (error instanceof AuthenticationError) {
            throw new AuthenticationError('OpenAI API Error', ErrorReason.EXTERNAL_SERVICE_ERROR);
        }

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

    private async handleResponses(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.headers['x-user-id'] as string) || 'unknown';
        const body = request.body as any;

        this.logger.info('Processing OpenAI proxy request (Responses API)', { userId, model: body.model });

        await this.tokenUsageService.checkUsageLimit(userId);

        const openaiClient = await this.resolveOpenAIClient(userId);

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                const stream = await openaiClient.responses.create(body) as any;
                await this.handleStreamingRequest(stream, reply, userId, body.model);
            } else {
                const response = await openaiClient.responses.create(body);

                if (response.usage) {
                    await this.trackUsage(userId, response.model || body.model, response.usage);
                }

                return response;
            }
        } catch (error: any) {
            return this.handleOpenAIError(error, reply, 'Responses');
        }
    }

    private async handleChatCompletion(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.headers['x-user-id'] as string) || 'unknown';
        const body = request.body as any;

        this.logger.info('Processing OpenAI proxy request', { userId, model: body.model });

        await this.tokenUsageService.checkUsageLimit(userId);

        const openaiClient = await this.resolveOpenAIClient(userId);

        try {
            const isStreaming = body.stream === true;

            if (isStreaming) {
                body.stream_options = { include_usage: true };
                const stream = await openaiClient.chat.completions.create(body) as any;
                await this.handleStreamingRequest(stream, reply, userId, body.model);
            } else {
                const completion = await openaiClient.chat.completions.create(body);

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
