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

resource "google_compute_address" "egress_nat_ip" {
  name   = "egress-ai-assistant-ip-${local.deployment["region"]}"
  region = local.deployment["region"]
}


resource "google_compute_router" "nat_router" {
  name    = "router-ai-assistant-${local.deployment["region"]}"
  region  = local.deployment["region"]
  network = google_compute_network.vpc_ai_assistant.self_link
}

resource "google_compute_router_nat" "gke_nat" {
  name                   = "nat-ai-assistant-${local.deployment["region"]}"
  region                 = local.deployment["region"]
  router                 = google_compute_router.nat_router.name

  nat_ip_allocate_option = "MANUAL_ONLY"
  nat_ips                = [google_compute_address.egress_nat_ip.self_link]

  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

}


data "google_compute_global_address" "lb_static_ip" {
  name   = local.deployment["lb-static-ip-name"]
}


