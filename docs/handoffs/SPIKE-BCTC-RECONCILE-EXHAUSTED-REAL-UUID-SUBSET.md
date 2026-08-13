---
sprint: SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET
branch: spike/bctc-real-uuid-exhausted-investigation
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Investigate and root-cause 3 confirmed RECONCILE EXHAUSTED alerts on real-UUID report_ids (HUT 2025-Q3, BSR 2024-Q1, FRT 2024-Q1) showing 0 layout/table rows after 8 extraction passes. This cohort is structurally distinct from the fallback-shell issue (which carries fallback-% report_ids) and requires separate diagnosis. Concurrent hypothesis: system-auditor A-30 pdf-extractor sustained-high memory (94.07% loss of reclamation, telegram 4648) could cause zero-row extraction on genuinely-extractable PDFs.

## [PM] Planning Context

- **Zone:** apps/mcp-server/ (extraction/reconciliation subsystem diagnosis)
- **Acceptance Criteria:**
  - [ ] Confirm reproducibility: re-run bctcExtractReconcileJob.ts against HUT 2025-Q3, BSR 2024-Q1, FRT 2024-Q1; verify "0 rows" persists across 2+ passes
  - [ ] Check PDF availability: verify pdf_path IS NOT NULL for all 3 report_ids (source PDFs are on disk, not the issue)
  - [ ] Check extraction logs: `docker logs vn-market-intelligence-mcp-pdf-extractor-1` for HUT/BSR/FRT — trace whether PEK extraction ran (and produced output) or never executed
  - [ ] Check system-auditor A-30 hypothesis: compare pdf-extractor memory profile (container stats, RSS/VSZ) at times of HUT/BSR/FRT reconcile passes; verify if loss-of-reclamation anomaly coincides
  - [ ] Identify root cause: format validation issue (read-side fix would unblock), memory exhaustion (container resource config or leak), PDF sourcing/pull failure, or other
  - [ ] If distinct root cause found: produce design brief (not implementation) — do NOT include code changes in this spike
  
