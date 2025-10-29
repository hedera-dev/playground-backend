export interface UserAIKey {
  user_id: string;
  encrypted_api_key: Buffer;
  kms_key_version?: string;
  created_at: Date;
}

export interface CreateUserAIKeyRequest {
  user_id: string;
  encrypted_api_key: Buffer;
  kms_key_version?: string;
}
