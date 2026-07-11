# BA Requirement Spec — ANALYSIS-QUALITY-CONVERGENCE

**Sprint:** ANALYSIS-QUALITY-CONVERGENCE (`sprint_goal` active, created 2026-07-11T07:22:56Z)
**BA task:** BA-ANALYSIS-QUALITY-CONVERGENCE
**Status:** SPEC COMPLETE
**Author:** ba
**Date:** 2026-07-11
**NEXT:** agents-architect — split FR-1/FR-2/FR-5 (flow-doc wiring, no new code) vs FR-3 (multi-zone dev-mcp-server+dev-frontend) vs FR-4 (skill authoring)
**Zero PO blockers.** All open items below are sequencing/technical, resolved by BA live-probe or already tracked elsewhere — none require a product decision only PO can make.

---

## 0. BA Live-Probe Findings (2026-07-11, RAW-verified — live gateway + docker exec against named-volume `market.db`)

These supersede stale notes on the subsumed backlog rows. Do not re-derive.

**0.1 OHLCV depth gate is SATISFIED (was the hold reason on IND-P1-MOMENTUM-CONSUMER-WIRING).**
`daily_ohlcv` now carries 750-762 bars/code across 1461 codes (probed live: `SELECT MAX(n) FROM (SELECT code,COUNT(*) n FROM daily_ohlcv GROUP BY code)` → 762). This clears the 252/273-bar requirement for the † P1 momentum family. Live tool calls confirm real (non-null) output for `get_roc_momentum`, `get_relative_strength`, `get_52w_proximity` (e.g. FPT: `roc=-0.401, z_score=-1.137, decile=1, label=MOMENTUM_LAGGARD`). **The `held_by:"po-s135"` hold on IND-P1-MOMENTUM-CONSUMER-WIRING no longer applies to these 3 tools** — only to the 4th (§0.2).

**0.2 `get_foreign_accum_rank` is still empty — DEFER wiring this ONE tool.**
Live call returns `{"tickers":[],"foreign_accum_z_market":null}` (no per-ticker rows at all, not honest-NULL-per-ticker). Root cause: `FIX-FOREIGN-FLOW-COVERAGE` (status `REVIEW`, code shipped 2026-07-09, `rebuild_required:true`) — the mcp-server container is still on the pre-change image (ops-gated swap, `feedback_container_swaps_user_gated.md`). Wire the other 3 P1 tools now; wire this one after that rebuild lands.

**0.3 `get_insider_sentiment` is wireable but currently near-zero value — ship anyway (honest-NULL), cross-reference known cause.**
Live call (FPT and market-wide) returns all-null with `null_reason:"INSUFFICIENT_DATA: no valid buy/sell transactions in 90d window"`. DB probe: `insider_transactions` table = **0 rows**. Root cause already tracked: `FIX-VPS-SSC-INSIDER-502` ("VPS proxy HTTP 502 on ssc-insider upstream", BACKLOG/TODO, decoupled from BA-PREDICTION-EVIDENCE-REVIVAL). Do not re-diagnose. Wiring still ships per the honest-NULL-is-designed-pass-state precedent (`IND-P1-MOMENTUM-CONSUMER-WIRING` generic_mandate) — it just won't show visible signal until that upstream fetch is restored.

**0.4 Full 9-tool × 6-flow coverage matrix (grep ground truth, bare tool name in flow `.md` tree):**

