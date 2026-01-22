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

  source_ranges = ["35.191.0.0/16", "34.172.226.0"]
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


resource "google_compute_firewall" "allow_egress_hedera_testnet" {
  name    = "allow-egress-hedera-testnet-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 1000

  destination_ranges = [
    # Testnet node 0
    "34.94.106.61/32", "50.18.132.211/32",
    # Testnet node 1
    "35.237.119.55/32", "3.212.6.13/32",
    # Testnet node 2
    "35.245.27.193/32", "52.20.18.86/32",
    # Testnet node 3
    "34.83.112.116/32", "54.70.192.33/32",
    # Testnet node 4
    "34.94.160.4/32", "54.176.199.109/32",
    # Testnet node 5
    "34.106.102.218/32", "35.155.49.147/32",
    # Testnet node 6
    "34.133.197.230/32", "52.14.252.207/32",
    # Testnet mirror node
    "35.186.230.203/32"
  ]

  allow {
    protocol = "all"
  }
}

resource "google_compute_firewall" "allow_egress_hedera_previewnet" {
  name    = "allow-egress-hedera-previewnet-${local.deployment["environment_id"]}"
  network = google_compute_network.network.id

  direction = "EGRESS"
  priority  = 1000

  destination_ranges = [
    # Previewnet node 0
    "35.231.208.148/32", "3.211.248.172/32",
    # Previewnet node 1
    "35.199.15.177/32", "3.213.213.146/32",
    # Previewnet node 2
    "35.225.201.195/32", "52.15.105.130/32",
    # Previewnet node 3
    "35.247.109.135/32", "54.241.38.1/32",
    # Previewnet node 4
    "35.235.65.51/32", "54.177.51.127/32",
    # Previewnet node 5
    "34.106.247.65/32", "35.83.89.171/32",
    # Previewnet node 6
    "34.125.23.49/32", "50.18.17.93/32",
    # Previewnet mirror node
    "35.186.250.160/32"
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

