# Decision Journal: SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD (Ops Dispatch 2026-07-30)

**Dispatch Date:** 2026-07-30T17:46:46Z  
**Dispatch Mode:** Supervised-Lane Sweep (plan-only, 180min timebox)  
**Coordinator:** system-auditor (dev-team monitoring)  
**Status:** Recurring dormancy diagnosed; follow-up FIX minted; original SPIKE flagged for REVIEW (not DONE)

---

## Context

This SPIKE was opened 2026-07-16 to diagnose a dormancy in the BCTC structured-extraction pipeline (PEK layout + agentic-refine) that cost the entire watchlist backlog ~76 fail-loud reports overnight. The original AC-2 diagnosis (2026-07-17) identified TWO independent producer failures:

1. **PEK layout:** Missing `pek_model_cache` volume (wiped by 2026-07-15 VM rebuild) → remediated by re-seeding weights on 07-17T03:04Z
2. **Agentic refine:** Session-scoped CronCreate trigger dormant since mid-June → tracked in existing backlog row `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP` (no new mint)

The close_predicate (07-17) set two conditions: (a) layout_units MAX advances past 2026-06-10, and (b) terminal enrich_failed rows recover. First half was pre-proven at 08:20Z on 07-17. This dispatch was blocked on verifying second half and proving durable producer resumption.

## Key Finding: NEW Recurring Dormancy (Distinct Root Cause)

**Timeline:**
- 2026-07-28T11:06:59Z: Last `bctc_layout_units` write (1193 rows)
- 2026-07-28T11:11:00Z: Circuit breaker fires (then silences)
- 2026-07-28T18:04:41Z: pdf-extractor container restarts (7h gap)
- 2026-07-30T17:47Z: Still dormant (55h stale, vs 6.5h fresh for refine leg)

**Root Cause (NOT the original 07-17 defect):**

Weights are present (39M `doclayout_yolo_ft.pt`, dated 2026-07-17 03:01Z). Dormancy is a **silent infrastructure failure**:

1. **OCR Gateway Deadlock:** `semaphore=1 != os_children=0` — child process bookkeeping/concurrency defect
2. **Network Push Failure:** `LayoutFirstPushClient.push_layout` cannot connect (errno 111, connection refused) to mcp-server
3. **Container Restart:** Watchdog triggered at 18:04Z, likely by one of the above errors; restart cleared state momentarily but did not fix root cause

**Defect Class:** `PEK-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK` (new infra/concurrency issue, NOT a repeat of missing weights)

## Disposition Decision

### Original SPIKE Status: IN_PROGRESS → REVIEW (blocked from DONE)

**Reason:** Close_predicate verification BLOCKED:
- First half (layout_units MAX advances past 06-10): ✓ Verified at 08:20Z on 07-17, but ✗ REGRESSION at 07-28 11:07Z
- Second half (terminal rows recover): ✗ UNVERIFIED; producer went dormant before proof could be collected

**Outcome:** Row remains IN_PROGRESS, promoted to REVIEW status. Once follow-up FIX resolves the new dormancy and confirms terminal row recovery, PO will flip this SPIKE to DONE_VERIFIED.

### Follow-up FIX: Mint `FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK`

**Scope:**
- Owner: ops + dev-pdf-extractor (co-owned)
- Priority: P0 (blocking extraction pipeline, recurring defect)
- Work: Debug OCR gateway semaphore/child-process bookkeeping; verify mcp-server network reachability from pdf-extractor; check port/firewall config drift
- Gate: Layout extraction resumes + terminal rows (PDR/BSR/DGC/GEX 2024-Q1/2023-Q4) in `bctc_layout_units` confirm recovery

**Not a simple restart:** Container was restarted at 18:04Z with no fix. Requires code review or config investigation.

---

## Investigation Rigor

- RAW docker logs (pdf-extractor since 07-28, grep for ERROR)
- `docker inspect` (container health, restart events)
- `bun:sqlite` readonly queries (cron_job_runs, bctc_layout_units, bctc_table_rows)
- Zero mutations; zero code changes; plan-only methodology maintained

---

## Next Steps (Not Executed, Plan-Only)

1. **Ops/Dev-PDF-Extractor:** Debug the OCR gateway deadlock + network push failure
2. **Verify:** Layout extraction resumes, rows land in `bctc_layout_units`
3. **Verify:** Terminal enrich_failed backlog (128 rows) starts recovering
4. **Gate:** Once both verified, mark `FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK` as DONE_VERIFIED
5. **Close:** PO flips original SPIKE from REVIEW → DONE_VERIFIED

---

## Risk Assessment

- **Severity:** P0 (extraction pipeline offline, recurring defect)
- **Scope:** PEK layout leg only (refine leg is fresh, proves mcp-server is reachable overall)
- **Confidence:** High (root cause clearly identified in logs; defect class distinct from original 07-17)
- **Recovery Path:** Clear (network reachability probe + OCR gateway debug + re-test)

