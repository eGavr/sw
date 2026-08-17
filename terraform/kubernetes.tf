# Zonal cluster (single-zone master — cheaper; use a regional master for HA). IAM roles must exist
# before the cluster is created, hence depends_on.
resource "yandex_kubernetes_cluster" "sw" {
  name        = "sw"
  network_id  = data.yandex_vpc_network.sw.id
  description = "sw control plane + environment pods"

  master {
    version   = var.k8s_version
    public_ip = true

    zonal {
      zone      = var.zone
      subnet_id = data.yandex_vpc_subnet.sw.id
    }

    security_group_ids = [yandex_vpc_security_group.k8s.id]
  }

  release_channel         = "STABLE"
  service_account_id      = yandex_iam_service_account.cluster.id
  node_service_account_id = yandex_iam_service_account.nodes.id

  depends_on = [
    yandex_resourcemanager_folder_iam_member.cluster,
    yandex_resourcemanager_folder_iam_member.nodes_puller,
  ]
}

resource "yandex_kubernetes_node_group" "sw" {
  cluster_id = yandex_kubernetes_cluster.sw.id
  name       = "sw-nodes"
  version    = var.k8s_version

  instance_template {
    platform_id = "standard-v3"

    resources {
      cores  = var.node_cores
      memory = var.node_memory_gb
    }

    boot_disk {
      type = "network-ssd"
      size = 64
    }

    network_interface {
      subnet_ids         = [data.yandex_vpc_subnet.sw.id]
      nat                = true
      security_group_ids = [yandex_vpc_security_group.k8s.id]
    }

    container_runtime {
      type = "containerd"
    }
  }

  scale_policy {
    fixed_scale {
      size = var.node_count
    }
  }

  allocation_policy {
    location {
      zone = var.zone
    }
  }
}
