resource "google_compute_network" "network" {
  name                    = "network-${local.deployment["environment_id"]}"
  routing_mode            = "REGIONAL"
  auto_create_subnetworks = "false"
}

resource "google_compute_subnetwork" "subnetwork-a" {
  ip_cidr_range = "10.1.0.0/16"
  name          = "subnetwork-a-${local.deployment["environment_id"]}"
  network       = google_compute_network.network.name
  region        = local.deployment["region"]

  secondary_ip_range {
    ip_cidr_range = "10.2.0.0/16"
    range_name    = "services-sec-range"
  }

  secondary_ip_range {
    ip_cidr_range = "10.3.0.0/16"
    range_name    = "pods-sec-range"
  }
}

resource "google_compute_firewall" "allow_http" {
  name    = "allow-http-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  allow {
    protocol = "tcp"
    ports    = ["80", "8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "allow-ssh-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null
}
