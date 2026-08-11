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
