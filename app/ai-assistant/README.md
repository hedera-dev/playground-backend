# AI Assistant — Hedera Playground Backend

HTTP Streaming API built with TypeScript and Fastify for the Hedera Playground assistant.

## Features

- **Fastify 5**: Fast web framework with native streaming support
- **OpenAI Streaming**: Real-time responses via AI SDK
- **PASETO v4**: Local authentication replicating SPOE/HAProxy behavior
- **PostgreSQL**: Session and configuration persistence
- **Redis**: Conversation session cache
- **BYOK**: Support for user-provided OpenAI keys (via GCP KMS)
- **Pino**: Structured logging with pino-pretty in development
- **TypeScript**: Full static typing

## Installation

```bash
npm install

# Copy and fill in environment variables
cp .env-tpl .env
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ENVIRONMENT` | Yes | Runtime environment: `local` \| `development` \| `production` |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `PORT` | No | Server port (default: `3001`) |
| `HOST` | No | Server host (default: `0.0.0.0`) |
| `LOG_LEVEL` | No | Log level: `debug` \| `info` \| `warn` \| `error` (default: `debug` in local/dev, `info` in prod) |
| `PASETO_V4_PUBLIC_KEY_HEX` | Yes (local) | Hex-encoded Ed25519 public key for PASETO token verification |
| `ALLOWED_ORIGIN` | No | Allowed CORS origin in local mode (default: `http://localhost:3000`) |
| `REDIS_URL` | No | Redis connection URL |
| `PG_HOST` | Yes | PostgreSQL host |
| `PG_PORT` | Yes | PostgreSQL port |
| `PG_DATABASE` | Yes | Database name |
| `PG_USER` | Yes | PostgreSQL user |
| `PG_PASSWORD` | Yes | PostgreSQL password |
| `PG_SSL` | No | Enable SSL for PG connection (`true`/`false`) |
| `MODEL_OPENAI` | No | Default OpenAI model |
| `VECTOR_STORE_ID` | No | OpenAI vector store ID |
| `TOKENS_LIMIT_PER_MONTH` | No | Monthly token limit per user |
| `ENABLE_MOCK_MODE` | No | Enable mock responses without calling OpenAI (`true`/`false`) |
| `GCP_PROJECT_ID` | No (BYOK) | GCP project for KMS |
| `GCP_KMS_LOCATION` | No (BYOK) | KMS region (default: `us-central1`) |
| `GCP_KMS_KEYRING` | No (BYOK) | KMS keyring name |
| `GCP_KMS_CRYPTO_KEY` | No (BYOK) | KMS crypto key name |
| `GOOGLE_APPLICATION_CREDENTIALS` | No (BYOK) | Path to GCP service account JSON key file |

## Scripts

```bash
# Development with hot reload
npm run dev

# Development with explicit debug level
npm run dev:debug

# Compile TypeScript
npm run build

# Run compiled output
npm start
```

## Architecture

The project follows a layered structure:

```
src/
├── application/      # HTTP controllers and middleware (routes, auth)
├── domain/           # Business logic and services
├── infrastructure/   # External integrations (PostgreSQL, Redis, GCP KMS)
└── utils/            # Shared helpers (logger, environment, errors, constants)
```

## HTTP Endpoints

### `GET /api/playground/assistant/health`

Server status and database connectivity.

```json
{
  "currentTime": "2025-01-01T00:00:00.000Z",
  "redis": { "ok": true },
  "pg": { "ok": true }
}
```

### `POST /api/playground/assistant/chat`

Starts or continues a conversation. Returns a streaming response (SSE / data stream).

**Required headers:**
- `Authorization: Bearer <paseto-token>` — in local mode, verified by the middleware
- `x-user-id` — in production, injected by SPOE/HAProxy

**Body:**
```json
{
  "id": "session-uuid",
  "messages": [{ "role": "user", "content": "What is Hedera?" }],
  "model": "gpt-4o-mini",
  "useCustomKey": false
}
```

### `GET /api/playground/assistant/chat/history/:conversationId`

Returns the history of a conversation.

### `GET /api/stats`

Active session statistics.

```json
{
  "activeSessions": 3,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "status": "running"
}
```

## Authentication

In **production**, the service runs behind HAProxy + SPOE, which verifies the PASETO token and adds the `x-user-id` header before the request reaches Fastify. The service trusts that header directly.

In **local** mode (`ENVIRONMENT=local`), the `localAuthMiddleware` replicates that behavior:

1. Verifies the PASETO v4 token using the public key from `PASETO_V4_PUBLIC_KEY_HEX`
2. Extracts the `userId` from the payload (`userId` field with fallback to `sub`)
3. Injects `x-user-id` into the request headers

Expired tokens are accepted in local mode (`ignoreExp: true`) to ease development, with a warning logged.

```
ENVIRONMENT=local  →  localAuthMiddleware verifies PASETO → sets x-user-id
ENVIRONMENT=*      →  HAProxy/SPOE verifies PASETO        → sets x-user-id
```

## Logging

The system uses **Pino** with a centralized instance in `utils/logger.ts`.

- In `local` and `development`: human-readable format with `pino-pretty` and colors
- In `production`: structured JSON

```typescript
import { logger, createLogger } from './utils/logger.js';

// Global logger
logger.info({ userId }, 'Chat started');

// Session-scoped logger
const sessionLogger = createLogger({ sessionId, userId }, 'CHAT');
sessionLogger.info('Streaming response');
sessionLogger.debug('Token usage', { tokens: 1234 });
```

The level is controlled by `LOG_LEVEL`. If not set, defaults to `debug` in local/development and `info` in production.

## Error Handling

Fastify has a global `setErrorHandler` that handles:

- **`ZodError`**: returns 400 with per-field validation details
- **`APIError`**: typed business errors with `ErrorReason`
- **OpenAI errors**: propagates the original `statusCode` and `type`
- **Unknown errors**: 500 with stack trace logged

## BYOK (Bring Your Own Key)

If `GCP_PROJECT_ID`, `GCP_KMS_KEYRING`, and `GCP_KMS_CRYPTO_KEY` are configured, the service enables a user key management endpoint. Keys are encrypted with GCP KMS before being stored in PostgreSQL.
