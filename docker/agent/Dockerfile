# Autonomous environment image: a selenium standalone browser node plus an in-container heartbeat
# agent that registers the environment with the control plane and keeps its liveness/busy fresh.
# curl and jq already ship in the selenium base, so no extra packages are needed.
ARG BASE_IMAGE=seleniarm/standalone-chromium:latest
FROM ${BASE_IMAGE}

USER root
COPY heartbeat-agent.sh /opt/bin/heartbeat-agent.sh
COPY heartbeat-agent.conf /etc/supervisor/conf.d/heartbeat-agent.conf
RUN chmod +x /opt/bin/heartbeat-agent.sh
USER 1200
