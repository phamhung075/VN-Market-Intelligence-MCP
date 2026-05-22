# BA — Notebook

**Last updated:** 2026-05-22T05:10Z | **Sprint:** 1968d (c250)

> Archive: `docs/archive/notebooks/ba-2026-05-21.md`

## c250 · 2026-05-22T05:10Z

Sprint 1968d decomposition complete. 3 handoff files emitted (P01/P02/P03). 3 TASKS.md rows added. Signal: `docs/signals/ba-1968d-spec-ready.json`. NEXT: po spec review.

Key decisions:
- P01 (L-10 delta-read): 2-file scope (skill + qa/developer flows). Backward compat via full-read fallback on missing anchor or >24h stale. Anchor format `## §N-slug`.
- P02 (L-12 notebook diff-write): 1-file scope (skill only). 3-cycle retention, prune oldest via Edit, blank-state fallback. 200L file bound post-write.
- P03 (L-14 zone caveman): 1-file scope (caveman skill only). Additive-only, no base-tier modification. BCTC zone entry marked FROZEN-NFR3. Gated on P01+P02 QA APPROVED — anchor convention from P01 may appear in P03 examples.
- All 3 tasks: owner=agent-father, zone=`.claude/` only, no apps/* collision with active 1971/1970/1972. WIP cap honored.
- No PO blockers identified.

## c1 · 2026-05-21T20:20Z

Sprint 1967 orchestration audit decomp. REQ_1967.md written. 7 atomic REQs, NFR-1..5, 0 PO blockers.
Signal: `docs/signals/ba-1967a-spec-ready.json`.

Key decisions:
- Surface 4f + 6b flagged as cross-sprint with 1968 L-3/L-1/L-2 — evidence input only.
- Superseded architect brief treated as supplementary evidence.
- Glossary section added (race, idempotency, recursive spawn, dispatcher-wrap, CAS, dead-handoff, stale-race).

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together (tightly coupled).
- globalSourceTracker is globalThis singleton — test isolation: check _resetGlobalSourceTracker() in beforeEach.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- SBV portal DOWN; rates from VCB XML proxy — tier 2.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- TASKS.md: always check wc -l before adding rows. Current ~150L post-1968d rows.

## Carry-over (next session)

- 1968d agent-father wave 1 in flight after PO approval — watch for qa-1968d-p01-done.json + qa-1968d-p02-done.json to gate P03 dispatch
- 1967b architect brief — surfaces confirmed, awaiting PO approval signal
- 1948e-fix: `"legal_risk"` to SignalTypeSchema enum + stage-signals.md dispatch block (6h dedup guard)
- 1909b (get_bctc_ocf): sequence AFTER 1890a-B — shared agentBootstrap/SKILL_MANIFEST merge risk
