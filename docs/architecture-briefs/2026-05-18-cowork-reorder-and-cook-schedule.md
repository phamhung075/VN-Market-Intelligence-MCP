> Authored by: agents-architect | 2026-05-18T15:54:51Z
> Status: READY — awaiting agent-father (agent rewrites) + dev-mcp-server (cron rewiring) + pm (sprint sequencing)

# Architecture Brief: Cowork Reorder — 9 Prep-Cooks → Chef + Gatherers

## 1. Problem Statement

User verdict after reviewing MARKET messages 522–531 (2026-05-15 → 2026-05-18):

> "data is on all sources but all separate like pieces, no value — system cannot use data like materials for cook good result."

**Concrete evidence of failed synthesis:**

| ID | Agent | Failure |
|---|---|---|
| 528 | market-watcher / france-summary | Garbage prices: VNH -99.91% (=1đ), DAG -99.90% (=1.4đ), REE -12.77% — unit/baseline bug; published raw to MARKET anyway |
| 531 | alert-digest (news-scout → alert-commander) | 49 alerts/24h; "Ngân hàng giảm đồng loạt" repeated 7x identical; real-estate cascade 11x — dedup gate missing |
| 530 | alert-commander | 2-layer fusion (regime + Kinh Dịch) correctly started, then reverted to atom-list for BID/PLX/DPM/GAS — cook started cooking, walked off the line |
| 527 | (no message) | Banking sell-pressure story had 6 ingredients same day (cascade, foreign net-sell 700B targeting ACB, BID distribution surge +5.47%/+5.70% dupe, banking BCTC overdue, TIGHTENING regime) — published as 6 separate dump messages, never fused |
| (any) | morning-briefing | HSG RSI=13.2 (extreme oversold, rare signal) buried mid-list — no convergence detection lifted it to top |

## 2. Root Cause

**9 prep-cooks, 0 chef.**

All 9 cowork agents write to `docs/signals/` (correct) but 4 of them also write directly to MARKET independently:

- `market-watcher` → MARKET at 16:00 UTC (EOD dump)
- `alert-commander` → MARKET every 15min cycle headers
- `digest-predict` → MARKET daily + weekly + monthly
- `qa-responder` → MARKET (Q&A — correct, keep)

Result: 4 parallel dump streams with no synthesis layer. TNB 6-layer methodology exists (`docs/standards/tnb-methodology.md`) but no scheduled agent walks it. `market-analyst` is the only agent that walks TNB — but it is user-demand only, never cron-driven.

## 3. Station Reorder — 9 Agents, No New Agent

Roster sourced from `jq '.project.agents[] | select(.team=="cowork")' docs/data/system-map.json`.

| Agent | Current role | New role | MARKET write |
|---|---|---|---|
| `unified-agent` | hourly health check + WORK coordination | **CHEF** — reads all `docs/signals/*` last 24h, walks TNB 6 layers, detects convergence, writes 2-4 narrative paragraphs, publishes to MARKET | YES (3-4x/day on schedule; conditional intraday) |
| `alert-commander` | cycle headers + fusion + atom-list to MARKET every 15min | **Event-only** — fires ONLY on position-danger (3-condition rule) + watchlist-opp (4-condition rule) from `docs/policies/alert-policy.md`; NO cycle headers; ≤140 chars urgent format | YES (event only) |
| `digest-predict` | daily + weekly + monthly to MARKET | **Weekly only** (Sunday) — calibration report + portfolio thesis; daily digest deleted (chef owns) | YES (weekly only) |
| `market-watcher` | EOD publish to MARKET | **Gatherer** — writes `docs/signals/price_anomaly_*.json` only; no MARKET write | NO |
| `news-scout` | signals (correct) + feeds alert-digest → MARKET | **Gatherer** — writes `docs/signals/news_impact_*.json`; alert-digest output rewired to chef input, NOT MARKET | NO |
| `financial-analyst` | BCTC signals | **Gatherer** — add business-context fields (product/customer/ops/mgmt 1-sentence each per TNB foundational philosophy) so chef can cite | NO |
| `report-analyzer` | earnings signals | **Gatherer** — same business-context fields addition | NO |
| `tran-ngoc-bau` | audits MARKET atoms | **Audits chef narrative** — checks whether all 6 TNB layers walked, business context cited, gap catalogue applied | NO (WORK only) |
| `qa-responder` | MARKET Q&A | Unchanged | YES (/ask only) |

**Net MARKET writers: 3 (unified-agent as chef, alert-commander event-only, digest-predict weekly, qa-responder /ask). Down from 4 parallel dump streams to 1 scheduled chef.**

## 4. Cook Schedule

