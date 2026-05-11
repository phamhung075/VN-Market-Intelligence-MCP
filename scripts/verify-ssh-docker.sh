#!/bin/sh
# verify-ssh-docker.sh — confirms SSH prerequisites inside the running mcp-server container.
#
# Usage (run from project root, container must already be up):
#   ./scripts/verify-ssh-docker.sh
#
# Checks:
#   1. SSH key file exists at /run/secrets/vps_ssh_key with permissions -rw-------  (0600)
#   2. known_hosts contains a fingerprint for VPS_HOST (125.212.251.27)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed (details printed to stderr)

set -e

CONTAINER="mcp-server"
KEY_PATH="/run/secrets/vps_ssh_key"
VPS_HOST="125.212.251.27"

ERRORS=0

echo "=== verify-ssh-docker: checking container '${CONTAINER}' ==="

# ── Check 1: key file exists and has correct permissions ──────────────────
echo ""
echo "1. SSH key at ${KEY_PATH} ..."
KEY_PERMS=$(docker exec "${CONTAINER}" stat -c "%a %n" "${KEY_PATH}" 2>&1) || {
    echo "   FAIL: key file not found — ${KEY_PERMS}" >&2
    ERRORS=$((ERRORS + 1))
    KEY_PERMS=""
}
if [ -n "${KEY_PERMS}" ]; then
    PERM_OCTAL=$(echo "${KEY_PERMS}" | awk '{print $1}')
    if [ "${PERM_OCTAL}" = "600" ]; then
        echo "   OK  : permissions ${PERM_OCTAL} (${KEY_PATH})"
    else
        echo "   FAIL: permissions ${PERM_OCTAL} — expected 600. SSH will reject this key." >&2
        ERRORS=$((ERRORS + 1))
    fi
fi

# ── Check 2: known_hosts contains VPS fingerprint ────────────────────────
echo ""
echo "2. known_hosts fingerprint for ${VPS_HOST} ..."
KEYGEN_OUT=$(docker exec "${CONTAINER}" ssh-keygen -F "${VPS_HOST}" 2>&1) || true
if echo "${KEYGEN_OUT}" | grep -q "found"; then
    echo "   OK  : host key found in known_hosts"
    echo "   ${KEYGEN_OUT}"
else
    echo "   FAIL: ${VPS_HOST} not found in /root/.ssh/known_hosts" >&2
    echo "   Run: docker exec ${CONTAINER} ssh-keyscan -H ${VPS_HOST} >> /root/.ssh/known_hosts" >&2
    ERRORS=$((ERRORS + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
if [ "${ERRORS}" -eq 0 ]; then
    echo "=== All checks passed. SSH to VPS should work. ==="
    exit 0
else
    echo "=== ${ERRORS} check(s) failed. See above. ===" >&2
    exit 1
fi
