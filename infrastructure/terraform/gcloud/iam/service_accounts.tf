# Service account for Playground runtime (application)
resource "google_service_account" "playground_service_account" {
  account_id   = "playground-sa"
  display_name = "Service Account for Playground"
}

# Bind the playgrouruntime role to the service account
resource "google_project_iam_member" "playground_role_binding" {
  project    = local.deployment["project_id"]
  depends_on = [google_service_account.playground_service_account, google_project_iam_custom_role.playground_role]
  role       = google_project_iam_custom_role.playground_role.id
  member     = "serviceAccount:${google_service_account.playground_service_account.email}"
}

# Service account for GitHub Actions (CI/CD)
resource "google_service_account" "github_actions_service_account" {
  account_id   = "github-actions-sa"
  display_name = "Service Account for GitHub Actions CI/CD"
}

# Bind the GitHub Actions role to the service account
resource "google_project_iam_member" "github_actions_role_binding" {
  project    = local.deployment["project_id"]
  depends_on = [google_service_account.github_actions_service_account, google_project_iam_custom_role.github_actions_role]
  role       = google_project_iam_custom_role.github_actions_role.id
  member     = "serviceAccount:${google_service_account.github_actions_service_account.email}"
}