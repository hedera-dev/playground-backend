import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { V4 } from 'paseto';

const HEALTH_PATH = '/api/playground/assistant/health';

let publicKey: ReturnType<typeof V4.bytesToKeyObject> | null = null;

function getPublicKey() {
  if (!publicKey) {
    const hex = process.env.PASETO_V4_PUBLIC_KEY_HEX || 'ca7fd8408500327b40d4da02dbc34881b2a379ccd3913a9d06e810a8fdb66329';
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
    const apiKey = request.headers['x-api-key'] as string | undefined;

    // Bypass con API key de admin (igual que el SPOE)
    const adminApiKey = process.env.ADMIN_API_KEY;
    if (adminApiKey && apiKey === adminApiKey) {
      request.headers['x-user-id'] = 'admin';
      return;
    }

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
      const payload = await V4.verify(token, key, { ignoreExp: true }) as Record<string, unknown>;

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
    } catch {
      return reply.status(401).send({
        reason: 'AUTHENTICATION_FAILED',
        message: 'Invalid or expired authentication token',
        statusCode: 401
      });
    }
  });
}
