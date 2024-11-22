# Infrastructure Setup for Playground

This directory contains the Terraform configuration files required to deploy the infrastructure for the **Playground** in Google Cloud Platform (GCP). The setup is divided into two main components:

- **`terraform/gcloud/app/`**: Deploys the application infrastructure (e.g., compute instances, networking).
- **`terraform/gcloud/iam/`**: Configures Identity and Access Management (IAM), including roles, service accounts, and permissions.

---

## 📂 Directory Structure

- **`gcloud/app/`**  
  Handles the deployment of the application infrastructure necessary for the Playground. This includes:
  - Compute Engine instances
  - VPC networks and subnets
  - Load balancers and other application-related resources

- **`gcloud/iam/`**  
  Sets up IAM configurations required for secure and proper operation of the infrastructure. This includes:
  - Creation and assignment of service accounts
  - Definition of roles and permissions
  - Management of IAM policies

---

## 🚀 Deployment Instructions

### Prerequisites

1. **Terraform ^v1.7.0**
2. Gcloud credentials configured in environment
3. Gcloud project configured with required storage to deploy the environment
    - bucket for tfstate
    - bucket with pkgs
    - Artifact registry repository

### Instruction

- **`gcloud/iam/`**
    - Configure `./templates/deployment.yaml`
    - `terraform init`
    - `terraforma apply`

- Reserve a public Static IP in gcloud for playground.
- **`gcloud/app/`**  
    - Configure `./templates/deployment.yaml`
    - `terraform init`
    - `terraforma apply`
    