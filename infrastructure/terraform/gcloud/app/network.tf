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
    ports    = ["80", "443"]
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
}



resource "google_compute_firewall" "allow_egress_internal" {
  name    = "allow-internal-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
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


resource "google_compute_firewall" "allow_egress_hedera_testnet" {
  name    = "allow-egress-hedera-testnet-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 1000

  destination_ranges = [
    "34.94.106.61/32", "50.18.132.211/32", "35.237.119.55/32", 
    "3.212.6.13/32", "35.245.27.193/32", "52.20.18.86/32", 
    "34.83.112.116/32", "54.70.192.33/32", "34.94.160.4/32", 
    "54.176.199.109/32", "34.106.102.218/32", "35.155.49.147/32",
    "34.133.197.230/32", "52.14.252.207/32"
  ]

  allow {
    protocol = "all"
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
