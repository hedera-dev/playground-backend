resource "google_compute_region_instance_template" "rit-gw" {
  lifecycle {
    prevent_destroy = true
  }
  name         = "rt-gw-${var.environment_id}"
  machine_type = "n2d-standard-2"

  disk {
    source_image = "projects/debian-cloud/global/images/debian-11-bullseye-v20241009"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-standard"
    type         = "PERSISTENT"
  }

  network_interface {
    network     = var.network_name
    subnetwork  = var.subnetwork_name
    access_config {
    }
  }

  service_account {
    email  =  # TODO: set email_service_account
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring.write",
      "https://www.googleapis.com/auth/compute"
    ]

  }

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(var.ssh_keys_file)}"
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash

    cd /tmp

    # Add Docker's official GPG key:
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
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
    sudo gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
    sudo mkdir /home/docker
    cd /home/docker

    sudo gsutil cp gs://kbucket-playground/api-gateway/haproxy.cfg /home/docker/haproxy.cfg
    sudo gsutil cp gs://kbucket-playground/api-gateway/docker-compose.yaml /home/docker/docker-compose.yaml

    sudo chmod 666 /home/docker/haproxy.cfg
    sudo chmod 666 /home/docker/docker-compose.yaml

    # Replace variables
    sudo sed -i 's|{{ service.port }}|${var.service_port}|g' /home/docker/haproxy.cfg
    sudo sed -i 's|{{ playground.host }}|${var.lb_playground_ip}|g' /home/docker/haproxy.cfg
    sudo sed -i 's|{{ playground.port }}|${var.lb_playground_port}|g' /home/docker/haproxy.cfg

    # Run docker containers
    sudo docker compose up -d
  EOT
}