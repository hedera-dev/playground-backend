resource "google_container_cluster" "k8s_cluster_playground" {
  initial_node_count = local.deployment["node-count"]
  deletion_protection = false
  workload_identity_config {
    workload_pool = "${local.deployment["project-id"]}.svc.id.goog"
  }
  location                 = local.deployment["zone"]
  name                     = local.deployment["cluster-name"]
  network                  = google_compute_network.vpc_ai_assistant.self_link
  remove_default_node_pool = true
  subnetwork               = google_compute_subnetwork.subnet_ai_assistant.self_link

  ip_allocation_policy {
    cluster_secondary_range_name  = local.deployment["pods-secondary-range-name"]
    services_secondary_range_name = local.deployment["services-secondary-range-name"]
  }
}

resource "google_container_node_pool" "node_pool_playground" {
  name       = local.deployment["node-pool-name"]
  cluster    = google_container_cluster.k8s_cluster_playground.id
  node_count = local.deployment["node-count"]

  node_config {
    preemptible  = false
    machine_type = local.deployment["node-machine-type"]
    disk_size_gb = local.deployment["node-disk-size-gb"]
    disk_type = local.deployment["node-disk-type"]
    
    # Explicit configurations to avoid drift detection  
    resource_labels = {
      "goog-gke-node-pool-provisioning-model" = "on-demand"
    }
    
    kubelet_config {
      cpu_cfs_quota      = false
      pod_pids_limit     = 0
      cpu_manager_policy = "none"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append"
    ]
  }
}