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

# The worker (a pod on a node) creates/deletes the on-demand Android Compute VMs via the yc CLI, using this
# node service account's IAM token from the instance metadata service. compute.editor to manage the VMs,
# vpc.user to attach them to the subnet/security group.
locals {
  nodes_compute_roles = ["compute.editor", "vpc.user"]
}

resource "yandex_resourcemanager_folder_iam_member" "nodes_compute" {
  for_each  = toset(local.nodes_compute_roles)
  folder_id = var.folder_id
  role      = each.value
  member    = "serviceAccount:${yandex_iam_service_account.nodes.id}"
}
