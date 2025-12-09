output "static_lb_ip" {
  description = "Regional static external IP for the LoadBalancer Service"
  value       = data.google_compute_global_address.lb_static_ip.address
}

output "egress_nat_ip" {
  value       = google_compute_address.egress_nat_ip.address
  description = "Public IP for the Egress NAT"
}

# KMS Outputs for BYOK feature
output "kms_keyring_id" {
  description = "ID of the KMS keyring for AI Assistant"
  value       = google_kms_key_ring.ai_assistant_keyring.id
}

output "kms_keyring_name" {
  description = "Name of the KMS keyring"
  value       = google_kms_key_ring.ai_assistant_keyring.name
}

output "kms_crypto_key_id" {
  description = "ID of the KMS crypto key for user AI keys"
  value       = google_kms_crypto_key.user_ai_keys.id
}

output "kms_crypto_key_name" {
  description = "Name of the KMS crypto key"
  value       = google_kms_crypto_key.user_ai_keys.name
}

output "kms_location" {
  description = "Location of the KMS keyring (regional for lower latency)"
  value       = google_kms_key_ring.ai_assistant_keyring.location
}

# Environment variables for application
output "kms_env_vars" {
  description = "KMS environment variables for the application"
  value = {
    GCP_PROJECT_ID      = local.deployment["project-id"]
    GCP_KMS_LOCATION    = google_kms_key_ring.ai_assistant_keyring.location
    GCP_KMS_KEYRING     = google_kms_key_ring.ai_assistant_keyring.name
    GCP_KMS_CRYPTO_KEY  = google_kms_crypto_key.user_ai_keys.name
  }
}