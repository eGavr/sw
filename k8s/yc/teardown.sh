#!/usr/bin/env bash
# Tear everything down. Deletes the LB Services first (so the cloud controller reaps the NLBs — avoids
# orphaned load balancers), removes leftover Android env / build VMs, then destroys the terraform stack.
# Does NOT delete the reused VPC network (a data source) or the golden image — remove those by hand only if
# you truly want them gone (keeping them makes the next `deploy` fast).
set -uo pipefail

cd "$(dirname "$0")/../.."
TOFU="${TOFU:-/tmp/tfbin/tofu}"

echo "== deleting env/build VMs =="
for v in $(yc compute instance list --format json 2>/dev/null \
           | python3 -c 'import sys,json;[print(i["name"]) for i in json.load(sys.stdin) if i["name"].startswith(("sw-env-","sw-imgbuild"))]'); do
  echo "  delete $v"; yc compute instance delete --name "$v" --async >/dev/null 2>&1 || true
done

echo "== deleting LB Services (reaps NLBs) =="
kubectl delete svc sw-api-lb sw-wd-lb -n sw --ignore-not-found 2>/dev/null || true
sleep 20   # let the cloud controller delete the NLBs before tofu destroy

echo "== tofu destroy (cluster / PG / CR / SG / SA) =="
env TF_CLI_CONFIG_FILE="$HOME/.terraformrc" YC_TOKEN="$(yc iam create-token)" \
  "$TOFU" -chdir=terraform destroy -auto-approve

echo "== done. Kept: reused VPC network, and the golden image (delete manually if unwanted):"
echo "   yc compute image list --folder-id <folder> | grep sw-android-golden"
