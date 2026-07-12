# STRATEGY-SELECTION PROPOSAL — VN Market Intelligence Platform
**Date:** 2026-07-11 · **Basis:** full microservice inventory (A), live probe 2026-07-11T21:40Z (B, status DEGRADED), 3 opportunity lenses (C) · **Operator context:** solo, watchlist-driven personal investing (33-34 tickers), TNB 6-layer methodology

---

## 1. Data Asset Map

Freshness/depth from the live probe where available; probe ran Saturday 04:40 ICT (market closed), so "last-session" values are expected. **Bold-flagged** = stale/dead/estimate per probe or inventory.

### Prices & Flow

| Source | Data | Stored in | Depth / freshness |
|---|---|---|---|
| VPS push (bgapidatafeed via fetch-prices.sh, 60s market hours) | live quotes, change%, volume | `market_prices` (121 rows), `market_prices_history` | snapshot fresh; **tick history only 24h rolling — perpetually ~2 days deep** |
| TCBS→VNDirect via VPS backfill + tick aggregation | daily OHLCV bars | `daily_ohlcv` | watchlist: ~757-762 bars/ticker (~3y), probe-verified FPT 502 bars/730d — healthy. **Universe (~1459 codes): shallow; 457 queue rows marked done with zero bars.** **2026-07-11 Friday candle missing (aggregator skipped incident day; prices flagged "Rất cũ" 36.7h)** |
| VPS push foreign flow (full universe, 60s market hours) | foreign buy/sell vol+value, room | `daily_ohlcv` foreign columns, `foreign_room_events` | richest plane in the system; **intraday granularity discarded — only end-of-day merge survives; deferred-write race drops rows until OHLCV bar exists** |
| VnDirect vnmarket_prices | VNINDEX quote, HOSE breadth | `vn_index_cache`, `market_breadth_history` | breadth **forward-accruing only, no backfill** — McClellan needs ~40 sessions |
| stock-price :5000 (Go) | 3-tier quote fallback, foreign-accum-rank z-scores | serves, doesn't store | **Tier 1/2 both VnDirect (geo-blocked from France host) — likely always degrading to Tier-3 cache, errors swallowed silently** |
| technical-analysis :5003 | RSI/MACD/BB/ROC/RS/52w/vol/money-flow | stateless, no historization | 33/33 watchlist TA-ready per probe; long-horizon endpoints (ROC 273-bar, MA200) **now unblocked by depth but not yet surfaced in agent cycles** |

### Fundamentals — BCTC

| Source | Data | Stored in | Depth / freshness |
|---|---|---|---|
| VPS BCTC pipeline (SSC/HNX discovery → PDF cache → pdf-extractor PEK) | code-keyed (Mã-số) statement rows | `bctc_table_rows` | 4,091 rows but **only ~12 tickers × 2 quarters (Q4-2025/Q1-2026)**; 6 orphan FKs |
| same | layout units, md tables, balance checks | `bctc_layout_units` (202/15 reports), `bctc_md_tables` (**1 row — dead**), `bctc_balance_checks` (**5 rows vs 20 reports**) | **pdf-extractor unhealthy at probe time; trigger-pek-extract aborting every 30s — plane stalled** |
| refine pipeline (haiku agent) | refined markdown + scalar backfill | `bctc_refined_units` (506/23 reports), `financial_reports` (125 rows/50 tickers) | probe: FPT serves **only 2 refined periods, with artifacts (eps=1, null pe/pb, −34% QoQ total_assets)** |
| queue | fetch state machine | `bctc_vps_queue` | 580 seeded (34 tickers × 10 quarters); only 71 done, **328 (57%) parked deferred_infra** |
| vnstock SDK (VCI), weekly + daily | income/BS/CF/ratios/officers/shareholders/events/trading stats | `vnstock_*` (7 tables) | working weekly/daily sweeps; feeds OCF/net-profit bridges into financial_reports |
| Vietstock via VPS (CSRF technique cracked) | AGM plan targets + quarterly actuals; officer appointment_year | `agm_plan`, `agm_actuals`, `vnstock_officers` | daily refresh, current-year only; **33-ticker list hardcoded in VPS script (watchlist drift risk)** |

### Macro

