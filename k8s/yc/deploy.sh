#!/usr/bin/env bash
# One-command control-plane deploy for the YC MK8s + Android setup. Idempotent; safe to re-run.
#
# Prerequisites (see docs/deploy/yc-mk8s-android-runbook.md §1a-§1c):
#   - `tofu apply` done in terraform/  (cluster, PG, CR, SG, node SA)
#   - sw image built for amd64 and pushed to the registry
#   - a golden image for Android env VMs exists
#   - kubeconfig: yc managed-kubernetes cluster get-credentials sw --external --force
#
# Required env:
#   POSTGRES_PASSWORD   (must match terraform's pg_password)
# Optional env (defaults):
#   TOFU=/tmp/tfbin/tofu   IMAGE_TAG=v4   GOLDEN_IMAGE_ID=<from a prior bake>
#   INTERNAL_API_SECRET=<generated if unset>
set -euo pipefail

cd "$(dirname "$0")/../.."               # repo root
TOFU="${TOFU:-/tmp/tfbin/tofu}"
TF="env TF_CLI_CONFIG_FILE=$HOME/.terraformrc YC_TOKEN=$(yc iam create-token) $TOFU -chdir=terraform"

: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD (must match terraform pg_password)}"
REGISTRY_ID=$($TF output -raw registry_id)
PG_HOST=$($TF output -raw postgres_host_rw)
SUBNET_ID=$($TF output -raw subnet_id)
ANDROID_SG_ID=$($TF output -raw android_env_security_group_id)
FOLDER_ID=$($TF output -raw folder_id)
ZONE="${ZONE:-ru-central1-a}"
IMAGE="cr.yandex/${REGISTRY_ID}/sw-service:${IMAGE_TAG:-v4}"
GOLDEN_IMAGE_ID="${GOLDEN_IMAGE_ID:?set GOLDEN_IMAGE_ID (the Android golden image, e.g. fd8opcrg042a3lu6u90e)}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-$(openssl rand -hex 32)}"

echo "image=$IMAGE  golden=$GOLDEN_IMAGE_ID  pg=$PG_HOST"

kubectl apply -f k8s/namespace.yaml -f k8s/rbac.yaml

curl -fsSL https://storage.yandexcloud.net/cloud-certs/CA.pem -o /tmp/yc-pg-ca.pem
kubectl create configmap sw-postgres-ca -n sw --from-file=root.crt=/tmp/yc-pg-ca.pem \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic sw-secrets -n sw \
  --from-literal=INTERNAL_API_SECRET="$INTERNAL_API_SECRET" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# Config: callback filled in after the pods (and their node) exist — start with a placeholder.
sed -e "s|__PG_HOST__|$PG_HOST|" -e "s|__GOLDEN_IMAGE_ID__|$GOLDEN_IMAGE_ID|" -e "s|__ZONE__|$ZONE|" \
    -e "s|__SUBNET_ID__|$SUBNET_ID|" -e "s|__ANDROID_SG_ID__|$ANDROID_SG_ID|" -e "s|__FOLDER_ID__|$FOLDER_ID|" \
    -e "s|__CALLBACK_URL__|http://127.0.0.1:3002|" k8s/yc/config.template.yaml | kubectl apply -f -

sed "s#sw/service:latest#$IMAGE#g" k8s/migrate-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete job/sw-migrate -n sw --timeout=240s

sed "s#sw/service:latest#$IMAGE#g" k8s/control-plane.yaml | kubectl apply -f -
kubectl apply -f k8s/yc/lb.yaml

# Internal callback = sw-internal as a NodePort pinned (Local) to the node its pod runs on.
kubectl patch svc sw-internal -n sw -p '{"spec":{"type":"NodePort","externalTrafficPolicy":"Local"}}'
kubectl rollout status -n sw deploy/sw-internal --timeout=180s
NODE=$(kubectl get pod -n sw -l app=sw-internal -o jsonpath='{.items[0].spec.nodeName}')
NODE_IP=$(kubectl get node "$NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}')
NODE_PORT=$(kubectl get svc sw-internal -n sw -o jsonpath='{.spec.ports[0].nodePort}')
CALLBACK="http://${NODE_IP}:${NODE_PORT}"
echo "android callback = $CALLBACK"
kubectl get configmap sw-config -n sw -o json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);d['data']['COMPUTE_ANDROID_INTERNAL_URL']='$CALLBACK';print(json.dumps(d))" \
  | kubectl apply -f -
kubectl rollout restart -n sw deploy/sw-worker

echo "waiting for external IPs..."
for _ in $(seq 1 20); do
  API_IP=$(kubectl get svc sw-api-lb -n sw -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  WD_IP=$(kubectl get svc sw-wd-lb -n sw -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  [ -n "$API_IP" ] && [ -n "$WD_IP" ] && break; sleep 10
done
echo "=========================================================="
echo " api = http://${API_IP:-pending}:3000    wd = http://${WD_IP:-pending}:3001"
echo " auth header:  Authorization: Bearer <user1>   (angle brackets are literal)"
echo " smoke test:   docs/deploy/yc-mk8s-android-runbook.md §1e"
echo "=========================================================="
