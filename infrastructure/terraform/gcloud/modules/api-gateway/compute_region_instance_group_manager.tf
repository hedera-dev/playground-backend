resource "google_compute_region_instance_group_manager" "rig-gw" {
  name                = "rig-gw-${var.environment_id}"
  region              = var.region
  base_instance_name  = "vm-gw-${var.environment_id}"
  version {
    instance_template = google_compute_region_instance_template.rit-gw.id
  }

  target_size = 1  

#   auto_healing_policies {
#     health_check      = google_compute_region_health_check.health-check-gw.id
#     initial_delay_sec = 300
#   }

  distribution_policy_zones = [
    "us-central1-a",
    "us-central1-b",
    "us-central1-c"
  ]
}