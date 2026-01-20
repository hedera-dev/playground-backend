import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserAIKeyController } from '../UserAIKeyController.js';
import { UserAIKeyService } from '../../../domain/services/UserAIKeyService.js';
import { createLogger } from '../../../utils/logger.js';
import { AuthorizationError, NotFoundError, ErrorReason } from '../../../utils/errors.js';
import { z } from 'zod';

const logger = createLogger();

// Schemas de validación
const StoreKeySchema = z.object({
  apiKey: z.string().min(1).startsWith('sk-')
});

export class UserAIKeyControllerImpl implements UserAIKeyController {
  private basePath = '/api/playground/assistant/user-ai-key';

  constructor(private readonly userKeyService: UserAIKeyService) {}

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post(this.basePath, this.storeKey.bind(this));
    fastify.get(this.basePath, this.getKey.bind(this));
    fastify.delete(this.basePath, this.deleteKey.bind(this));

    // Test endpoint - ONLY FOR DEVELOPMENT
    //fastify.get(`${this.basePath}/decrypt`, this.getDecryptedKey.bind(this));
  }

  private async storeKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      throw new AuthorizationError('No valid session found', ErrorReason.INVALID_SESSION);
    }

    const body = StoreKeySchema.parse(request.body);

    logger.debug('Storing user AI key', { userId });

    await this.userKeyService.storeKey({
      userId,
      apiKey: body.apiKey
    });

    return reply.status(201).send();
  }

  private async getKey(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      throw new AuthorizationError('No valid session found', ErrorReason.INVALID_SESSION);
    }

    const key = await this.userKeyService.getKeyInfo(userId);

    // Remove sensitive fields before sending
    const { encrypted_api_key, ...safeData } = key;
    return reply.status(200).send(safeData);
  }

  private async deleteKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      throw new AuthorizationError('No valid session found', ErrorReason.INVALID_SESSION);
    }

    logger.info('Deleting user AI key', { userId });

    const deleted = await this.userKeyService.deleteKey(userId);

    if (!deleted) {
      throw new NotFoundError('User AI key not found', ErrorReason.USER_KEY_NOT_FOUND);
    }

    return reply.status(204).send();
  }

  /**
   * TEST ENDPOINT - Returns decrypted API key
   * WARNING: Only for development/testing purposes
   */
  private async getDecryptedKey(request: FastifyRequest, reply: FastifyReply): Promise<any> {
    const userId = request.headers['x-user-id'] as string;

    if (!userId) {
      throw new AuthorizationError('No valid session found', ErrorReason.INVALID_SESSION);
    }

    logger.warn('Decrypting user AI key for testing', { userId });

    const result = await this.userKeyService.retrieveKey(userId);

    return reply.status(200).send(result);
  }
}
