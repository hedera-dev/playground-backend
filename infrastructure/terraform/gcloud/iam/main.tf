#########################################################################################################################################################################################################################
# Google Cloud service account key: Terraform will access your Google Cloud account by using a service account key. You can create one in the Cloud Console. While creating the key, assign the role as Project > Editor.
#########################################################################################################################################################################################################################
provider "google" {
  project = local.deployment["project_id"]
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
terraform {
  backend "gcs" {
    bucket = "playground-terraform-prod"
    prefix = "playground-iam/state"
  }
}

locals {
  deployment = yamldecode(file("./templates/deployment.yml"))
}