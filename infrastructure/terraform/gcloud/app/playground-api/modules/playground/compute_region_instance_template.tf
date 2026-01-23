resource "google_compute_region_instance_template" "rit-playground" {
  lifecycle {
    prevent_destroy = false
    create_before_destroy = true
  }

  name_prefix  = "rt-playground-${var.environment_id}-"
  machine_type = "n2d-standard-4"

  tags = ["playground"]

  disk {
    source_image = "projects/debian-cloud/global/images/debian-11-bullseye-v20241009"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-standard"
    type = "PERSISTENT"
  }

  network_interface {
    network     = var.network_id
    subnetwork  = var.subnetwork_id
    access_config {
    }
  }

  service_account {
    email  = "playground-sa@${var.project_id}.iam.gserviceaccount.com"
    scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
    ]

  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
    preemptible         = false
    provisioning_model  = "STANDARD"
  }

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(var.ssh_keys_file)}"
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash

    cd /tmp

    # Add Cloud Ops Agent
    curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
    sudo bash add-google-cloud-ops-agent-repo.sh --also-install

    # Add Docker's official GPG key:
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg iptables
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    # Add the repository to Apt sources:
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update

    sudo apt-get install -y google-cloud-cli-docker-credential-gcr docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo chmod 666 /var/run/docker.sock

    # Configure Docker Registry with Google Container Registry
    sudo docker-credential-gcr configure-docker
    sudo gcloud auth configure-docker ${var.region}-docker.pkg.dev --quiet

    sudo mkdir -p /home/docker
    cd /home/docker
    
    sudo gsutil cp gs://${var.bucket_templates}/playground/docker-compose.yaml /home/docker/docker-compose.yaml

    # Run docker containers
    sudo docker compose up -d

    # Download and execute iptables setup script
    sudo gsutil cp gs://${var.bucket_templates}/playground/setup-iptables.sh /usr/local/bin/setup-iptables.sh
    sudo chmod +x /usr/local/bin/setup-iptables.sh
    sudo /usr/local/bin/setup-iptables.sh ${var.bucket_templates}

  EOT
}