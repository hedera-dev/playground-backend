# Hedera Playground Backend

Backend API de WebSocket construido con TypeScript, Fastify y OpenAI para el asistente Hedera Playground.

## 🚀 Características

-   **Fastify**: Framework web rápido y eficiente
-   **WebSocket**: Comunicación en tiempo real con `@fastify/websocket`
-   **OpenAI Integration**: Streaming de respuestas con GPT-4
-   **TypeScript**: Tipado estático completo
-   **Validación**: Esquemas Zod para mensajes WebSocket
-   **Health Checks**: Endpoints de monitoreo
-   **Auto-reconexión**: Manejo robusto de conexiones

## 📋 Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp env.example .env
```

### Variables de Entorno

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
NODE_ENV=development
```

## 🛠️ Scripts

```bash
# Desarrollo con hot reload
npm run dev

# Compilar TypeScript
npm run build

# Ejecutar versión compilada
npm start

# Tests (por implementar)
npm test
```

## 📡 API

### WebSocket Endpoints

#### `/ws/chat`

Endpoint principal para comunicación de chat en tiempo real.

**Mensajes de entrada:**

```typescript
{
  type: 'chat' | 'ping',
  content: string,
  conversationId?: string,
  messageId?: string
}
```

**Respuestas:**

```typescript
{
  type: 'chat_start' | 'chat_delta' | 'chat_complete' | 'error' | 'pong',
  content?: string,
  messageId?: string,
  conversationId?: string,
  error?: string,
  metadata?: {
    model?: string,
    finishReason?: string,
    usage?: {
      promptTokens: number,
      completionTokens: number,
      totalTokens: number
    }
  }
}
```

### HTTP Endpoints

#### `GET /health`

Estado del servidor

```json
{
	"status": "healthy",
	"timestamp": "2024-01-01T00:00:00.000Z",
	"uptime": 123.45,
	"environment": "development"
}
```

#### `GET /api/info`

Información de la API

```json
{
	"name": "Hedera Playground Backend",
	"version": "1.0.0",
	"description": "WebSocket API for Hedera Playground Assistant",
	"endpoints": {
		"websocket": "/ws/chat",
		"health": "/health",
		"stats": "/api/stats"
	}
}
```

#### `GET /api/stats`

Estadísticas de conexiones

```json
{
	"activeConnections": 2,
	"connections": [
		{
			"id": "uuid-1",
			"isAlive": true,
			"messageCount": 5
		}
	]
}
```

## 🏗️ Arquitectura

```
src/
├── index.ts              # Servidor principal Fastify
├── websocket-handler.ts  # Manejo de conexiones WebSocket
├── openai-service.ts     # Servicio de integración OpenAI
└── types.ts             # Definiciones de tipos TypeScript
```

### Componentes Principales

#### `WebSocketHandler`

-   Maneja conexiones WebSocket
-   Enrutamiento de mensajes
-   Health checks (ping/pong)
-   Gestión de estado de conexiones

#### `OpenAIService`

-   Integración con OpenAI API
-   Streaming de respuestas
-   Manejo de historial de conversaciones
-   Especialización en Hedera/Web3

#### `Types`

-   Esquemas de validación Zod
-   Interfaces TypeScript
-   Tipos para mensajes y respuestas

## 🔧 Configuración Avanzada

### CORS

```typescript
await fastify.register(cors, {
	origin: [
		"http://localhost:3000",
		"http://localhost:5173",
		/^http:\/\/localhost:\d+$/,
	],
	credentials: true,
});
```

### WebSocket Options

```typescript
await fastify.register(websocket, {
	options: {
		maxPayload: 1048576, // 1MB
		verifyClient: (info) => true, // Personalizar autenticación
	},
});
```

### OpenAI Configuration

```typescript
const stream = await this.client.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
  max_tokens: 2000,
  temperature: 0.7,
});
```

## 🔍 Logging y Debugging

El servidor incluye logging integrado con Fastify:

