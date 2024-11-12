#########################################################################################################################################################################################################################
# Google Cloud service account key: Terraform will access your Google Cloud account by using a service account key. You can create one in the Cloud Console. While creating the key, assign the role as Project > Editor.
#########################################################################################################################################################################################################################
provider "google" {
  credentials = file(local.deployment["path_to_credentials"])
  project = local.deployment["project_id"]
  region  = local.deployment["region"]
  zone    = local.deployment["zone"]
}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "5.12.0"
    }
  }
}

terraform {
  backend "gcs" {
    bucket = "playground-terraform-develop"
    prefix = "playground-app/state"
  }
}

locals {
  deployment = yamldecode(file("./templates/deployment.yml"))
}

module "playground" {
  source = "./modules/playground"

  project_id          = local.deployment["project_id"]
  region              = local.deployment["region"]
  zone                = local.deployment["zone"]

  network_name        = google_compute_network.network.name
  subnetwork_name     = google_compute_subnetwork.subnetwork-a.name
  network_id          = google_compute_network.network.id
  subnetwork_id       = google_compute_subnetwork.subnetwork-a.id

  environment_id      = local.deployment["environment_id"]
  ssh_user            = local.deployment["ssh_user"]
  ssh_keys_file       = local.deployment["ssh_keys_file"]
}

output "playground_module_outputs" {
  value = module.playground
}

module "api-gateway" {
  source = "./modules/api-gateway"

  project_id          = local.deployment["project_id"]
  region              = local.deployment["region"]
  zone                = local.deployment["zone"]

  network_name        = google_compute_network.network.name
  subnetwork_name     = google_compute_subnetwork.subnetwork-a.name
  environment_id      = local.deployment["environment_id"]
  ssh_user            = local.deployment["ssh_user"]
  ssh_keys_file       = local.deployment["ssh_keys_file"]

  haproxy_config_content = file("./templates/api-gateway/haproxy.cfg")
  service_port        = "80"
  lb_playground_ip    = module.playground.lb_playground_ip
  lb_playground_port  = module.playground.lb_playground_port

}

// TODO: Enable cloud monitoring
# module "cloud-operations_agent-policy" {
#   source    = "terraform-google-modules/cloud-operations/google//modules/agent-policy"
#   version   = "0.6.0"

#   project_id = local.deployment["project_id"]
#   policy_id  = "ops-agents-policy-${local.deployment["environment_id"]}"
#   os_types = [
#     {
#       short_name = "debian"
#       version    = "11"
#     },
#   ]

#   agent_rules = [
#     {
#       type = "logging"

#     }, {
#       type = "monitoring"
#     }
#   ]
# }
