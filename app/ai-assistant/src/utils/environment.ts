export const environment = {
  environment: process.env.ENVIRONMENT ?? 'production',
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  pasetoPublicKeyHex: process.env.PASETO_V4_PUBLIC_KEY_HEX,
};

export const isLocal = () => environment.environment === 'local';
export const isDevelopment = () => environment.environment === 'development';
