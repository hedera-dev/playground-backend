# Create the service account
resource "google_service_account" "playground_service_account" {
  account_id   = "playground-sa"
  display_name = "Service Account for Playground"
}

# Bind the custom role to the service account
resource "google_project_iam_member" "playground_role_binding" {
  project = local.deployment["project_id"]
  depends_on = [ google_service_account.playground_service_account, google_project_iam_custom_role.playground_role]
  role    = google_project_iam_custom_role.playground_role.id
  member  = "serviceAccount:${google_service_account.playground_service_account.email}"
}