| Source | Data | Stored in | Depth / freshness |
|---|---|---|---|
| FRED API (keyed) | EFFR/IORB/ISM daily | `fred_series_daily` | live; **FEDFUNDS CSV path still behind the Akamai WAF that already broke twice** |
| Yahoo | Brent/gold/USDVND/DXY, shipping | `commodity_prices(+history)` | probe: tier-1 live, non-estimate; history 1,226 rows ~51 days; **SCFI is a BDI proxy; cny_vnd dead column** |
| VCB portal + config fallback | USD/VND FX; SBV policy rates | `sbv_rates(+history)` | FX live; **policy rates are NOT live — SBV portal down, values from config, is_estimate=1** |
| macro-indicators :5004 (NSO Excel, SBV BOP/OMO via VPS) | BOP, trade balance, CPI components, IIP, OMO auctions, liquidity state | `macro_vmt_cache`, `sbv_omo_daily` | endpoints live (probe: macro snapshot fully live tier-1); **sbv_omo_daily near-empty — no scheduler calls /liquidity-state, so the built OMO stress score stays null; interbank_1w/IRS/CPI-weights permanently is_estimate** |
| TradingEconomics + GSO via VPS | VN macro columns | `macro_indicators` | TE live if key set (**silent-dark if unset**); **GSO fetcher DEAD — pushes empty payload hourly purely to refresh fetched_at (fake freshness)** |
| IMF, Polymarket | forecasts; prediction markets | `imf_indicators`, `prediction_markets/signals` | live, 6h / 30min |

### News / Legal / Governance

| Source | Data | Stored in | Depth / freshness |
|---|---|---|---|
| 10 VN outlets via VPS RSS + CafeF/VnExpress/VnEconomy direct + Google-News-proxied Reuters/Bloomberg (news-fetch :5008) | headlines → analyzed entries | `rag_analyses` + LanceDB (54,823 rows) | deep corpus; **vn-news-fetch VPS service UNHEALTHY at probe; FTS rebuild cron never wired — hybrid BM25 leg silently misses post-boot rows; tuoitre/nhandan blocked since 04-22; baodautu dead** |
| deep-fetch (VPS + Playwright) | full article bodies | `deep_fetch_queue`, body_text, LanceDB deep tier | running 5-min cadence |
| news pipeline derived | hourly ticker mention counts | `mention_velocity` | accruing |
| SSC via VPS proxy | insider transactions | `insider_transactions`, `evidence_fragments` | **forward-only since Task 1922a fix — no history before that** |
| SSC direct | broker sanctions | `broker_sanctions` | quarterly, working |
| muasamcong via VPS proxy | gov contract awards | `public_contracts` | weekly; **no production CREATE TABLE (DDL only in a test file); silent-empty if proxy env unset** |
| congbao.chinhphu.vn | decrees/circulars | — | **DEAD from France host — geo-blocked, no VPS route wired** |
| DAV | drug approvals | `pharma_events` | monthly, working |
| vnstock bond / static seed | TPDN maturities | `bond_maturity` | **5 static seed rows from 2026-05-31 — not live** |

### Alternative / Derived

| Source | Data | Stored in | Notes |
|---|---|---|---|
| kinh-dich-service :5005 | hexagram readings | `kinhdich_readings` (written mcp-server side) | input = last 7 closes only; Go DB layer stubbed |
| NCHMF/NOAA/EVN-news-regex | weather, ENSO, reservoirs | signals | **reservoir data = regex over news text, fragile** |
| outcome machinery | signal/alert/prediction scoring | `signal_outcomes`, `prediction_claims`, `calibration_snapshots`, `cascade_rule_hits`, `improve_check_log` | running nightly — self-grading exists, **nothing converts grades into weights** |
| sector tools | credit/energy/crisis signals | static seeds | **thinnest layer — hardcoded RE-credit 20%/19%, EVN grid approximations, flagged DEGRADED** |

---

## 2. Honest Gap Assessment (most consequential first)

