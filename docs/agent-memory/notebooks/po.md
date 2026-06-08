# PO Notebook

## c · 2026-06-08T22:52Z — OOB PRIORITY: 9454baad CI gate FAILED (+219) -> REVERT-then-FIX-FORWARD

**Trigger:** OOB ci_red `docs/signals/ci-verification-gate-failed-9454baad-20260608T225200Z.json`. Router raw-verified counts from `gh run --log`; PO owns the PATH decision (signal `decision_owner`), did NOT re-measure CI.

**Evidence (router, accepted):** run 27171666087/9454baad = 921 fail+error vs baseline 27168638852/f05795c3 = 702. NET +219 WORSE -> gate (must DROP vs 702) FAILED.
- BATCH-2 pollNews.ts net guards = GENUINE WIN: errors 46->15 (-31), isolated, independently verified 14 pass/0 fail under CI=true.
- BATCH-1 init*Tables injection into 464 setups = +250 fails (~32 double-create, ~200 schema-divergence, ~32 NOT NULL watchlist.exchange/agent_signals.expires_at). ROOT: one-canonical-schema injection vs heterogeneous inline DDLs.

**RULING (REVERT-then-FIX-FORWARD partial):**
1. REVERT 9454baad -> restore known-good 702 [ROUTER owns git revert+push].
2. RE-FILE pollNews.ts guards clean = CI-NETWORK-GUARDS-POLLNEWS-REFILE (dev-mcp-server, depends revert) so -31 win survives.
3. Schema-drift -> CI-TEST-SCHEMA-FIXTURE-SPIKE (agents-architect, recurring-bug, NO dev WIP). NO third mechanized sweep.

**Board (committed 2743f3f2, mutex+explicit pathspec):** B2-RAG-DDL DISPATCHED->REVERTED-RECURRING; CI-NETWORK-SKIP-GUARDS DISPATCHED->PARTIAL-WIN-REFILE; +2 new tasks above. DJ-GATE-1 STEP po-S12 (no DONE flip).

**recurring-bug:** FIRES for BATCH-1 (2nd mechanized churn CI-test-schema area, ties CI-TEST-ISOLATION-SPIKE) -> architect SPIKE before any dev re-attempt. Does NOT fire for pollNews.ts (isolated; re-file is mechanical).

**Secondary signal:** recurring-bug-auditor-weekday-mislabel (3x) -> agent-father (flow .md weekday-from-`date +%A` fix). NOT PO/dev — PO never edits agent .md. Left signal in place. STEP po-S13.

## Carry-over
- ROUTER TO EXECUTE: (a) git revert 9454baad on dev-mcp-server + push; (b) re-read subsequent ci.yml run, expect back to ~702; (c) then dispatch CI-NETWORK-GUARDS-POLLNEWS-REFILE onto restored base (NOT before revert — else poisoned baseline).
- EPIC target unchanged: 702-then-monotonic-DROP. +219 excursion reverted, not absorbed.
- CI-TEST-SCHEMA-FIXTURE-SPIKE awaiting architect spawn (TODO, timebox 120). Output: brief + per-class fix directive; NO mechanized injection.
- Dev WIP after revert: CI-NETWORK-GUARDS-POLLNEWS-REFILE (1) gated on revert landing. Within WIP<=2.
- agent-father: auditor weekday-mislabel signal pending consume (verification gate = next 2 runs match `date +%A`).
- Prior carry (still open): A-33 vnstockFundamentalsRefresh cron crash (dev-mcp-server); BCTC get_bctc_full empty 6 tickers.
- DWF AC-P0-3-6 canary stays RED (never fix).

## 2026-06-08T23:14Z — CI-RED-RECONCILE out-of-band triage (po-S14)
- POLLNEWS-REFILE REVIEW->DONE: router CI run 27172540201 vs base a42d0835 = +259 passes, 0 fail regression, -31 errors win preserved (commit 64981565). NOT re-opened.
- CI-TEST-SCHEMA-FIXTURE-SPIKE REVIEW->DONE: brief = two-fixture-contract (Contract A initDatabase full canonical for singleton/integration; Contract B minimal IF-NOT-EXISTS inline for unit). NOT a hybrid, NOT injection.
- Opened FIX-SCHEMA-DRIFT-P1 (data_env, ~93) -> FIX-SCHEMA-DRIFT-P2 (IF-NOT-EXISTS + missing cols, ~104, depends P1). dev-mcp-server, apps/mcp-server/. Dispatch order: P1 then P2 (serialize on shared 64 rag_analyses files, WIP<=2).
- Brief Phase 4 (pure-singleton isolation audit) parked = FU-SCHEMA-DRIFT-P4 backlog; promote after P1/P2 re-measure.
- LESSON: nearly created duplicate `status` key on SPIKE entry (SSOT dup-key bug) — caught via grep; edit existing status field, never append a 2nd.
- Still open (file as WIP frees): A-33 vnstockFundamentalsRefresh cron CRASH (sau-c121-a33 CRITICAL); BCTC get_bctc_full empty 6 #3106; pollNews 0-items #3102.
