# ---- Builder: compile TypeScript and prepare node_modules without dev deps ----
  FROM node:22.16.0-alpine AS builder

  WORKDIR /app
  
  # Install system dependencies required for HEALTHCHECK (curl)
  RUN apk add --no-cache curl
  
  # Install dependencies
  COPY package*.json ./
  RUN npm ci
  
  # Copy source code and tsconfig for compilation
  COPY tsconfig.json ./
  COPY src ./src
  
  # Compile to dist/
  RUN npm run build
  
  # Remove dev dependencies to prepare production node_modules
  RUN npm prune --omit=dev
  
  # ---- Runtime: minimal image to run the app ----
  FROM node:22.16.0-alpine AS runtime
  
  ENV NODE_ENV=production
  WORKDIR /app
  
  # Install curl in runtime for HEALTHCHECK
  RUN apk add --no-cache curl
  
  # Copy only what is needed from the builder
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package*.json ./
  COPY --from=builder /app/dist ./dist
  
  # Port exposed by the app
  EXPOSE 3001
  
  # Start the app
  CMD ["node", "dist/index.js"]
  
  
  