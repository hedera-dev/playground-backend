# Infrastructure

This directory contains all the infrastructure configuration required to deploy the Playground in Google Cloud Platform (GCP). It is organized into two main areas: **Terraform** for provisioning cloud resources and **Helm charts** for Kubernetes deployments.

---

## Directory Structure

```
infrastructure/
├── terraform/
│   └── gcloud/
│       ├── app/
│       │   ├── playground-api/   # Compute Engine infra for the Playground API
│       │   └── ai-assistant/     # GKE workload, KMS and networking for the AI Assistant
│       └── iam/                  # Service accounts, roles and IAM policies
└── k8s/
    └── helm/
        └── charts/
            ├── api-gateway/      # HAProxy API gateway
            ├── spoe-auth/        # PASETO authentication SPOE service
            └── ai-assistant/     # AI Assistant HTTP streaming service
```

---

## Deployment

The preferred way to deploy is via the **GitHub Actions workflows** available in `.github/workflows/`. Manual deployment using Terraform and Helm is described below as a fallback.

### GitHub Actions Workflows

| Workflow | Trigger | Description |
|---|---|---|
| `ai-assistant-build.yaml` | `workflow_dispatch` | Builds and pushes the AI Assistant Docker image to Artifact Registry |
| `ai-assistant-deploy.yaml` | `workflow_dispatch` | Deploys the AI Assistant to GKE via Helm |
| `playground-api-build.yaml` | `workflow_dispatch` | Builds and pushes the Playground API Docker image to Artifact Registry |
| `playground-api-deploy.yaml` | `workflow_dispatch` | Deploys the Playground API to the Compute Engine fleet |
| `playground-api-sync-packages.yaml` | `workflow_dispatch` | Syncs runtime language packages from develop to production |

> `spoe-auth` is deployed as part of the `api-gateway` Helm release and does not have a dedicated workflow.

---

## Manual Deployment

### Terraform

#### Prerequisites

1. **Terraform ^v1.7.0**
2. GCloud credentials configured in the environment
3. GCP project configured with the required resources:
    - Bucket for tfstate
    - Bucket for runtime packages
    - Artifact Registry repository

#### Deployment order

**1. `gcloud/iam/`** — Configures service accounts, roles and IAM policies required by all services.

```bash
cp ./templates/deployment.yaml.tpl ./templates/deployment.yaml
terraform init
terraform apply
```

**2.** Reserve a public Static IP in GCP for the Playground.

**3. `gcloud/app/playground-api/`** — Deploys the Compute Engine infrastructure for the Playground API: instances, VPC networks, subnets and load balancers.

```bash
cp ./templates/deployment.yaml.tpl ./templates/deployment.yaml
terraform init
terraform apply
```

**4. `gcloud/app/ai-assistant/`** — Deploys the GKE workload, GCP KMS keyring and networking resources for the AI Assistant service.

```bash
cp ./templates/deployment.yaml.tpl ./templates/deployment.yaml
terraform init
terraform apply
```

---

### Helm Charts

Helm charts are located under `k8s/helm/charts/` and are deployed to a GKE cluster.

| Chart | Description |
|---|---|
| `api-gateway` | HAProxy-based API gateway. Handles TLS termination, routing and SPOE integration |
| `spoe-auth` | PASETO v4 token validation service integrated with HAProxy via SPOE protocol |
| `ai-assistant` | AI Assistant HTTP streaming service with Workload Identity for GCP KMS access |

```bash
# Fill the values template and install or upgrade:
helm upgrade --install <release-name> ./charts/<chart-name> -f values.yaml
```
