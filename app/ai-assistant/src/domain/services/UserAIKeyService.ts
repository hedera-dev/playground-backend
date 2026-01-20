import { UserAIKeyRepository } from '../../infrastructure/repositories/UserAIKeyRepository.js';
import { UserAIKey, CreateUserAIKeyRequest } from '../entities/UserAIKey.js';
import { getKmsService } from '../../infrastructure/kms/KmsService.js';
import { createLogger, AppLogger } from '../../utils/logger.js';
import OpenAI from 'openai';
import { 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  ErrorReason 
} from '../../utils/errors.js';
import { isDevelopment, isLocal } from '../../utils/environment.js';

const baseLogger = createLogger();

export interface StoreKeyRequest {
  userId: string;
  apiKey: string; // Plaintext API key
}

export interface RetrieveKeyResponse {
  userId: string;
  apiKey: string; // Decrypted API key
  createdAt: Date;
}

export class UserAIKeyService {
  constructor(private readonly repository: UserAIKeyRepository) {}

  /**
   * Stores a new AI API key for a user, encrypting it with KMS
   * @param request - Request with userId and apiKey in plain text
   * @returns Stored UserAIKey
   */
  async storeKey(request: StoreKeyRequest): Promise<UserAIKey> {
    const { userId, apiKey } = request;

    // Validate that the API key is valid before storing it
    const isValid = await this.validateAIKey(apiKey);
    if (!isValid) {
      throw new ValidationError('Invalid AI API key', ErrorReason.INVALID_API_KEY);
    }

    // Check if a key already exists for this user
    const existingKey = await this.repository.findByUserId(userId);
    if (existingKey) {
      throw new ConflictError('User already has an AI key. Delete it first to create a new one.', ErrorReason.USER_KEY_ALREADY_EXISTS);
    }

    // Encrypt the API key using KMS
    const kmsService = getKmsService();
    const { ciphertext, keyVersion } = await kmsService.encrypt(apiKey);

    // Create the database record
    const createRequest: CreateUserAIKeyRequest = {
      user_id: userId,
      encrypted_api_key: ciphertext,
      kms_key_version: keyVersion
    };

    const stored = await this.repository.insert(createRequest);

    baseLogger.info('AI key stored successfully', { userId });
    return stored;
  }

  /**
   * Retrieves and decrypts the AI API key of a user
   * @param userId - User ID
   * @returns Decrypted API key
   */
  async retrieveKey(userId: string): Promise<RetrieveKeyResponse> {
    // Find the encrypted key
    const userKey = await this.repository.findByUserId(userId);
    if (!userKey) {
      throw new NotFoundError('User AI key not found', ErrorReason.USER_KEY_NOT_FOUND);
    }

    // Decrypt using KMS
    const kmsService = getKmsService();
    const decryptedKey = await kmsService.decrypt(userKey.encrypted_api_key, userKey.kms_key_version);

    baseLogger.debug('AI key retrieved successfully', { userId });

    return {
      userId: userKey.user_id,
      apiKey: decryptedKey,
      createdAt: userKey.created_at
    };
  }

  /**
   * Deletes the AI API key of a user
   * @param userId - User ID
   * @returns true if deleted successfully
   */
  async deleteKey(userId: string): Promise<boolean> {
    const deleted = await this.repository.delete(userId);

    if (deleted) {
      baseLogger.info('AI key deleted successfully', { userId });
    } else {
      baseLogger.warn('AI key not found for deletion', { userId });
    }

    return deleted;
  }

  /**
   * Gets the AI API key information of a user (without decrypting)
   * @param userId - User ID
   * @returns UserAIKey or null if it doesn't exist
   */
  async getKeyInfo(userId: string): Promise<UserAIKey> {
    const key = await this.repository.findByUserId(userId);
    if (!key) {
      throw new NotFoundError('User AI key not found', ErrorReason.USER_KEY_NOT_FOUND);
    }
    return key;
  }

  /**
   * Checks if a user has a stored AI API key
   * @param userId - User ID
   * @returns true if the user has a key
   */
  async hasKey(userId: string): Promise<boolean> {
    return await this.repository.exists(userId);
  }

  /**
   * Validates that an AI API key is valid by making an API call
   * @param apiKey - API key to validate
   * @returns true if the key is valid
   * @throws ValidationError if the key is invalid
   */
  private async validateAIKey(apiKey: string): Promise<boolean> {
    if (isDevelopment || isLocal) {
      return true;
    }

    try {
    const openai = new OpenAI({ apiKey });

    // Make a simple call to verify the key
    await openai.models.list();

    return true;
    } catch (error: any) {
      baseLogger.warn('OpenAI API key validation failed', { 
        error: error?.message,
        status: error?.status,
        type: error?.type 
      });
      
      // OpenAI SDK throws errors with status codes
      if (error?.status === 401) {
        throw new ValidationError('Invalid OpenAI API key', ErrorReason.INVALID_API_KEY);
      }
      
      // Other errors (rate limits, network issues, etc.)
      throw new ValidationError('Unable to validate OpenAI API key', ErrorReason.INVALID_API_KEY, {
        originalError: error?.message || 'Unknown error'
      });
    }
  }
}
