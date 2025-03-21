resource "google_compute_region_instance_group_manager" "rig-playground" {
  name                = "rig-playground-${var.environment_id}"
  region              = var.region
  base_instance_name  = "vm-playground-${var.environment_id}"
  version {
    instance_template = google_compute_region_instance_template.rit-playground.id
  }

  target_size = 1

  auto_healing_policies {
    health_check      = google_compute_region_health_check.health-check-playground.id
    initial_delay_sec = 300
  }

  distribution_policy_zones = [
    "${var.region}-a",
    "${var.region}-b",
    "${var.region}-c"
  ]
}

resource "google_compute_region_autoscaler" "autoscaler-playground" {
  name = "autoscaler-playground-${var.environment_id}"
  region = var.region
  target = google_compute_region_instance_group_manager.rig-playground.id

  autoscaling_policy {
    max_replicas    = 20
    min_replicas    = 1

    cpu_utilization {
      target = 0.5
    }
  }
}