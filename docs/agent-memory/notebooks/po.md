# PO Notebook

## Cycle 2026-05-31T10:04Z — ADJUDICATED ENV-ISOLATION 6 ODs + opened/seeded sprint (commit 55c22ef8)

**Mode: decision + sprint-seeding only (operator "PO decides"). No code.** Read both env-isolation briefs (`2026-05-31-fleet-env-isolation-architecture.md` 6e8f3d23 + predecessor `…-test-prod-data-isolation.md` 192f6c56). Ruling on all 6:
- **OD-A → same volume** (`.dev` filename boundary IS the guard; separate volume buys nothing for single-user).
- **OD-B → 5 tables** (`bctc_refined_units`,`bctc_table_rows`,`news_analysis`,`macro_evidence`,`agent_signals`) — all W-2 agent-synthesized; `agent_signals` feeds MARKET dishes. Audit-only `NOT NULL DEFAULT 'production'`, NO read-filter (zero drift).
- **OD-C → confirmed.** P1 now; P2 schema AFTER FU-TRUST-REFRESH (re-refine = first clean prod stamp). Hard gate.
- **OD-D → manual SOP** (script deferred). Single-user; rare promotion; doc the FK parent-before-child order.
- **OD-E → defer partial stack** (Cloudflare/port re-route too complex/unproven; full-replace sequential model).
- **OD-F → SPLIT.** P1 (compose tagging + script guards + SOP) ships now; P2 (assertion+schema+dev-compose) gated.

**Raw-verify before ruling (didn't trust brief):** `docker-compose.yml` — `market_data` mounted in ALL DB services (L12/80/122/154/185/219/286/317), `:ro` at L349; `APP_ENV` ABSENT everywhere (Phase 0 no-op default = current state); `COORDINATION_DB_PATH` not in compose (derived → make explicit, sound). `run-bt7-backfill.ts:16` hardcodes abs path w/ `readwrite:true` (W-4 confirmed); `purge-phantom-reports.ts:9` resolves `data/market.db` no guard (confirmed). Brief matches reality → GO.

**Sequencing honored:** FU-TRUST-REFRESH is OPEN, FU-1 DONE, **FU-2 NEXT** (re-refine NOT yet done). ENV-ISOLATION-P2 explicitly ⛔ until FU-4 sign-off — P2 must NOT jump ahead.

**Cap discipline:** TASKS.md cap=80 (`file-size-caps.json`); pre-existing 76L. Compressed my block to 5L (pointer to uncapped SPRINT_GOAL.md) → 83L. 3L residual = irreducible new-sprint cost; flagged for janitor closed-sprint prune. Did NOT trim other sprints' active records.

## Carry-over
- **First dispatch for router:** spawn **ops** for **EI-P1-1** (`APP_ENV: production` + explicit `COORDINATION_DB_PATH` in `docker-compose.yml`, additive, rolling `up -d`). Zero dependency, ships immediately.
- P1 parallel-safe: developer EI-P1-2 (`scripts/` guards) + EI-P1-3 (`docs/protocols/dev-environment.md`) can run alongside EI-P1-1.
- **P2 is GATED** — do NOT dispatch EI-P2-* until FU-TRUST-REFRESH FU-4 signs off. Watch for FU-4 EXIT before greenlighting dev-mcp-server EI-P2-1/2.
- ENV-ISOLATION full shape + acceptance + OD rationale live in `docs/SPRINT_GOAL.md` ENV-ISOLATION § (not TASKS, by cap discipline).
- task_claim schema = `task_kind`/`task_id`/`owner_agent` (NOT kind/key/agent_name); `commit-mutex` enum value now VALID (drift fix landed) — used it directly.
