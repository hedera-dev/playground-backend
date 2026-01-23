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
}

resource "google_compute_firewall" "allow_http" {
  name    = "allow-http-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id
  priority  = 3000

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null
}

resource "google_compute_firewall" "allow_health_check" {
  name    = "allow-health-check-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "allow-ssh-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id
  priority  = 100

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null
  disabled = true
}



resource "google_compute_firewall" "allow_egress_internal" {
  name    = "allow-internal-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 1000

  source_ranges       = ["10.1.0.0/16"]
  destination_ranges  = ["10.1.0.0/16"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null

  allow {
    protocol = "all"
  }
}

resource "google_compute_firewall" "allow_ingress_internal" {
  name    = "allow-ingress-internal-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "INGRESS"
  priority  = 1000

  source_ranges = ["10.1.0.0/16"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null

  allow {
    protocol = "all"
  }
}


# Allow essential egress protocols: HTTP/HTTPS, DNS, and Hedera gRPC
# This covers all VM operational needs:
# - DNS resolution (port 53 UDP/TCP)
# - Package installations (apt, yum via HTTP/HTTPS)
# - Docker image pulls (Docker Hub, GCR, Artifact Registry via HTTPS)
# - Google Cloud APIs (HTTPS)
# - SSL certificates (Let's Encrypt via HTTPS)
# - Cloud Ops Agent (HTTPS)
# - Hedera network access (ports 50211, 50212 for testnet/mainnet gRPC connections)
resource "google_compute_firewall" "allow_egress_essential_ports" {
  name    = "allow-egress-essential-ports-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 1500

  destination_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null

  # HTTP/HTTPS
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  # DNS
  allow {
    protocol = "udp"
    ports    = ["53"]
  }

  allow {
    protocol = "tcp"
    ports    = ["53"]
  }

  # Hedera gRPC
  allow {
    protocol = "tcp"
    ports    = ["50211", "50212"]
  }
}

resource "google_compute_firewall" "deny_egress_all" {
  name    = "deny-egress-all-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 5000

  destination_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = null
  target_service_accounts = null

  deny {
    protocol = "all"
  }
}

resource "google_compute_firewall" "deny_ingress_all" {
  name    = "deny-ingress-all-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "INGRESS"
  priority  = 2000

  source_ranges = ["0.0.0.0/0"]
  source_tags             = null
  source_service_accounts = null
  target_tags             = ["playground"]
  target_service_accounts = null

  deny {
    protocol = "all"
  }
}

