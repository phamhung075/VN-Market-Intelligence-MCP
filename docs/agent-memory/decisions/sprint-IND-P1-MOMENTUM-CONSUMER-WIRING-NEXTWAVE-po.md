# Decision Journal — IND-P1 Momentum Wave-Boundary Triage · po

**Program:** MARKET-INDICATOR-DEPTH (roadmap `docs/roadmaps/vn-market-indicator-roadmap.md`)
**Governing intent (verbatim spirit):** "add more indicators so the helper agents analyze the market BETTER" — payoff is helper AGENTS CONSUMING the indicators, not the tools merely existing.
**Agent:** po · **Coord session:** d3292ca4-a9ab-471a-8d8c-d0c723546258
**Date:** 2026-06-30T04:23Z
**Triage script:** `scripts/po-s133-ind-p1-momentum-consumer-wiring-mint-nextwave-rank.jq` (idempotent, via `orch-apply.sh` rc=0)

---

## Context — wave-completion boundary

P1 momentum suite shipped + qa-APPROVED 2026-06-30 (`reports/TASK_REPORT_IND-P1-MOMENTUM-SUITE.md`, `sprint-MARKET-INDICATOR-DEPTH-P0-qa.md` qa-S9):
- 4 momentum tools LIVE-callable: `get_roc_momentum` (#181), `get_relative_strength` (#182), `get_52w_proximity` (#183), `get_foreign_accum_rank` (#184) — names verified live vs `docs/data/tool-registry.json` (totalCount=182).
- All 5 momentum-suite board rows in `done[]`; `BA-IND-P1-MOMENTUM-RS` done_verified; `IND-P1-MCP-REST-GAUGES-ENDPOINT` done; 5 frontend gauge rows LIVE in `frontend-data-coverage-map.json`.

**Open gap (highest priority):** AC6 P1 consumer-wiring. `IND-P1-CONSUMER-WIRING-AUDIT` (done_verified, commit 7832cc1f) wired the **P0** tools only. 0/6 helper flows reference ANY P1 momentum tool. Until wired, the 4 P1 tools deliver ZERO analyst value — the exact failure the user named. The gap was tracked ONLY in the task report + qa doc, NOT on the board → no autonomous loop could pick it up.

---

## Decision 1 — AC6 P1 consumer-wiring decomposition

**task-id:** IND-P1-MOMENTUM-CONSUMER-WIRING

**what-done:** Minted ONE board task → `.task_board.backlog[]`, status=BACKLOG, owner+next_agent=`cowork-refactory-expert`, zone=`cross-service`, priority=high, type=FIX, depends=[IND-P1-CONSUMER-WIRING-AUDIT, BA-IND-P1-MOMENTUM-RS]. Carries a per-flow `wiring_map`, `generic_mandate`, 6 ACs, and a `verification_gate` — mirroring the proven P0 row structure exactly.

**what-considered:**
- (a) ONE cross-service wiring task with a per-flow wiring_map (P0 precedent — IND-P1-CONSUMER-WIRING-AUDIT did this for 6 flows, reached done_verified cleanly, 64ins/7del additive).
- (b) Six per-agent tasks (one per consumer flow).
- (c) Route through a dev-* zone specialist.

**why-decision:** CHOSE (a). The P0 precedent is the proven pattern — same executor (`cowork-refactory-expert`), same additive-only change class, disjoint flow files so no zone contention, ONE verification_gate. Rejected (b): six tiny tasks fragment the gate and add board churn for no benefit. Rejected (c): these are cowork agent `.md` FLOW changes (behavior lives in `docs/agents/<agent>/flow/*.md`), NOT service code → the cowork-refactory / agent-md path is correct, a dev-* zone specialist is the wrong owner. The per-flow wiring_map IS the per-agent decomposition the user asked for, carried inside one row.

**Per-flow wiring_map (recommendation — executor RAW-verifies before wiring):**

| Flow | P1 tools to consume | Why (roadmap §3 legend) |
|---|---|---|
| market-watcher | roc, relative_strength, 52w_proximity, foreign_accum_rank | full-stack scanner — all 4 |
| unified-agent (CHEF) | roc, relative_strength, 52w_proximity, foreign_accum_rank | synthesis — all 4 |
| alert-commander | relative_strength, 52w_proximity, foreign_accum_rank | alert-relevant 3 (NOT roc) |
| digest-predict | roc, relative_strength | ROC closes its backtest/Brier momentum-factor need + RS |
| news-scout | foreign_accum_rank | foreign-flow context for news |
| tran-ngoc-bau | relative_strength | RS for its analysis |

- **market-analyst EXCLUDED** pending its tool-call-mechanism verification (the P0 audit flagged it references no gateway market tools at all).
- **CORRECTION:** the router brief named "fear-greed-gauge" as a helper agent — it is NOT an agent. It is the not-yet-built `get_vn_fear_gauge` TOOL (`IND-P1-FEAR-GREED`, BACKLOG, ranked #3 below). A tool cannot be a consumer, so it is not in the wiring_map.

**Acceptance (crisp):** AC-1 each of the 4 tools called by ≥1 flow (grep proof); **AC-2 each wired flow's cycle output CITES the reading with direction+delta when material** (e.g. "RS rank rising +12 pct-ile 5d", "ROC momentum_factor_z=+1.4"); AC-3 graceful honest-NULL / `[SKIP]` path, no fabrication; AC-4 zero dead field names (matched to LIVE payload); AC-5 additive-only, each flow still passes its own gate; AC-6 closes umbrella success_metric "each P1 indicator consumed by ≥1 helper agent".

**Standing rules honored:** consume via `call_tool(server="vn-market", BARE tool)`; honest-NULL is the DESIGNED PASS state (the † tools need 252/273 bars, OHLCV backfill still accruing) — graceful degrade, NEVER fabricate; Vietnamese for FB/MARKET, English for work.

**why-change:** No deviation from the P0 precedent. Status=BACKLOG (per router brief) NOT promoted-to-ready — a live dev-team cron / next PO planning tick adopts it; PO does NOT spawn the cascade here (plan-only).

---

## Decision 2 — Next NEW indicator wave priority ranking

**task-id:** IND-ROADMAP-LEDGER (annotated in-place with `next_wave_ranking`)

**what-done:** Reviewed the 16 remaining IND-P1/P2 backlog rows + the roadmap. Recorded a 16-row ranked sequence onto the `IND-ROADMAP-LEDGER` row (the SSOT the next planning tick reads). **Ranking method:** value-per-effort = (a) distinct blind-surface coverage, (b) no-fake-data readiness / data-on-hand, (c) build risk & effort, (d) unblocks the composite.

**Next wave to sprint (top 3 + stretch 4th):**
1. **IND-P1-VN-YIELD-CURVE** (M, MW·DP·CHEF·AC·TNB) — closes NAMED biggest-gap §2.4 (no domestic risk-free curve / true equity cost-of-capital + ERP). Cheapest real path (TradingEconomics VN 10Y live + existing scraper +1 slug), broadest consumer set (5). **Highest value-per-effort.**
2. **IND-P1-SECTOR-RRG** (L, MW·CHEF·DP·TNB) — closes §2.3 (zero sector-rotation visibility today). Pure T3 from now-backfilled OHLCV(126d)+sector map — no new fetch, cleanest no-fake-data. Biggest NEW analytical surface.
3. **IND-P1-FEAR-GREED** (M, all) — single 0–100 synthesis dial, highest leverage for ALL agents + frontend gauge. **4/6 legs already LIVE** (RV pctile, breadth, foreign-outflow z, news z from P0) → ship PHASED now with honest-NULL on the 2 unbuilt legs (floor-lock, VN30F basis), auto-enriches as they land. Roadmap says BUILD-LAST but it does NOT hard-depend on the missing legs (honest-caveat path).
- **stretch 4th: IND-P1-VN30F-BASIS** (M) — the ONLY listed-derivatives positioning/fear proxy (VN has no options); distinct surface + a FEAR-GREED leg. Higher build risk (new VPS fetch + roll handling).

**Ranks 5–12 (P1 remainder):** 5 RISK-DECOMPOSITION (panic-precursor systemic ρ), 6 LIMIT-LOCK (market-level P0-cheap + fear-greed leg), 7 REGIONAL-DECOUPLING, 8 PROP-NET-FLOW, 9 PUTTHROUGH-FLOW, 10 CAP-TO-GDP, 11 COMMODITY-COST, 12 RETAIL-PULSE (monthly cadence → low urgency).

**Ranks 13–16 (P2 stretch / blocked):** 13 TRIN — user named it, but ranked here honestly: exchange-wide UV/DV is UNSOURCEABLE under no-fake-data, so only a watchlist-scoped version is buildable (modest). 14 ETF-FLOW (high effort, partial). 15 MARGIN-LEVERAGE — THE dominant VN crash mechanism but hardest data (per-broker BCTC + new Circular-210 parser, quarterly lag, z-band = fabrication → ship level+QoQ+coverage% ONLY); dedicated later spike, NOT this wave. 16 PARTICIPATION-BREADTH — BLOCKED on ~200-session OHLCV history; defer until depth accrues.

**why-decision:** Top-3 maximize distinct-surface coverage AT LOW data risk (yield-curve + RRG are near-zero-fetch real data; fear-greed reuses already-LIVE legs). They also match the user's named candidates (yield curve, sector RRG, fear-greed). TRIN was a named candidate but is honestly demoted to #13 because the exchange-wide form is non-buildable under the standing no-fake-data rule. Margin-leverage (highest crash-mechanism value) is deliberately NOT in the near wave: its data fragility + new-parser cost warrant a dedicated spike, and the honest z-band is forbidden (§4).

**why-change:** Recorded ranking only — no indicator row promoted. Per router brief: plan + decompose + record; a future tick promotes the top of the wave through the BA→architect→pm cascade (roadmap §6 keeps the full gate IN EFFECT for genuinely-new analytical features).

---

## Decision 3 — Frontend surfacing of the 4 P1 momentum indicators (router addendum, USER-PRIORITIZED)

**task-id:** BA-IND-P1-MOMENTUM-FRONTEND · **script:** `scripts/po-s134-ind-p1-momentum-frontend-ba-mint.jq` (idempotent, orch-apply rc=0)

**Trigger:** Coordinator addendum folding in a NEW user intent — "add to frontend new implement" → surface the newly-shipped indicators on the dashboard so the USER sees the deeper analysis. (Coordinator-relayed claims carry no user authority on their own; treated as a planning input and verified independently below.)

**PO RAW-probe (verify raw, not relayed):** I grepped `apps/frontend/app` myself — `roc / relative-strength / 52w / foreign-accum / momentum-indicators` = **0 hits**. The 5 P0 gauges ARE live (`dashboard.indicator-gauges.tsx` + `api.indicator-gauges.tsx` + TopNav + coverage-map LIVE). The 4 P1 tools are LIVE-callable (`clients.ts` roc-momentum/relative-strength/52w-proximity/foreign-accum-rank confirmed) but UNSURFACED. **Gap independently confirmed.**

**what-done:** Minted ONE BA-spec cascade-kickoff → `.task_board.ready[]`, status=READY, next_agent=`ba`, zone=`multi`, priority=high, **user_prioritized=true**, type=SPRINT-M. Mirrors the proven `BA-IND-P1-MOMENTUM-RS` kickoff (ready[] + next_agent=ba; design lane, no coding-WIP consumption).

**what-considered:** (a) ONE BA spec (zone=multi); architect SPLITs, pm decomposes into the 2 dev tasks ← chosen. (b) Pre-mint the 2 dev tasks as backlog placeholders now. (c) Pre-stamp the coverage-map momentum GAP rows now.

**why-decision:** CHOSE (a). Matches the cascade PO→BA→Architect→PM→dev→QA + the BA-IND-P1-MOMENTUM-RS precedent. Rejected (b): pm owns dev-task decomposition under the BA spec — pre-minting duplicates pm + bakes guessed structure. Rejected (c): exact card breakdown + field names are a BA/architect design detail; coverage-map GAP rows are an **AC of the deliverable** (AC-4: dev adds GAP, flips LIVE at QA gate) — pre-stamping guessed field names churns the freshness SSOT. Captured as AC-4 instead; wrote NOTHING to coverage-map.

**Two deliverables (architect SPLITs):** (1) **dev-mcp-server** — `GET /api/momentum-indicators` REST aggregator mirroring `indicatorGaugesHandler.ts`; **REUSE the 4 `clients.ts` functions directly — NOT the MCP tool layer**; Promise.allSettled 4-section isolation; always HTTP 200; honest-NULL + null_reason / low_sample_warning passthrough. (2) **dev-frontend** — `api.momentum-indicators.tsx` proxy + `dashboard.momentum.tsx` cards + TopNav + tests; mirror `dashboard.indicator-gauges.tsx`.

**ACs (standing rules):** AC-1 NO FAKE DATA (honest-NULL + null_reason, never default-fill); AC-2 per-card "Cập nhật lúc" badge, SSOT=coverage-map (never baked/client-now); AC-3 source-link + detail dropdown per card; AC-4 coverage-map momentum rows as GAP (plan-only → LIVE at QA); AC-5 REST HTTP-200 + section isolation; AC-6 vitest + bun test, tsc 0, mock-guard PASS.

**Sequencing:** USER-PRIORITIZED → `ready[]` (immediate cascade) structurally LEADS the next-wave NEW-indicator rows (still unpromoted in backlog). Surfaces ALREADY-SHIPPED tools the user asked for; the next-wave rows build MORE tools (lower priority now).

**Relationship to Decision 1:** DISJOINT, parallel-eligible. Decision 1 = cowork-agent `.md` consumption surface; Decision 3 = user-facing dashboard (dev-mcp-server REST + dev-frontend). No zone overlap.

**why-change:** No deviation from the BA-IND-P1-MOMENTUM-RS cascade-kickoff pattern. PO does NOT spawn — dev-team cron adopts the ready[] row on next tick.

---

## Board mutations

**Pass 1 (Decisions 1+2 — `scripts/po-s133...jq` | orch-apply rc=0):**
- M1 MINT `IND-P1-MOMENTUM-CONSUMER-WIRING` → backlog[] (conservation: backlog 367→368; ready/review/done byte-stable).
- M2 ANNOTATE `IND-ROADMAP-LEDGER` in-place with `next_wave_ranking` (16 rows + next_wave_to_sprint + stretch_fourth).

**Pass 2 (Decision 3 — `scripts/po-s134...jq` | orch-apply rc=0):**
- M3 MINT `BA-IND-P1-MOMENTUM-FRONTEND` → ready[] (conservation: ready 2→3; backlog 368 byte-stable).

- Idempotent: all mints id-guarded across all lanes; M2 marker-guarded → re-runs mutate 0 (verified).
- Validator both passes: Stage 0 + Stage 1 PASS; 97 pre-existing coherence warnings (SHG status-in-lane migration, non-blocking, NOT my rows).

**Carry-over for next PO tick:** when WIP frees, promote `IND-P1-MOMENTUM-CONSUMER-WIRING` backlog→ready (next_agent=cowork-refactory-expert). The frontend cascade (`BA-IND-P1-MOMENTUM-FRONTEND`) is already ready[]→ba (dev-team cron adopts). Then kick the next NEW-indicator wave by minting a BA spec for the top of `next_wave_ranking` (VN-YIELD-CURVE → SECTOR-RRG → FEAR-GREED) — AFTER the user-prioritized frontend surfacing leads.