1. **BCTC structured coverage is a facade of depth.** 4,091 rows sounds like data; it is ~12 tickers × 2 quarters. 57% of the seeded queue is parked `deferred_infra`, the extractor container was unhealthy at probe time (30s PEK aborts), and the served values contain unfiltered artifacts (FPT eps=1, −34% QoQ assets, null pe/pb). Any fundamentals strategy launched today runs on 2-period snapshots with known bad cells.
2. **Irreplaceable data is being thrown away daily.** Intraday ticks are deleted after 24h (`market_prices_history`), full-universe 60s foreign-flow pushes survive only as an end-of-day merge, and `sbv_omo_daily` accrues nothing because no cron calls `/liquidity-state`. Unlike code, these losses cannot be backfilled later — VN intraday and OMO auction history are not purchasable.
3. **The Vinahost VPS is a single point of failure for everything uniquely Vietnamese.** Prices, foreign flow, BCTC PDFs, AGM plans, insider data, news — all route through one 1GB-RAM box at 125.212.251.27. `ENABLE_LOCAL_BCTC_FETCH=false` means a VPS outage = zero BCTC intake. Two of five VPS services were UNHEALTHY at probe.
4. **Fake-freshness masks dead sources.** fetch-gso.sh pushes empty payloads hourly to keep `fetched_at` green; ssc-iboard is NXDOMAIN since 04-27 yet listed as a live 15-min source in system-map; SBV policy rates serve config constants flagged is_estimate; bond_maturity serves 6-week-old seed fixtures through a live-looking tool. Agents citing these are quietly fabricating.
5. **The daily aggregation chain has no catch-up path.** One Docker incident produced a missing Friday candle, 36.7h-stale prices, and every downstream signal (snapshot, breadth, TA, briefings) serving Thursday closes — and the raw ticks needed to repair it were expiring on the 24h timer while nobody ran the fix.
6. **Universe-vs-watchlist depth split.** Watchlist OHLCV is genuinely deep (~3y, long-horizon indicators now unblocked), but the ~1459-code universe backfill silently no-ops (`done=1` regardless of exit code, no inserted-count verification) — so cross-sectional z-scores (foreign-accum rank, ROC deciles) rank against a partly-empty cross-section.
7. **Built-but-starved capabilities.** Long-horizon TA endpoints, `run_backtest`, foreign-accum-rank, OMO stress score, and the whole outcome/calibration layer exist and are honest — but nothing surfaces them into daily decisions. The marginal cost of activating them is glue, not construction.
8. **Dead machinery adds audit noise.** alert-engine has zero production callers; kinh-dich Go DB layer is stubbed; the news-fetch Go port is dead code. Not investment-blocking, but it inflates the apparent estate and feeds auditor false positives.

---

## 3. Strategy Options

### Option A — Flow-and-Price Alpha Loop
**Thesis:** Foreign flow is the dominant VN price driver, and this platform's foreign-flow plane (full universe, 60s, buy/sell/value/room) is its richest, freshest, most unusual asset. Join it with news sentiment and TA into a small number of ranked, regime-gated, outcome-scored daily signals for the watchlist.

