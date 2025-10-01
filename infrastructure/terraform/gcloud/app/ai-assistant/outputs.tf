output "static_lb_ip" {
  description = "Regional static external IP for the LoadBalancer Service"
  value       = data.google_compute_address.lb_static_ip.address
}

