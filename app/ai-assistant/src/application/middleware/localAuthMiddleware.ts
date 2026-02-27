import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { V4 } from 'paseto';
import { KeyObject } from 'node:crypto';
import { environment } from '../../utils/environment.js';
import { logger } from '../../utils/logger.js';
import { HEALTH_PATH } from '../../utils/constants.js';

let publicKey: KeyObject | null = null;

function getPublicKey(): KeyObject {
  if (!publicKey) {
    const hex = environment.pasetoPublicKeyHex;
    if (!hex) {
      throw new Error('Missing required env: PASETO_V4_PUBLIC_KEY_HEX');
    }
    publicKey = V4.bytesToKeyObject(Buffer.from(hex, 'hex'));
  }
  return publicKey;
}

export async function registerLocalAuthMiddleware(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith(HEALTH_PATH)) {
      return;
    }

    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader) {
      return reply.status(401).send({
        reason: 'AUTHENTICATION_FAILED',
        message: 'Invalid or expired authentication token',
        statusCode: 401
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
      const key = getPublicKey();
      // ignoreExp: true — tokens expirados son válidos en local para facilitar el desarrollo
      const payload = await V4.verify(token, key, { ignoreExp: true }) as Record<string, unknown>;

      const exp = payload['exp'] as string | undefined;
      if (exp && new Date(exp) < new Date()) {
        logger.warn({ exp }, 'PASETO token is expired (ignoreExp=true in local mode)');
      }

      // El SPOE extrae userId con fallback a sub (userField: "userId")
      const userId = (payload['userId'] || payload['sub']) as string | undefined;

      if (!userId) {
        return reply.status(401).send({
          reason: 'AUTHENTICATION_FAILED',
          message: 'Invalid or expired authentication token',
          statusCode: 401
        });
      }

      request.headers['x-user-id'] = userId;
    } catch (err) {
      logger.warn({ err }, 'PASETO token verification failed');
      return reply.status(401).send({
        reason: 'AUTHENTICATION_FAILED',
        message: 'Invalid or expired authentication token',
        statusCode: 401
      });
    }
  });
}
