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
