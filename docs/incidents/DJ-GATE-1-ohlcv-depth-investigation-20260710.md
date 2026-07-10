# DJ-GATE-1: OHLCV Backfill VPS Pipeline Investigation Resolution

**Date:** 2026-07-10T03:55Z  
**Agent:** ops  
**Ticket:** Telegram Reports #3540, #3541  
**Investigation Duration:** 2026-07-10T03:07Z → 2026-07-10T03:57Z (~50 minutes)

---

## Decision Summary

**Status:** RESOLVED AS OPERATIONAL + KNOWN CONSTRAINT  
**Root Cause:** NOT A PIPELINE BUG — legitimate source data scarcity on 5 peripheral HNX/UPCOM tickers  
**Pipeline Status:** OPERATIONAL (verified live 2026-07-08 deployment + 3 successful cycles today)  
**Telegram Resolution:** Both reports processed with category="monitoring"

---

## Investigation Timeline & Findings

### Pre-Investigation Context (Key Correction)
- **Commit e89f09ac1 (2026-07-07T21:08Z):** Added proper SCP + sed substitution + GUARD-1 to `scripts/deploy-vinahost.sh` § 6
  - This was a pre-existing fix, NOT created during today's investigation
  - Deployment to VPS occurred 2026-07-08T01:53Z (verified via live SSH file mtime)

### Phase 1: Root Cause Analysis (Found Pre-Existing Recon)
- **Input:** Recon doc `docs/vps-sources/ohlcv-backfill-pipeline-stall/recon.md` (2026-07-07 18:35Z)
  - Documented 2.5-month backfill failure: 541 poll cycles since 2026-04-17, ZERO successful pushes ever
  - Phase A (2026-04-17→2026-06-30, 466 cycles): Script missing from VPS
  - Phase B (2026-06-30→2026-07-07, 75 cycles): Script on VPS with unsubstituted placeholders
  
- **Finding:** Issue was already diagnosed; fix was already committed to repo; but VPS deployment status was unknown

### Phase 2: Live Verification via SSH (Today's Work)
**2026-07-10T03:52Z SSH Probe:**

```
✓ /root/fetch-ohlcv-backfill.sh file state:
  - MCP_BASE="${MCP_BASE:-https://zenmidi.com}" [CORRECTLY SUBSTITUTED]
  - API_KEY="${API_KEY:-38955a...}" [CORRECTLY SUBSTITUTED]
  - File mtime: 2026-07-08T01:53Z
  - Executable: YES
  - Timer: active

✓ Poll log evidence (last 3 cycles):
  2026-07-10T02:36:17Z: ok=109, 77,568 bars, exit code 0
  2026-07-10T03:06:41Z: ok=109, 77,573 bars, exit code 0
  2026-07-10T03:35:37Z: ok=109, 77,573 bars, exit code 0
```

**Critical Finding:** Pipeline IS working. Deployment happened ~24h ago (2026-07-08) and has been successful.

### Phase 3: MCP Server Depth Probe Analysis
**Retry escalation timeline:**

```
02:08:24Z: retry_count=3 → depth shortfall, re-queued
02:36:18Z: retry_count=4 → depth shortfall, re-queued
03:06:41Z: retry_count=5 → ESCALATION TRIGGERED (telegram 3540 fires at 03:35:37Z)
03:35:37Z: retry_count=5 → ESCALATION AGAIN (telegram 3540)
03:51:06Z: retry_count=5 → ESCALATION AGAIN (telegram 3541)
```

**Root Cause of Alerts:** After 5 retry cycles, depth probe correctly escalates per R-5 retry-storm cap because 5 codes remain <252 bars:

| Code | Exchange | VNDirect Depth | Status |
|------|----------|---|---|
| BDI | HNX | 1 bar | Likely delisted/illiquid |
| DLC | HOSE | 41 bars | Sparse ~2mo history |
| JSH | HNX | 0 bars | Halted/delisted |
| SIS | HNX | 0 bars | Halted/delisted |
| VDC | HNX | 0 bars | Halted/delisted |

**Validation:** Local script test confirmed these are the actual bar counts from VNDirect (not a fetch bug).

---

## Corrected Attribution

| Item | Status | Timeline | Attribution |
|------|--------|----------|---|
| **Root cause identified** | PRE-INVESTIGATION | 2026-07-07 (recon.md) | ops-vps-fetch agent |
| **Code fix deployed** | PRE-INVESTIGATION | 2026-07-07T21:08Z (e89f09ac1) | (existing developer fix) |
| **VPS deployment** | PRE-INVESTIGATION | ~2026-07-08T01:53Z | (unknown deployer, but confirmed live) |
| **Live verification** | TODAY | 2026-07-10T03:52Z | ops agent (this investigation) |
| **Depth probe working** | TODAY | 2026-07-10T03:06-03:51Z | (confirmed via MCP logs) |
| **Source data scarcity confirmed** | TODAY | 2026-07-10T03:51Z | ops agent + local script test |
| **Telegram resolution** | TODAY | 2026-07-10T03:57:42Z | ops agent (this investigation) |

---

## Disposition

### Pipeline Status: OPERATIONAL
- ✓ Backfill script deployed (2026-07-08)
- ✓ Latest 3 cycles: 77,573 bars/cycle successfully pushed
- ✓ Retry/escalation logic functioning correctly
- ✓ Depth probe working as designed

### Alerts: LEGITIMATE BUT EXPECTED
- Alerts correctly reflect 5 peripheral codes with source data scarcity
- System correctly escalates after 5 retries per R-5 cap
- Alerts are NOT indicative of pipeline failure

### Recommended Follow-Up
1. Whitelist BDI/DLC/JSH/SIS/VDC from depth alerts (known source limitations)
2. OR accept these as permanent shallow codes and reduce re-queue cadence
3. Monitor for any NEW codes entering shallow state (would indicate real issue)

### Telegram Reports Resolved
- **3540:** resolved_at=2026-07-10T03:57:42.429Z, resolution=monitoring
- **3541:** resolved_at=2026-07-10T03:57:42.434Z, resolution=monitoring

---

## References

**Recon Analysis:**  
- docs/vps-sources/ohlcv-backfill-pipeline-stall/recon.md (2026-07-07)

**Code Fix:**  
- e89f09ac1: fix(ops-infra): add missing fetch-ohlcv-backfill.sh SCP + sed substitution to deploy-vinahost.sh

**Live Verification:**  
- VPS SSH probe: 2026-07-10T03:52-03:55Z
- MCP server logs: 2026-07-10T02:08Z → 03:51Z depth probe timeline
- Telegram database: resolution=monitoring, resolved_at=2026-07-10T03:57:42Z

---

**Decision:** Pipeline is operational. Alerts reflect legitimate source data scarcity. No code changes needed. Recommended: categorize these 5 codes as "shallow by design" in monitoring rules.
