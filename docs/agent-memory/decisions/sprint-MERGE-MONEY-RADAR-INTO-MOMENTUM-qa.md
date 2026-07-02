# Decision Journal — Sprint MERGE-MONEY-RADAR-INTO-MOMENTUM · qa

**Sprint goal:** One unified /dashboard/momentum surface carrying BOTH money-flow radar and momentum indicators — without homogenizing the two card contracts.
**Agent:** qa
**Started:** 2026-07-02T05:00:00Z

---

### STEP qa-S1 · qa · 2026-07-02T05:10:00Z
**task-id:** FIX-BCTC-BANK-BS-SECTION-CLASSIFIER
**what-done:** CODE sign-off (not done_verified, per PO scope). Re-ran FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts (13/13 GREEN), tsc --noEmit (0 errors), 26-file direct-dependency non-regression set (356/356 pass, independently corroborates dev-mcp-server's claim), mock-guard (PASS, no fabricated data), DDD/security grep (clean — no domain→infra imports, no process.env, no secrets). Traced the `unit_id ASC` == page-order claim into windowPartitioner.ts (zero-padded sequential unit-NNNN) and the `runBoundedPool` fixed-index-array claim — both hold, validating the RC-3 section-carry fix's ordering assumption.
**what-considered:**
- Run full 1161-file suite vs targeted direct-dependency set (grep -l on refinedMarkdownParser/finalizeBctcRefineTool/bctcRefineJob/parseRefinedMarkdown) → chose targeted (25 files, direct callers/consumers) after the full-suite run exceeded the 2min tool timeout with no result; targeted set is a valid non-regression proxy since only these files touch the changed code paths.
- Task prompt referenced test file TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD.test.ts — verified via git log/status this is a DIFFERENT untracked file from an unrelated, still-BLOCKED sprint (FIX-BCTC-BANK-SUMMARY-MAPPING); the actual committed test in 2c7fb5b0 is FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts (402L, matches commit stat exactly) — ran the correct file, treated the prompt's filename as a copy-paste slip, not a real finding.
**why-decision:** All 3 claimed root causes verified against the actual diff (blank-Ma 3-cell mis-route, separator-loss content-recovery via isHeaderRow, initialSection/finalSection cross-unit thread in both sibling pipelines); test fixtures are structurally-shaped synthetic reconstructions (docstring is honest about this, not fabricated) pinned to the task's own DoD numbers; identity holds exactly. APPROVE-CODE, done_verified correctly withheld per PO scope (live behavioral DoD needs the gated rebuild).
**why-change:** no change from plan.
