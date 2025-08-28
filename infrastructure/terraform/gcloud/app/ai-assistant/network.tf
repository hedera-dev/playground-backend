resource "google_compute_network" "vpc_ai_assistant" {
  name                    = local.deployment["vpc-network"]
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet_ai_assistant" {
  name                     = local.deployment["subnetwork"]
  ip_cidr_range            = local.deployment["subnet-ip-cidr"]
  region                   = local.deployment["region"]
  network                  = google_compute_network.vpc_ai_assistant.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = local.deployment["pods-secondary-range-name"]
    ip_cidr_range = local.deployment["pods-secondary-cidr"]
  }

  secondary_ip_range {
    range_name    = local.deployment["services-secondary-range-name"]
    ip_cidr_range = local.deployment["services-secondary-cidr"]
  }
}

data "google_compute_address" "lb_static_ip" {
  name   = local.deployment["lb-static-ip-name"]
  region = local.deployment["region"]
}

