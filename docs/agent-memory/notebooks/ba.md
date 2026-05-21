# BA — Notebook

**Last updated:** 2026-05-21T20:20Z | **Sprint:** 1967 (c1)

> Archive: `docs/archive/notebooks/ba-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Current state (2026-05-21) — Sprint 1967 orchestration audit decomp

REQ_1967.md written. 7 atomic REQs (one per surface 1-7), NFR-1..5, 0 PO blockers.
Signal: `docs/signals/ba-1967a-spec-ready.json`. NEXT: PO approval → po-1967-ba-approved.json → architect 1967b.

Key decisions:
- Surface 4f (signal payload pointer) + Surface 6b (trigger:startup) flagged as cross-sprint with 1968 L-3/L-1/L-2 — evidence input only, fix authority stays in 1968.
- Superseded architect brief (ae9649866b992cb41, 13 findings) treated as supplementary evidence.
- No PO blockers. Glossary section added for race, idempotency, recursive spawn, dispatcher-wrap, CAS, dead-handoff, stale-race.

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together (tightly coupled).
- globalSourceTracker is a globalThis singleton — test isolation issues common; check _resetGlobalSourceTracker() in beforeEach.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- Error format in all MCP tools: `{ error: '...' }` JSON, never throw.
- SBV portal DOWN; rates from VCB XML proxy — tier 2.
- apps/macro-indicators is standalone Hono service on port 5004, NOT part of mcp-server.
- TASKS.md 80L cap: always check wc -l before adding rows.

## Carry-over (next session)

- 1967b architect brief — surfaces confirmed, await PO approval signal
- 1948e-fix: `"legal_risk"` to SignalTypeSchema enum + stage-signals.md dispatch block (6h dedup guard)
- 1909b (get_bctc_ocf): sequence AFTER 1890a-B — shared agentBootstrap/SKILL_MANIFEST merge risk
