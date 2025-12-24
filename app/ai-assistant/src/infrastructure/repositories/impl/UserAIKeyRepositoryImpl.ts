import { PgClient } from '../../persistence/PgConnector.js';
import { UserAIKeyRepository } from '../UserAIKeyRepository.js';
import { UserAIKey, CreateUserAIKeyRequest } from '../../../domain/entities/UserAIKey.js';
import { logger } from '../../../utils/logger.js';
import { ExternalServiceError, ErrorReason, InternalServerError } from '../../../utils/errors.js';

export class UserAIKeyRepositoryImpl implements UserAIKeyRepository {
  private readonly tableName = 'user_ai_key';

  async insert(data: CreateUserAIKeyRequest): Promise<UserAIKey> {
    const query = `
      INSERT INTO ${this.tableName} 
      (user_id, encrypted_api_key, kms_key_version)
      VALUES ($1, $2, $3)
      RETURNING user_id, encrypted_api_key, kms_key_version, created_at
    `;

    try {
      const result = await PgClient.query(query, [data.user_id, data.encrypted_api_key, data.kms_key_version || null]);

      if (result.rows.length === 0) {
        throw new InternalServerError('Failed to insert user AI key');
      }

      logger.debug({ userId: data.user_id }, 'User AI key inserted successfully');
      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logger.error({ userId: data.user_id }, 'Error inserting user AI key', error);
      if (error instanceof InternalServerError) {
      throw error;
      }
      throw new ExternalServiceError('Database error while inserting user AI key', ErrorReason.DATABASE_ERROR, 503, { 
        service: 'PostgreSQL',
        operation: 'insert',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async findByUserId(userId: string): Promise<UserAIKey | null> {
    const query = `
      SELECT user_id, encrypted_api_key, kms_key_version, created_at 
      FROM ${this.tableName} 
      WHERE user_id = $1
    `;

    try {
      const result = await PgClient.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToEntity(result.rows[0]);
    } catch (error) {
      logger.error({ userId }, 'Error finding user AI key by user ID', error);
      throw new ExternalServiceError('Database error while finding user AI key', ErrorReason.DATABASE_ERROR, 503, { 
        service: 'PostgreSQL',
        operation: 'findByUserId',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async delete(userId: string): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE user_id = $1`;

    try {
      const result = await PgClient.query(query, [userId]);
      const deleted = result.rowCount > 0;

      if (deleted) {
        logger.debug({ userId }, 'User AI key deleted successfully');
      }

      return deleted;
    } catch (error) {
      logger.error({ userId }, 'Error deleting user AI key', error);
      throw new ExternalServiceError('Database error while deleting user AI key', ErrorReason.DATABASE_ERROR, 503, { 
        service: 'PostgreSQL',
        operation: 'delete',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  async exists(userId: string): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.tableName} WHERE user_id = $1 LIMIT 1`;

    try {
      const result = await PgClient.query(query, [userId]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error({ userId }, 'Error checking if user AI key exists', error);
      throw new ExternalServiceError('Database error while checking user AI key existence', ErrorReason.DATABASE_ERROR, 503, { 
        service: 'PostgreSQL',
        operation: 'exists',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Map database row to UserAIKey entity
   * @param row - Database row
   * @returns UserAIKey entity
   */
  private mapRowToEntity(row: any): UserAIKey {
    return {
      user_id: row.user_id,
      encrypted_api_key: row.encrypted_api_key,
      kms_key_version: row.kms_key_version || undefined,
      created_at: new Date(row.created_at)
    };
  }
}
