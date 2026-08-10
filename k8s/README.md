# Kubernetes deployment

The control plane (api / wd / internal / worker) runs in namespace `sw`; environments are provisioned
as Pods in `sw-environments` by the worker's Kubernetes compute adapter (`COMPUTE_K8S_NETWORKING=cluster-dns`).

Files: `namespace.yaml`, `rbac.yaml` (worker SA + env-namespace Role), `config.yaml` (ConfigMap +
Secret), `control-plane.yaml` (4 Deployments + api/wd/internal Services), `migrate-job.yaml`.

## Deploy to Yandex Cloud (Managed Service for Kubernetes)

Prerequisites: a MK8s cluster + node group, a Container Registry, a Managed PostgreSQL cluster (same
VPC), the node-group SA holding `container-registry.images.puller`, and `kubectl` credentials
(`yc managed-kubernetes cluster get-credentials <name> --external`).

1. Build and push the image:
   ```
   docker build -t cr.yandex/<registry-id>/sw-service:<tag> .
   yc container registry configure-docker
   docker push cr.yandex/<registry-id>/sw-service:<tag>
   ```
   Set that image in `control-plane.yaml` and `migrate-job.yaml` (or `kubectl -n sw set image`).

2. Fill in config/secrets:
   - `config.yaml`: `POSTGRES_HOST` = `c-<cluster_id>.rw.mdb.yandexcloud.net` (port 6432, TLS on).
   - `sw-secrets`: `INTERNAL_API_SECRET` (`openssl rand -hex 32`) and `POSTGRES_PASSWORD` — set these
     out-of-band, not in git (`kubectl -n sw create secret generic sw-secrets --from-literal=...`).
   - Postgres CA (for `POSTGRES_SSL=true` verify-full):
     ```
     curl -s https://storage.yandexcloud.net/cloud-certs/CA.pem -o root.crt
     kubectl -n sw create configmap sw-postgres-ca --from-file=root.crt
     ```

3. Apply:
   ```
   kubectl apply -f k8s/namespace.yaml -f k8s/rbac.yaml -f k8s/config.yaml
   kubectl apply -f k8s/migrate-job.yaml         # runs migrations once
   kubectl apply -f k8s/control-plane.yaml
   ```

4. Expose api + wd externally (WebSocket-friendly). Either a Network Load Balancer:
   ```
   kubectl -n sw patch svc sw-api -p '{"spec":{"type":"LoadBalancer"}}'
   kubectl -n sw patch svc sw-wd  -p '{"spec":{"type":"LoadBalancer"}}'
   ```
   (needs the cluster SA role `load-balancer.admin`), or an ALB Ingress (`ingressClassName: yc-alb`).
   `sw-internal` stays cluster-internal.

> Prod security (PLAN item 12) is mandatory before real traffic: TLS on the internal channel and
> per-workload identity instead of the shared `INTERNAL_API_SECRET` (mTLS / per-pod SA tokens).

## Verify locally on kind

kind (`k8s/kind-cluster.yaml`) with Postgres on the host (`sw-db` on 5433). Load the image and apply
with kind overrides (PG on `host.docker.internal:5433`, TLS off, arm chromium image):

```
docker build -t sw/service:latest .
kind load docker-image sw/service:latest --name sw
kubectl --context kind-sw apply -f k8s/namespace.yaml -f k8s/rbac.yaml -f k8s/control-plane.yaml
# apply a kind-specific ConfigMap/Secret (host PG, POSTGRES_SSL=false, seleniarm image) instead of config.yaml
kubectl --context kind-sw -n sw port-forward svc/sw-api 3000:3000   # + svc/sw-wd 3001:3001
```
Then create an account with `resources.providerType=kubernetes` and drive the normal flow.
