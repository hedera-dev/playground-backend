variable "project_id" {
  description = "Project ID into which deploy component"
}

variable "region" {
  description = "Region where to deploy component"
}

variable "zone" {
  description = "Zone where to deploy component"
}

variable "environment_id" {
  description = "Name of the deployment this component is included in"
}

variable "network_name" {
  description = "VPC network this component should use"
}

variable "subnetwork_name" {
  description = "VPC subnetwork this component should use"
}

variable "ssh_user" {
  description = "Known user name to deploy components"
}

variable "ssh_keys_file" {
  description = "Public key of the known user to deploy components"
}

variable "service_port" {
  description = "Service Port"
  default = "80"
}

variable "haproxy_config_content" {
  description ="haproxy.cfg"
}

variable "lb_playground_ip" {
  description = "IP Address of playground load balancer"
}

variable "lb_playground_port" {
 description = "Port of playground load balancer"
}