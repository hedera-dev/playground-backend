# Custom role for Playground runtime (application)
resource "google_project_iam_custom_role" "playground_role" {
  project     = local.deployment["project_id"]
  role_id     = "PlaygroundRole"
  title       = "Playground Role"
  description = "Custom role for playground to interact with GCP resources"
  
  permissions = [
    "artifactregistry.dockerimages.get",
    "artifactregistry.repositories.downloadArtifacts",
    "artifactregistry.repositories.uploadArtifacts",
    "cloudkms.cryptoKeys.get",
    "cloudkms.cryptoKeyVersions.useToEncrypt",
    "cloudkms.cryptoKeyVersions.useToDecrypt",
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
    "osconfig.osPolicyAssignments.get",
    "osconfig.osPolicyAssignments.list",
    "storage.objects.get",
    "storage.objects.list",
    "storage.objects.create",
    "storage.objects.delete"
  ]
}

# Custom role for GitHub Actions (CI/CD)
resource "google_project_iam_custom_role" "github_actions_role" {
  project     = local.deployment["project_id"]
  role_id     = "GitHubActionsRole"
  title       = "GitHub Actions Role"
  description = "Custom role for GitHub Actions CI/CD pipelines"
  
  permissions = [
    # Artifact Registry permissions (for pushing/pulling Docker images)
    "artifactregistry.dockerimages.get",
    "artifactregistry.dockerimages.list",
    "artifactregistry.repositories.downloadArtifacts",
    "artifactregistry.repositories.uploadArtifacts",
    # Kubernetes Engine permissions (for deployment)
    "container.clusters.get",
    "container.clusters.getCredentials",
    "container.configMaps.create",
    "container.configMaps.delete",
    "container.configMaps.get",
    "container.configMaps.list",
    "container.configMaps.update",
    "container.deployments.create",
    "container.deployments.delete",
    "container.deployments.get",
    "container.deployments.list",
    "container.deployments.update",
    "container.pods.create",
    "container.pods.delete",
    "container.pods.get",
    "container.pods.list",
    "container.pods.getLogs",
    "container.replicaSets.create",
    "container.replicaSets.delete",
    "container.replicaSets.get",
    "container.replicaSets.list",
    "container.replicaSets.update",
    "container.secrets.create",
    "container.secrets.delete",
    "container.secrets.get",
    "container.secrets.list",
    "container.secrets.update",
    "container.serviceAccounts.create",
    "container.serviceAccounts.delete",
    "container.serviceAccounts.get",
    "container.serviceAccounts.list",
    "container.serviceAccounts.update",
    "container.services.create",
    "container.services.delete",
    "container.services.get",
    "container.services.list",
    "container.services.update",
    # Logging (for deployment logs)
    "logging.logEntries.create"
  ]
}