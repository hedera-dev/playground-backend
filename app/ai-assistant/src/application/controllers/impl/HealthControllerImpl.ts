import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import IHealthController from '../HealthController.js';
import { CacheClient } from '../../../infrastructure/persistence/RedisConnector.js';

export default class HealthControllerImpl implements IHealthController {
  private basePath = '/api/playground/assistant';

  constructor(private fastify: FastifyInstance) {}

  public async registerRoutes(): Promise<void> {
    this.fastify.get(`${this.basePath}/health`, this.checkHealth.bind(this));
  }

  private async checkHealth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const redisOk = await CacheClient.ping();
    const result = {
      currentTime: new Date(),
      redis: {
        ok: redisOk
      }
    };
    reply.send(result);
  }
}