| Agent flow | Wired today | Gap this sprint targets |
|---|---|---|
| unified-agent (`chef.md`) | 4/9: volatility, foreign_room, sentiment_index, breadth_thrust | + roc_momentum, relative_strength, 52w_proximity, insider_sentiment |
| bctc-analyst (all stage files) | **0/9 — total silo**, no gateway market-data tool call of any kind (only `record_evidence_fragment`/`task_claim`/`task_release`) | + insider_sentiment (only roadmap-mapped tool for this agent) |
| market-watcher (`cycle.md`) | 2/9: volatility, breadth_thrust | + foreign_room, sentiment_index (P0 gap — roadmap legend lists MW as intended consumer of both, never wired), roc_momentum, relative_strength, 52w_proximity |
| news-scout (`stage-sentiment.md`) | 1/9: sentiment_index | + insider_sentiment |
| digest-predict (`daily-predict.md`) | 2/9: volatility, breadth_thrust | + foreign_room, sentiment_index (P0 gap), roc_momentum, relative_strength (closes DP's backtest/Brier momentum-factor requirement per roadmap §3) |
| market-analyst (`main.md`) | 4/9: volatility, foreign_room, sentiment_index, breadth_thrust — **live-confirmed correct `call_tool(server="vn-market",...)` mechanism with graceful degrade** | + relative_strength, 52w_proximity (BA-recommended extension; see §0.5) |

`get_foreign_accum_rank` excluded from the ADD column everywhere per §0.2 (all 6 flows: DEFER).

**0.5 `market-analyst`'s prior exclusion note is STALE.** `IND-P1-MOMENTUM-CONSUMER-WIRING`'s `wiring_map_rationale` excluded market-analyst "pending its tool-call-mechanism verification (P0 audit flagged it references no gateway market tools)". Live read of `docs/agents/market-analyst/flow/main.md` (lines 74-80) shows 4 P0 tools already wired via the correct `call_tool(server="vn-market", tool="...", arguments={})` pattern with an honest `[SKIP] <tool_name> unavailable` degrade path. That gap has since closed (unrelated prior work) — market-analyst is now IN SCOPE for the P1 extension, not excluded.

**0.6 GAP-CHEF-SYNTHESIS-A is code-shipped but UNVERIFIED live — B genuinely has nothing to serve yet.**
`chef.md` Step 7.6 (PERSIST SYNTHESIS, writes `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json`) exists in the flow file. Live disk check: **zero matching files exist** (`docs/data/unified-agent-synthesis-*.json` → no matches). `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` is `REVIEW`, `review_gated_by:"live-cycle-verification"` — still open, not re-scoped here. `GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD` (subsumed into this sprint) is correctly `blocked_by` A in the board already; this finding confirms the gate is still accurate, not stale.

**0.7 CCATO-T2 (the shared skill CCATO-T3 depends on) does not exist yet.** `.claude/skills/claim-truth-gate/SKILL.md` — file not found. `CCATO-T2-CLAIM-TRUTH-SKILL` is `BACKLOG`, never started. `CCATO-T3-FLOW-WIRING-6PT` (subsumed into this sprint) hard-`depends`s on it. **FR-4 (build T2) must ship before FR-5 (wire T3) can start.**

**0.8 Naming collision — two different "6 flows".** CCATO-T3's 6 target flows (fb-market-poster, CHEF, market-watcher, alert-commander, digest-predict, tran-ngoc-bau) are a **different set** from this sprint's 6 analysis-agent flows (unified-agent/CHEF, bctc-analyst, market-watcher, news-scout, digest-predict, market-analyst). They overlap on exactly 3 (CHEF, market-watcher, digest-predict); diverge on bctc-analyst/news-scout/market-analyst vs fb-market-poster/alert-commander/tran-ngoc-bau. Architect must not conflate the two when scoping FR-5.

**0.9 Tool response shape.** `get_roc_momentum` / `get_relative_strength` / `get_52w_proximity` / `get_foreign_accum_rank` return a full-universe `tickers[]` array regardless of any `symbol` argument passed (live-confirmed — passing `symbol:"FPT"` still returned ~40 tickers). Wiring code must filter client-side for the ticker(s) of interest; do not assume a single-ticker response shape.

---

## 1. Functional Requirements — Phase-1 (build scope)

### FR-1 — Consumption wiring, 6 analysis-agent flows — DDD layer: **interface**
Zero new domain/application/infrastructure code — the indicator computation, persistence, and MCP tool contract already exist and are LIVE (verified §0). This FR is pure interface-layer consumption: wire the gateway `call_tool` calls per the §0.4 table into each flow's existing indicator-gathering step (anchors: `chef.md` Step 0 GATHER / Step 3 / Step 4; `market-watcher/cycle.md` Step "2. Market indicators"; `digest-predict/daily-predict.md` P-3/P-4; `market-analyst/main.md` "Call P0 indicator tools at session start" block; `news-scout/stage-sentiment.md` ~L32; `bctc-analyst` — anchor candidate `stage-analyze.md` "E1+E3 Multi-Pass Trick Detection" or `stage-consolidate.md` Step 5 "Write trick_summary", architect to pin exact insertion). Mirror the proven additive-only pattern from `IND-P1-CONSUMER-WIRING-AUDIT` (done_verified, commit 7832cc1f).

### FR-2 — CHEF numeric-fabrication gate extension — DDD layer: **interface**
`chef.md` Step 6.7 Rule AF-1 currently enumerates only 5 blocked numeric-indicator classes (RSI/MACD/BB/MA/σ) with a regex self-check (Step 6.7 Pre-Publish). It does **not** cover the new numeric families FR-1 introduces (`roc`/`z_score`/`decile`, `rs`/`percentile`/`composite_score`, `pct_from_52w_high`/`pct_from_52w_low`, insider `net_sentiment_score`). Without this extension, FR-1's wiring reopens the exact fabrication vector `FIX-CHEF-FABRICATED-TA-NUMBERS` was built to close (CHEF could cite "momentum z-score +1.4" with no in-cycle tool source). Extend Rule AF-1's indicator-class list and the Step 6.7 blocked-token regex to cover these 4 new families.

### FR-3 — GAP-CHEF-SYNTHESIS-B endpoint + card — DDD layer: **infrastructure** (JSON file read) + **application** (mcp-server endpoint handler) + **interface** (frontend card)
`GET /api/cheb-synthesis` (or fold into `/api/market-digest`) reads `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json` with a `data_asof`/`generatedAt` field (reuse `sectorRotationHandler.ts` pattern); frontend card surfaces conviction calls, sector phases, regime, known_gaps. **Sequencing: do not start dev work until §0.6's gate clears** (>=1 real synthesis JSON exists on disk, i.e. `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` closes its live-cycle verification) — that closure is tracked separately, not re-scoped by this spec.

### FR-4 — CCATO-T2 shared claim-truth-gate skill (prerequisite) — DDD layer: **interface** (skill wraps the already-built `narrative-truth-gate.sh` infrastructure)
Build `.claude/skills/claim-truth-gate/SKILL.md`: invocation contract (`post_body`/`agent_id`/`cache`), self-correct in-cycle protocol, time-sensitivity override for real-time agents, PASS-on-null honest-NULL note. Per §0.7, this is a hard prerequisite for FR-5 — does not exist today.

### FR-5 — CCATO-T3 6-flow wiring (sequenced strictly after FR-4) — DDD layer: **interface**
Insert the claim-truth-gate skill as the last pre-write gate into the 6 CCATO-T3 flows at the documented anchors (fb-market-poster STEP 4d, CHEF chef.md Step 6.7 Rule AF-3, market-watcher cycle.md Step 4f, alert-commander stage-dispatch-log.md Step 4a-pre, digest-predict daily-predict.md P-5.5, TNB audit-market.md Step 2 backstop). See §0.8 — this is NOT the same 6 flows as FR-1.

### FR-6 — Phase-2 data-depth sequencing note (PLAN-ONLY — no code, no task-board mutation) — DDD layer: n/a (planning artifact)
See §3 below.

### FR-7 — Feasibility-gate: earnings-revisions + valuation-history-percentile (PLAN-ONLY recon SPIKE, no build) — DDD layer: n/a this cycle; if GO verdict, future work touches infrastructure (new external fetch)
See §4 below.

---

## 2. Non-Functional Requirements

- **NFR-1 (no-fake-data floor):** every wired reading degrades to honest-NULL / `[SKIP] <tool> unavailable` log when the underlying tool returns null/insufficient_history; zero fabricated fallback values.
- **NFR-2 (precision over verbosity — PO-mandated this cycle):** cycle-output citations are terse — one line per material reading, direction+delta only (e.g. "RS rank +12 pct-ile 5d", "ROC z=+1.4 (strong)"). No prose padding. Applies to flow-doc wording too — do not inflate `.md` files beyond the minimum needed to wire + gate.
- **NFR-3 (additive-only, non-regression):** no behavior change to existing steps in the 6 flows; each flow's own gate/test suite still passes (mirrors `IND-P1-CONSUMER-WIRING-AUDIT` AC-5).
- **NFR-4 (language boundary):** Vietnamese for FB/MARKET channel output, English for internal WORK/session-log/flow-doc content.
- **NFR-5 (zone/owner discipline):** FR-1/FR-2/FR-5 are cowork agent `.md` flow edits — route through `cowork-refactory-expert` / agent-md path, **not** a dev-* zone specialist (precedent: `IND-P1-MOMENTUM-CONSUMER-WIRING` notes field). FR-3 is multi-zone (`dev-mcp-server` + `dev-frontend`, architect splits). FR-4 is `.claude/skills/` authoring (per CCATO-T2's own `zone` field).
- **NFR-6 (full-pipeline RAW-verify, FR-3 only):** DB/JSON → `/api` endpoint → frontend card → ops-gated rebuild — every hop RAW-verified live, not assumed from code-read (matches `feedback_remediation_overclaims_derived_layer.md`).
- **NFR-7 (tool response shape):** see §0.9 — client-side filter required, tools are not per-symbol-scoped.

---

## 3. Phase-2 — Data-Depth Sequencing Note (PLAN-ONLY, next sprint)

No code or task-board mutation this cycle; all rows below remain `BACKLOG`, untouched.

1. **IND-P1-VN-YIELD-CURVE** (M) — no upstream dependency, ship first.
2. **IND-P1-PROP-NET-FLOW** + **IND-P1-PUTTHROUGH-FLOW** (M each) — pair them; both reuse the same VPS CafeF/Vietstock mirror fetch-script scaffolding.
3. **IND-P1-LIMIT-LOCK** (S-M) — market-level leg (A) is P0-cheap (already-on-hand `get_market_breadth`), ship early; per-stock leg (B) needs a new persisted ref/ceiling/floor series — defer to the same sprint's back half.
4. **IND-P2-MARGIN-LEVERAGE** (L) — build LAST of this tranche; needs a new Circular-210 CTCK parser (`dev-pdf-extractor`), largest/most novel ingestion effort.
5. **FIX-MACRO-* cluster** (`FIX-MACRO-INDICATORS-EMPTY-COLUMNS`, `FIX-MACRO-ISM-FRED-API-KEY-MISSING`, `FIX-MACRO-TE-CHROMIUM-FETCH-BROKEN`, `FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE`, `FIX-MACRO-CARRY-YIELD-ESTIMATE-FLAG`, `FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT`, `FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT`) — data-completeness/bug fixes to the **existing** macro plane, not new indicators. Different zone (standalone `dev-macro-indicators` service) from #1-4 (`dev-technical-analysis`/`dev-mcp-server`) — run in **parallel**, not sequenced after. (`FIX-MACRO-THRESHOLD-FXFLOOR-OVERCLAMP` already `REVIEW`, in-flight — excluded, not new scope.)
6. **FIX-VPS-SSC-INSIDER-502** (already TODO, §0.3) — same VPS-proxy zone family as #2 — non-mandatory bundling candidate for pm.

No OHLCV-depth-blocked `†` items (RRG, participation-breadth, beta-decomposition) in this tranche — consistent with PO scope_out.

---

## 4. Feasibility Gate — Earnings-Revisions + Valuation-History-Percentile

Roadmap §4 explicitly rejects **VN-Index Valuation Z-Score** (covers valuation-history-percentile) as fabrication-risk: no real multi-year daily series, no per-ticker earnings for ~1700 constituents, no historical free-float/shares/membership — "the z-score IS the fabricated distribution." Its own text names the only defensible path: "a SEPARATE P2 spike to source a REAL external VN-Index P/E history feed first." **Earnings-revisions is not literally named in §4 but fails the identical test** — no consensus-estimate database for ~1700 VN constituents is known in this codebase's source inventory (SBV/GSO/HOSE/HNX/VnDirect/CafeF/Vietstock/TradingEconomics/Yahoo — none carry analyst-consensus EPS-revision series; FiinGroup/FiinTrade already confirmed paywalled per `IND-P2-MARGIN-LEVERAGE`'s own text).

**Recon SPIKE spec (PLAN-ONLY — probe only, do NOT build compute or design any indicator):**
- Probe candidate sources for a REAL, machine-reachable (HTTP-only, VPS-compatible, no paid API key) feed: FiinGroup/FiinTrade consensus API (expect paywalled, confirm), VNDirect/SSI/Simplize research portals (expect narrative-only, confirm structured-data absence), Refinitiv/Bloomberg VN coverage (expect enterprise-paywalled, confirm), TradingEconomics (check if a P/E multi-year VN-Index series exists on the already-used slug family).
- Output: a GO/NO-GO verdict per gap, nothing else. If GO — a separate future sprint scopes the build (do not pre-scope build steps now; would be speculative ahead of the SPIKE's own finding).
- Expected default (stated honestly, not presumed): likely NO-GO for both, given 2 adjacent asks in the same roadmap (VN-Index Valuation Z-Score, Margin-Lending 8Q z-score band) were already rejected for the identical missing-real-distribution reason — but the SPIKE must actually probe, not presume.

---

## 5. Edge Cases (Vietnamese/VN-market-specific + pipeline-state)

- `insider_transactions` = 0 rows (§0.3) — wiring ships correctly (honest-NULL/NEUTRAL) but delivers near-zero visible signal until `FIX-VPS-SSC-INSIDER-502` restores the upstream fetch. Do not treat 0-row state as a wiring bug.
- `get_foreign_accum_rank` returns `tickers:[]` (empty array, not per-ticker null) — DEFER wiring this one tool market-wide until `FIX-FOREIGN-FLOW-COVERAGE` rebuild lands (§0.2).
- Full-universe `tickers[]` response shape regardless of `symbol` arg (§0.9) — client-side filter required in every wiring insertion.
- GAP-CHEF-SYNTHESIS-A code-shipped, zero live output on disk yet (§0.6) — FR-3 dev/qa work sequenced after, not concurrent.
- CCATO-T2 skill file does not exist (§0.7) — FR-5 sequenced strictly after FR-4.
- Two distinct "6 flows" sets (§0.8) — do not conflate FR-1's target list with FR-5's.
- market-analyst exclusion note is stale (§0.5) — do not re-verify what's already confirmed live.

---

## 6. Numbered Acceptance Criteria

1. **AC-1:** grep across the 6 flow `.md` trees shows `get_roc_momentum` / `get_relative_strength` / `get_52w_proximity` each appearing in >=1 of {`chef.md`, `market-watcher/cycle.md`, `digest-predict/daily-predict.md`, `market-analyst/main.md`} per the §0.4 ADD column (`get_foreign_accum_rank` excluded — DEFER).
2. **AC-2:** grep shows `get_insider_sentiment` newly appearing in >=3 of {`chef.md`, a bctc-analyst stage file, `news-scout/stage-sentiment.md`}.
3. **AC-3:** grep shows `get_foreign_room` + `get_market_sentiment_index` newly appearing in `market-watcher/cycle.md` and `digest-predict/daily-predict.md` (closing the P0 gap found live 2026-07-11, §0.4).
4. **AC-4:** every newly-wired call has a graceful honest-NULL / `[SKIP]` guard — no fabricated fallback (mirrors `IND-P1-CONSUMER-WIRING-AUDIT` AC-3).
5. **AC-5:** each wired flow's cycle output cites the reading with direction+delta when material — not fetched silently (mirrors `IND-P1-MOMENTUM-CONSUMER-WIRING` AC-2).
6. **AC-6:** `chef.md` Step 6.7 Rule AF-1's indicator-class enumeration + blocked-token regex are extended to cover roc/z_score/decile, rs/percentile/composite_score, pct_from_52w_high/low, insider net_sentiment_score (FR-2) — a live dish-cycle audit (Block B WORK message) shows zero un-sourced numeric tokens from these families.
7. **AC-7:** additive-only diff — tsc + each flow's own existing gate/suite still pass; zero regression.
8. **AC-8 (FR-3, gated):** work starts ONLY after >=1 real `docs/data/unified-agent-synthesis-*.json` exists on disk (§0.6 gate cleared); `GET /api/cheb-synthesis` returns that JSON with a non-null `data_asof`/`generatedAt`; frontend card renders conviction/sector-phase/regime/known_gaps; full pipeline RAW-verified live (NFR-6).
9. **AC-9 (FR-4+FR-5):** `claim-truth-gate/SKILL.md` exists with the documented invocation contract; all 6 CCATO-T3 target flows reference it at their documented anchor; fb-market-poster STEP 4d + TNB Step 2 explicitly re-verified against CCATO-T3's own DoD (e)/(f).
10. **AC-10 (cross-reference discipline):** architect brief explicitly states, without re-diagnosing, that (a) insider_sentiment's near-zero current value traces to `FIX-VPS-SSC-INSIDER-502` and (b) `foreign_accum_rank`'s DEFER traces to `FIX-FOREIGN-FLOW-COVERAGE` — both cross-linked, neither re-opened as a new investigation.
11. **AC-11 (Phase-2 PLAN-ONLY):** §3's sequencing note is delivered as prose only — zero code/task-board mutation this cycle for any `IND-P1-*`/`IND-P2-*`/`FIX-MACRO-*` row; all remain `BACKLOG`, untouched.
12. **AC-12 (feasibility-gate):** a recon SPIKE task is minted (`BACKLOG`, PLAN-ONLY, size S) for §4's two gaps, explicitly forbidding any build/compute step before a GO verdict; zero code written this cycle for either gap.

---

## 7. Cascade-Ordering Enforcement

```
ba (this doc)
  │
  ▼
agents-architect — brief splitting:
  · FR-1/FR-2/FR-5 → cowork-refactory-expert (flow-doc wiring, zero new code)
  · FR-3 → dev-mcp-server (endpoint) + dev-frontend (card), sequenced after §0.6 gate clears
  · FR-4 → skill-authoring owner (`.claude/skills/`), MUST land before FR-5 starts
  · FR-7 → mints the recon SPIKE task (AC-12), does not scope any build
  │
  ▼
pm — decomposes into per-zone tasks, respecting zone isolation for parallel dispatch;
     sequences FR-4 → FR-5; holds FR-3 dev start on §0.6 gate
  │
  ▼
dev (cowork-refactory-expert | dev-mcp-server | dev-frontend | skill-owner) → qa RAW-verify per AC-1..AC-12
```

---

## Decision Journal

**task_id:** ANALYSIS-QUALITY-CONVERGENCE (BA task: BA-ANALYSIS-QUALITY-CONVERGENCE)
See `docs/agent-memory/decisions/sprint-ANALYSIS-QUALITY-CONVERGENCE-ba.md`.

## RETURN
DONE: BA spec complete — requirements written to `docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md`. Zero PO blockers.
NEXT: agents-architect — split FR-1/FR-2/FR-5 (flow-doc, cowork-refactory-expert) vs FR-3 (multi-zone, gated on §0.6) vs FR-4 (skill, prerequisite for FR-5) vs FR-7 (mint recon SPIKE only)
HANDOFF: `docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md`
PIPELINE: continue
