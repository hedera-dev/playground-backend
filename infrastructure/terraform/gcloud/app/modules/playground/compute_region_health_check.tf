resource "google_compute_region_health_check" "health-check-playground" {
  name               = "health-check-playground-${var.environment_id}"
  region             = "us-central1"
  timeout_sec        = 5
  check_interval_sec = 30
  healthy_threshold  = 2
  unhealthy_threshold = 2

  http_health_check {
    port = 80
  }
}