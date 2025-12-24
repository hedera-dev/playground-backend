import { KeyManagementServiceClient } from '@google-cloud/kms';
import { createLogger } from '../../utils/logger.js';
import { ExternalServiceError, InternalServerError, ErrorReason } from '../../utils/errors.js';

const logger = createLogger();

export interface KmsConfig {
  projectId: string;
  locationId: string;
  keyRingId: string;
  cryptoKeyId: string;
}

export class KmsService {
  private client: KeyManagementServiceClient;
  private config: KmsConfig;

  constructor(config: KmsConfig) {
    this.config = config;
    this.client = new KeyManagementServiceClient();
  }

  private getCryptoKeyPath(): string {
    return this.client.cryptoKeyPath(
      this.config.projectId,
      this.config.locationId,
      this.config.keyRingId,
      this.config.cryptoKeyId
    );
  }

  /**
   * Encrypts plain text using Google Cloud KMS
   * @param plaintext - Plain text to encrypt
   * @returns Encrypted buffer and key version
   */
  async encrypt(plaintext: string): Promise<{ ciphertext: Buffer; keyVersion: string }> {
    try {
      const cryptoKeyPath = this.getCryptoKeyPath();
      logger.debug('Encrypting data with KMS', { cryptoKeyPath });

      const plaintextBuffer = Buffer.from(plaintext, 'utf8');

      const [encryptResponse] = await this.client.encrypt({
        name: cryptoKeyPath,
        plaintext: plaintextBuffer
      });

      if (!encryptResponse.ciphertext) {
        const errorMessage = 'KMS encryption returned no ciphertext';
        logger.error(errorMessage);
        throw new ExternalServiceError(errorMessage, ErrorReason.KMS_ENCRYPTION_ERROR, 502, {
          service: 'KMS',
          operation: 'encrypt'
        });
      }

      // Extract only the version number from the full path (if available)
      let keyVersion = '';
      if (encryptResponse.name) {
        const versionMatch = encryptResponse.name.match(/cryptoKeyVersions\/(\d+)/);
        keyVersion = versionMatch ? versionMatch[1] : '';
      }

      logger.debug('Data encrypted successfully', { keyVersion });

      return {
        ciphertext: Buffer.from(encryptResponse.ciphertext),
        keyVersion
      };
    } catch (error) {
      const errorMessage = 'Error encrypting data with KMS';
      logger.error(errorMessage, error);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(errorMessage, ErrorReason.KMS_ENCRYPTION_ERROR, 502, { 
        service: 'KMS',
        operation: 'encrypt',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Decrypts encrypted text using Google Cloud KMS
   * @param ciphertext - Encrypted buffer
   * @param keyVersion - Key version (optional, for logging/auditing only - KMS auto-detects version from ciphertext)
   * @returns Decrypted plain text
   */
  async decrypt(ciphertext: Buffer, keyVersion?: string): Promise<string> {
    try {
      const cryptoKeyPath = this.getCryptoKeyPath();
      logger.debug('Decrypting data with KMS', { cryptoKeyPath, keyVersion });

      const [decryptResponse] = await this.client.decrypt({
        name: cryptoKeyPath,
        ciphertext: ciphertext
      });

      if (!decryptResponse.plaintext) {
        const errorMessage = 'KMS decryption returned no plaintext';
        logger.error(errorMessage);
        throw new ExternalServiceError(errorMessage, ErrorReason.KMS_DECRYPTION_ERROR, 502, {
          service: 'KMS',
          operation: 'decrypt'
        });
      }

      const plaintext = Buffer.from(decryptResponse.plaintext).toString('utf8');
      logger.debug('Data decrypted successfully');

      return plaintext;
    } catch (error) {
      const errorMessage = 'Error decrypting data with KMS';
      logger.error(errorMessage, error);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(errorMessage, ErrorReason.KMS_DECRYPTION_ERROR, 502, { 
        service: 'KMS',
        operation: 'decrypt',
        originalError: error instanceof Error ? error.message : String(error) 
      });
    }
  }
}

// Singleton instance
let kmsServiceInstance: KmsService | null = null;

/**
 * Initializes the KMS service with the environment configuration
 */
export function initializeKmsService(): KmsService {
  if (kmsServiceInstance) {
    return kmsServiceInstance;
  }

  const config: KmsConfig = {
    projectId: process.env.GCP_PROJECT_ID || '',
    locationId: process.env.GCP_KMS_LOCATION || '',
    keyRingId: process.env.GCP_KMS_KEYRING || '',
    cryptoKeyId: process.env.GCP_KMS_CRYPTO_KEY || ''
  };

  if (!config.projectId || !config.locationId || !config.keyRingId || !config.cryptoKeyId) {
    throw new InternalServerError(
      'KMS configuration incomplete. Required: GCP_PROJECT_ID, GCP_KMS_LOCATION, GCP_KMS_KEYRING, GCP_KMS_CRYPTO_KEY'
    );
  }

  kmsServiceInstance = new KmsService(config);
  logger.info('🔐 KMS Service initialized successfully');

  return kmsServiceInstance;
}

/**
 * Gets the KMS service instance
 */
export function getKmsService(): KmsService {
  if (!kmsServiceInstance) {
    throw new InternalServerError('KMS Service not initialized. Call initializeKmsService() first.', ErrorReason.NOT_INITIALIZED);
  }
  return kmsServiceInstance;
}