```bash
# Logs de desarrollo (nivel: info)
npm run dev

# Logs de producción (nivel: warn)
NODE_ENV=production npm start
```

## 🚦 Manejo de Errores

-   Validación de esquemas con Zod
-   Error handlers globales de Fastify
-   Timeout handling para conexiones WebSocket
-   Reconexión automática del cliente

## 📊 Monitoreo

-   Health check endpoint
-   Estadísticas de conexiones activas
-   Métricas de uso de tokens OpenAI
-   Estado de conexiones WebSocket

## 🔒 Seguridad

-   Validación de entrada con Zod
-   CORS configurado apropiadamente
-   Rate limiting (por implementar)
-   Autenticación (por implementar)

## 🚀 Despliegue

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm run build
npm start
```

### Docker (por implementar)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
```

## Helm Chart

To deploy the application using Helm, follow these steps:

1. **Create a Helm Chart**:

    - Run `helm create hedera-playground-assistant` to generate a new Helm chart.
    - Replace the contents of `hedera-playground-assistant/templates/` with the Kubernetes manifests created earlier.

2. **Update `values.yaml`**:

    - Set the Docker image and other configurations as needed.

3. **Deploy the Helm Chart**:

    - Run `helm install hedera-playground-assistant ./hedera-playground-assistant` to deploy the application.

4. **Verify Deployment**:
    - Use `kubectl get pods` and `kubectl get services` to ensure the application is running correctly.

## GCP deployment with Terraform

### Prerequisites

-   Google Cloud project with billing enabled
-   `gcloud` CLI authenticated and configured for your project
-   `terraform` >= 1.5 installed

### What Terraform creates

-   Artifact Registry repo for Docker images
-   Secret Manager secret `OPENAI_API_KEY`
-   Cloud Run (fully managed) service for the backend
-   Service Account for Cloud Run with permissions to pull images and read the secret
-   Public invoker on the Cloud Run service

### 1) Build and push the Docker image

```bash
# Set these values
PROJECT_ID="your-project-id"
REGION="us-central1"
REPO="playground-backend"
IMAGE_NAME="backend"
TAG="v1"

gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
gcloud services enable artifactregistry.googleapis.com run.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project ${PROJECT_ID}

# Create repo if it does not exist
gcloud artifacts repositories create ${REPO} \
  --repository-format=docker \
  --location=${REGION} \
  --description="Docker repo for playground backend" \
  --project ${PROJECT_ID} || true

# Build and push
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG} -f ./backend/Dockerfile ./backend
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG}
```

### 2) Upload your OpenAI key to Secret Manager

```bash
gcloud secrets create OPENAI_API_KEY --replication-policy=automatic --project ${PROJECT_ID} || true
printf "%s" "$OPENAI_API_KEY" | gcloud secrets versions add OPENAI_API_KEY --data-file=- --project ${PROJECT_ID}
```

### 3) Deploy infra with Terraform

```bash
cd ../infra/terraform

terraform init
terraform apply \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="repository_id=${REPO}" \
  -var="service_name=playground-backend" \
  -var="image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG}"
```

### 4) Verify

```bash
terraform output cloud_run_url
curl "$(terraform output -raw cloud_run_url)/api/playground/assistant/health"
```

Notes:

-   The service listens on port `3001` and exposes `/api/playground/assistant/health`.
-   `OPENAI_API_KEY` is injected from Secret Manager at runtime. Ensure the secret has a latest version.

## GKE deployment (Kubernetes) with Terraform

If you prefer Kubernetes over Cloud Run, use the provided Terraform to create a GKE Autopilot cluster and deploy a `Service` named `hedera-playground-assistant` that exposes the app via a LoadBalancer.

### Prerequisites

-   Google Cloud project with billing enabled
-   `gcloud` and `terraform` installed
-   Docker image pushed to Artifact Registry (see step 1 below)

### 1) Build and push the Docker image

