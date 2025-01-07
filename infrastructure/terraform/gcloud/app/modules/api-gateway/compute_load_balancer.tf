resource "google_compute_region_backend_service" "lb-backend-gw" {
  name                  = "lb-backend-gw-${var.environment_id}"
  protocol              = "TCP"
  timeout_sec           = 30
  health_checks         = [google_compute_region_health_check.health-check-gw.id]
  load_balancing_scheme = "EXTERNAL"
  port_name             = "http"

  backend {
    group = google_compute_region_instance_group_manager.rig-gw.instance_group
    balancing_mode  = "CONNECTION"
  }
}

resource "google_compute_forwarding_rule" "lb-frontend-gw" {
  name                   = "lb-frontend-gw-${var.environment_id}"
  backend_service        = google_compute_region_backend_service.lb-backend-gw.id
  ip_protocol            = "TCP"
  ports                  = ["80"]
  load_balancing_scheme  = "EXTERNAL"
  network_tier           = "PREMIUM"
}
