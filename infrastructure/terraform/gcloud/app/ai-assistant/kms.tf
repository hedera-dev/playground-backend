# Google Cloud KMS configuration for BYOK (Bring Your Own Key) feature
# This configuration creates the necessary KMS resources to encrypt/decrypt user AI keys
#
# Note: KMS permissions are managed in the IAM terraform module (infrastructure/terraform/gcloud/iam/roles.tf)
# The service account gets the necessary permissions through the custom PlaygroundRole

# KMS Key Ring
# Using regional location for lower latency and cost optimization
resource "google_kms_key_ring" "ai_assistant_keyring" {
  name     = "ai-assistant-keyring"
  location = local.deployment["region"] # Regional: us-central1 (from deployment.yml)
  project  = local.deployment["project-id"]
}

# KMS Crypto Key for encrypting user AI keys
resource "google_kms_crypto_key" "user_ai_keys" {
  name     = "user-ai-keys"
  key_ring = google_kms_key_ring.ai_assistant_keyring.id
  purpose  = "ENCRYPT_DECRYPT"

  # Rotation period (optional but recommended)
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true # Prevents accidental deletion of encryption keys
  }

  # Version template
  version_template {
    algorithm        = "GOOGLE_SYMMETRIC_ENCRYPTION"
    protection_level = "SOFTWARE"
  }
}

