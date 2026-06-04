# Agent Father — Notebook

## c284 · 2026-06-04 — DSI-CONSUMER-HONORS-ISESTIMATE: carry provenance guard in chef + fb-market-poster

- Task: DSI-CONSUMER-HONORS-ISESTIMATE (P1). Root: consumers recomputed spread from raw fedFundsRate/vndDepositRate even after serve layer suppressed carrySpread=null + is_estimate=true.
- chef.md Step 6.5 L193: replaced hardcoded `FII_OUTFLOW_RISK`/`carry -33bp` example with neutral gap example. Added carry provenance rule: carry/FII narrative ONLY when `carry.is_estimate=false AND carrySpread!=null`; else insert `[gap: carry regime unavailable]`, never recompute from raw rate fields.
- fb-market-poster/flow/main.md STEP 1b: added `get_macro_snapshot` call + `$carry_usable` flag derivation. STEP 3 hard rules: added carry/FII provenance rule keyed on `$carry_usable`; blocks rate-differential + FII-outflow thesis when flag false.
- Size-justifications updated: chef.md 308→321L, fb-market-poster 465→489L.
- orch-state DSI-CONSUMER-HONORS-ISESTIMATE → DONE. head updated.
- Commits: see main commit.

## c283 · 2026-06-03 — NB-FLOW-SETTLED-WRITE: migrate APPEND-class consumers to AC-3 settled-write invariant

- Task: NB-FLOW-SETTLED-WRITE (HIGH, root-cause fix). Closes notebook-bloat class.
- Root cause: skill SSOT (NB-WRITE-ATOMIC 948b6ed0 + NB-SKILL-CAP 2b42931f) mandates compose-in-memory then ONE Write/Edit (AC-3). chef.md and 4 peers never migrated — still encoded forbidden append-then-trim multi-Edit sequence.
- Live evidence: chef ran 08:49Z after 06:12Z skill commit → appended onto 186L base → 219L → context-bloat backstop fired 08:52Z.
- Files changed (5 flow/handler files, commit 04b20c87):
  - `docs/agents/unified-agent/flow/chef.md` — Steps 8b-8e replaced with compose-in-memory (8b) + single settled Write (8c) + AC-5 sanity-only check (8d); size-justification updated 289→308L
  - `docs/agents/news-scout/flow/stage-log-notify.md` — Stage 4 notebook block migrated
  - `docs/agents/bctc-analyst/flow/stage-log-notify.md` — Steps 5a-5c migrated
  - `docs/agents/agents-architect/handlers.md` — Brief-Commit Invariant Step 2 migrated
  - `docs/agents/digest-predict/flow/monday.md` — P-6 notebook commit migrated
- Audit verdict (6 agents): fb-market-poster=CORRECT (OVERWRITE class, defers to skill); digest-predict daily/weekly/monthly=CORRECT (defer to cowork-end-cycle→skill); all 5 above=FLOW-ORPHAN now fixed.
- Commit: 04b20c87

## c282 · 2026-05-31 — Create cron-detect-loop skill (durability layer for anomaly-task-bridge)

- Change: Created `.claude/skills/cron-detect-loop/SKILL.md` (120L at cap) — session-start re-arm skill that idempotently registers 4 crons (dev-team `7 * * * *` + system-auditor Tier-1/2/3). Updated `CLAUDE.md` Skills section (+1 bullet for /cron-detect-loop). Added explicit `repair_task_request` routing row to `docs/agents/dev-team/flow/drain-signals.md` routing table (before "any other" fallback) — self-documenting the detect→plan bridge.
- Files modified: 3 (new skill + CLAUDE.md + drain-signals.md)
- Validation: 5/5 passed; Commit: 5b1b5574

## c281 · 2026-05-30 — Create refine_bctc_md (AR-AGENT-A, BCTC-AGENTIC-REFINE)

- Type: leaf subagent (Haiku runtime, Opus-authored one-time)
- Files created: 7 (.claude/agents/refine_bctc_md.md + init.md + 5 flow files)
- Registration: .claude/agents/refine_bctc_md.md created (CC registration); docs/ tree only
- Validation: 7/7 passed; Commit: d854e8ff
- Blocks: AR-AGENT-B (bctc-analyst retier + ESC-5 confidence column)
