#!/usr/bin/env bash
# Installs the sw machine agent on this box — the one command the operator runs (or cloud-init runs
# for an ordered machine). Needs: SW_INTERNAL_URL (the control plane's internal API, reachable from
# here), SW_MACHINE_ID and SW_REGISTRATION_TOKEN (from the machine's registration token, shown once).
#
# It registers the machine (spending the one-time token for the long-lived machine token), keeps that
# token in the agent's home, fetches the agent, and starts it: as a systemd unit where systemd runs
# this as root, otherwise in the foreground (a dev Mac: keep the terminal open, or nohup it yourself).
# The control plane never SSHes in — the machine dials out, and only ever out (plus the inbound wd
# ports of its slots).
set -u

: "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"
: "${SW_MACHINE_ID:?SW_MACHINE_ID is required}"
: "${SW_REGISTRATION_TOKEN:?SW_REGISTRATION_TOKEN is required}"

home="${SW_HOME:-$HOME/.sw}"
mkdir -p "${home}"
chmod 700 "${home}"

log() { echo "[sw-machine-installer] $*"; }

# A first, minimal fact sheet: enough for the domain to judge the box; the agent refreshes the rest
# on every sync.
cores() {
    if command -v nproc >/dev/null 2>&1; then nproc; else sysctl -n hw.ncpu 2>/dev/null || echo 1; fi
}
virtualization() {
    if [ -e /dev/kvm ]; then echo kvm
    elif [ "$(uname -s)" = "Darwin" ]; then echo hvf
    else echo none
    fi
}
facts() {
    node -e '
const [cores, virtualization] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
    cores: Number(cores), memoryMb: null, virtualization, emulator: false, avds: [], docker: false,
    vncStack: false, agentVersion: "installer", address: null,
}));
' "$(cores)" "$(virtualization)"
}

command -v node >/dev/null 2>&1 || { log "node is required on the machine (the agent parses JSON with it)"; exit 1; }
command -v curl >/dev/null 2>&1 || { log "curl is required on the machine"; exit 1; }

log "registering machine ${SW_MACHINE_ID} with ${SW_INTERNAL_URL}"
response="$(curl -sf -X POST -H "content-type: application/json" \
    -d "{\"registrationToken\":\"${SW_REGISTRATION_TOKEN}\",\"facts\":$(facts)}" \
    "${SW_INTERNAL_URL}/internal/machines/${SW_MACHINE_ID}:register")" || {
    log "registration refused: the token is spent, expired or the machine is gone; generate a new one"
    exit 1
}
machine_token="$(printf '%s' "${response}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).machineToken||""))')"
[ -n "${machine_token}" ] || { log "registration answered without a machine token"; exit 1; }

umask 077
cat >"${home}/machine.env" <<ENV
SW_INTERNAL_URL=${SW_INTERNAL_URL}
SW_MACHINE_ID=${SW_MACHINE_ID}
SW_MACHINE_TOKEN=${machine_token}
ENV
log "registered; credentials in ${home}/machine.env"

curl -sf -H "Authorization: Bearer ${machine_token}" \
    "${SW_INTERNAL_URL}/internal/machines/agent:download" -o "${home}/machine-agent.sh" \
    || { log "agent download failed"; exit 1; }
chmod 700 "${home}/machine-agent.sh"

if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    cat >/etc/systemd/system/sw-machine-agent.service <<UNIT
[Unit]
Description=sw machine agent
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=${home}/machine.env
ExecStart=/usr/bin/env bash ${home}/machine-agent.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now sw-machine-agent.service
    log "agent installed as sw-machine-agent.service"
else
    log "no systemd (or not root): starting the agent in the foreground"
    log "to run it later: set -a; . ${home}/machine.env; set +a; bash ${home}/machine-agent.sh"
    set -a
    . "${home}/machine.env"
    set +a
    exec bash "${home}/machine-agent.sh"
fi
