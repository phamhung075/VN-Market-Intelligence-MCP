# Sprint 1951 Goal — COWORK MASTER SCHEDULER (REMOTE-TRIGGER MODEL)

**Status:** OPEN | **Opened:** 2026-05-18T17:50Z | **Theme:** Migrate the cowork pipeline (9 agents, 17 schedule slots) from per-agent session-scoped CronCreate blocks (F1 session-evaporation risk) to a fleet of 17 independent claude.ai RemoteTriggers driven by the SSOT file `docs/data/cowork-schedule.json`. SPIKE-1951a (closed 2026-05-18) resolved all three implementation gates: OQ-1 SUPPORTED (cron range+step `*/15 2-8 * * 1-5` accepted as one trigger — no decomposition needed), OQ-2 UNKNOWN but proceed empirically (workspace currently has 3 triggers; adding 17 → 20 total), OQ-3 ANSWERED (`RemoteTrigger` is a separate MCP tool with `action='create'`, env_id `env_011CV1yonRDFUhYhGEdkVwqj`, full body shape documented in brief §2.3). Phase 1 of the 5-phase rollout ships this sprint: create 17 RemoteTriggers, validate persistence, and verify smoke-test ticks. Phases 2-5 (agent .md schedule-block removal, watchdog wiring, last_fired observability, docs cascade) are out-of-scope for Sprint 1951 — they queue as separate sprints once Phase 1 holds for 24h.

# Goal

## Vision
Cowork pipeline persistence becomes immune to Claude Desktop session-evaporation: 17 independent claude.ai RemoteTriggers fire each cowork slot directly, no master dispatcher process, no SPOF, no implicit dependency on any single session staying alive. Operator gains a single SSOT file (`docs/data/cowork-schedule.json`) to inspect "is every slot wired correctly" — replacing fragmented `schedule:` blocks scattered across 7 agent files.

## Scope

**IN — Phase 1 only:**
- T1 (anchor, Size=M, agent-father zone): create 17 RemoteTriggers via `RemoteTrigger` MCP tool using exactly the `cron` + `trigger_prompt` fields from `docs/data/cowork-schedule.json`. One trigger per slot. Each trigger carries env_id `env_011CV1yonRDFUhYhGEdkVwqj`, mcp_connections=[vn-market], persist_session=false, model=claude-sonnet-4-6. Body shape per brief §2.3.
- T2 (validation, Size=S, agent-father zone): run the 24h validation window IN PARALLEL with existing agent .md `schedule:` blocks. Confirm at least 3 smoke-test ticks fire correctly with correct agent sessions launched (recommended: chef-morning 05:23, chef-eod 08:37, tnb-audit 20:13). Document smoke results in handoff note.
- T3 (gate verification, Size=XS, agent-father zone): close-session-and-reopen smoke test — verify all 17 triggers survive Claude Desktop session close (this is the entire point of the migration). One human-loop step.

**OUT — explicitly deferred to later sprints:**
- Phase 2 (remove `schedule:` blocks from 7 agent .md files) — separate sprint 1952 after Phase 1 holds 24h.
- Phase 3 (dev-team Step 0 watchdog wiring) — separate sprint 1953.
- Phase 4 (`last_fired` observability writes from chef/tnb/digest-predict flows) — separate sprint 1954.
- Phase 5 (docs cascade: system-map.json, agent-roster.md, ARCHITECTURE.md, cron-registry.json, cron-jobs.md) — separate sprint 1955.
- OQ-2 (max trigger-count per workspace): NOT a blocker for Sprint 1951; if API rejects trigger #18+, agent-father stops, reports count limit hit, and PO opens follow-up spike. Otherwise proceed empirically.

## Success Metric (AC composite — Phase 1 only)

- **AC-1 (coverage):** All 17 slots in `docs/data/cowork-schedule.json` have a corresponding live RemoteTrigger in claude.ai. Zero slots missing. Trigger names match `slot_id` 1:1. Verified by: `RemoteTrigger action=list` returns ≥20 triggers (3 pre-existing + 17 new) with names containing each `slot_id`.

- **AC-2 (cron parity):** Each created RemoteTrigger `cron_expression` matches the `cron` field of its source slot exactly — including range syntax (`2-8`), step syntax (`*/15`), and weekday lists (`1-5`). Zero cron drift between SSOT file and live triggers. Verified by: for each slot, RemoteTrigger config `cron_expression` === `cowork-schedule.json` slot.cron.

