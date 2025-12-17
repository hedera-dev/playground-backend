import Fastify, { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { config } from 'dotenv';
import { ZodError } from 'zod';
import { ChatControllerImpl } from './application/controllers/impl/ChatControllerImpl.js';
import HealthControllerImpl from './application/controllers/impl/HealthControllerImpl.js';
import { UserAIKeyControllerImpl } from './application/controllers/impl/UserAIKeyControllerImpl.js';
import { logger } from './utils/logger.js';
import { CacheClient } from './infrastructure/persistence/RedisConnector.js';
import { PgClient } from './infrastructure/persistence/PgConnector.js';
import { initializeKmsService } from './infrastructure/kms/KmsService.js';
import { UserAIKeyService } from './domain/services/UserAIKeyService.js';
import { UserAIKeyRepositoryImpl } from './infrastructure/repositories/impl/UserAIKeyRepositoryImpl.js';
import { APIError, ErrorReason } from './utils/errors.js';

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
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    fastify.log.warn({ issues: error.issues, path: request.url }, 'Validation error');

    return reply.status(400).send({
      reason: ErrorReason.VALIDATION_ERROR,
      message: 'Validation error',
      statusCode: 400,
      details: {
      errors: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
        }))
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle custom API errors
  if (error instanceof APIError) {
    // Log based on severity
    if (error.statusCode >= 500) {
    fastify.log.error(error);
  } else {
    fastify.log.warn(error);
  }

    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Handle OpenAI API errors from AI SDK
  // Thanks to our onError callback in agents, we now receive the original AI_APICallError
  const openaiError = error as any;
  
  if (openaiError.statusCode && openaiError.data?.error) {
    const errorData = openaiError.data.error;
    
    fastify.log.warn({ 
      statusCode: openaiError.statusCode, 
      type: errorData.type,
      code: errorData.code,
      message: openaiError.message 
    }, 'OpenAI API error');

    return reply.status(openaiError.statusCode).send({
      reason: ErrorReason.EXTERNAL_SERVICE_ERROR,
      message: openaiError.message,
      statusCode: openaiError.statusCode,
      details: {
        service: 'OpenAI',
        operation: 'streamText',
        type: errorData.type,
        code: errorData.code
      },
      timestamp: new Date().toISOString()
    });
  }

  // Handle unknown errors
  fastify.log.error(error);

  const statusCode = (error as any).statusCode || 500;
  const message = error.message || 'Internal Server Error';

  reply.status(statusCode).send({
    reason: ErrorReason.INTERNAL_SERVER_ERROR,
    message,
    statusCode,
    timestamp: new Date().toISOString()
  });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    reason: ErrorReason.NOT_FOUND,
    message: 'Route not found',
    statusCode: 404,
    details: {
    path: request.url,
      method: request.method
    },
    timestamp: new Date().toISOString()
  });
});

async function start() {
  try {
    // Initialize optional Redis connection if REDIS_URL is provided
    await CacheClient.connect();

    // Initialize PostgreSQL connection
    await PgClient.initialize();

    // Initialize KMS Service for BYOK (if configured)
    let userAIKeyController = null;
    try {
      if (process.env.GCP_PROJECT_ID && process.env.GCP_KMS_KEYRING && process.env.GCP_KMS_CRYPTO_KEY) {
        initializeKmsService();

        // Initialize User AI Key Service
        const userAIKeyRepository = new UserAIKeyRepositoryImpl();
        const userAIKeyService = new UserAIKeyService(userAIKeyRepository);
        userAIKeyController = new UserAIKeyControllerImpl(userAIKeyService);

        logger.info('BYOK (Bring Your Own Key) feature enabled');
      } else {
        logger.warn('BYOK feature disabled: KMS configuration not found');
      }
    } catch (error) {
      logger.warn(error, 'BYOK feature disabled: KMS initialization failed');
    }

    const healthController = new HealthControllerImpl(fastify);
    const chatController = new ChatControllerImpl(fastify);

    await healthController.registerRoutes();
    await chatController.registerRoutes();

    // Register User Key routes if BYOK is enabled
    if (userAIKeyController) {
      await userAIKeyController.registerRoutes(fastify);
    }

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
          stats: `/api/stats`,
          userKeys: userAIKeyController ? `/api/playground/assistant/user-ai-key` : 'disabled'
        },
        logger_level: process.env.LOG_LEVEL,
        mockMode: process.env.ENABLE_MOCK_MODE === 'true',
        databases: {
          redis: CacheClient.isConnected(),
          postgresql: PgClient.isConnected()
        }
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
  await PgClient.disconnect();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await CacheClient.disconnect();
  await PgClient.disconnect();
  process.exit(0);
});
