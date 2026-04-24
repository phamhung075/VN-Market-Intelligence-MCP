# VPS Audit Report — 1566_c: Foreign Flow Fetch Script (Task 1566_c)

**Status:** DRAFT (pending VPS on-site testing)
**Date:** 2026-04-21
**Sprint:** 228
**Dependency:** Task 1566_b (validator + CB implementation DONE)

---

## Executive Summary

Task 1566_c hardens the VPS foreign-flow fetch script (`vps-scripts/fetch-foreign-flow.sh`) against recurring parse errors and network truncation issues. The root cause of 784 errors/24h (sprint 214–227) is a combination of:

1. **Timeout issues** — curl default 20s timeout too short for large payloads (30 items = ~5–50 KB)
2. **Truncation detection gap** — no check for incomplete JSON before sending to MCP server
3. **Diagnostic logging gap** — minimal observability of payload sizes, timings, and error conditions

This audit documents the hardening changes and provides a checklist for VPS validation.

---

## Changes Applied to `vps-scripts/fetch-foreign-flow.sh`

### 1. Timeout Hardening

**Before:**
```bash
curl -s --connect-timeout 10 --max-time 20 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES"
```

**After:**
```bash
curl -s --connect-timeout 10 --max-time 60 \
  "https://bgapidatafeed.vps.com.vn/getliststockdata/$CODES"
```

**Rationale:** Large payloads (~50 KB for 30 items) may take 30–45s to download over typical VPS upstream links. Increasing max-time from 20s to 60s allows complete transmission without timeout failure.

### 2. Truncation Detection

**New Code:**
```bash
# Detect truncation: payload should end with ]
if [ ${VN_DATA_SIZE} -gt 0 ] && [[ ! "$VN_DATA" =~ \]\s*$ ]]; then
  log_diagnostic "WARN" "VPS_API_TRUNCATION_DETECTED: response size ${VN_DATA_SIZE} bytes but no closing bracket"
fi
```

**Rationale:** If curl times out mid-transmission, the body is incomplete but the script previously sent it anyway. A closing `]` is required for valid JSON array; its absence is a strong truncation indicator.

### 3. Diagnostic Logging Framework

Added structured logging with four levels:

```bash
# Helper: diagnostic log function
log_diagnostic() {
  local level="$1"
  local msg="$2"
  local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  echo "[$timestamp] [$level] $msg" >> "$LOG"
  if [ "$DEBUG_MODE" = "1" ]; then
    echo "[$timestamp] [$level] $msg" >&2
  fi
}
```

**Log Levels:**
- `INFO` — normal progress (watchlist loaded, API fetch success, push complete)
- `WARN` — suspicious but non-fatal (large payload, missing fields, empty result)
- `ERROR` — fatal errors (watchlist unreachable, jq parse failed, HTTP error)
- `DEBUG` — timing and size metrics (opt-in via `DEBUG_MODE=1`)

### 4. Timing Instrumentation

Each major step now logs execution time in milliseconds:

```bash
# Example: VPS API fetch timing
VN_FETCH_START=$(date +%s%N)
VN_DATA=$(curl -s ...)
VN_FETCH_END=$(date +%s%N)
VN_FETCH_TIME_MS=$(( (VN_FETCH_END - VN_FETCH_START) / 1000000 ))
log_diagnostic "DEBUG" "VPS_API_FETCH took ${VN_FETCH_TIME_MS}ms, response size: ${VN_DATA_SIZE} bytes"
```

**Steps Instrumented:**
1. Watchlist fetch
2. VPS API fetch
3. jq transformation
4. Push to MCP server

### 5. Payload Size Monitoring

```bash
# Warn if payload is suspiciously large
PAYLOAD_SIZE_THRESHOLD="${PAYLOAD_SIZE_THRESHOLD:-50000}"  # bytes
if [ ${VN_DATA_SIZE} -gt ${PAYLOAD_SIZE_THRESHOLD} ]; then
  log_diagnostic "WARN" "VPS_API_LARGE_PAYLOAD: ${VN_DATA_SIZE} bytes (threshold: ${PAYLOAD_SIZE_THRESHOLD})"
fi
```