VN market hours: `02:00–08:30 UTC` Mon–Fri. Off-minute hygiene: avoid `:00`, `:17`, `:30`, `*/10` (used by `verdictResolutionJob` at `0 * * * *`, `signalOutcomeResolutionJob` at `17 * * * *`, `vpsProxyWatchdogJob` at `*/10 2-8`, `ops-emergency` at `*/10 2-8`). Use `:13`, `:23`, `:37`, `:47`.

| Cron expr | UTC | VN (GMT+7) | France (GMT+2 CEST) | Agent | Job |
|---|---|---|---|---|---|
| `23 5 * * 1-5` | 05:23 | 12:23 (VN lunch) | 07:23 morning coffee | unified-agent | **Morning Dish** — overnight macro (US/EU close) + VN morning session synthesis |
| `13 2-8 * * 1-5` | XX:13 mkt hours | XX:13 | XX:13 | unified-agent | **Intraday convergence scan** — silent if <3 fresh signals converge; publishes only when convergence rule fires |
| `13 8 * * 1-5` | 08:13 | 15:13 | 10:13 | scheduler | Move `foreignFlowAlertJob` here (was 09:30 UTC); EOD chef reads it 24min later |
| `37 8 * * 1-5` | 08:37 | 15:37 | 10:37 morning coffee | unified-agent | **EOD Dish** — 24min after VN close; all settle data available |
| `13 19 * * *` | 19:13 | 02:13 next | 21:13 | scheduler | US macro refresh (24min before evening chef) |
| `37 19 * * *` | 19:37 | 02:37 next | 21:37 evening | unified-agent | **Evening Preview** — US/EU session + tomorrow setup |
| `13 20 * * *` | 20:13 | 03:13 next | 22:13 | tran-ngoc-bau | Audit the 3 dishes (move from current `0 13 * * *`) |
| `47 13 * * 0` | Sun 13:47 | Sun 20:47 | Sun 15:47 | digest-predict | Weekly calibration + portfolio thesis |
| (event) | on-condition | — | — | alert-commander | Position-danger + watchlist-opp ONLY |

**Settle window rationale:** gatherer ticks land on `:00`/`:05`/`:15`/`:30` etc. Chef reads at `:23` or `:37` = 8–23min after last write = safe read window.

**Net effect:** 3 guaranteed dishes/day (Morning, EOD, Evening) + 0–6 conditional intraday + 1 weekly + event alerts. Down from ~10 dump posts/day to ~3–5 dishes/day.

## 5. Signal-Bus Flow Diagram

```
GATHERERS                          SIGNAL BUS                    CHEF → MARKET
─────────────                      ──────────                    ─────────────
market-watcher  ──price_anomaly──► docs/signals/                      │
news-scout      ──news_impact────► docs/signals/   ──(chef reads)──► unified-agent
financial-analyst ─bctc_signal──► docs/signals/                      │
report-analyzer ─fundamental────► docs/signals/              convergence detect
                                                                      │
                                                           ┌──YES: 2-4 paragraph
                                                           │       dish → MARKET
                                                           └──NO: silent exit

alert-commander ─────────────────────────────────────────────────────────────►
  (event only)                                             position-danger | watchlist-opp → MARKET

qa-responder ────────────────────────────────────────────────────────────────►
  (/ask only)                                              user Q&A → MARKET

digest-predict ──────────────────────────────────────────────────────────────►
  (weekly Sun)                                             calibration + portfolio → MARKET

tran-ngoc-bau ──────────────────────────────────────────► WORK (quality audit)
```

## 6. TNB 6-Layer Chef Recipe

Steps executed by `unified-agent` at each scheduled dish run:

