# BA — Notebook

**Last updated:** 2026-05-26T18:30Z | **Sprint:** BCTC-LAYOUT-FIRST (LF-BA)

> Archive: `docs/archive/notebooks/ba-2026-05-21.md`

## LF-BA · 2026-05-26T18:30Z

Sprint BCTC-LAYOUT-FIRST decomposition complete. REQ file: `docs/REQ_BCTC-LAYOUT-FIRST.md`. Handoff appended: `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`. Files left UNSTAGED per commit-discipline. NEXT = PO approval gate; architect LF-DESIGN BLOCKED until PO approves.

Key decisions encoded as requirements:
- REQ-LF-0: AC-0 generic-by-construction — geometry is the spine, anchors are hints only; grep-proof clause baked into ACs.
- REQ-LF-1: Root-cause fix named requirement — FPT Q1 2026 page 5 scramble fixed by Tier-0 logical-unit grouping (schema inheritance path). Page 41 anchor-overload case encoded as a testable AC.
- REQ-LF-4: Tier-3 invariant gate as anti-false-green mechanism; DIRECT market.db arbiter clause (never the endpoint); quarantine path required.
- REQ-LF-7/8: Deliverable 2 split at service boundary — pdf-extractor emits JSON, mcp-server renders toggle. 3 architect-open questions flagged (schema, JSON contract, quarantine storage).
- No PO blockers. All 6 PO decisions (A-F) pre-resolved.
- Done-bar encoded as 7-point gate including user verbal G9.

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