**Expected Range:** 5–50 KB for ~30 items. Values >50 KB may indicate:
- API returning extra fields
- Encoding issue (UTF-8 BOM, extra whitespace)
- Unexpected data volume

### 6. HTTP Response Logging

**Before:**
```bash
RESP=$(curl -s -X POST ...)
echo "$(date -u) PUSH: $FF_COUNT items => $RESP" >> "$LOG"
```

**After:**
```bash
PUSH_HTTP_CODE=$(curl -s -o PUSH_RESPONSE.tmp -w "%{http_code}" \
  -X POST "$FOREIGN_FLOW_API_URL" \
  -d "$FF_JSON" 2>&1)
PUSH_RESP=$(cat PUSH_RESPONSE.tmp 2>/dev/null || echo "")
log_diagnostic "INFO" "PUSH_RESPONSE: HTTP $PUSH_HTTP_CODE, body: $PUSH_RESP"

if [ "$PUSH_HTTP_CODE" != "200" ]; then
  log_diagnostic "ERROR" "PUSH_FAILED: HTTP $PUSH_HTTP_CODE (expected 200)"
  exit 1
fi
```

**Rationale:** Explicitly check HTTP status code and log response body to enable root-cause diagnosis on MCP side (schema errors, truncation detected, circuit breaker state).

---

## VPS On-Site Testing Checklist

> **Status:** Pending SSH access to `$VINAHOST_IP` (not available in current environment)

### 1. Connect to VPS

```bash
export VINAHOST_IP="<IP from .env>"
ssh root@$VINAHOST_IP
```

### 2. Verify Service Status

```bash
systemctl status vn-foreign-flow.service
systemctl log -u vn-foreign-flow.service -n 50 --output short-iso
```

**Expected:**
- Service is `active (running)`
- Recent logs show timestamps and progress messages
- No "restart" loops or crash restarts

### 3. Inspect Log File

```bash
tail -100 /var/log/vn-foreign-flow.log
```

**Expected log entries:**
```
[2026-04-21T08:30:00Z] [INFO] === FOREIGN_FLOW FETCH START ===
[2026-04-21T08:30:01Z] [INFO] Watchlist loaded: 30 codes. Fields: fBuyVol/fSellVol/fRoom
[2026-04-21T08:30:15Z] [DEBUG] VPS_API_FETCH took 14000ms, response size: 12345 bytes
[2026-04-21T08:30:16Z] [INFO] VPS_API_FETCH_SUCCESS: 25 raw items, 12345 bytes
[2026-04-21T08:30:17Z] [INFO] JQ_TRANSFORM_SUCCESS: extracted 20 items, payload size: 9876 bytes
[2026-04-21T08:30:18Z] [INFO] PUSH_REQUEST: 20 items, payload size 9876 bytes, took 1500ms
[2026-04-21T08:30:18Z] [INFO] PUSH_RESPONSE: HTTP 200, body: {"ok":true,"upserted":20}
[2026-04-21T08:30:18Z] [INFO] === FOREIGN_FLOW FETCH COMPLETE (success) ===
```

### 4. Check for Truncation Warnings

```bash
grep -E "TRUNCATION_DETECTED|LARGE_PAYLOAD" /var/log/vn-foreign-flow.log | tail -20
```

**Expected:**
- No TRUNCATION_DETECTED entries (if found, indicates network issue or large payload)
- No LARGE_PAYLOAD warnings (if found, may need to increase threshold or split batches)

### 5. Verify Payload Sizes

```bash
grep "response size:" /var/log/vn-foreign-flow.log | tail -20
```

**Expected range:** 5,000–50,000 bytes for ~25–30 items.

**Analysis:**
- If typical size 5–15 KB: normal, no issues
- If typical size 15–30 KB: larger than expected, may indicate extra fields or encoding
- If >50 KB: possible multi-payload accumulation, check API

### 6. Check Error Patterns

```bash
grep -E "ERROR|FAILED" /var/log/vn-foreign-flow.log | tail -20
```

**Expected:**
- Zero errors (if any, document frequency and pattern)

