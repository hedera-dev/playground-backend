/**
 * Error reasons for machine-readable error identification
 */
export enum ErrorReason {
  // Authentication & Authorization (4xx)
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_SESSION = 'INVALID_SESSION',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_API_KEY = 'INVALID_API_KEY',
  CUSTOM_KEY_NOT_FOUND = 'CUSTOM_KEY_NOT_FOUND',
  
  // Resource errors (4xx)
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  USER_KEY_NOT_FOUND = 'USER_KEY_NOT_FOUND',
  
  // Validation errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_METADATA = 'MISSING_METADATA',
  UNKNOWN_METADATA_TYPE = 'UNKNOWN_METADATA_TYPE',
  
  // Rate limiting (4xx)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Usage limits (4xx)
  TOKEN_LIMIT_EXCEEDED = 'TOKEN_LIMIT_EXCEEDED',
  USAGE_LIMIT_EXCEEDED = 'USAGE_LIMIT_EXCEEDED',
  
  // Conflict errors (4xx)
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  USER_KEY_ALREADY_EXISTS = 'USER_KEY_ALREADY_EXISTS',
  
  // External service errors (5xx)
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  KMS_ENCRYPTION_ERROR = 'KMS_ENCRYPTION_ERROR',
  KMS_DECRYPTION_ERROR = 'KMS_DECRYPTION_ERROR',
  HEDERA_MCP_ERROR = 'HEDERA_MCP_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Internal errors (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NOT_INITIALIZED = 'NOT_INITIALIZED'
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  reason: ErrorReason;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: string;
}

/**
 * Base API Error class
 */
export class APIError extends Error {
  public readonly reason: ErrorReason;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(message: string, reason: ErrorReason, statusCode: number, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.reason = reason;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ErrorResponse {
    return {
      reason: this.reason,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Authentication Error (401)
 */
export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed', reason: ErrorReason = ErrorReason.AUTHENTICATION_FAILED, details?: any) {
    super(message, reason, 401, details);
  }
}

/**
 * Authorization Error (403)
 */
export class AuthorizationError extends APIError {
  constructor(message: string = 'Access forbidden', reason: ErrorReason = ErrorReason.FORBIDDEN, details?: any) {
    super(message, reason, 403, details);
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends APIError {
  constructor(message: string = 'Resource not found', reason: ErrorReason = ErrorReason.NOT_FOUND, details?: any) {
    super(message, reason, 404, details);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends APIError {
  constructor(message: string = 'Validation failed', reason: ErrorReason = ErrorReason.VALIDATION_ERROR, details?: any) {
    super(message, reason, 400, details);
  }
}

/**
 * Rate Limit Error (429)
 * Use for request frequency limits (e.g., "10 requests per minute")
 */
export class RateLimitError extends APIError {
  constructor(message: string = 'Rate limit exceeded', reason: ErrorReason = ErrorReason.RATE_LIMIT_EXCEEDED, details?: any) {
    super(message, reason, 429, details);
  }
}

/**
 * Usage Limit Error (429)
 * Use for consumption limits (e.g., "100k tokens per month")
 */
export class UsageLimitError extends APIError {
  constructor(message: string = 'Usage limit exceeded', reason: ErrorReason = ErrorReason.USAGE_LIMIT_EXCEEDED, details?: any) {
    super(message, reason, 429, details);
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends APIError {
  constructor(message: string = 'Resource already exists', reason: ErrorReason = ErrorReason.RESOURCE_ALREADY_EXISTS, details?: any) {
    super(message, reason, 409, details);
  }
}

/**
 * External Service Error (502/503)
 */
export class ExternalServiceError extends APIError {
  constructor(message: string = 'External service error', reason: ErrorReason = ErrorReason.EXTERNAL_SERVICE_ERROR, statusCode: number = 502, details?: any) {
    super(message, reason, statusCode, details);
  }
}

/**
 * Internal Server Error (500)
 */
export class InternalServerError extends APIError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, ErrorReason.INTERNAL_SERVER_ERROR, 500, details);
  }
}
