#!/bin/sh
# entrypoint.sh — seeds VPS host key into /root/.ssh/known_hosts at container startup.
#
# Why at runtime (not build time):
#   VPS_HOST is injected via docker-compose env, not available at docker build time.
#   ssh-keyscan must run against the live host to capture the real fingerprint.
#
# Fail-loud: exits non-zero if ssh-keyscan fails or produces no output.
# This prevents the container from starting with a broken SSH config that would
# cause all restart_vps_service calls to fail with "Host key verification failed".

set -e

if [ -n "${VPS_HOST}" ]; then
    echo "[entrypoint] Seeding known_hosts for ${VPS_HOST} ..."
    KEYSCAN_OUT=$(ssh-keyscan -H "${VPS_HOST}" 2>/dev/null)
    if [ -z "${KEYSCAN_OUT}" ]; then
        echo "[entrypoint] ERROR: ssh-keyscan returned no output for ${VPS_HOST} — aborting." >&2
        exit 1
    fi
    echo "${KEYSCAN_OUT}" >> /root/.ssh/known_hosts
    chmod 600 /root/.ssh/known_hosts
    echo "[entrypoint] known_hosts seeded ($(echo "${KEYSCAN_OUT}" | wc -l | tr -d ' ') entries for ${VPS_HOST})."
else
    echo "[entrypoint] WARNING: VPS_HOST not set — skipping known_hosts seeding. SSH to VPS will fail." >&2
fi

exec "$@"