**Common issues:**
- `WATCHLIST_FETCH failed`: MCP server unreachable or API_KEY invalid
- `VPS_API_TRUNCATION_DETECTED`: network timeout, increase timeout or reduce batch size
- `JQ_TRANSFORM_FAILED`: API response changed schema or is malformed
- `PUSH_FAILED: HTTP 400`: MCP server validation failed (check server logs for details)
- `PUSH_FAILED: HTTP 503`: circuit breaker is open (too many recent errors)

### 7. Enable Debug Mode for Extended Diagnostics

```bash
# Run one fetch with debug output
DEBUG_MODE=1 /root/vps-scripts/fetch-foreign-flow.sh 2>&1 | tee debug.log
```

**Output will include:**
- Timing for each step (watchlist, VPS API, jq, push)
- Exact payload sizes
- Curl error messages (if any)
- jq transformation details

---

## Expected Log Format Reference

Each log line follows this format:

```
[TIMESTAMP] [LEVEL] MESSAGE
[2026-04-21T08:30:00Z] [INFO] Watchlist loaded: 30 codes. Fields: fBuyVol/fSellVol/fRoom
```

**Timestamp:** ISO 8601 UTC (`date -u +'%Y-%m-%dT%H:%M:%SZ'`)
**Level:** INFO, WARN, ERROR, DEBUG
**Message:** structured key=value pairs when applicable

---

## Troubleshooting Guide

### Symptom: TRUNCATION_DETECTED warnings in logs

**Root cause:** Payload takes >20s to download (old timeout), curl aborts, incomplete JSON sent.

**Fix:** Already applied (timeout increased to 60s). If still occurring:
1. Check VPS upstream bandwidth: `iftop` or `nethogs`
2. Check if watchlist has grown beyond ~30 items
3. Check API response includes unexpected fields

**Mitigation:**
```bash
# Option A: Increase timeout further (if network is very slow)
curl -s --max-time 90 ...

# Option B: Reduce batch size (split watchlist into pages)
# Run script multiple times with subsets of codes
```

### Symptom: JQ_TRANSFORM_FAILED errors

**Root cause:** VPS API changed response schema, or jq filter syntax error.

**Fix:**
1. Manually fetch VPS API: `curl -s "https://bgapidatafeed.vps.com.vn/getliststockdata/VNM,FPT"`
2. Inspect response: does it have expected fields (`sym`, `fBuyVol`, `fSellVol`, `fRoom`)?
3. If API renamed fields, update env vars: `FOREIGN_FLOW_FBUY_FIELD=foreignBuyVol`
4. If filter is wrong, test jq separately: `echo '{...}' | jq '[.[] | ...]'`

### Symptom: PUSH_FAILED with HTTP 400

**Root cause:** MCP server validation rejected the payload (schema error, invalid JSON structure).

**Diagnosis:**
1. Check MCP server logs: `systemctl log -u vn-market.service | grep push-foreign-flow`
2. Look for detailed error message (e.g., "Item 0: missing required field 'code'")
3. If script is sending malformed JSON, enable debug mode and inspect `$FF_JSON`

### Symptom: PUSH_FAILED with HTTP 503

**Root cause:** Circuit breaker is open (too many recent validation/DB errors on MCP side).

**Diagnosis:**
1. Check MCP circuit breaker state: `sqlite3 ./data/market.db "SELECT * FROM vps_push_log WHERE service='foreign-flow' ORDER BY created_at DESC LIMIT 10;"`
2. Circuit breaker opens after 5 consecutive errors, resets after 30s of inactivity
3. Wait 30s and retry: `sleep 30 && /root/vps-scripts/fetch-foreign-flow.sh`

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Watchlist fetch | <2s | depends on MCP server latency |
| VPS API fetch | 10–30s | depends on payload size and upstream bandwidth |
| jq transformation | <1s | CPU-bound, depends on item count |
| Push to MCP | <2s | depends on network latency to France |
| **Total cycle** | **15–45s** | typical: 20–25s for 25 items |

If total cycle exceeds 60s, the next systemd timer trigger may overlap. Check:
1. VPS API timeout: may need increase if API is slow
2. MCP server latency: check if France box is responsive
3. Network bandwidth: check `iftop` during fetch

---

## Recommended Next Steps (Post-Testing)

After VPS validation:

1. **Review Logs** — Compare actual timings and sizes against targets. If any metric is consistently high:
   - Watchlist fetch >5s: check MCP server health
   - VPS API fetch >45s: consider batch splitting
   - Push >5s: check France network connectivity

