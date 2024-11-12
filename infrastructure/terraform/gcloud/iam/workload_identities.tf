resource "google_iam_workload_identity_pool" "playground_wip" {
  project      = local.deployment["project_id"]
  workload_identity_pool_id = "playground-pool"
  display_name = "Playground"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  project             = local.deployment["project_id"]
  workload_identity_pool_id = google_iam_workload_identity_pool.playground_wip.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name        = "GitHub Playground"
  description         = "Provider for GitHub Actions Playground"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"            = "assertion.sub"
    "attribute.actor"           = "assertion.actor"
    "attribute.repository"      = "assertion.repository"
  }

  # Attribute Condition
  attribute_condition = "assertion.repository=='${local.deployment["github_repository"]}'"
}

resource "google_service_account_iam_member" "playground_wip_binding" {
  depends_on = [ google_service_account.playground_service_account, google_iam_workload_identity_pool.playground_wip, google_iam_workload_identity_pool_provider.github_provider ]
  service_account_id = google_service_account.playground_service_account.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.playground_wip.name}/attribute.repository/${local.deployment["github_repository"]}"
}