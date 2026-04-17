# Run playground-api in Docker (local)

This guide explains how to build the image with the main **`Dockerfile`** (Go, Java, Node, and Rust packages from the same URLs as dev/prod) and run it with `docker compose`, matching the GCE `docker-compose` layout (fixed network, `tmpfs`, environment variables, and a privileged container).

## Requirements

- Docker Desktop or Docker Engine with Compose v2.
- Network access during **`docker build`** so layers can download runtime tarballs from `storage.googleapis.com`.

## 1. Build the image

The build context is **`app/playground-api`** (paths in `Dockerfile` are relative to that directory).

From the monorepo root:

```bash
cd app/playground-api
docker build --platform linux/amd64 -t playground-api:latest-local .
```

The tag matches the one used in this module’s `docker-compose.yaml`.

## 2. Start the container

From the same directory:

```bash
docker compose up
```

Detached:

```bash
docker compose up -d
```

## 3. Verify it responds

By default this compose maps host **2000** to container **2000** (the Terraform template uses `80:2000`). Health is unauthenticated:

```bash
curl -sS http://127.0.0.1:2000/api/playground/health
```

`docker-compose.yaml` keeps **`PUBLIC_KEY` commented out** so the API behaves like an open local sandbox: `/api/playground/*` does not require a Bearer token or session cookie. Example:

```bash
curl -sS http://127.0.0.1:2000/api/playground/runtimes
```

To match deployed behaviour, uncomment `PUBLIC_KEY` in `docker-compose.yaml` and call the API with a valid **PASETO** `Authorization: Bearer …` (or portal session cookie) as in production.

See [api-playground.md](api-playground.md) for API details and [configuration.md](configuration.md) for environment variables.

## 4. Call `POST /api/playground/execute` (local)

Against the compose in this repo the base URL is **`http://127.0.0.1:2000`**. With **`PUBLIC_KEY` unset**, `Accept` and `Content-Type` are enough; no `Authorization` header is required for local testing.

```bash
curl -sS 'http://127.0.0.1:2000/api/playground/execute' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data '{"language":"javascript","version":"*","files":[{"content":"console.log(\"Hello World\");\n"}]}'
```

If you enable **`PUBLIC_KEY`** in `docker-compose.yaml`, add **`Authorization: Bearer <PASETO>`** (same as hedera portal).

## 5. Stop and remove the stack

From `app/playground-api` (same directory as `docker-compose.yaml`):

```bash
docker compose down
```

This stops the containers and removes the Compose project network. The image **`playground-api:latest-local`** remains on the Docker host until you delete it (for example with `docker rmi playground-api:latest-local`).

## Notes

- **`privileged: true`** and fixed IP `172.20.0.10` mirror the deployed environment; they are required for job isolation (`isolate`).
- **`DISABLE_NETWORKING: "false"`** matches the deployment template so jobs may use the network. For stricter behavior (the in-code default is no network), set it to `"true"` in `docker-compose.yaml`.
- Runtimes and checksums come from `Dockerfile` (`playground_pkgs_dev` URLs); that matches the dev/prod image contents, not `Dockerfile.local`.
