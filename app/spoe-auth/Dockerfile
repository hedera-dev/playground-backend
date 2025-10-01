# Multi-stage Dockerfile for SPOE Authentication Service

# Build stage
FROM golang:1.25.1-alpine AS builder

# Install system dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy dependency files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o spoe-auth main.go

# Final stage
FROM alpine:latest

# Install CA certificates and timezone data
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy compiled binary
COPY --from=builder /app/spoe-auth .

# Change file ownership
RUN chown appuser:appgroup spoe-auth

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 9000

# Default command
CMD ["./spoe-auth"]
