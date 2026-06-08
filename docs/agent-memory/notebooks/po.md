# PO Notebook

## c · 2026-06-08T21:52Z — Triage tick: CI-RED-RECONCILE MILESTONE — coverage-OOM RESOLVED, sprint re-baselined to REAL 702

**FIX-CI-COVERAGE-OOM-CRASH -> DONE (verify-raw-not-badges).**
- CI run 27168638852 (HEAD f05795c3, conclusion=failure) emitted the FIRST clean summary in 200+ runs: `10742 pass / 29 skip / 656 fail / 46 errors` / `Ran 11427 across 1039 files [343.72s]`. NO coverage table, NO C++ panic, NO OOM, NO arg-parse error. Gate = clean-summary-emitted (NOT green job); RED on real fails is EXPECTED + PASSES.
- Mechanism raw-verified at HEAD: bunfig `coverage=false` (L26) + ci.yml bare `bun test` (L49) + scripts/test-coverage.sh present. Architect arch-S2 (DJ-GATE-1) DJ + brief 2026-06-08-ci-coverage-off-mechanism.md present (dry-run-proof on pinned bun 1.3.13). Subsumes SPIKE-CI-COVERAGE-OFF-MECHANISM (design this FIX delivered).

**RE-BASELINE: REAL = 702 (656 fail + 46 errors). Phantom 639 + local 443 DISCARDED.** EPIC CI-BUN-TEST-MULTI-CLASS-FIX carries baseline_real=702. Goal (/goal ci/cd pass) = 0 fail.

**Buckets re-validated against raw CI signatures (gh run view 27168638852 --log):**
- DDL-sync (B2, WIDENED): rag_analyses/data_env=93 + daily_ohlcv/data_env=5 + statement_section=3 + missing-tables(cron_job_runs/signal_quality_audit/notified_telegram)=4. Same root (inline DDL drift from schema-*.ts). Sweep ALL inline DDLs -> SSOT init helpers.
- NETWORK (DOMINANT, single largest lever): AbortError/fetch-failed/ETIMEDOUT/getaddrinfo/5000ms=175 + fs ENOENT mkdir data/__test-1335__.
- mock.module (B1 cascade): only 17 hits => ~269 cascade hypothesis EMPIRICALLY DEAD. mock.restore() wrapper already shipped 8fd9bde1 (KEEP). B1 re-run de-prioritized.

**DISPATCHED this tick (WIP<=2, disjoint file sets):**
- B2-RAG-DDL-INITNEWSTABLES (DISPATCHED, high, WIDENED) -> dev-mcp-server.
- CI-NETWORK-SKIP-GUARDS (TODO->DISPATCHED, med->high; B1 dep REMOVED/moot) -> dev-mcp-server.
- SEQUENCED AFTER: OBSOLETE-REMOVE-24 (evidence-gated 24-test), CLASS-B-PERTEST-TRIAGE (PO pass).
- PROTECT canary DWF-is-trading-day AC-P0-3-6 (intentional RED, NEVER touch).

**Auditor repair triaged:** repair_task_request AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC (system-auditor swept 7 peer files into f05795c3 via non-explicit git add; benign, latent race). Filed FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC -> backlog DEFERRED-OUT-OF-DEV-SCOPE (agent flow .md = agents-architect contract + agent-father edit, NOT dev-team). Fix = explicit pathspec + commit-mutex. Signal moved to processed/.

**TNB c91:** already ACK'd 21:20 (F-SUNDAY false-positive rejected); no new TNB findings this tick.

## Carry-over
- CI: B2 (widened DDL) + NETWORK-SKIP-GUARDS in flight -> dev-mcp-server. Verification gate = bun-test FAIL+ERROR count DROP vs 702 on subsequent push (router owns push).
- B1-MOCK-MODULE-EXPERIMENT: unblocked (prereq DONE) but DE-PRIORITIZED — 17 mock hits already refute cascade; re-run only as cheap confirm if WIP frees.
- CLASS-B-PERTEST-TRIAGE: PO per-test pass owed AFTER B2/network land (depends still cites B1 — non-blocking).
- Auditor commit-hygiene fix: maintenance lane (agents-architect + agent-father), not dev.
- Journal: sprint-CI-RED-RECONCILE-po.md steps po-S1..po-S11 (po-S11 = this tick, DJ-GATE-1).
- Foreign dirty files NOT touched (commit ONLY po-owned, explicit pathspec).
