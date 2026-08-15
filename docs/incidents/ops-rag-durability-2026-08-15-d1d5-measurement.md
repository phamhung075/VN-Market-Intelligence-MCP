# OPS: RAG Service D1-D5 Durability Measurement — 2026-08-15

**Date**: 2026-08-15T09:15Z  
**Task**: UNBLOCK-RAG-OPS-DEPLOY-AND-DURABILITY-MEASUREMENT-WINDOW (P0 CRITICAL PATH)  
**Owner**: ops (session 632721c2-41e4-4aff-8d06-a47cf80dc0d7)  
**Verdict**: **FAIL** — AC-3/AC-4 fail path applies → escalate FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED

## Deployment Status (AC-1, AC-2)

- **Image**: sha256:26e681b0ca3a83c87f7eda787c963d0b7ee18094d805cfbc1862a5db18b3fe8c ✓
- **Built**: 2026-08-14T20:12:15Z (malloc_trim fix commit 0eb733b577)
- **Started**: 2026-08-14T20:15:29Z
- **Uptime at measurement**: 13.2 hours
- **RestartCount**: 0 (continuous operation)
- **malloc_trim fix present**: YES (grep -rl returns 4 hits)
- **AC-1**: PASS (image differs from pre-fix sha256:4a955869f002)
- **AC-2**: PASS (repositories.py hash matches, malloc_trim function calls confirmed)

## D1-D5 Durability Bar Analysis (AC-3, AC-4)

**Measurement Window**: 2026-08-14T20:19:20Z → 2026-08-15T09:35:54Z (13.2 hours)  
**Samples**: 781 memory readings (approximately 60-90 second intervals)  
**Evidence**: `/tmp/rag-durability-measurement/memory-samples.csv`

### D3 Stability & Capacity Verdict: **FAIL**

**Requirement**: ≤0.02 pp/min volatility over final 12h AND ≤85% of 1 GiB cap

**Actual performance**:
- Memory range: 3.84% → 97.87%
- Mean: 63.02%
- Last 12h avg volatility: 2.368 pp/min (118x threshold)
- Last 12h max volatility: 93.120 pp/min (4656x threshold)
- Samples above 85% cap: 326/706 (46.2%)
- Peak margin to OOMKill: 2.13% (97.87% used, 100% is OOMKill)

**Pattern**: Aggressive climbs to 93-97% followed by sharp drops. No plateau achieved. No grace period observed.

### Root Cause Assessment

The malloc_trim fix is physically deployed and present in running code. However:

1. **Memory leak persists** — oscillation pattern indicates malloc_trim is not preventing the underlying allocation surge
2. **malloc_trim effectiveness** — either:
   - Not triggered frequently enough (insufficient timer cadence)
   - Insufficient heap reclamation (LanceDB allocations pinned in RSS)
   - Competing with application allocation rate
3. **No benign settling** — 13.2h is sufficient time to establish a stable baseline; the continued volatility indicates active problem, not transient startup behavior

### Comparison to Prior Window

This measurement window has 13+ hours of continuous data post-fix. The D3 bar explicitly requires stability; this window shows **zero stability window**. Previous windows from RAG incidents (2026-08-08, 2026-08-12) showed similar patterns of oscillation leading to crashes.

## Evidence Chain

- **Time-series data**: `/tmp/rag-durability-measurement/memory-samples.csv` (781 samples)
- **Monitoring baseline**: Container status, uptime, restart count verified at measurement time
- **dmesg OOM evidence**: Not accessible from this host (Docker VM dmesg unavailable; docker inspect returns OOMKilled=false, documented false-negative)

## AC Summary

- **AC-1** (rebuild + image ID differs): **PASS** ✓
- **AC-2** (malloc_trim present): **PASS** ✓
- **AC-3** (D1-D5 durability bar ≤0.02 pp/min & ≤85%): **FAIL** ✗
- **AC-4** (dmesg OOM evidence): **INCONCLUSIVE** (docker inspect returns false-negative per spec)
- **AC-5** (fail-path routing): **FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED**

## Next Steps (PO Decision)

The re-diagnosis row FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED is now live in qa[]/QA lane. PO to decide:
- Code review: Is malloc_trim being called with correct parameters?
- Malloc policy: Does the current implementation (malloc_trim on fixed 5min timer) match the actual memory allocation pattern of LanceDB?
- Alternative mitigation: Consider direct memory limit cgroup reduction or alternative allocator.

**Do NOT rebuild rag-service again** — the fix is already deployed; re-building resets the measurement window for nothing. This window is sufficient to show the fix is ineffective.

