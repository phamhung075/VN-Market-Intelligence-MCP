# Task Context — 1566_c: VPS audit & hardening — fetch script diagnostics

## TLDR (read this first)
change: vps-scripts/fetch-foreign-flow.sh (audit + hardening) + diagnostic logs + payload patterns
test: manual VPS SSH validation: tail /var/log/vn-foreign-flow.log, systemctl status vn-foreign-flow.service, check payload sizes
branch: task/1566c-foreign-flow-vps-audit
depends: 1566_b (validator + CB implementation DONE)
knowledge_needed: [bundle-developer, vps-proxy setup]

---

sprint: 228
branch: task/1566c-foreign-flow-vps-audit
status: todo
req_ref: REQ-228
tech_ref: TECH-228

---

## [PM] Planning Context

layer: infrastructure (VPS scripts)
depends_on: 1566_b (validator GREEN, ready for VPS payload testing)

files_to_read:
- docs/TECH_228.md (section "Notes for Developer", item 5 — VPS script audit guidance)
- docs/ARCHITECTURE.md (VPS proxy geo-block workaround, vn-foreign-flow.service details)
- vps-scripts/fetch-foreign-flow.sh (current script, lines 80–113)
- /root/vps-status.sh (on VPS — health check script)

files_to_create:
- docs/AUDIT_1566c_foreign_flow_vps.md (diagnostic findings, payload patterns, truncation evidence)

files_to_modify:
- vps-scripts/fetch-foreign-flow.sh (add diagnostic logging, timeout hardening, truncation detection)
- /var/log/vn-foreign-flow.log (on VPS — enable structured logging)

test_file: manual SSH commands on VPS (no automated test harness)

acceptance_criteria:
- Given vn-foreign-flow.service running on Vinahost VPS
- When SSH to root@VINAHOST_IP and tail -100 /var/log/vn-foreign-flow.log
- Then log entries show: (1) payload size in bytes, (2) HTTP status code, (3) curl error messages (if any), (4) timestamp of each fetch
- And systemctl status vn-foreign-flow.service shows service active, recent runs logged
- And payload sizes are typical (5–50 KB for ~30 items), not truncated (no incomplete JSON brackets)
- And if truncation evidence found in logs, document frequency and trigger conditions
- And report saved to docs/AUDIT_1566c_foreign_flow_vps.md with findings + recommendations

## Diagnostic Checklist

### 1. Connect to VPS

```bash
export VINAHOST_IP="<IP from env>"
ssh root@$VINAHOST_IP
```

### 2. Check Service Status

```bash
systemctl status vn-foreign-flow.service
systemctl log -u vn-foreign-flow.service -n 50 --output short-iso
```

### 3. Inspect Log Files

```bash
tail -100 /var/log/vn-foreign-flow.log
grep -E "truncat|timeout|error|ERROR" /var/log/vn-foreign-flow.log | tail -20
```

### 4. Audit fetch-foreign-flow.sh Script

- Check curl timeout settings (default: 30s, should be 60s for large payloads)
- Verify jq filter handles incomplete JSON gracefully (current: `jq '.data[] | ...'`)
- Check if payload size is logged before HTTP POST
- Verify POST response is checked for truncation indicators

### 5. Payload Size Analysis

```bash
# Extract recent payloads and measure size
ls -lah /tmp/foreign-flow-*.json 2>/dev/null | tail -10
# If available, check actual payload size vs expected
```

### 6. Generate Diagnostic Report

Document in docs/AUDIT_1566c_foreign_flow_vps.md:
- Service uptime and recent run timestamps
- Payload size distribution (min, max, average)
- Truncation incidents (count, last occurrence, trigger)
- Timeout errors (count, frequency)
- Recommended script improvements

### Implementation Notes

**Diagnostic Logging Enhancements:**

Add to fetch-foreign-flow.sh:

```bash
#!/bin/bash
set -e

# Log every fetch attempt with timestamp and payload info
PAYLOAD_FILE="/tmp/foreign-flow-payload-$(date +%s).json"
LOGFILE="/var/log/vn-foreign-flow.log"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting fetch..." >> $LOGFILE

# Fetch data (existing code)
RESPONSE=$(curl -s --max-time 60 \
  -H "Authorization: Bearer ${VPS_PUSH_API_KEY}" \
  https://api.example.com/foreign-flow)

# Check response size BEFORE JSON.parse
RESPONSE_SIZE=${#RESPONSE}
echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Response size: $RESPONSE_SIZE bytes" >> $LOGFILE

# Detect truncation (no closing bracket)
if [[ ! "$RESPONSE" =~ \]\s*$ ]]; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] WARNING: Response appears truncated (no closing bracket)" >> $LOGFILE
fi

# Parse and validate
if ! jq . <<< "$RESPONSE" > /dev/null 2>&1; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: Invalid JSON" >> $LOGFILE
  exit 1
fi

# POST to server
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${SERVER_PUSH_KEY}" \
  -d "$RESPONSE" \
  http://localhost:3000/api/push-foreign-flow)

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] POST response: $HTTP_CODE" >> $LOGFILE

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: HTTP $HTTP_CODE" >> $LOGFILE
  exit 1
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] SUCCESS" >> $LOGFILE
```

**VPS Systemd Service Update (if needed):**

Verify /etc/systemd/system/vn-foreign-flow.service has StandardOutput/StandardError directed to journal or logfile.

### Rollback Scenario

If VPS SSH access fails, document environment variables needed and skip on-site testing. Report limitations in audit document.

### Post-Audit Actions

After diagnostic run:
1. Document findings in docs/AUDIT_1566c_foreign_flow_vps.md
2. If truncation is detected >5 times/day, recommend curl timeout increase or payload size limit on API side
3. If timeout errors frequent, recommend circuit breaker cooldown on VPS side
4. Return audit report to PM/QA for task 1568 (QA verification)

---

## [QA] Review Record

**verdict:** APPROVED

**blocking_issues:** []

**non_blocking:** []

**files_confirmed_clean:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/vps-scripts/fetch-foreign-flow.sh
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/AUDIT_1566c_foreign_flow_vps.md

**test_results:**
- bun test: 5982 pass / 0 fail (includes 1566_a RED + 1566_b impl)
- bun tsc --noEmit: 0 errors
- bash -n: 0 errors (syntax valid)
- ddd_compliance: PASS (vps-scripts are infrastructure, audit doc is documentation)

**review_notes:**
All 9 hardening criteria verified:
1. set -e for fail-fast (line 30) ✓
2. DEBUG_MODE and PAYLOAD_SIZE_THRESHOLD env vars ✓
3. log_diagnostic() function with 4 levels (INFO/WARN/ERROR/DEBUG) ✓
4. curl timeout 60s (line 94, increased from 20s) ✓
5. Truncation detection: check for closing ] bracket (lines 103-106) ✓
6. Millisecond-precision timing on all 4 steps (nanosecond OS time) ✓
7. HTTP status code + response body logging (lines 157-171) ✓
8. Payload size warnings (threshold-driven) ✓
9. ISO 8601 UTC timestamps via date -u (1 definition, reused in helper) ✓

Audit report comprehensive: 16 required sections present (Executive Summary through Implementation Status), root cause analysis (784 errors/24h from timeout + truncation gap), VPS validation checklist with example logs, troubleshooting guide, performance targets, and audit limitations noted (pending VPS SSH access).

Task 1566_c changes only: vps-scripts/fetch-foreign-flow.sh + docs/AUDIT_1566c_foreign_flow_vps.md
No DDD violations. No new test files. Clean integration with 1566_a (RED) and 1566_b (impl).

**merge_commit:** (pending)
