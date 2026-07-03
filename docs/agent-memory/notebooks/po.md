# PO Notebook

_Last: 2026-07-03T19:00Z_

## Tick 2026-07-03T18:37Z (router-dispatched) — B-05 signal triage + WIP=0 backlog dispatch

**Context:** dev-team tick, ONE new signal `sau-1783103887` (system-auditor B-05 WARN, data_stale). head=idle, in_progress=0, ready=0, qa=0, review=4 (all parked), backlog 402. dev WIP=0.

**B-05 RAW-verify (sau-1783103887 "bctc-discover stale 10.6h, 36 queue items"):**
- CORROBORATED-REAL (auditor B-05 WARN + telegram 3438 CRITICAL + 3440 B-13 + bctc-analyst MBB Q1-2026 coverage-gap). NOT the freshness-market-hours-blind FP class.
- Ground truth (WORK channel flood): NOT terminal url_not_found. Queue is ACTIVELY churning; every enrich = `enrich_failed` with `bctc_table_rows=0 AND bctc_md_tables=0` for ~18 Q4-2025 tickers across ALL sectors (ACB/BID/DHG/EIB/D2D/GAS/GVR/HCM/HSG/MBB/NKG/POW/SSI/VCI/VHM/VIC/VPB/VRE). = extraction/OCR pipeline STALL.
- DISTINCT root: NOT the pending bank-mapping rebuild (2cd9e105/a46131cf fix wrong VALUES, not 0-tables); NOT BCTC-ENRICHER-OLD-QUARTERS (0-URLs pre-Q4-2025); NOT already-done FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD / B-05-FU-ENRICHER-LIVENESS.
- Disposition: ops/infra recon + DEPLOY-GATED → NOT a dev coding lane this tick. MINTED PLAN-ONLY `RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL` (ops, infra-vps, high) via po-s140; RESOLVED signal row; surfaced to WORK.

**WIP=0 dispatch (/goal take-backlog-if-free):** BATCH `CHORE-GITIGNORE-CLAUDE-TMP` (CLEAN, cross-service/) — deploy-INDEPENDENT (satisfies deploy-gate), READY, RAW-confirmed real debt (111 tracked .claude/tmp/orch-hook-proposal-*.json, .claude/tmp NOT gitignored, each leaks session UUID). baseline_pass=true (repo hygiene, no compile; orch-apply verified to write these as scratch, no tracking dependency).

**Prior-triage this window (commit e5be7fe8a) — NOT duplicated:** FIX-BCTC-FULL-BATCH-CONTAMINATION (HIGH, architect-first), FEAT-SEVERITY-OVERRIDE-SURFACING, FIX-AGENT-NOTEBOOK-UUID-PROVENANCE, FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT. CHORE-GITIGNORE promoted to BATCH (only deploy-independent + single-shot-ready of the five).

**Writes:** po-s140 orch-apply exit 0 (backlog +1 recon, signal NEW→RESOLVED, NEW-left=0; 104 pre-existing SHG coherence warns non-blocking). .head UNTOUCHED (router owns tick/head). No push (fleet-push timer owns).

## Carry-over
- **RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL** (backlog, ops, PLAN-ONLY): diagnose VPS PDF-extractor / PDF-Extract-Kit / OCR liveness first — the whole extraction returns 0 tables for all sectors, so root is upstream of parsing. High urgency (Q2 earnings window, 18 watchlist tickers with no fundamentals). Any mcp-server code fix DEPLOY-GATED.
- **DEPLOY-GATE (standing):** mcp-server ROBUST tier pending rebuild batch (FIX-LEGAL-RISK ROBUST + pdfpull-guard + COLUMN-ORDER finalize_bctc_refine CTG). Route gated deploys to ops (feedback_user_gates_delegate_to_ops). AFTER deploy: reingest CTG 96e36139 → RAW-verify total_assets → W5 review rows done_verified.
- Review lane (4, all parked, no action): ARCH-SHIP-WAVE-REAUDIT (DEFERRED), TASK-W5-…VALIDATION-REINGEST (BLOCKED deploy-gate), W5-FU-CTG-REFINE-96e36139 (BLOCKED deploy-gate), BCTC-HNX-SSL-HARDEN (deploy-gated, dev-vps-crawls).
- FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD backlog (plan-only, next_agent=ba) — dispatch when a slot opens; architect SPLITs multi-zone.
