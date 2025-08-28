provider "google" {
  project = local.deployment["project-id"]
  region  = local.deployment["region"]
  zone    = local.deployment["zone"]
}

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "5.12.0"
    }
  }
}

// We have to set here the same state than in deployment yaml environment id
locals {
  deployment = yamldecode(file("./templates/deployment.yml"))
}

terraform {
  backend "gcs" {
    bucket = "hedera-portal-terraform-dev"
    prefix = "ai-assistant/state"
  }
}

