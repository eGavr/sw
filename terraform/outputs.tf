output "registry_id" {
  description = "Container Registry id — image path is cr.yandex/<registry_id>/sw-service."
  value       = yandex_container_registry.sw.id
}

output "cluster_id" {
  value = yandex_kubernetes_cluster.sw.id
}

output "cluster_name" {
  description = "Fetch kubeconfig: yc managed-kubernetes cluster get-credentials <name> --external"
  value       = yandex_kubernetes_cluster.sw.name
}

output "postgres_host_rw" {
  description = "Set as POSTGRES_HOST in k8s/config.yaml (port 6432, TLS on)."
  value       = "c-${yandex_mdb_postgresql_cluster.sw.id}.rw.mdb.yandexcloud.net"
}

output "node_service_account_id" {
  value = yandex_iam_service_account.nodes.id
}
