# Output the playground runtime service account email
output "playground_service_account_email" {
  description = "Service account email for Playground runtime"
  value       = google_service_account.playground_service_account.email
}

# Output the GitHub Actions service account email
output "github_actions_service_account_email" {
  description = "Service account email for GitHub Actions CI/CD"
  value       = google_service_account.github_actions_service_account.email
}

data "google_project" "project" {
  project_id = local.deployment["project_id"]
}

# Output the workload identity provider with the project number
output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions"
  value       = "projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.playground_wip.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_provider.workload_identity_pool_provider_id}"
}