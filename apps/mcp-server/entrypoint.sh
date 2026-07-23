#!/bin/sh
# entrypoint.sh — seeds VPS host key into known_hosts at container startup.
#
# Why at runtime (not build time):
#   VPS_HOST is injected via docker-compose env, not available at docker build time.
#   ssh-keyscan must run against the live host to capture the real fingerprint.
#
# Non-fatal degrade (FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION,
# 2026-07-23): a VPS-reachability problem (VPS down, network partition, DNS
# failure) must NEVER prevent mcp-server from starting — that would turn a
# VPS outage into a total outage of the ENTIRE MCP tool surface plus every
# cron job, most of which have nothing to do with the VPS. If ssh-keyscan
# fails or returns no output, this script logs a loud WARN and continues
# with known_hosts left unseeded; only SSH-dependent tools
# (restart_vps_service, trigger_*_vps_fetch) then fail loudly (a real
# connection error, never a silent no-op) at call time. Deliberately NO
# `set -e` — every step below is explicitly guarded so a soft failure here
# can never abort the exec handoff to the real server process. This was the
# original (pre-regression) design's fatal flaw: `set -e` plus a nonzero
# hard-exit on empty keyscan output meant a VPS outage crashed the whole
# container.
#
# KNOWN_HOSTS_DIR / KNOWN_HOSTS_FILE are overridable for testability (the
# regression test drives this script directly against a tmp dir); production
# always uses the default /root/.ssh/known_hosts.

KNOWN_HOSTS_DIR="${KNOWN_HOSTS_DIR:-/root/.ssh}"
KNOWN_HOSTS_FILE="${KNOWN_HOSTS_FILE:-${KNOWN_HOSTS_DIR}/known_hosts}"

mkdir -p "${KNOWN_HOSTS_DIR}" 2>/dev/null
chmod 700 "${KNOWN_HOSTS_DIR}" 2>/dev/null

if [ -n "${VPS_HOST}" ]; then
    echo "[entrypoint] Seeding known_hosts for ${VPS_HOST} ..."
    KEYSCAN_OUT=$(ssh-keyscan -H "${VPS_HOST}" 2>/dev/null)
    if [ -z "${KEYSCAN_OUT}" ]; then
        echo "[entrypoint] WARN: ssh-keyscan returned no output for ${VPS_HOST} (VPS unreachable, DNS failure, or ssh-keyscan timeout) — known_hosts NOT seeded. Server startup continues normally; SSH-dependent tools (restart_vps_service, trigger_*_vps_fetch) will fail loudly with a real connection error at call time until the VPS is reachable." >&2
    else
        echo "${KEYSCAN_OUT}" >> "${KNOWN_HOSTS_FILE}"
        chmod 600 "${KNOWN_HOSTS_FILE}" 2>/dev/null
        echo "[entrypoint] known_hosts seeded ($(echo "${KEYSCAN_OUT}" | wc -l | tr -d ' ') entries for ${VPS_HOST})."
    fi
else
    echo "[entrypoint] WARN: VPS_HOST not set — skipping known_hosts seeding. SSH-dependent tools will fail at call time until VPS_HOST is configured." >&2
fi

exec "$@"
