variable "project_id" {
  description = "Project ID into which deploy component"
}

variable "region" {
  description = "Region where to deploy component"
}

variable "zone" {
  description = "Zone where to deploy component"
}

variable "name" {
  description = "Name of the component to deploy"
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

variable "network_id" {
  description = "VPC network this component should use"
}

variable "subnetwork_id" {
  description = "VPC subnetwork this component should use"
}

variable "ssh_user" {
  description = "Known user name to deploy components"
}

variable "ssh_keys_file" {
  description = "Public key of the known user to deploy components"
}


variable "github_repository" {
  description = "Github project repository"
}