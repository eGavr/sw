terraform {
  required_version = ">= 1.5"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = ">= 0.100"
    }
  }
}

# Auth via env: `export YC_TOKEN=$(yc iam create-token)` (or a service-account key file). cloud/folder
# and default zone come from variables.
provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
  zone      = var.zone
}
