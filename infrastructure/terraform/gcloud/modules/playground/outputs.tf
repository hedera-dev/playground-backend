output "lb_playground_ip" {
  value = google_compute_forwarding_rule.lb-frontend-playground.ip_address
}

output "lb_playground_port" {
  value = "80"
}

output "rig_playground_name" {
  value = google_compute_region_instance_group_manager.rig-playground.name
  description = "The name of the instance group for playground"
}

output "rig_playground_region" {
  value = google_compute_region_instance_group_manager.rig-playground.region
  description = "The region of the instance group for playground"
}

# Output the service account email for your GitHub Action setup
output "service_account_email" {
  value = google_service_account.playground_service_account.email
}


data "google_project" "project" {
  project_id = var.project_id
}

# Output the workload identity provider with the project number
output "workload_identity_provider" {
  value = "projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.playground_wip.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_provider.workload_identity_pool_provider_id}"
}