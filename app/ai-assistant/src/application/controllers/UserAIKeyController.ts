import { FastifyInstance } from 'fastify';

export interface UserAIKeyController {
  /**
   * Register all routes for user AI key management
   * @param fastify - Fastify instance
   */
  registerRoutes(fastify: FastifyInstance): Promise<void>;
}
