resource "yandex_mdb_postgresql_cluster" "sw" {
  name        = "sw"
  environment = "PRODUCTION"
  network_id  = yandex_vpc_network.sw.id

  config {
    version = var.pg_version

    resources {
      resource_preset_id = var.pg_resource_preset
      disk_type_id       = "network-ssd"
      disk_size          = var.pg_disk_size_gb
    }
  }

  host {
    zone             = var.zone
    subnet_id        = yandex_vpc_subnet.sw.id
    assign_public_ip = false
  }

  security_group_ids = [yandex_vpc_security_group.pg.id]
}

resource "yandex_mdb_postgresql_user" "sw" {
  cluster_id = yandex_mdb_postgresql_cluster.sw.id
  name       = var.pg_user
  password   = var.pg_password
}

resource "yandex_mdb_postgresql_database" "sw" {
  cluster_id = yandex_mdb_postgresql_cluster.sw.id
  name       = var.pg_database
  owner      = yandex_mdb_postgresql_user.sw.name
}