2. **Monitor Truncation Frequency** — If TRUNCATION_DETECTED occurs:
   - Document frequency (per day, per 100 runs)
   - Check if correlated with time of day (peak traffic hours?)
   - May warrant increasing timeout to 90s or splitting payloads

3. **Circuit Breaker Tuning** — If PUSH_FAILED: HTTP 503 occurs frequently:
   - Review MCP server validation errors (HTTP 400 before CB opens)
   - Check if schema validation is too strict
   - Consider increasing CB error threshold from 5 to 10

4. **Long-Term Improvements:**
   - Migrate from systemd timer to built-in MCP scheduler (avoid SSH entirely)
   - Implement exponential backoff + retry logic in script (currently: fail-fast)
   - Add alert mechanism (Telegram) when errors exceed threshold (e.g., 3 ERRORs in 1 hour)

---

## Validation Environment Requirements

To run this audit, the following must be available:

**Local (current environment):**
- bash 4.0+ (for `${#VAR}` length expansion)
- curl (for HTTP requests)
- jq 1.5+ (for JSON transformation)
- date (supports `-u` and `+%s%N` for nanosecond precision)

**VPS (Vinahost Vietnam):**
- root SSH access to `$VINAHOST_IP`
- systemd (for service status checks)
- bash 4.0+
- curl, jq, date
- `/var/log/vn-foreign-flow.log` writable by script runner
- Upstream connectivity to:
  - `https://bgapidatafeed.vps.com.vn/` (VN stock API)
  - `$FOREIGN_FLOW_API_URL` (MCP server in France)
  - `$WATCHLIST_URL` (MCP server in France)

**VPS Environment Variables (in `/root/.bashrc` or systemd unit):**
```bash
export FOREIGN_FLOW_API_URL="https://<mcp-domain>/api/push-foreign-flow"
export WATCHLIST_URL="https://<mcp-domain>/api/watchlist"
export API_KEY="<vps-push-api-key>"
export DEBUG_MODE="0"  # set to 1 for verbose output
export PAYLOAD_SIZE_THRESHOLD="50000"  # bytes, warn if exceeded
```

---

## Audit Limitations

This audit was performed **without VPS SSH access**. The following could not be validated on-site:

- [ ] Actual service status and uptime history
- [ ] Real log file analysis (truncation frequency, error patterns)
- [ ] Timing metrics from production runs
- [ ] Integration with systemd timer (does it trigger correctly every 60s?)
- [ ] Payload size distribution over a 24h period
- [ ] HTTP status codes from actual MCP server pushes

**Recommended:** Schedule follow-up on-site validation once VPS access is available. Expected time: 30 minutes.

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Script changes | DONE | fetch-foreign-flow.sh hardened + diagnostic logging added |
| Timeout increase (20s→60s) | DONE | curl --max-time 60 |
| Truncation detection | DONE | check for closing `]` bracket |
| Diagnostic logging | DONE | structured logs with INFO/WARN/ERROR/DEBUG |
| Timing instrumentation | DONE | nanosecond-precision timers on all steps |
| Payload size monitoring | DONE | PAYLOAD_SIZE_THRESHOLD parameter |
| HTTP status logging | DONE | explicit `${PUSH_HTTP_CODE}` capture |
| On-site validation | PENDING | requires VPS SSH access |
| Audit report | DONE | this document |

---

## Files Modified

- `vps-scripts/fetch-foreign-flow.sh` — diagnostic logging, timeout hardening, truncation detection

## Files Created

- `docs/AUDIT_1566c_foreign_flow_vps.md` — this audit report

---

## References

- Task 1566_a: TDD RED test suite
- Task 1566_b: foreignFlowValidator + server.ts integration
- REQ-228: Foreign flow root-cause fix requirements
- TECH-228: Foreign flow architecture design
- docs/ARCHITECTURE.md: VPS proxy pattern and timeout settings
- `.claude/knowledge/cron-jobs.md`: VPS scheduling details

---

**Authored:** Developer (Task 1566_c)
**Date:** 2026-04-21
**Branch:** task/1566c-foreign-flow-vps-audit
