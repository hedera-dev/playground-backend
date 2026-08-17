import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { V4 } from 'paseto';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
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

let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) {
    const issuer = environment.zitadelIssuer;
    if (!issuer) {
      throw new Error('Missing required env: ZITADEL_ISSUER');
    }
    const url = environment.zitadelJwksUrl ?? `${issuer.replace(/\/+$/, '')}/oauth/v2/keys`;
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

// Local mirror of the SPOE agent's ZITADEL branch (BRA-468): RS256 only,
// exact issuer, aud must contain the project id, and the identity comes
// exclusively from the portal-user-id claim — never `sub`, whose ZITADEL
// value would detach every stored BYOK key.
async function verifyZitadelJwt(token: string): Promise<string | undefined> {
  // Fail closed like the Go agent, which refuses to boot without these: with
  // `audience: undefined` jose would simply skip the aud check.
  if (!environment.zitadelIssuer || !environment.zitadelAudience) {
    throw new Error('ZITADEL_ISSUER and ZITADEL_AUDIENCE are required for the JWT branch');
  }
  const { payload } = await jwtVerify(token, getJwks(), {
    algorithms: ['RS256'],
    issuer: environment.zitadelIssuer,
    audience: environment.zitadelAudience,
    clockTolerance: environment.jwtClockSkewSeconds
  });
  const userId = payload[environment.jwtUserClaim];
  return typeof userId === 'string' && userId.trim() !== '' ? userId.trim() : undefined;
}

const isJwt = (token: string) => token.startsWith('eyJ') && token.split('.').length === 3;

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
      let userId: string | undefined;

      if (isJwt(token)) {
        userId = await verifyZitadelJwt(token);
      } else if (!environment.acceptLegacyPaseto) {
        // Same kill switch as the SPOE agent: past the migration, legacy
        // tokens are refused rather than quietly still accepted in local.
        return reply.status(401).send({
          reason: 'AUTHENTICATION_FAILED',
          message: 'Invalid or expired authentication token',
          statusCode: 401
        });
      } else {
        const key = getPublicKey();
        // ignoreExp: true — tokens expirados son válidos en local para facilitar el desarrollo
        const payload = await V4.verify(token, key, { ignoreExp: true }) as Record<string, unknown>;

        const exp = payload['exp'] as string | undefined;
        if (exp && new Date(exp) < new Date()) {
          logger.warn({ exp }, 'PASETO token is expired (ignoreExp=true in local mode)');
        }

        // El SPOE extrae userId con fallback a sub (userField: "userId")
        userId = (payload['userId'] || payload['sub']) as string | undefined;
      }

      if (!userId) {
        return reply.status(401).send({
          reason: 'AUTHENTICATION_FAILED',
          message: 'Invalid or expired authentication token',
          statusCode: 401
        });
      }

      request.headers['x-user-id'] = userId;
    } catch (err) {
      logger.warn({ err }, 'Token verification failed');
      return reply.status(401).send({
        reason: 'AUTHENTICATION_FAILED',
        message: 'Invalid or expired authentication token',
        statusCode: 401
      });
    }
  });
}
