# Create a custom IAM role
resource "google_project_iam_custom_role" "playground_role" {
  project     = local.deployment["project_id"]
  role_id     = "PlaygroundRole"
  title       = "Playground Role"
  description = "Custom role for playground to interact with GCP resources"
  
  permissions = [
    "artifactregistry.dockerimages.get",
    "artifactregistry.repositories.downloadArtifacts",
    "artifactregistry.repositories.uploadArtifacts",
    "compute.instances.list",
    "compute.instanceGroupManagers.get",
    "compute.instances.get",
    "compute.instances.osLogin",
    "compute.instances.setMetadata",
    "compute.networks.get",
	  "compute.subnetworks.get",
	  "compute.addresses.list",
	  "compute.globalAddresses.list",
    "logging.logEntries.create",
    "monitoring.timeSeries.create",
    "storage.objects.get",
    "storage.objects.list",
    "storage.objects.create",
    "storage.objects.delete"
  ]
}