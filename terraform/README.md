# Terraform — Yandex Cloud infrastructure

Provisions everything the control plane needs: VPC + subnet + security groups, two service accounts
with the required roles, a Container Registry, a Managed Service for Kubernetes cluster + node group,
and a Managed PostgreSQL cluster (database + user).

> Not apply-tested from this repo (no cloud account here) — structurally valid (`terraform validate`).
> Review security-group rules and versions against the current Yandex Cloud docs before production;
> for HA use a regional master instead of the zonal one.

## Use

```
export YC_TOKEN=$(yc iam create-token)      # or use a service-account key file
cp terraform.tfvars.example terraform.tfvars   # fill cloud_id / folder_id / pg_password
terraform init
terraform apply
```

Then wire the app to the created infra:

```
terraform output                              # registry_id, cluster_name, postgres_host_rw

yc managed-kubernetes cluster get-credentials $(terraform output -raw cluster_name) --external

REGISTRY=$(terraform output -raw registry_id)
docker build -t cr.yandex/$REGISTRY/sw-service:latest ..
yc container registry configure-docker && docker push cr.yandex/$REGISTRY/sw-service:latest

# set POSTGRES_HOST=$(terraform output -raw postgres_host_rw) in ../k8s/config.yaml,
# set the sw-service image in ../k8s/control-plane.yaml + ../k8s/migrate-job.yaml,
# create the sw-secrets Secret and sw-postgres-ca ConfigMap, then apply ../k8s (see ../k8s/README.md).
```

## Notes
- IAM role bindings are `iam_member` (additive), applied before the cluster (`depends_on`); role
  propagation can lag a few seconds on first apply.
- The Postgres password is also needed in the k8s Secret `sw-secrets` — keep them in sync.
- Destroy with `terraform destroy` (Managed PostgreSQL has deletion protection off by default here).
