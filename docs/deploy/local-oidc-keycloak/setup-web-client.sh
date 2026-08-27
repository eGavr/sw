#!/bin/bash
# Adds a CONFIDENTIAL client `sw-web` for the dashboard BFF (Auth.js / NextAuth): authorization-code
# flow, redirect to the Next.js callback, and an audience mapper (aud=sw) so the minted access token is
# accepted by the sw api. Prints the client id/secret/issuer to paste into apps/frontend/.env.local.
# Run after `setup-realm.sh` (needs realm `sw` + users). Idempotent-ish (re-creates are ignored).
#
# Usage: ./setup-web-client.sh [container] [redirect-uri]
set -euo pipefail

CONTAINER="${1:-sw-keycloak}"
REDIRECT="${2:-http://localhost:3000/api/auth/callback/keycloak}"
REALM=sw
CLIENT=sw-web
AUDIENCE=sw

docker exec "${CONTAINER}" bash -c "
set -e
K=/opt/keycloak/bin/kcadm.sh
\$K config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null

CID=\$(\$K create clients -r ${REALM} -s clientId=${CLIENT} -s enabled=true -s publicClient=false \
    -s standardFlowEnabled=true -s directAccessGrantsEnabled=false \
    -s 'redirectUris=[\"${REDIRECT}\"]' -s 'webOrigins=[\"+\"]' -i 2>/dev/null \
    || \$K get clients -r ${REALM} -q clientId=${CLIENT} --fields id --format csv | tr -d '\"' | head -1)

# aud=sw so the sw api (jose audience check) accepts the access token forwarded by the BFF.
\$K create clients/\$CID/protocol-mappers/models -r ${REALM} -s name=aud-${AUDIENCE} -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s 'config.\"included.custom.audience\"=${AUDIENCE}' -s 'config.\"access.token.claim\"=true' >/dev/null 2>&1 || true

# group names into a `groups` claim (parity with sw-api, in case authZ uses group bindings).
\$K create clients/\$CID/protocol-mappers/models -r ${REALM} -s name=groups -s protocol=openid-connect \
    -s protocolMapper=oidc-group-membership-mapper \
    -s 'config.\"claim.name\"=groups' -s 'config.\"full.path\"=false' -s 'config.\"access.token.claim\"=true' >/dev/null 2>&1 || true

SECRET=\$(\$K get clients/\$CID/client-secret -r ${REALM} --fields value --format csv | tr -d '\"')
echo '---8<--- paste into apps/frontend/.env.local ---8<---'
echo \"AUTH_KEYCLOAK_ID=${CLIENT}\"
echo \"AUTH_KEYCLOAK_SECRET=\$SECRET\"
echo \"AUTH_KEYCLOAK_ISSUER=http://localhost:8085/realms/${REALM}\"
"
