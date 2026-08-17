export const environment = {
  environment: process.env.ENVIRONMENT ?? 'production',
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  pasetoPublicKeyHex: process.env.PASETO_V4_PUBLIC_KEY_HEX,
  // ZITADEL JWT branch (BRA-468) — local mirror of the SPOE agent's config.
  zitadelIssuer: process.env.ZITADEL_ISSUER,
  zitadelJwksUrl: process.env.ZITADEL_JWKS_URL,
  zitadelAudience: process.env.ZITADEL_AUDIENCE,
  jwtUserClaim: process.env.JWT_USER_CLAIM ?? 'urn:hedera:portal_user_id',
};

export const isLocal = () => environment.environment === 'local';
export const isDevelopment = () => environment.environment === 'development';