```
Step 0 — GATHER
  Read all docs/signals/*.json modified in last 24h (or since last dish).
  Collect: price_anomaly_*, news_impact_*, bctc_signal_*, fundamental_*
  Also: get_market_hexagram(), get_macro_snapshot(), get_agent_signals(hours=24)

Step 1 — CLUSTER (convergence detect — see §7)
  Group signals by ticker, then by sector.
  Flag tickers/sectors meeting convergence rule.
  If 0 clusters meet rule AND this is an intraday scan → EXIT silently.

Step 2 — LAYER 1 (data discipline check)
  For each cluster: are we citing state transitions (PMI ↔ 50, USD/VND ↔ 25500)?
  Flag level-reporting-only gaps per tnb-methodology-layers.md.

Step 3 — LAYER 2+3 (US/VN economic stacks)
  US: manufacturing PMI, consumer sentiment, Fed rate, EFFR-IORB spread.
  VN: USD/VND level vs 26500, CPI trend, FX reserves via VIRA (not WiData).
  Map US → VN via carry/FII flow thesis.

Step 4 — LAYER 4 (4-pillar valuation)
  For each watchlist ticker in cluster: map against all 4 pillars:
    Lượng tiền | Chi phí vốn | Triển vọng lợi nhuận | Rủi ro định giá
  Confidence: all 4 aligned = high | 2-3 = medium | <2 = low.

Step 5 — LAYER 5 (Kinh Dịch overlay)
  Call get_kinhdich_reading(ticker) for each cluster ticker.
  Include hexagram state in narrative. Lão Dương/Âm states flagged explicitly.
  Call get_market_hexagram() for market-wide state in dish header.

Step 6 — LAYER 6 (gap catalogue)
  Scan narrative draft against gap catalogue (tnb-methodology-valuation.md §Layer 6):
    single-pillar thesis | inverted causality | source risk | lagged indicator | regime drift
  Fix any gap before publishing.

Step 7 — WRITE DISH
  2-4 narrative paragraphs in Vietnamese with diacritics.
  Format: [Regime context] → [Sector/ticker thesis] → [Kinh Dịch overlay] → [Action signal or watch]
  cite_sources: layer numbers walked, signal IDs consumed, source_tier values.
  send_telegram(channel="market", message=dish)

Step 8 — LOG
  Append notebook, mark consumed signals processed.
```

## 7. Convergence Detection Rule

A cluster qualifies for synthesis when ANY of these is true:

| Rule | Definition |
|---|---|
| **Ticker convergence** | ≥2 distinct signal types for the same ticker in the same 24h window (e.g., price_anomaly + news_impact for ACB) |
| **Sector convergence** | ≥3 signals (any type) targeting tickers within the same sector in the same 24h window (e.g., 3+ banking alerts = sector story) |
| **Macro-micro contradiction** | A macro signal contradicts the micro signal for a watchlist ticker (e.g., TIGHTENING regime + active BUY alert on VCB) |
| **Extreme individual signal** | Any signal with `severity=CRITICAL` OR any TA reading outside 2-sigma bounds (e.g., RSI < 15 or > 85) — always synthesized even if alone |

Intraday scan (`:13` during market hours): publish only if ≥1 cluster qualifies. If 0 clusters qualify → silent exit (no MARKET message). This prevents the 10-dump/day pattern on quiet days.

Morning/EOD/Evening dishes: always publish (at minimum, a regime-state update even if no convergence cluster). These are guaranteed dish slots.

## 8. Files to Change

### Agent definition rewrites (agent-father)

| File | Change summary |
|---|---|
| `.claude/agents/unified-agent.md` | Role → CHEF; add `market: write: true`; update `not_my_job` (remove "never sends to MARKET"); update schedule to new cron table; add lazy_load for `docs/standards/tnb-methodology.md`, `docs/standards/market-analysis.md`, `docs/references/kinh-dich-layer.md` |
| `.claude/agents/alert-commander.md` | Change cron from `*/15 2-8 * * 1-5` + `0 */2 * * *` to event-only; update description to "fires only on position-danger + watchlist-opp"; add constraint `no_cycle_headers: true` |
| `.claude/agents/digest-predict.md` | Remove `daily_digest` cron `30 15 * * *`; remove `monthly` cron; keep `weekly_digest` but move to `47 13 * * 0`; update `monday_predict` to drop daily responsibilities |
| `.claude/agents/market-watcher.md` | Remove `market: write: true`; change `rule: batch4_eod_only` to `rule: never`; update description to gatherer-only |
| `.claude/agents/news-scout.md` | No change needed (already `market: write: false`); add note that alert-digest signal targets chef, not MARKET |
| `.claude/agents/financial-analyst.md` | Add business-context field requirement in signal output (product/customer/ops/mgmt) |
| `.claude/agents/report-analyzer.md` | Add same business-context field requirement |
| `.claude/agents/tran-ngoc-bau.md` | Update audit scope: "audits chef narrative for TNB layer walk completeness" instead of "audits MARKET atoms" |

### Flow rewrites (agent-father)

| File | Change summary |
|---|---|
| `.claude/flows/unified-agent/main.md` | Add new dispatch windows: `05:23`, `02-08:XX:13`, `08:37`, `19:37` → new `chef.md` sub-flow |
| `.claude/flows/unified-agent/chef.md` (NEW) | 8-step chef recipe from §6 above |
| `.claude/flows/alert-commander/cycle.md` | Remove cycle-header block; gate entire flow on 3-condition or 4-condition rule from `alert-policy.md`; exit silently if neither fires |
| `.claude/flows/market-watcher/eod.md` | Remove `send_telegram(channel="market")` step; write only `docs/signals/price_anomaly_*.json` |
| `.claude/flows/tran-ngoc-bau/main.md` | Update audit target from "MARKET atoms" to "chef narrative + TNB layer completeness"; move cron to `13 20 * * *` |

