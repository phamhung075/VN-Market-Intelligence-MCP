# PO Notebook

_Last: 2026-07-02T06:30Z_

## Tick 2026-07-02T06:07Z — dev-team triage (coord d3292ca4): 7 reports resolved, ARCH-DASH → WIP

**Reports — all substance already board-tracked → resolved + channel cleaned, NO new mint:**
- 3368 bctc non-bank total_assets=0 (VHM/REE/VIC/VNM/VRE/POW Q1-26 OCR fail) → DUP of `SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO` (backlog high, dev-mcp-server, zone apps/mcp-server).
- 3369 auditor B-05 bctc-discover stale 21711min / 38 pending / vn-bctc-fetch 15d → DUP: root fix `FIX-BCTC-ENRICHER-STUCK-BACKLOG` (in_progress, USER-GATED rebuild) + `B-05-FU-ENRICHER-LIVENESS` DONE. Downstream of user-gated rebuild — no new task.
- 3372 Tier-3 → DUP: C-06=`FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE`, C-11=`FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE` (broken predicate = always-false FP), size-cap root=`FIX-COLDEVICT-TERMINAL-VOCAB-CANONICALIZE`+`FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT` (54 terminal rows stuck in done[]). Size-cap = ctx-bloat on LIVE board → DEFER in-flight, plan-only, NO prune this tick.
- 3384 OHLCV-DEPTH VPS backfill stall (BDI/DLC/JSH/SIS/VDC non-watchlist) → DUP of `OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST` (backlog low, ops, infra-vps).
- 3385 A-30 mem 82.66% → duplicate (known-pinned, fix d9280133, rebuild user-gated). 3386 A-12 FAIL → wontfix (router probe refuted: 4000/health=200, 3001=200, docker-healthy). 3387 dev-team correction → wontfix (informational).

**Board (orch-apply rc=0, 100 pre-existing SHG coherence warns, 0 new):** promoted `ARCH-DASH-CRON-RECHECK-TABLE` ready→in_progress + head=in_progress/architect (user-prioritized SPRINT-M > internal SPRINT-S; BA handoff `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md` ready). WIP 2/2. `TOKEN-ECONOMY-TICK-PREFLIGHT` stays ready (next up). No tasks minted — every report already covered.

## Carry-over
- WIP 2/2: `FIX-BCTC-ENRICHER-STUCK-BACKLOG` (user-gated rebuild) + `ARCH-DASH-CRON-RECHECK-TABLE` (architect SPLIT dispatching). No more promotions until a slot frees.
- ONE operator `up -d --build mcp-server` clears: A-30 mem + FIX-BCTC-ENRICHER deploy + bctc-discover staleness (3369). Do NOT work around / re-mint.
- `SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO` (high, backlog) = next coding-lane candidate once WIP frees + rebuild lands.
- Size-cap breach (task_board 85/80, sprint_goal 26/15): root = cold-evict not clearing 54 terminal done[] rows; tracked (COLDEVICT / SPRINT-GOAL-EVICT). DEFER prune while board in-flight.
- `TOKEN-ECONOMY-TICK-PREFLIGHT` next in ready — router dispatches architect when a WIP slot frees.