```bash
PROJECT_ID="playground-develop-441415"
REGION="us-central1"
REPO="playground-backend"
IMAGE_NAME="backend"
TAG="v1"

gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
gcloud services enable artifactregistry.googleapis.com container.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project ${PROJECT_ID}

gcloud artifacts repositories create ${REPO} \
  --repository-format=docker \
  --location=${REGION} \
  --description="Docker repo for playground backend" \
  --project ${PROJECT_ID} || true

docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG} -f ./backend/Dockerfile ./backend
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG}
```

### 2) Deploy GKE + Kubernetes resources with Terraform

```bash
cd ../infra/terraform

# Pass your secret without echoing it on the command line
export TF_VAR_openai_api_key="${OPENAI_API_KEY}"

terraform init
terraform apply \
  -var="project_id=${PROJECT_ID}" \
  -var="region=${REGION}" \
  -var="repository_id=${REPO}" \
  -var="service_name=playground-backend" \
  -var="image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${TAG}" \
  -var="enable_cloud_run=false"
```

### 3) Get access and test Service

```bash
# Fetch kubeconfig for the Autopilot cluster
gcloud container clusters get-credentials playground-backend-gke --region ${REGION} --project ${PROJECT_ID}

# Wait for the LoadBalancer external IP
kubectl get svc hedera-playground-assistant -w

# Once EXTERNAL-IP is assigned, test health
EXTERNAL_IP=$(kubectl get svc hedera-playground-assistant -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl "http://${EXTERNAL_IP}/api/playground/assistant/health"
```

Notes:

-   The Service name is `hedera-playground-assistant` and forwards port 80 -> container `3001`.
-   The Deployment label selector uses `app: playground-backend` by default; keep labels in sync if you change `service_name`.

## 📊 Sistema de Logging con Pino

### Configuración Centralizada

El sistema utiliza **Pino** con **pino-pretty** para logging estructurado y legible:

```typescript
import { logger, createAgentLogger } from "./utils/logger.js";

// Logger principal para toda la aplicación
logger.info({ key: "value" }, "Message");

// Logger específico para agentes con trazabilidad de sesión
const agentLogger = createAgentLogger();
agentLogger.logAgent1Start("User input...");
```

### Variables de Entorno de Logging

```bash
# Nivel de logging (debug, info, warn, error, fatal)
LOG_LEVEL=debug

# Entorno (afecta formato de salida)
NODE_ENV=development  # pino-pretty con colores
NODE_ENV=production   # JSON estructurado
```

### Scripts de Desarrollo

```bash
# Desarrollo normal
npm run dev

# Modo debug (muestra flujo completo Agent 1 → Agent 2)
npm run dev:debug
```

### Logs de Debug para Agentes

En modo debug (`LOG_LEVEL=debug`), verás el flujo completo:

-   **Input del usuario** al Agent 1
-   **Salida completa** del Agent 1 → Agent 2
-   **Prompt generado** para el Agent 2
-   **Respuesta final** del Agent 2
-   **Consumo de tokens** por agente

### Formato de Salida

**Desarrollo** (pino-pretty):

```
[2025-01-XX 10:15:23.456] INFO: 🚀 Two-agent mode enabled
    agent: "SESSION"
    sessionId: "a1b2c3"
    elapsed: 0

[2025-01-XX 10:15:24.123] DEBUG: Full proposed changes (Agent 1 → Agent 2 input)
    agent: "AGENT-1"
    fullProposedChanges: {...}
```

**Producción** (JSON):

```json
{
	"level": 30,
	"time": 1640000000000,
	"agent": "AGENT-1",
	"sessionId": "a1b2c3",
	"msg": "Changes proposed"
}
```

## 📝 Próximas Mejoras

-   [ ] Autenticación JWT
-   [ ] Rate limiting
-   [ ] Métricas Prometheus
-   [ ] Tests unitarios
-   [ ] Docker containerization
-   [ ] Base de datos para persistencia
-   [ ] Clustering para múltiples instancias
