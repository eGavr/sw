variable "cloud_id" {
  type        = string
  description = "Yandex Cloud id."
}

variable "folder_id" {
  type        = string
  description = "Folder to create resources in."
}

variable "zone" {
  type        = string
  description = "Zone for the (zonal) cluster, node group and Postgres host."
  default     = "ru-central1-a"
}

variable "subnet_cidr" {
  type    = string
  default = "10.10.0.0/24"
}

variable "k8s_version" {
  type    = string
  default = "1.30"
}

variable "node_count" {
  type    = number
  default = 2
}

variable "node_cores" {
  type    = number
  default = 4
}

variable "node_memory_gb" {
  type    = number
  default = 8
}

variable "pg_version" {
  type    = string
  default = "16"
}

variable "pg_resource_preset" {
  type    = string
  default = "s2.micro"
}

variable "pg_disk_size_gb" {
  type    = number
  default = 20
}

variable "pg_user" {
  type    = string
  default = "sw"
}

variable "pg_database" {
  type    = string
  default = "sw"
}

variable "pg_password" {
  type        = string
  sensitive   = true
  description = "Password for the Postgres user (also put it in the k8s Secret sw-secrets)."
}

variable "network_id" {
  type        = string
  description = "Existing VPC network to reuse (the folder's network quota is 1)."
}

variable "subnet_id" {
  type        = string
  description = "Existing subnet in that network; must be in var.zone."
}
