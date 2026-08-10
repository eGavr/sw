# Cluster service account: manages compute/VPC/LB resources for the k8s control plane.
resource "yandex_iam_service_account" "cluster" {
  name = "sw-k8s-cluster"
}

# Node service account: kubelet pulls images from Container Registry under this one.
resource "yandex_iam_service_account" "nodes" {
  name = "sw-k8s-nodes"
}

locals {
  cluster_roles = ["k8s.clusters.agent", "vpc.publicAdmin", "load-balancer.admin"]
}

resource "yandex_resourcemanager_folder_iam_member" "cluster" {
  for_each  = toset(local.cluster_roles)
  folder_id = var.folder_id
  role      = each.value
  member    = "serviceAccount:${yandex_iam_service_account.cluster.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "nodes_puller" {
  folder_id = var.folder_id
  role      = "container-registry.images.puller"
  member    = "serviceAccount:${yandex_iam_service_account.nodes.id}"
}