- **Files to read first:**
  - docs/architecture-briefs/2026-08-05-fix-bctc-fallback-shell-reports-structurally-unextractable.md § PO fold 20260811T1322Z (the PO's flag on this cohort)
  - apps/mcp-server/src/services/bctcExtractReconcileJob.ts:1-50 (main loop, report resolution)
  - apps/mcp-server/src/services/bctcExtractReconcileJob.ts:380-420 (reconcile success check)
  - Docker/container monitoring: `docker stats vn-market-intelligence-mcp-pdf-extractor-1` (memory tracking)

- **Files to trace (read-only):**
  - apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts (write-side gate — may NOT be the issue if extraction never fired)
  - apps/mcp-server/src/interface/bctcInspectHandler.ts:45-50 (read-side gate — relevant ONLY if extraction succeeded but inspection is gated)
  - apps/mcp-server/src/services/bctcExtractReconcileJob.ts:100-150 (report lookup + reconcile loop entry)

- **Dependencies:** none (parallel investigation, does not block FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write)

- **Knowledge needed:**
  - docs/architecture-briefs/2026-08-05-fix-bctc-fallback-shell-reports-structurally-unextractable.md (context on why fallback- vs real-UUID are distinct)
  - Docker container resource monitoring (memory RSS/VSZ)
  - Reconcile job log/trace patterns
  - system-auditor A-30 alert baseline (telegram 4648)

## Background: Why This Is Distinct From the Fallback-Shell Fix

The FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE task addresses fallback-% report_ids, which are structurally unextractable because:
1. They have no real financial_reports row with a UUID report_id to drive extraction
2. The extraction pipeline was designed to write keyed on a UUID, and it never accepted fallback- ids
3. The fix: make fallback- rows extractable by replacing the isValidUuid format gate with an existence gate

The REAL-UUID cohort (HUT, BSR, FRT) is **different**:
1. They carry actual UUID report_ids that DO exist in financial_reports 
2. They SHOULD be extractable via the same pipeline that works for 191 other UUID-keyed rows
3. Yet they consistently return 0 rows after 8 full extraction passes
4. This suggests a DIFFERENT root cause: extraction never fired, extraction failed silently, or memory exhaustion killed extraction mid-process

The PO's 2026-08-11T13:22Z fold explicitly warns: "do not let the ~87% volume reduction [from fixing fallback shells] stand in for a fix" on this cohort. They are separate bugs.

## Investigation Strategy

1. **Reproducibility check:** Pick one report_id (e.g., HUT 2025-Q3), manually trigger bctcExtractReconcileJob.ts once and observe:
   - Does reconcile job run at all?
   - Does it attempt a PEK extraction call?
   - Does PEK extraction logs show the PDF being processed?
   - What is the final reconcile result (0 rows confirmed, or retry)?

2. **PDF sourcing:** Verify the pdf_path field is SET for all 3 rows (if NULL, that's a known gap, out of scope):
   ```sql
   SELECT id, pdf_path FROM financial_reports 
   WHERE id IN ('dab264ae-...', 'd332bf35-...', '268f4544-...')
   ```

3. **Extraction tracing:** Check pdf-extractor logs at the wall-clock time the reconcile job was scheduled to run:
   - If logs show layout units extracted but zero written to mcp-server → the write-side fix (FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write) could be the blocker
   - If logs show NO extraction at all → something prevented PEK from running (resource exhaustion, queue jam, or other)
   - If logs show "HTTP 400" responses → likely the read-side isValidUuid gate (separate from this row, covered by FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW)

4. **Memory hypothesis test:** Cross-reference docker stats for the pdf-extractor container at the times of the HUT/BSR/FRT reconcile passes:
   - Is RSS/VSZ approaching the container memory limit?
   - Does loss of reclamation (A-30 alert) appear in the same window?
   - If yes → likely OOM or memory pressure killing extraction silently

5. **Output:** If root cause is confirmed, produce a brief (not code) describing:
   - Root cause diagnosis
   - Why this cohort is distinct from fallback shells
   - Recommended mitigation (new code fix, resource tuning, or both)
   - Dependency on other rows (if any)

## No Implementation In This Spike

Do NOT write code changes in this phase. The goal is diagnosis only, so architect can design the fix. If the root cause turns out to be "also needs format-to-existence gate like fallback fix," that extends FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW's scope, not this row.

## Related

- **Parent issue:** FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE (fallback-shell fix, separate root cause)
- **Alert evidence:** telegram 4648 (A-30 pdf-extractor memory), 4649-4650 (latest RECONCILE EXHAUSTED reports)
- **Read-side fix:** FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW (will also unblock read-path for fallback shells, separate sequencing)

---

**Spike boundary:** Investigation, diagnosis, and brief-writing only. No code changes. Once root cause is confirmed, architect writes a fix design (similar to the fallback-shell brief), PM decomposes it, and dev implements.

---

## [Architect] Brownfield Findings

- **Zone:** apps/pdf-extractor/ (correction — parent SPIKE row inherited `apps/mcp-server/` from its
  sibling; every file this investigation touched, and every file the fix touches, is under
  `apps/pdf-extractor/`, a distinct zone with its own specialist `dev-pdf-extractor`,
  `docs/data/system-map.json`).
- **Verified paths:**
  - `apps/pdf-extractor/infrastructure/pek_engine_adapter.py:90-92,656-662` — non-blocking
    `threading.Semaphore(1)` acquire; contention raises `SemaphoreContendedError` instantly (root cause).
  - `apps/pdf-extractor/interface/pek_run_helper.py:56-93` — background task; catches+logs the
    contention error, no retry, no signal back to caller (202 already sent).
  - `apps/pdf-extractor/interface/routes_pek.py:29-86` — `/pek-extract` route; confirms market-hours
    guard is time-uniform (not per-request differentiator) and background task is fire-and-forget.
  - `apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts:322-527` — re-fires
    the entire still-pending batch (up to 20) every 30-min tick with no pacing; this is what creates
    the near-simultaneous burst that triggers the semaphore race.
  - `apps/pdf-extractor/infrastructure/ocr_gateway.py:119-121,382-389` — existing, already-shipped
    bounded-blocking-acquire pattern for an analogous shared resource; the fix design reuses this
    exact shape rather than inventing a new concurrency primitive.
- **Root cause (RAW-verified via `docker logs vn-market-intelligence-mcp-pdf-extractor-1`, full
  retained history 2026-08-08→present, plus live DB probes):** NOT the fallback-shell write-gate
  defect (all 3 named reports carry real, existing UUIDs; confirmed 0 rows in all 3 extraction
  tables). Root cause is a **silent-drop concurrency defect**: pdf-extractor's single-extraction-at-a-
  time semaphore fails contended requests immediately instead of queueing them, and the reconcile
  job's un-throttled batch re-fire creates that contention every tick. FRT 2024-Q1 hit
  `SemaphoreContendedError` on 8/8 of its recorded reconciliation passes (100%, fully reproduced in
  logs). BSR 2024-Q1 and HUT 2025-Q3 show the same burst-load symptom one layer upstream (their
  trigger calls mostly never reached pdf-extractor's logged code path at all — consistent with
  client-side `unreachable`/timeout under the same load, unconfirmable from mcp-server's side because
  that container was recycled 2026-08-13, losing its 08-11 logs). Full breakdown, live log excerpts,
  and the A-30-memory-hypothesis correlation analysis: `docs/architecture-briefs/
  2026-08-13-fix-pek-extract-semaphore-contention-silent-drop.md` §1.
- **Reuse patterns:** Extend the existing `_extraction_semaphore` guard (bounded blocking acquire,
  same shape already shipped in `ocr_gateway.py`'s `_OCR_SLOTS`) — do not invent a new primitive.
- **Design decisions:**
  - Layer: infrastructure (`apps/pdf-extractor/infrastructure/pek_engine_adapter.py`) — no DDD
    violation, no new port/file.
  - `SemaphoreContendedError` class and its `try/finally: release()` stay unchanged; only the
    acquire call and its message change.
- **A-30 memory hypothesis (from this row's own concurrent-hypothesis note):** correlated, not
  causal. The observed semaphore-contention burst (08-11 12:35:03–12:35:04Z) sits ~1 minute before
  telegram 4648's A-30 alert (12:36:20Z) — most parsimoniously read as A-30's signal being a
  downstream symptom of the same un-throttled batch-refire burst, not an independent memory leak.
  Full brief §1 recommends re-checking this empirically post-fix rather than building a separate
  memory mitigation now.
- **Scan clean:** true ✓ — full-history log breakdown (183 total extraction failures: 129
  semaphore-contention / 53 already-diagnosed fallback-id write-gate 400s / 1 genuine timeout) shows
  no evidence of a distinct "extraction runs but silently produces empty output" failure class; ruled
  out the "genuinely malformed source PDFs" alternative hypothesis (both BSR's and FRT's own 2025-Q1
  filings extracted successfully once they won the semaphore race).

**Standard Detection:** BUG-FIX (in-zone, no new primitives, existing service) → **BUILD-STANDARD: not-applicable**

**Suggested follow-up FIX row (PM to mint per normal task-breakdown flow):**
`FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE` · zone `apps/pdf-extractor/` → `dev-pdf-extractor`
· size M · priority P0 · parent `SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET` · depends: none.
Full design: `docs/architecture-briefs/2026-08-13-fix-pek-extract-semaphore-contention-silent-drop.md`

## RETURN
DONE: Root cause confirmed (RAW-verified, not the fallback-shell defect) — silent-drop semaphore
contention in pdf-extractor's PEK extraction trigger path, driven by the reconcile job's un-throttled
batch re-fire. Fix design (bounded blocking acquire, reusing the existing ocr_gateway.py pattern)
written to docs/architecture-briefs/2026-08-13-fix-pek-extract-semaphore-contention-silent-drop.md.
ZONE: apps/pdf-extractor/
NEXT: pm | mint FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE per §7 of the brief, route to dev-pdf-extractor
HANDOFF: docs/handoffs/SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET.md
PIPELINE: continue
