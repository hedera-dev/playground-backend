import { UserAIKey, CreateUserAIKeyRequest } from '../../domain/entities/UserAIKey.js';

export interface UserAIKeyRepository {
  /**
   * Insert a new user AI key
   * @param data - User AI key data to insert
   * @returns Promise<UserAIKey> - The inserted user AI key
   */
  insert(data: CreateUserAIKeyRequest): Promise<UserAIKey>;

  /**
   * Find a user AI key by user ID
   * @param userId - The user ID to search for
   * @returns Promise<UserAIKey | null> - The user AI key or null if not found
   */
  findByUserId(userId: string): Promise<UserAIKey | null>;

  /**
   * Delete a user AI key
   * @param userId - The user ID to delete
   * @returns Promise<boolean> - True if deleted, false if not found
   */
  delete(userId: string): Promise<boolean>;

  /**
   * Check if a user AI key exists
   * @param userId - The user ID to check
   * @returns Promise<boolean> - True if exists, false otherwise
   */
  exists(userId: string): Promise<boolean>;
}
