
# Create a custom IAM role
resource "google_project_iam_custom_role" "playground_role" {
  project     = var.project_id
  role_id     = "PlaygroundGithubRole"
  title       = "Playground Github Role"
  description = "Custom role to allow GitHub workflows to interact with GCP resources"
  
  permissions = [
    "compute.instances.list",
    "compute.instanceGroupManagers.get",
    "compute.instances.get",
    "compute.instances.osLogin",
    "compute.instances.setMetadata",
    "compute.networks.get",
	  "compute.subnetworks.get",
	  "compute.addresses.list",
	  "compute.globalAddresses.list",
    "storage.objects.get",
    "storage.objects.list",
    "storage.objects.create",
    "storage.objects.delete"
  ]
}

# Create the service account
resource "google_service_account" "playground_service_account" {
  account_id   = "playground-github-sa"
  display_name = "Service Account for Github Playground Workflow"
}

# Bind the custom role to the service account
resource "google_project_iam_member" "playground_role_binding" {
  project = var.project_id
  depends_on = [ google_service_account.playground_service_account ]
  role    = google_project_iam_custom_role.playground_role.id
  member  = "serviceAccount:${google_service_account.playground_service_account.email}"
}

resource "google_iam_workload_identity_pool" "playground_wip" {
  project      = var.project_id
  workload_identity_pool_id = "playground-pool"
  display_name = "Playground"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  project             = var.project_id
  workload_identity_pool_id = google_iam_workload_identity_pool.playground_wip.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-playground-provider"
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
  attribute_condition = "assertion.repository=='${var.github_repository}'"
}

resource "google_service_account_iam_member" "playground_wip_binding" {
  depends_on = [ google_service_account.playground_service_account, google_iam_workload_identity_pool.playground_wip, google_iam_workload_identity_pool_provider.github_provider ]
  service_account_id = google_service_account.playground_service_account.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.playground_wip.name}/attribute.repository/${var.github_repository}"
}