- **AC-3 (prompt parity):** Each created RemoteTrigger `job_config.ccr.events[0].prompt` matches `trigger_prompt` from its source slot exactly. Verified by: spot-check 3 triggers (chef-morning, news-scout-market, alert-commander-market).

- **AC-4 (smoke success):** At least 3 RemoteTrigger ticks fire correctly during the validation window (24h post-T1) with the correct agent session launched and a notebook + WORK trace evidencing the firing. Recommended: chef-morning 2026-05-19T05:23Z, chef-eod 2026-05-19T08:37Z, tnb-audit 2026-05-19T20:13Z.

- **AC-5 (session-persistence — the whole point):** All 17 RemoteTriggers survive a Claude Desktop session close. Operator (or agent-father remote MCP call) verifies via `RemoteTrigger action=list` after a session close+reopen cycle. None are session-scoped.

- **AC-6 (no parallel-run regression):** During the 24h validation window, existing agent .md `schedule:` blocks remain active (Phase 2 has NOT run). Worst-case outcome = double-firing of a slot (one CronCreate + one RemoteTrigger). Chef/TNB are idempotent on slot/cycle args; double-fire produces duplicate WORK lines but does NOT corrupt MARKET output. AC-6 PASS if no MARKET duplicate dish is published in the 24h window. AC-6 FAIL if any chef double-publishes a MARKET dish — in that case, Phase 1 rolls back (delete the 17 new triggers) and PO opens an idempotency-guard spike.

## Pre-conditions (all CLEARED)
- SPIKE-1951a closed 2026-05-18: OQ-1 SUPPORTED, OQ-2 UNKNOWN (non-blocking), OQ-3 ANSWERED.
- Architect brief v2 READY at `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md`.
- SSOT file READY at `docs/data/cowork-schedule.json` (17 slots, `_notes` populated with SPIKE-1951a findings).
- WIP=0 prior to dispatch. No other sprint contends for `agent-father` zone.

## Risks (carried from brief §9 — Sprint 1951 lens)
- **R1 — OQ-2 (trigger count limit) hits during creation.** Mitigation: agent-father stops on first 4xx error, reports trigger count at failure point, returns partial-success handoff. PO opens follow-up spike. Likelihood: LOW (no documented limit; 20 is small).
- **R2 — Double-firing causes duplicate MARKET dish.** Mitigation: AC-6 is the rollback gate. Chef.md already idempotent per slot/cycle (Sprint 1949 design); but if a regression slipped, this catches it. Likelihood: LOW.
- **R3 — Smoke window misses (e.g. chef-morning silent at 05:23 not because of trigger but because chef.md regressed).** Mitigation: T2 reports both trigger-side success AND agent-side dish success separately, so failure is attributable. Likelihood: LOW (chef pipeline shipped clean in Sprint 1950).

## Sprint 1951 maintenance (independent of Phase 1, parallel-dispatch OK)
Three Sprint 1950 follow-on MAINT items remain in Backlog at LOW priority. They do not depend on the master-scheduler migration and can drain in parallel:
- **MAINT-1950b** — archive 5 oversized agent notebooks (>200L cap). Token economy win.
- **MAINT-1950c** — semble-search `model:` YAML field + orphan news-scout-cycle notebook cleanup.
- **MAINT-1950d** — workflow-map.md L103 stale "monday predict" residue sweep.

These can be dispatched concurrently with PM Sprint 1951 planning. They consume only 1 WIP slot (agent-father, three sequential XS-S edits) — combined with Sprint 1951 PM planning slot, total WIP = 2 (at the cap).

## Deferred to follow-on sprints
| Item | Reason | Trigger |
|------|--------|---------|
| Phase 2 — strip `schedule:` blocks from 7 agent .md | Risk-mitigation: keep parallel-run as safety net during validation | Sprint 1952, after Phase 1 holds 24h with zero regression |
| Phase 3 — dev-team watchdog wiring | Detection layer, not core migration | Sprint 1953 |
| Phase 4 — last_fired writes | Observability layer | Sprint 1954 |
| Phase 5 — docs cascade | Documentation sync | Sprint 1955 |
| 1948 closed-loop auto-improvement | Gate-blocked until 2026-05-20T07:22Z (post-1945 scored_pct gate) | Sprint 1948 unblock cycle |
| 1948e-C (PC1 watchlist add) | Optional, deferred per c195 PO decision | Schedule after 1948a/b/c clear |
