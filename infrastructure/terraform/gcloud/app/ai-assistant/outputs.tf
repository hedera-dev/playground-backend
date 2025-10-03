output "static_lb_ip" {
  description = "Regional static external IP for the LoadBalancer Service"
  value       = data.google_compute_global_address.lb_static_ip.address
}

output "egress_nat_ip" {
  value       = google_compute_address.egress_nat_ip.address
  description = "Public IP for the Egress NAT"
}