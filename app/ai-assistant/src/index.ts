import Fastify, { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { config } from 'dotenv';
import { ChatControllerImpl } from './application/controllers/impl/ChatControllerImpl.js';
import HealthControllerImpl from './application/controllers/impl/HealthControllerImpl.js';
import { logger } from './utils/logger.js';
import { CacheClient } from './infrastructure/persistence/RedisConnector.js';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify: FastifyInstance = Fastify({
	loggerInstance: logger as FastifyBaseLogger,
	disableRequestLogging: true // Disable automatic request logging
});

// Custom request logging with healthcheck filter
fastify.addHook('onRequest', async (request, reply) => {
	// Skip logging for healthcheck endpoint
	if (request.url.includes('/health')) {
		return;
	}
	request.log.info(
		{
			method: request.method,
			url: request.url
		},
		'incoming request'
	);
});

fastify.addHook('onResponse', async (request, reply) => {
	// Skip logging for healthcheck endpoint
	if (request.url.includes('/health')) {
		return;
	}
	request.log.info(
		{
			method: request.method,
			url: request.url,
			statusCode: reply.statusCode,
			responseTime: reply.elapsedTime
		},
		'request completed'
	);
});

fastify.setErrorHandler((error, request, reply) => {
	fastify.log.error(error);

	const statusCode = error.statusCode || 500;
	const message = error.message || 'Internal Server Error';

	reply.status(statusCode).send({
		message,
		statusCode,
		timestamp: new Date().toISOString()
	});
});

fastify.setNotFoundHandler((request, reply) => {
	reply.status(404).send({
		message: 'Route not found',
		statusCode: 404,
		path: request.url,
		method: request.method,
		timestamp: new Date().toISOString()
	});
});

async function start() {
	try {
		// Initialize optional Redis connection if REDIS_URL is provided
		await CacheClient.connect();
		const healthController = new HealthControllerImpl(fastify);
		const chatController = new ChatControllerImpl(fastify);

		await healthController.registerRoutes();
		await chatController.registerRoutes();

		// Stats endpoint
		fastify.get('/api/stats', async (request, reply) => {
			return {
				activeSessions: chatController.getActiveSessionsCount(),
				timestamp: new Date().toISOString(),
				status: 'running'
			};
		});

		// Cleanup old sessions every hour
		setInterval(() => {
			chatController.cleanupOldSessions(24); // 24 hours
		}, 60 * 60 * 1000);

		await fastify.listen({ port: PORT, host: HOST });
		logger.info(
			{
				host: HOST,
				port: PORT,
				endpoints: {
					chat: `/api/playground/assistant/chat`,
					history: `/api/playground/assistant/chat/history/:conversationId`,
					health: `/api/playground/assistant/health`,
					stats: `/api/stats`
				},
				logger_level: process.env.LOG_LEVEL,
				mockMode: process.env.ENABLE_MOCK_MODE === 'true',

			},
			`🚀 Hedera Playground Backend running on http://${HOST}:${PORT}`
		);
	} catch (error) {
		fastify.log.error(error);
		process.exit(1);
	}
}

// Start the server
start().catch((error) => {
	logger.fatal(error, 'Failed to start server');
	process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
	await CacheClient.disconnect();
	process.exit(0);
});
process.on('SIGTERM', async () => {
	await CacheClient.disconnect();
	process.exit(0);
});
