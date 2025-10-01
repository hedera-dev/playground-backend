# SPOE Authentication Service

A high-performance authentication service for HAProxy using the Stream Processing Offload Engine (SPOE) protocol. This service validates PASETO v4 tokens and provides user authentication for your applications.

## Features

- 🔐 **PASETO v4 Token Validation** - Secure token verification using Ed25519 signatures
- ⚡ **SPOE Integration** - Native HAProxy SPOE protocol support
- 🌐 **HTTP Mode** - Standalone HTTP service for testing and development
- 🛡️ **Security Features** - Audience/Issuer validation, expiration control

## Architecture

```
Request → HAProxy → SPOE Filter → spoe-auth → HAProxy → Backend
```

1. **HAProxy** receives HTTP request
2. **SPOE Filter** sends headers to spoe-auth service
3. **spoe-auth** validates PASETO token
4. **HAProxy** receives authentication result and user_id
5. **Backend** receives request with X-User-ID header

## Quick Start

### Local Development

1. **Build the application:**
   ```bash
   go build -o spoe-auth main.go
   ```

2. **Run in HTTP mode (for testing):**
   ```bash
   PASETO_V4_PUBLIC_KEY_HEX="your_public_key_hex" \
   MODE=http \
   IGNORE_EXP=true \
   ./spoe-auth
   ```

3. **Test the service:**
   ```bash
   curl -H "Authorization: Bearer your_token" http://localhost:8080/check
   ```

### Docker

1. **Build the image:**
   ```bash
   docker build -t spoe-auth .
   ```

2. **Run the container:**
   ```bash
   docker run -p 9000:9000 -p 8080:8080 \
     -e PASETO_V4_PUBLIC_KEY_HEX="your_public_key_hex" \
     -e MODE=spoe \
     spoe-auth
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PASETO_V4_PUBLIC_KEY_HEX` | ✅ | - | Ed25519 public key in HEX format (32 bytes) |
| `MODE` | ❌ | `http` | Service mode: `http` or `spoe` |
| `LISTEN_ADDR` | ❌ | `:9000` (spoe) / `:8080` (http) | Listen address |
| `IGNORE_EXP` | ❌ | `false` | Ignore token expiration validation |
| `REQUIRE_AUD` | ❌ | - | Expected audience (aud claim) |
| `REQUIRE_ISS` | ❌ | - | Expected issuer (iss claim) |
| `USER_FIELD` | ❌ | `userId` | Claim to extract user ID (fallback to `sub`) |
| `ADMIN_API_KEY` | ❌ | - | Bypass authentication with this API key |
| `AUTH_ARG` | ❌ | `auth` | SPOE argument name for token |
| `API_KEY_ARG` | ❌ | `api_key` | SPOE argument name for API key |
| `MESSAGE_NAME` | ❌ | `verify` | SPOE message name |

### Token Requirements

Your PASETO tokens should include:

```javascript
const token = await paseto.V4.sign(
  {
    sub: userId,                    // Standard subject claim
    userId: userId,                 // Custom user ID field
    aud: "playground-api",          // Audience (optional but recommended)
    iss: "auth-service",            // Issuer (optional but recommended)
  },
  secretKey,
  {
    jti: tokenId,                   // Unique token ID
    expiresIn: "24h",               // Expiration time
  }
);
```

## HAProxy Integration

### SPOE Configuration

Create a `spoe-auth.conf` file:

```ini
    [auth]
    spoe-agent spoe-auth
        log global
        messages verify
        option var-prefix spoe
        timeout hello 100ms
        timeout idle 30s
        timeout processing 15ms
        use-backend backend-spoe-auth

    spoe-message verify
        args auth=hdr(Authorization) api_key=hdr(X-API-Key) cookie=hdr(Cookie) method=method path=path host=hdr(host)
        event on-frontend-http-request


```

## API Endpoints

### HTTP Mode

- `GET /health` - Health check endpoint
- `POST /check` - Token validation endpoint

### SPOE Mode

- Listens on port 9000 for SPOE protocol
- Health check available on port 8080


## Development

### Prerequisites

- Go 1.25.1+
- Docker (optional)
- HAProxy with SPOE support

### Building

```bash
# Install dependencies
go mod download

# Build
go build -o spoe-auth main.go

### Testing

```bash
# Test HTTP mode
curl -H "Authorization: Bearer valid_token" http://localhost:8080/check

# Test health endpoint
curl http://localhost:8080/health
```