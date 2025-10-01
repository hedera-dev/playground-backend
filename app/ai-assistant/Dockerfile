# ---- Builder: compila TypeScript y prepara node_modules sin dev ----
  FROM node:22.16.0-alpine AS builder

  WORKDIR /app
  
  # Instalar dependencias del sistema necesarias para HEALTHCHECK (curl)
  RUN apk add --no-cache curl
  
  # Instalar dependencias
  COPY package*.json ./
  RUN npm ci
  
  # Copiar código fuente y tsconfig para compilar
  COPY tsconfig.json ./
  COPY src ./src
  
  # Compilar a dist/
  RUN npm run build
  
  # Quitar dependencias de desarrollo para preparar node_modules de producción
  RUN npm prune --omit=dev
  
  # ---- Runtime: imagen mínima para ejecutar la app ----
  FROM node:22.16.0-alpine AS runtime
  
  ENV NODE_ENV=production
  WORKDIR /app
  
  # Instalar curl en runtime para el HEALTHCHECK
  RUN apk add --no-cache curl
  
  # Copiar sólo lo necesario desde el builder
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/package*.json ./
  COPY --from=builder /app/dist ./dist
  
  # Puerto expuesto por la app
  EXPOSE 3001
  
  # Ejecutar
  CMD ["node", "dist/index.js"]
  
  
  