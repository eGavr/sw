#!/bin/bash
# Configure a Keycloak realm that mints tokens our `oidc` auth strategy accepts. Idempotent-ish: safe to
# re-run (create calls that already exist are ignored). Run after `docker compose up -d` (see README).
#
# It creates:
#   - realm `sw`
#   - public client `sw-api` with Direct Access Grants (so a token can be minted with a password grant)
#   - an *audience* mapper adding `sw` to the token's `aud` (jose's audience check needs our value in aud)
#   - a *group membership* mapper putting group names into a `groups` claim (name only, no leading slash)
#   - group `eng`; users alice (in eng, the demo owner), bob (in eng), carol (no group)
#
# Keycloak 26 gotchas baked in below: a user is "not fully set up" (login fails) without firstName/lastName
# and a *non-temporary* password with emailVerified; and `UID` is a read-only shell variable, so we use
# USERID.
set -euo pipefail

CONTAINER="${1:-sw-keycloak}"
REALM=sw
CLIENT=sw-api
AUDIENCE=sw

docker exec "${CONTAINER}" bash -c "
set -e
K=/opt/keycloak/bin/kcadm.sh
\$K config credentials --server http://localhost:8080 --realm master --user admin --password admin >/dev/null

\$K create realms -s realm=${REALM} -s enabled=true >/dev/null 2>&1 || echo '(realm exists)'

CID=\$(\$K create clients -r ${REALM} -s clientId=${CLIENT} -s enabled=true -s publicClient=true \
    -s directAccessGrantsEnabled=true -s 'redirectUris=[\"*\"]' -i 2>/dev/null \
    || \$K get clients -r ${REALM} -q clientId=${CLIENT} --fields id --format csv | tr -d '\"' | head -1)

\$K create clients/\$CID/protocol-mappers/models -r ${REALM} -s name=aud-${AUDIENCE} -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s 'config.\"included.custom.audience\"=${AUDIENCE}' -s 'config.\"access.token.claim\"=true' >/dev/null 2>&1 || true

\$K create clients/\$CID/protocol-mappers/models -r ${REALM} -s name=groups -s protocol=openid-connect \
    -s protocolMapper=oidc-group-membership-mapper \
    -s 'config.\"claim.name\"=groups' -s 'config.\"full.path\"=false' -s 'config.\"access.token.claim\"=true' >/dev/null 2>&1 || true

GID=\$(\$K create groups -r ${REALM} -s name=eng -i 2>/dev/null \
    || \$K get groups -r ${REALM} -q search=eng --fields id --format csv | tr -d '\"' | head -1)

for entry in alice:eng bob:eng carol:; do
    u=\${entry%%:*}; grp=\${entry##*:}
    USERID=\$(\$K create users -r ${REALM} -s username=\$u -s enabled=true -s email=\$u@example.com \
        -s emailVerified=true -s firstName=\$u -s lastName=Test -i 2>/dev/null \
        || \$K get users -r ${REALM} -q username=\$u --fields id --format csv | tr -d '\"' | head -1)
    \$K set-password -r ${REALM} --userid \$USERID --new-password \${u}pw >/dev/null
    [ -n \"\$grp\" ] && \$K update users/\$USERID/groups/\$GID -r ${REALM} >/dev/null
done

echo 'realm ${REALM} ready: client=${CLIENT}, group=eng, users=alice(eng)/bob(eng)/carol'
"
