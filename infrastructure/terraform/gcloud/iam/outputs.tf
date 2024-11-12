# Output the service account email for your GitHub Action setup
output "service_account_email" {
  value = google_service_account.playground_service_account.email
}


data "google_project" "project" {
  project_id = local.deployment["project_id"]
}

# Output the workload identity provider with the project number
output "workload_identity_provider" {
  value = "projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.playground_wip.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_provider.workload_identity_pool_provider_id}"
}