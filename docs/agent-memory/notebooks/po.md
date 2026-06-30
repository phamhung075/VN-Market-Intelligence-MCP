# PO Notebook

_Last: 2026-06-30T06:50Z_

## Tick 06:37Z — dev-team triage: CHEF double-publish → FIX (recurring root)

**Inbox:** no new Telegram reports, list_unresolved=[], head IDLE. 1 NEW signal_queue row + 4 drained pendingSignals.

**CHEF double-publish (cow-20260630T0515-chef-doublepublish, MEDIUM) → minted `FIX-COWORK-CHEF-SAMETICK-MUTEX` (backlog, S, zone cross-service/).** RAW-verified vs payload + 06:21Z update:
- Root = (a) `stale_warning=true` (DETERMINISTIC, correct — snapshot >20min old) forces legacy mode → `CADENCE_MATCHES=raw MATCHES` no-filter (pressure-cadence.md 4.5b) → cadence gate bypassed; (b) no same-tick CHEF mutex (per-slot markers never collide).
- **Fix = A (unconditional same-tick CHEF mutex, BOTH modes), NOT C (stale_warning is correct lever — do not touch).**
- **RECURRING:** chef-evening (po-s90) + chef-intraday (c53a7df5→FU-CHEF-MARKER-INFLOW DEFERRED, never shipped). No durable fix ever landed → this consolidates them; FU-CHEF-MARKER-INFLOW folds in.
- **Routing:** dispatch table "update cowork agents → cowork-refactory-expert → main". Maintenance-lane (NOT dev-cron auto-adopt) → minted to backlog[] dispatcher=main, BATCH route_to=cowork-refactory-expert (po-s109 dead-route guard). Signal NEW→TRIAGED.

**Skipped/noted:**
- signal #4 stale_warning drift = SAME root as above → no separate task.
- context-bloat ba.md(210/+10)/pm.md → NOTE only; HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING done_verified → self-cap on next write; per-agent mint = treadmill (warned against).
- cowork-fire heartbeats (errors=[]) → informational.
- Stale branch `ci-red-fix-buntest` (0 unmerged commits) → CLEAN→qa (low), returned in BATCH.

## Carry-over
- **FIX-COWORK-CHEF-SAMETICK-MUTEX** (backlog, dispatcher=main) awaits router dispatch to cowork-refactory-expert. Verification gate: next weekday 05:15Z coincidence tick → exactly ONE CHEF dish; forcing stale_warning=true no longer double-posts. Closes cowork-cron AC-6.
- **FIX-BCTC-BANK-SCALAR-MAPPING** (high, BACKLOG, zone=multi) still next-up reliability fix — promote on dedicated BCTC grooming tick (overfit risk → fresh spec).
- 2 legit bctc ESC-3 locks live (VCB exp 07-06 / FPT exp 07-02) — expected, do not release.
- Detail → `decisions/triage-20260630T0637Z-po.md`.
