resource "google_compute_region_backend_service" "lb-backend-playground" {
  name                  = "lb-backend-playground-${var.environment_id}"
  protocol              = "TCP"
  timeout_sec           = 30
  load_balancing_scheme = "INTERNAL"
  health_checks         = [google_compute_region_health_check.health-check-playground.id]

  backend {
    group = google_compute_region_instance_group_manager.rig-playground.instance_group
  }
}

resource "google_compute_forwarding_rule" "lb-frontend-playground" {
  name                   = "lb-frontend-playground-${var.environment_id}"
  load_balancing_scheme = "INTERNAL"
  backend_service       = google_compute_region_backend_service.lb-backend-playground.id
  ip_protocol           = "TCP"
  ports                 = ["80"]
  network               = var.network_id
  subnetwork            = var.subnetwork_id
}
