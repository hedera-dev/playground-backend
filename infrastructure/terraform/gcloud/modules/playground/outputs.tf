output "lb_playground_ip" {
  value = google_compute_forwarding_rule.lb-frontend-playground.ip_address
}

output "lb_playground_port" {
  value = "80"
}