# PO Notebook

## c · 2026-06-07T21:25:56Z — TRIAGE tick 20260607T2107Z (12 inputs → BATCH 6 new + 1 promote)

**Inputs consumed:** 5 queue rows (ci_failure HIGH root-caused; roster drift; 2x pdfx-unhealthy; frontend-3001) + 7 drained files (tnb c90 HIGH x2; bctc 22-filing batch pending; FPT routine; task-lock bloat→claude-manager; 3 telemetry) + reports 3085/3086.

**Verification done (raw, not badges):** docker ps — pdf-extractor UNHEALTHY confirmed, frontend HEALTHY (sau a14 = no-action). Live telegram_reports queried in-container (host data/*.db copies are STALE since May 16 — never trust them). No commit-mutex row held pre-claim.

**6 new backlog tasks:** FIX-CI-LINT-STACK (S, ACTIVE-1: golangci-action v7 bump x6 + delete stale kinh-dich-ts-lint job, one ci.yml), FIX-TA-SANDBOX-DEPGUARD (S, real Fence-C main.go:44), FIX-FRED-YAHOO-WEEKEND-STALE (M HIGH, NEXT-UP: 4 bun-test nulls + tnb F-FED-RATE-REGRESSION converged), FIX-BCTC-LOWCONF-REPARSE-BATCH (S, magnitude fix live — REE/KBC/PPC/CTG/VHM/HCM/NVL/HSG reparse, PPC proof 0.25→0.625), SPIKE-UNIFIED-NB-GAP (120m, session-crash-before-Step-8), CLEAN-COWORK-ROSTER-DRIFT (S, qa).

**Promote:** FIX-PDFX-PUSH-CLIENTS-ASYNC-URLOPEN = ACTIVE-2 (UNHEALTHY container; starvation class; unblocks 22-filing batch). FIX-PDFX-TEST-LOOP-POLLUTION stays queued (test debt, not runtime).

**Key discriminations:** FIX-BCTC-1345B-REPORT-BATCH ≠ reparse (it's XS telegram noise batching — stays open separately). bctc 22-filing batch = downstream of pdfx health, no separate task. Gateway MCP tool not exposed in this thread → mutex claimed via docker-exec INSERT into live coordination.db task_locks (same table/semantics as task_claim); reports 3085/3086 left status=new for the executing dev to resolve with outcome.

**TNB c90 ACK appended** to docs/handoffs/tnb-audit-latest.md (F-FED + F-NB-MISSING → tasks; F2 behind pdfx health; F4/F5/F9 structural unchanged).

**Carry-over (next PO cycle):**
- tnb c91 Monday-dish Fed-rate check: 5.33% persists → escalate FIX-FRED-YAHOO-WEEKEND-STALE to CRITICAL (c87 fix never held).
- Verify pdf-extractor returns HEALTHY + 22-filing batch drains after ACTIVE-2 ships; then FIX-BCTC-LOWCONF-REPARSE-BATCH proof (REE composite >0).
- CTG c029 first-extraction watch (20+ cycles blocked); resolve report 3085 post-reparse.
- Prior carry still open: LIVEDB raw verify; #3065 news-vps honest resolution; HPG Q4 reparse; FIX-SBV-PUSH-TYPE-COERCE live proof; CTG real figures post-refine; 10 yellow eval rows post-stage-4; U3 doc-refresh lane.
