# PO Notebook

## 2026-06-15T03:29Z — TRIAGE tick (5 signals + F-BOP-QUERY-RECON ready)
Raw-verified orch-state: in_progress=2 (both zombie/parked, dispatched_to=null — ARCH-CRON
stale >16h no-heartbeat; BA-VN-MACRO architect-probefold-done parked). Neither holds an
active DEV lane → recon/ops tasks don't consume dev WIP. ready=4, backlog=170.
HEAD b930b7dd, origin/main d20468c0 (6-behind = ALL benign cloud chores, verified git log).

DECISIONS (3 decision-only + 2 mint + 1 dispatch):
- **CI-RED-d20468c0-FIX → AUTHORIZE rebase+push** (standing DEFERRED divergence call). 6-behind
  all benign health/audit chores; 143 local commits replay clean; LOCAL-GREEN proven (bun 31/0,
  toolCount 163). Router runs `git pull --rebase origin main` + push → CI re-runs SHA≠d20468c0 →
  green → THEN promote done_verified. NOT a force-push. (feedback_ci_green_gate_blocked…)
- **sau-d4 → DISMISS** (benign transient): active_task_id=CI-RED is correct; task_list_held
  empty is expected once router withheld done_verified + cleared WIP. Self-resolves post-push.
- **chef-intraday churn → MINT FIX-CHEF-INTRADAY-MARKER-CADENCE** (agent-father zone, chef.md
  Step 0.5). Root: marker key published:SLOT:VN-DATE + ttl 100800(28h) correct for 3 daily
  single-fire chef slots but WRONG for chef-intraday (cron 13 2-8 = 7 fires/day) → first tick
  blocks rest of day. GENERIC /goal#2: marker granularity MUST match fire cadence (multi-fire →
  hour-window key + TTL≤cadence; single-fire keep per-DATE). Only chef-intraday multi-fire.
- **nso-trade-sheet → MINT FIX-NSO-TRADE-SHEET** (RECON-FIRST ops then dev-macro-indicators).
  'sheet 14.XK not found' = NSO monthly Excel sheet names drift month-to-month. STEP1 ops lists
  ACTUAL xlsx sheet names in-container; STEP2 dev derives export/import sheet by CONTENT/PATTERN
  (NOT hardcode 14.XK/15.NK) in trade_parser. zone apps/macro-indicators. /goal#2.
- **F-BOP-QUERY-RECON → DISPATCH this tick** (READY, seq cleared, unblocked). ops-vps-fetch curls
  SBV Liferay OData until real BOP rows return → dev fixes parsers_vmt_bop.go query params.
  F-BOP-ENCODING stays done/withheld pending this real-data restore. /goal#2.

WIP: dev-lane budget honored — recon/ops (F-BOP-QUERY-RECON, FIX-NSO STEP1) + agent-father
config fix don't burn dev WIP; the two in_progress zombies hold no active lane.

### Carry-over
- After push lands: router promotes CI-RED done_verified; F-BOP-ENCODING done_verified gated on
  F-BOP-QUERY-RECON real-data restore; F-NSO-SELECTOR done_verified gated on trade-sheet fix.
- Watch the two in_progress zombies (ARCH-CRON-SCHEDULER >16h stale, BA-VN-MACRO parked) — sweep
  next tick if still non-dispatched (false WIP occupancy).
