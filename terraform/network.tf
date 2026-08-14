resource "yandex_vpc_network" "sw" {
  name = "sw"
}

resource "yandex_vpc_subnet" "sw" {
  name           = "sw-${var.zone}"
  zone           = var.zone
  network_id     = yandex_vpc_network.sw.id
  v4_cidr_blocks = [var.subnet_cidr]
}

# Security group for the cluster + nodes. Rules follow the Managed Kubernetes reference set; review
# against the current docs before production. Empty groups deny all, so egress must be opened explicitly.
resource "yandex_vpc_security_group" "k8s" {
  name       = "sw-k8s"
  network_id = yandex_vpc_network.sw.id

  ingress {
    description       = "Node-to-node and master-to-node within the group."
    protocol          = "ANY"
    predefined_target = "self_security_group"
    from_port         = 0
    to_port           = 65535
  }

  ingress {
    description    = "Load balancer health checks."
    protocol       = "TCP"
    v4_cidr_blocks = ["198.18.235.0/24", "198.18.248.0/24"]
    from_port      = 0
    to_port        = 65535
  }

  ingress {
    description    = "Kubernetes API (443/6443)."
    protocol       = "TCP"
    v4_cidr_blocks = ["0.0.0.0/0"]
    from_port      = 443
    to_port        = 443
  }

  ingress {
    description    = "NodePort range for external service exposure."
    protocol       = "TCP"
    v4_cidr_blocks = ["0.0.0.0/0"]
    from_port      = 30000
    to_port        = 32767
  }

  ingress {
    description    = "ICMP from the VPC."
    protocol       = "ICMP"
    v4_cidr_blocks = [var.subnet_cidr]
  }

  egress {
    description    = "Allow all egress (image pulls, YC API, DNS)."
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
    from_port      = 0
    to_port        = 65535
  }
}

# On-demand Android environment VMs: the wd proxy (a cluster pod) reaches the node surface on 4444; the
# in-VM agent reaches the control plane's internal API by egress (via the internal load balancer). No
# external ingress — the VM is only used from inside the VPC.
resource "yandex_vpc_security_group" "android_env" {
  name       = "sw-android-env"
  network_id = yandex_vpc_network.sw.id

  ingress {
    description       = "Node surface (Appium + VNC) from the cluster."
    protocol          = "TCP"
    security_group_id = yandex_vpc_security_group.k8s.id
    port              = 4444
  }

  ingress {
    description       = "Within the group."
    protocol          = "ANY"
    predefined_target = "self_security_group"
    from_port         = 0
    to_port           = 65535
  }

  egress {
    description    = "Allow all egress (control-plane callback, image layers already baked)."
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
    from_port      = 0
    to_port        = 65535
  }
}

# Postgres reachable on the pooler port from the k8s workloads.
resource "yandex_vpc_security_group" "pg" {
  name       = "sw-pg"
  network_id = yandex_vpc_network.sw.id

  ingress {
    description       = "Postgres pooler from the cluster."
    protocol          = "TCP"
    security_group_id = yandex_vpc_security_group.k8s.id
    port              = 6432
  }

  egress {
    description    = "Allow all egress."
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
    from_port      = 0
    to_port        = 65535
  }
}
