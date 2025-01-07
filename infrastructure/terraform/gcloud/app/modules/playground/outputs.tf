output "lb_playground_ip" {
  value = google_compute_forwarding_rule.lb-frontend-playground.ip_address
}

output "lb_playground_port" {
  value = "80"
}

output "rig_playground_name" {
  value = google_compute_region_instance_group_manager.rig-playground.name
  description = "The name of the instance group for playground"
}

output "rig_playground_region" {
  value = google_compute_region_instance_group_manager.rig-playground.region
  description = "The region of the instance group for playground"
}