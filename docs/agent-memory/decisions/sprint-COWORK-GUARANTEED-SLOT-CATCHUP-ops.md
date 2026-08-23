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


### STEP ops-S22 · ops · 2026-08-08T08:12:00Z
**task-id:** OPS-RAG-SERVICE-REBUILD-STALE-IMAGE-PREDATES-IDLE-UNLOAD-FIX
**what-done:** Rebuilt rag-service container from post-fix source; verified new image created after fix commit (2026-08-08T08:10:53Z > 2026-08-06T16:33:53Z fix date); memory reclamation observed (96.43% → 3.82% post-rebuild).
**what-considered:**
- Restart container with existing stale image (REJECTED: would not engage fix)
- Full docker compose down/up (REJECTED: forbidden by policy, kills peer containers/state)
- Only: single-service rebuild with docker compose build + up -d --no-deps
**why-decision:** Fix code exists in source but stale Docker image predates it by ~24h; strict single-service rebuild isolates the reclamation code path and limits blast radius per standing policy.
**why-change:** No change from plan; task specification mandated AC-1/AC-2/AC-3 verification and all three passed; idle-unload is now active in production.

### STEP ops-S23 · ops · 2026-08-23T14:15:02Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Rebuilt pdf-extractor (image 4ee7f1c3→e5d36a38, StartedAt 14:15:02Z) and proved the running PROCESS carries the fix by live module introspection, not by file grep: loaded PekEngineAdapter.extract_layout_and_tables has wait_s param + acquire(blocking=True, timeout=wait), _SEMAPHORE_WAIT_SECONDS=1800 from env.
**what-considered:**
- Trust `docker exec grep` on /app source (REJECTED: file-on-disk ≠ module loaded by the running interpreter)
- Plain restart (REJECTED: cannot pick up baked-in source; has masked Bun JIT corruption before)
- Only: scoped `build --build-arg GIT_SHA` + `up -d --no-deps`, then introspect the live module
**why-decision:** qa held the row precisely because REBUILD_REQUIRED was TRUE; only runtime evidence clears that, and image-ID change alone proves a swap, not that the fix is loaded.
**why-change:** No change from plan.

### STEP ops-S24 · ops · 2026-08-23T14:51:00Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Generated the AC-8 traffic qa named as blocker (b) by running the already-authored reset migration (21/21 rows url_not_found→pending), then measured: 6 /pek-extract 202s, 0 SemaphoreContendedError, 0 _run_pek_extract FAILED vs a pre-fix baseline of 30 raises / 39 FAILED.
**what-considered:**
- Hand-craft a synthetic requeue UPDATE (REJECTED: out_of_scope (c), and an ad-hoc write is exactly the falsification class BUG 3550 punished)
- Wait for organic pek_triggered traffic (REJECTED: histogram had pek_triggered=0 and 56 enrich_failed at/over cap — organically unreachable)
- Only: run reset-bctc-enricher-stuck-backlog-2026-04.ts, which the architect brief already authorised for my other ready row
**why-decision:** One action discharges both blocker (b) for AC-8 and the OPS-BCTC-BANK-2025Q4 row's own action plan; it is an existing reviewed migration, not new code.
**why-change:** Sequenced AFTER the rebuild deliberately, so the batch would hit the post-fix image; firing it first would have burned the traffic window on the stale image.

### STEP ops-S25 · ops · 2026-08-23T14:50:00Z
**task-id:** FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE
**what-done:** Recorded AC-9 as REFUTED-NOT-CONFIRMED: pdf-extractor memory re-pinned at 99.99% of its 2.5GiB cap and silently exited (code 0, OOMKilled=false, RestartCount 0→1 at 14:27:10Z) on the POST-fix image, in a window where /pek-extract count was ~0 and /extract carried 127 posts.
**what-considered:**
- Report A-30 as resolved on the healthy post-rebuild sample (REJECTED: fabrication; the 18.89% reading was a 2-minute-old cold container)
- Stay silent and let qa discover it (REJECTED: AC-9 explicitly demands a plain statement if A-30 does not quiet)
**why-decision:** The worst memory episode preceded PEK traffic entirely, so the architect's "A-30 is downstream of the semaphore burst" read does not survive measurement; the live driver is the /extract OCR path.
**why-change:** AC-9 anticipated only confirm/deny; the evidence instead re-attributes the symptom to a different code path, which needs a new row rather than a verdict on this one.
