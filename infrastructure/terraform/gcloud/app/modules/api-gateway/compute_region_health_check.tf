resource "google_compute_region_health_check" "health-check-gw" {
  name               = "health-check-gw-${var.environment_id}"
  region             = "us-central1"
  timeout_sec        = 5
  check_interval_sec = 60
  healthy_threshold  = 2
  unhealthy_threshold = 2

  http_health_check {
    port          = 80
    request_path  = "/api/playground/health"
  }
}