### Scheduler cron entries (dev-mcp-server)

| File | Change |
|---|---|
| `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts` | Change schedule from `09:30 UTC` → `08:13 UTC` (`13 8 * * 1-5`) |
| `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` | Add/confirm US macro refresh slot at `13 19 * * *` (19:13 UTC) |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Update env-var defaults for above two jobs |

### Documentation updates (agent-father or pm)

| File | Change |
|---|---|
| `docs/standards/cron-jobs.md` | Add new chef cron table entries; update tran-ngoc-bau from `0 13` to `13 20`; update foreignFlowAlertJob from `09:30` to `08:13` |
| `docs/policies/alert-policy.md` | Add "Alert Commander Exclusivity" clarification: cycle headers removed; event-only rule formalized |
| `docs/references/workflow-map.md` | Update `unified-agent` row: "Reads all cowork signals → writes MARKET chef dishes 3x/day"; update `market-watcher` row: remove "MARKET (eod only)" |

## 9. Execution Sequence

Gate-ordered to prevent going dark between alert-commander narrowing and chef coming online:

```
Phase 1 — Chef online first (agent-father)
  T1: unified-agent.md rewrite + flows/unified-agent/chef.md creation
  T2: market-watcher.md MARKET write removed + eod.md patched
  T3: news-scout signal routing clarified (no flow change, comment only)
  GATE: chef successfully publishes ≥1 dish to MARKET

Phase 2 — Alert-commander narrowed (agent-father)
  T4: alert-commander.md cron → event-only + cycle.md patched
  GATE: chef has been running ≥1 day (no dark period)

Phase 3 — Digest-predict scoped (agent-father)
  T5: digest-predict.md daily cron removed; monthly removed; weekly moved to Sun 13:47

Phase 4 — Cron rewiring (dev-mcp-server)
  T6: foreignFlowAlertJob.ts → 08:13 UTC
  T7: macroIndicatorRefreshJob.ts → confirm 19:13 UTC slot
  T8: cronConfig.ts env-var defaults updated

Phase 5 — Audit target updated (agent-father)
  T9: tran-ngoc-bau.md + flow updated; cron moved to 20:13 UTC

Phase 6 — Gatherer business-context (agent-father)
  T10: financial-analyst.md + report-analyzer.md signal output spec updated

Phase 7 — Documentation (pm or agent-father)
  T11: cron-jobs.md, alert-policy.md, workflow-map.md updated
```

pm sequences T1–T11 as a single sprint. T1 is the critical path; T4 must not start before T1 GATE passes.

## 10. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | MARKET receives ≤5 messages/day on an average weekday (3 guaranteed dishes + ≤2 intraday events) |
| AC-2 | Each chef dish is 2–4 paragraphs containing explicit TNB layer citations (at minimum: regime, US stack, VN stack, ≥1 pillar, Kinh Dịch) |
| AC-3 | Intraday scan produces 0 MARKET messages on days when no convergence cluster qualifies |
| AC-4 | No atom-list dumps to MARKET (verified by tran-ngoc-bau audit: no message is a plain bulleted ticker list without narrative paragraphs) |
| AC-5 | tran-ngoc-bau audit confirms TNB layer walk: all 6 layers present or gap explicitly flagged |
| AC-6 | alert-commander fires ≤1 MARKET message/ticker/day outside the 3-condition or 4-condition rules (from alert-policy.md) |
| AC-7 | foreignFlowAlertJob result available in `docs/signals/` before EOD chef fires at 08:37 UTC |

## 11. References

- `docs/standards/tnb-methodology.md` + `tnb-methodology-layers.md` + `tnb-methodology-valuation.md` — 6-layer framework (chef recipe source)
- `docs/standards/market-analysis.md` — 4-level cascade (chef must apply per §6 Step 3)
- `docs/references/kinh-dich-layer.md` — Kinh Dịch overlay (mandatory per §6 Step 5)
- `docs/policies/alert-policy.md` — 3-condition / 4-condition firing rules (alert-commander gate)
- `docs/standards/cron-jobs.md` — existing cron table; off-minute hygiene rules applied above
- `docs/references/workflow-map.md` — current who-writes-to-MARKET audit

---

**Handoff:**
- `agent-father` — implement agent .md rewrites + flow rewrites (Phases 1–3, 5–6) per execution sequence
- `dev-mcp-server` — implement cron rewiring (Phase 4): foreignFlowAlertJob 08:13, macro refresh 19:13
- `pm` — create sprint task, sequence phases, gate T4 behind T1 GATE