- **Leverages (existing):** `daily_ohlcv` foreign columns + `foreign_room_events`; stock-price `/price/foreign-accum-rank` (built, honest-null, feeds foreignAccumZMarket); `rag_analyses`/LanceDB sentiment + `mention_velocity`; technical-analysis `/ta/money-flow-oscillators`, `/ta/roc-momentum`, `/ta/relative-strength`, `/ta/52w-proximity` (depth-unblocked per probe); carry-trade signal (`sbv_rates` × `fred_series_daily`), DXY regime (`commodity_prices_history`); `signal_outcomes`/`get_alert_accuracy` for scoring.
- **Must build/deepen:** (1) divergence screen joining foreign z-score × sentiment × RS (alpha lens #1 — "nearly pure SQL"); (2) missing-candle repair + aggregator catch-up guard; (3) fix foreign-flow deferred-write race; (4) one cron calling `/liquidity-state` so the regime gate gets its OMO leg; (5) a "signal truth ledger" view over the already-running outcome tables; (6) surface ranks into morningBriefing/Telegram.
- **Effort horizon:** ~2-4 weeks total; every step is days-scale per the feasibility lens.
- **Payoff profile:** fast — first divergence digests within days; compounding as outcome scores accrue.
- **Main risk:** signal quality unproven — foreign-flow divergence may not clear transaction costs on a 33-ticker book; cross-sectional ranks degraded until the universe backfill bug is fixed.

### Option B — Fundamentals Moat Deep-Build
**Thesis:** A machine-readable, Mã-số-level quarterly fundamentals series for VN listcos does not exist from any provider. The extraction pipeline (SSC session flow, HNX TLS pinning, PEK gates) is already built; drain the 580-row queue to 8+ quarters × 34 tickers and layer the AGM plan-vs-actual tracker and PEAD scanner on top.

- **Leverages:** `bctc_vps_queue`/`bctc_table_rows`/`bctc_balance_checks`/`financial_reports`; `agm_plan`/`agm_actuals` (daily, technique cracked); `vnstock_financials/cash_flow` cross-check bridges; `vnstock_events` dates; refine pipeline.
- **Must build/deepen:** recover pdf-extractor health (blocked on this today); re-drive 328 deferred_infra rows; persist `needs_vision_verify` markers (currently lost after fire-and-forget); orphan-FK cleanup (6+29+100 rows); plausibility gates on served values (the eps=1 class); multi-year AGM backfill + de-hardcode the 33-ticker list; then AGM run-rate tracker and earnings-surprise/PEAD scanner (both mostly SQL once data exists).
- **Effort horizon:** 6-10 weeks; front-loaded ops repair, backfill throughput-bound on the VPS.
- **Payoff profile:** slow then compounding — each earnings season lands on a deepening base; the management-credibility series is one irreplaceable data point per AGM season.
- **Main risk:** pipeline fragility — the plane is stalled *right now*, deferred_infra causes are unresolved, HOSE discovery is known-broken except via the SSC fallback, and quality artifacts show verification is immature. High chance of weeks spent on plumbing before any investor-facing output.

### Option C — Macro-Regime + Event Intelligence
**Thesis:** Build the top-down layer (carry × DXY × OMO liquidity × BOP incidence) plus the geo-moated VN event corpus (congbao decrees, procurement awards, insider history) into a regime dial and event-study asset.

- **Leverages:** get_carry_trade_signal, get_vn_bop, macro-indicators liquidity-state, `commodity_prices_history`, `market_breadth_history`, earnings-yield spread; VPS `/proxy/*` pattern (15+ working precedents); `insider_transactions`, `broker_sanctions`, `pharma_events`.
- **Must build/deepen:** OMO cron (days); congbao VPS proxy route + parser (days, copy of sscInsider pattern); public_contracts production DDL + fail-loud fetch + winner→ticker entity linkage (weeks); insider historical backfill + person-key linkage across officers/shareholders (weeks, VN name normalization); breadth warmup is a pure wait (~40 sessions).
- **Effort horizon:** 4-8 weeks, mixed days/weeks items.
- **Payoff profile:** the regime dial arrives fast and conditions everything else; the event corpus pays off slowly (event-study needs history that only starts accruing at wiring time).
- **Main risk:** several permanently-estimated inputs (SBV rates from config, interbank_1w blocked forever, yield-spread tier-4) cap how "live" the regime read can honestly be; event datasets are leading indicators with long, hard-to-validate lags for a solo operator.

---

## 4. Scoring Matrix

Scale 1-10. **Effort: 10 = cheapest. Risk: 10 = safest.** Total = simple sum (equal weights; no dimension deserves special pleading at this stage).

| Criterion | A: Flow-alpha loop | B: Fundamentals moat | C: Macro + events |
|---|---|---|---|
| Data-readiness today | 9 (flow plane live @60s; TA depth unblocked; rank service built) | 3 (12 tickers × 2 quarters; extractor down at probe) | 6 (macro snapshot live tier-1; OMO/congbao/insider empty-to-thin) |
| Uniqueness / moat | 7 (full-universe VN foreign flow is rare; joins are replicable) | 9 (Mã-số series + AGM credibility history exist nowhere commercially) | 7 (geo-moated corpora; regime dial itself is standard) |
| Investor value (watchlist operator) | 9 (daily entry/exit + sizing signals) | 8 (conviction & valuation depth, quarterly cadence) | 6 (conditions decisions; rarely generates them) |
| Effort (10 = cheapest) | 8 (days-scale steps, mostly glue) | 3 (ops repair + weeks of backfill first) | 6 (two cheap wins, two weeks-scale linkage builds) |
| Risk (10 = safest) | 7 (edge unproven; universe cross-section degraded) | 4 (stalled pipeline, unresolved deferred_infra, quality artifacts) | 6 (permanent estimates; long validation lags) |
| **Total /50** | **40** | **27** | **31** |

Arithmetic: A = 9+7+9+8+7 = 40 · B = 3+9+8+3+4 = 27 · C = 6+7+6+6+6 = 31.

---

## 5. Recommendation

**Primary: Option A — Flow-and-Price Alpha Loop.**
**Cheap parallel track: "Archive-now" moat capture** — the subset of B/C that is forward-only data preservation, near-zero build cost, and impossible to redo later: stop deleting intraday ticks (compact to permanent 5-min bars), guarantee foreign-flow persistence, arm the OMO cron, wire the rag FTS rebuild. This banks Option B/C raw material every trading day while A proves (or kills) itself. Option B's heavy build waits until pdf-extractor is stably healthy and A's verdict is in.

### Sequenced roadmap

| # | Step | Dataset / table | Effort |
|---|---|---|---|
| 1 | **Repair the serving floor:** re-aggregate the missing 2026-07-11 candle from surviving ticks (urgent — 24h retention) or via taOhlcvBackfill; add a startup "last-session-candle-present?" guard; fix the ohlcv-backfill `done=1`-regardless bug + inserted-count check on `/api/ohlcv-backfill-done` | `daily_ohlcv`, `market_prices_history`, `ohlcv_backfill_queue` | 2-4 days |
| 2 | **Archive-now parallel track (one batch):** 5-min tick downsample table before the 24h purge; fix the foreign-flow deferred-write race; daily `/liquidity-state` cron → `sbv_omo_daily`; daily FTS-rebuild cron on rag-service | new 5-min bars table, `daily_ohlcv` foreign cols, `sbv_omo_daily`, LanceDB `rag_entries` | 3-5 days |
| 3 | **Ship the divergence screen v1:** foreign z-score (accum-rank) × sentiment (`rag_analyses`) × RS (`/ta/relative-strength`), watchlist-scoped, daily Telegram digest via existing alerts path | `daily_ohlcv`, `foreign_room_events`, `rag_analyses`, `mention_velocity` | 4-6 days |
| 4 | **Regime gate v1:** carry spread × DXY-vs-30d-mean × OMO stress (once ≥5 auctions accrue) as a size-up/stand-down dial prepended to every screen output; exclude is_estimate fields honestly | `sbv_rates`, `fred_series_daily`, `commodity_prices_history`, `sbv_omo_daily` | 3-4 days |
| 5 | **Truth ledger + backtest calibration:** rank signal classes by realized hit-rate/impact from the already-running outcome tables; backtest RSI/BB thresholds against the ~3y bars; mute losing alert classes | `signal_outcomes`, `alerts`, `calibration_snapshots`, `backtest_runs`, `daily_ohlcv` | ~1 week |
| 6 | **Decision gate → Option B:** if pdf-extractor has been healthy ≥2 weeks and A is producing scored signals, start the BCTC deferred_infra drain + AGM multi-year backfill as the next major build | `bctc_vps_queue`, `bctc_table_rows`, `agm_plan/actuals` | gate, then 6-10 weeks |

Total to a live, scored, regime-gated flow loop: **~3-4 weeks.**

### Kill / pivot criteria

1. **Signal-quality kill (A):** after 8 weeks of outcome scoring, if the divergence screen's resolved T+24/48h hit-rate is indistinguishable from the base rate (and average 3d impact ≤ 0) at n ≥ 40 signals — stop A, pivot the freed effort to Option B, keeping only the regime gate and archive track.
2. **Ingestion-integrity kill:** if the foreign-flow plane suffers a second silent-loss class (beyond the deferred-write race) or the VPS has >2 multi-day outages in a quarter — freeze new signal work and redirect to acquisition hardening (VPS redundancy / second push target), because every option dies without the ingestion plane.
3. **BCTC pivot trigger (B):** if by step-6 gate the extractor still can't hold 2 weeks of health or deferred_infra can't be drained below ~30% of the queue — abandon in-house structured extraction for historical quarters and downgrade Option B to the vnstock-only fundamentals layer (already populated weekly), reserving the PEK pipeline for current-quarter filings only.

### Traceability note
Every dataset, row count, and health claim above comes from the inventory (A), the 2026-07-11T21:40Z probe (B), or the named lens item (C). Where the probe was degraded — pdf-extractor health, missing Friday candle, 2 unhealthy VPS services, FPT BCTC artifacts — this document treats those as facts to plan around, not assumed-healthy. No datasets were invented; sector-tool static seeds, SBV config-fallback rates, GSO empty pushes, and bond_maturity seed rows are explicitly excluded from all strategy inputs until their writers are made honest.

---

*Generated 2026-07-11 by ultracode workflow `data-strategy-selection` (run wf_36dfdd93-80d): 18 agents — 13 service-inventory analysts + 1 live gateway probe (status: DEGRADED), 3 opportunity lenses (alpha/moat/feasibility), 1 synthesis. Services analyzed: 13, opportunities scored: 29.*
