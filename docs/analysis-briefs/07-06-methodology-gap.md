# 07-06 Roundtable — Methodology Gap Brief

**Source transcript:** `docs/raw-input/expert-discussion/Bàn tròn kinh tế/Bàn tròn kinh tế 07-06` (791 lines, spoken VN)
**Speakers:** Báu (host, macro), Thành (independent researcher, BOP/trade), Trường (W Group, moderator)
**Prior corpus distilled:** T-1..T-14 (31-05 roundtable) → 6 cowork skills in `.claude/skills/`
**Continues series at:** T-15

## Orientation note

The 31-05 roundtable was **company/equity** focused → produced the bottom-up screening skills (T-1..T-14). This 07-06 roundtable is almost entirely **macro / top-down**: inflation decomposition, FX stability mechanics, trade-deficit anatomy, and balance-of-payments (BOP) reasoning. So almost none of it overlaps T-1..T-14 — instead it fills the **macro layer above** them (TNB Layer 1–3: macro → sector → regime), which is currently served by `get_macro_snapshot` + `regime-extraction` + `unified-agent`/CHEF's TNB 6-layer walk and `market-watcher`.

The dominant deliverables here are therefore **AGENT-UPGRADE** (market-watcher, unified-agent/CHEF, digest-predict) and **NEW-MCP-TOOL** (real VN macro series the system does not yet have), plus 2 genuinely new skills (a macro-health read protocol and a trade-deficit/FX-pressure decomposition).

---

## Technique catalogue

| ID | Name | Action | Source lines |
|---|---|---|---|
| T-15 | Dual-axis macro read (production vs consumption) | NEW-SKILL `macro-health-read` | 37–41, 96–98 |
| T-16 | PMI moving-average over raw print | EXTEND `regime-extraction` (+ NEW-MCP-TOOL) | 44–52 |
| T-17 | IIP vs YoY (de-seasonalise), use YTD-cumulative not MoM | NEW-SKILL `macro-health-read` (+ NEW-MCP-TOOL) | 56–73 |
| T-18 | Nominal-vs-real consumption (strip CPI from retail sales) | NEW-SKILL `macro-health-read` (+ NEW-MCP-TOOL) | 80–98 | 
| T-19 | "Tăng doanh thu, không tăng sản lượng" — revenue-up/volume-flat tag for retail tickers (MWG) | AGENT-UPGRADE bctc-analyst | 94–98 |
| T-20 | Oil-shock pass-through to CPI is near-immediate in VN (model correction) | AGENT-UPGRADE market-watcher | 110–125 |
| T-21 | CPI peak-detection (shock front-loaded → CPI rolls over) | AGENT-UPGRADE market-watcher / digest-predict | 130–146, 178–195 |
| T-22 | Component-level CPI driver decomposition (transport ~20% weight, construction-materials, food) | NEW-MCP-TOOL `get_cpi_components` | 113–122, 146–173 |
| T-23 | Bank-survey consensus cross-check (VIRA/VARA) for CPI/IRS/interbank/FX | AGENT-UPGRADE digest-predict (+ NEW-MCP-TOOL) | 185–198, 318–326 |
| T-24 | Public investment (đầu tư công) disbursement-speed read | NEW-MCP-TOOL `get_vn_investment_flows` | 203–209, 236 |
| T-25 | FDI registered-vs-disbursed split + sector quality (high-tech/AI chips, data centers) | NEW-MCP-TOOL `get_vn_investment_flows` | 212–230, 496–502 |
| T-26 | Record trade deficit = leading FX-stress signal (2010–11 analogue) | NEW-SKILL `trade-fx-pressure-decomp` | 244–254, 342–346 |
| T-27 | SJC vs world gold premium gap as FX/policy stress proxy | AGENT-UPGRADE market-watcher (+ NEW-MCP-TOOL) | 257–266 |
| T-28 | VND/USD only stresses when CNY weakens vs USD (CNY-coupling rule) | AGENT-UPGRADE market-watcher | 272–288 |
| T-29 | Interbank-rate "framework break" read (OMO/refi floor vs interbank, Big-4 margin) | NEW-MCP-TOOL `get_vn_liquidity_state` | 293–311 |
| T-30 | OMO outstanding balance level as liquidity-stress gauge | NEW-MCP-TOOL `get_vn_liquidity_state` | 296–299 |
| T-31 | "Thiếu tiền" root-cause: fiscal surplus traps deposits (treasury cash at SBV) | AGENT-UPGRADE unified-agent/CHEF | 329–335 |
| T-32 | Leading-data-before-GSO-print principle (read movers first, predict the official series) | AGENT-UPGRADE market-watcher | 200–202, 338–347 |
| T-33 | Trade-deficit two-bloc decomposition (FDI surplus shrink vs domestic deficit) | NEW-SKILL `trade-fx-pressure-decomp` (+ NEW-MCP-TOOL) | 425–431, 542–559 |
| T-34 | HS-group attribution of the deficit (electronics/components ≈70–80%; oil ≈30%) | NEW-MCP-TOOL `get_vn_trade_balance` | 440–491 |
| T-35 | Processing-margin (biên gia công) = export/import value ratio per HS group | NEW-MCP-TOOL `get_vn_trade_balance` | 584–602, 614–629 |
| T-36 | Negative-margin trap ("càng xuất khẩu càng chết") when biên < 1 and volume grows | NEW-SKILL `trade-fx-pressure-decomp` | 602–629 |
| T-37 | Import-cost spike vs sticky output price → intercompany FDI loss (Samsung chip/RAM 5–6×) | AGENT-UPGRADE bctc-analyst (electronics tickers) | 506–518, 722–734 |
| T-38 | FDI surplus parked offshore (0% USD deposit) → deficit ≠ FX outflow (BOP errors-and-omissions) | NEW-SKILL `trade-fx-pressure-decomp` | 542–559, 656–719 |
| T-39 | Full BOP walk: current acct + financial acct + E&O; deposit/other-investment line is the swing | AGENT-UPGRADE unified-agent/CHEF | 671–719 |
| T-40 | Domestic-vs-FDI deficit discriminator for FX risk (domestic deficit = real pressure) | NEW-SKILL `trade-fx-pressure-decomp` | 551–559, 644–664 |
| T-41 | "Fake FDI" — capital injections that merely cover accumulated trading losses | AGENT-UPGRADE news-scout / market-watcher | 740–746 |
| T-42 | Trade cycle is ~1-year peak-to-trough, not 2–3 months (deficit-duration prior) | AGENT-UPGRADE digest-predict | 773–776 |
| T-43 | China PPI/CPI as imported-inflation leading indicator (PPI leads CPI ~3m; decompose component) | AGENT-UPGRADE market-watcher | 359–398 |
| T-44 | Decompose-before-conclude discipline (3 questions: which component, direct-or-indirect to wallet, policy-shock-or-trend) | EXTEND `four-factor-synthesis` (meta-rule) | 399–410 |
| T-45 | Adversarial cross-examination ("phản biện qua lại") before publishing a macro call | AGENT-UPGRADE tran-ngoc-bau (supervisor) | 415–416, 756–757 |

**Counts:** 31 techniques (T-15..T-45). Actions: 2 NEW-SKILL groups (covering 8 techniques), 5 NEW-MCP-TOOL (covering 12 techniques), 2 EXTEND (existing skills), ~13 AGENT-UPGRADE, 0 SKIP.

---

## New skills proposed

### 1. `macro-health-read`
- **Trigger:** start of any cycle that needs a top-down read — invoked by `market-watcher` each cycle and by `unified-agent`/CHEF before the TNB Layer-1 macro paragraph, and on the monthly GSO data release.
- **What it does:** Báu's "two trucks → six tracks" walk (T-15). Reads, in order:
  1. **Production** — PMI (use 3–5-period MA, not the raw print: T-16) + IIP (compare YoY, use YTD-cumulative not MoM to kill Tết seasonality: T-17). Verdict: STRONG / AVERAGE / WEAK on *momentum*, not level.
  2. **Consumption** — retail sales, but strip CPI to get **real** growth (T-18). Nominal 11.2% with CPI ~6% ⇒ real ~5–6% = "thấp". Output `nominal_growth`, `real_growth`, and a `price_driven` boolean.
  3. **Inflation** — component decomposition (T-22) + peak-detection (T-21): is CPI YoY rolling over? Flag `cpi_peaked`.
  4. **Investment** — đầu tư công speed (T-24) + FDI registered/disbursed/quality (T-25).
  5. **FX/rates** — hand off to `trade-fx-pressure-decomp` for the deep read; here just record usdVnd direction + interbank level.
- **Output:** a 6-track JSON `{production, consumption, inflation, investment, fx, liquidity}` each with `{value, trend, verdict, is_estimate}` plus an overall `macro_regime_note`.
- **Agents that use it:** market-watcher (primary), unified-agent/CHEF (TNB Layer 1), digest-predict (weekly).
- **Note:** thresholds are deliberately *relative-to-history* and *momentum-based* (matches T-16/T-17/T-21), never absolute snapshots. Depends on the NEW-MCP-TOOLs below; until those land, the skill runs in degraded mode off `get_macro_snapshot` + `get_policy_signals` and marks every track `is_estimate=true`.

### 2. `trade-fx-pressure-decomp`
- **Trigger:** monthly trade-balance release; any month VN prints a goods deficit; or when `get_macro_snapshot` usdvnd direction = BEARISH while reserves/flows look benign (the "mysterious stability" case, T-26).
- **What it does:** Thành's BOP decomposition that explains *why a record deficit does not move FX* — and when it will.
  1. **Two-bloc split (T-33):** FDI bloc surplus vs domestic bloc deficit. 5M-2026 example: FDI surplus fell ~14B→~6B; domestic deficit ~9B→~11B.
  2. **HS-group attribution (T-34):** electronics+components ≈70–80% of the deficit; oil ≈30%/~3B; everything else minor.
  3. **Processing-margin (T-35/T-36):** export-value / import-value per HS group. VN's electronics range is ~0.6–0.7 (i.e. **−20% to −40%, mean −30%**). Flag NEGATIVE-MARGIN-TRAP when bién < 1 *and* volume is rising → "càng xuất khẩu càng chết".
  4. **FX-incidence test (T-38/T-40):** classify the deficit. **FDI-driven** deficit ⇒ low FX pressure (USD parked offshore at 0% VND deposit, settled abroad, shows up only as BOP errors-and-omissions; T-38). **Domestic-driven** deficit ⇒ real FX pressure (domestic firms must source USD at the bank).
  5. **Duration prior (T-42):** trade cycles run ~1 year peak-to-trough; do not treat a deficit as a 2–3 month blip.
- **Output:** `{deficit_total_b, fdi_bloc_b, domestic_bloc_b, hs_attribution[], electronics_margin, margin_trap_flag, fx_incidence: FDI_BENIGN|DOMESTIC_PRESSURE|MIXED, fx_pressure_verdict, cycle_stage}`.
- **Agents that use it:** market-watcher (FX/trade), unified-agent/CHEF (TNB macro→sector for electronics/IZ/banking), digest-predict (FX thesis).
- **Note:** this is the highest-signal new content in the transcript and the most data-hungry — it needs `get_vn_trade_balance` and the BOP series (see tool #1 and #2 below).

---

## New MCP tools requested (ranked by leverage)

> Discovery confirmed against the live gateway. Existing macro tools: `get_macro_snapshot` (vnIndex/oil/gold-world/usdVnd/carry/yield/investment-clock), `get_carry_trade_signal`, `get_yield_spread_signal`, `get_credit_flow_signal` (mostly is_estimate/static_seed), `get_policy_signals`, `get_foreign_flow`, `get_imf_signals`, `get_investment_clock_phase`, `run_impact_chain`. **None of the VN domestic real-economy series below currently exist with live data.**

### #1 — `get_vn_trade_balance` (HIGHEST leverage; unlocks T-33/T-34/T-35/T-36 + both new skills)
- **Input:** `{period: "YYYY-MM" | "YTD", group_by: "bloc"|"hs_group"|"country", lookback_months?: int}`
- **Output:** total export/import/balance; split FDI-bloc vs domestic-bloc; per-HS-group export, import, net, and **processing-margin (export/import ratio)**; per-country import (to spot Taiwan/Korea chip inflow → AI signal). Include a multi-year margin series so the two-trend chart (T-35, lines 764–767) is reproducible.
- **Data source:** GSO / Vietnam Customs (Tổng cục Hải quan) monthly trade statistics. Geo-blocked → route via Vinahost VPS per `project_bctc_vps_proxy`. Owner: dev-vps-crawls + dev-macro-indicators.
- **Unlocks:** 4 techniques, both new skills, market-watcher + CHEF + digest-predict.

### #2 — `get_vn_bop` (balance-of-payments; unlocks T-38/T-39/T-40)
- **Input:** `{period, components?: [current_account, trade_goods, services, income, transfers, fdi_net, portfolio_net, other_investment_net, errors_omissions, overall_balance]}`
- **Output:** each BOP line with sign, plus a derived `offshore_parked_estimate` (E&O proxy — Báu's ~$450B cumulative "ướm" at line 716–719) and `fx_swing_line` (the largest negative financial-account component).
- **Data source:** SBV (Ngân hàng Nhà nước) quarterly BOP; cross-check IMF (already have `get_imf_signals`). Geo-blocked → VPS. Owner: dev-vps-crawls + dev-macro-indicators.
- **Unlocks:** 3 techniques, the FX-incidence test in `trade-fx-pressure-decomp`, CHEF's BOP walk.

### #3 — `get_vn_macro_indicators` (real-economy series; unlocks T-16/T-17/T-18/T-24/T-25)
- **Input:** `{indicators: [pmi, iip, retail_sales_nominal, retail_sales_real, public_investment, fdi_registered, fdi_disbursed], transform?: "raw"|"ma3"|"ma5"|"yoy"|"ytd_cumulative"}`
- **Output:** each series with the requested transform pre-computed (so T-16 MA, T-17 YTD-cumulative, T-18 real-vs-nominal are first-class, not agent-side math), plus `is_estimate` per series.
- **Data source:** GSO monthly socio-economic report; PMI from S&P Global VN press releases. VPS for GSO; main-server fetch for the S&P PMI page. Owner: dev-macro-indicators + dev-vps-crawls.
- **Unlocks:** 5 techniques, the production/consumption/investment tracks of `macro-health-read`.

### #4 — `get_cpi_components` (unlocks T-22; supports T-20/T-21/T-43)
- **Input:** `{period, basis: "yoy"|"mom", weights?: bool}`
- **Output:** the 11 CPI baskets with weight and contribution (transport ~20%, housing+construction-materials, food & catering, education/health flagged as administered-price), plus a derived `cpi_peaked` boolean (T-21) from the momentum of the heaviest movers.
- **Data source:** GSO CPI release. VPS. Owner: dev-macro-indicators.
- **Unlocks:** 1 primary + reinforces the inflation track and oil-pass-through (T-20) and China-imported-inflation (T-43) reads.

### #5 — `get_vn_liquidity_state` (unlocks T-29/T-30; supports T-23/T-27/T-28)
- **Input:** `{}` (latest) or `{period}`
- **Output:** interbank rate (1-week tenor — the benchmark, per line 320–322), OMO outstanding balance + delta vs peak, refi/OMO floor, IRS, **SJC-vs-world-gold gap** (T-27), and **CNY/DXY cross** (T-28). One call covers Báu's liquidity + FX-coupling tracks.
- **Data source:** SBV OMO data + interbank fixings (VPS); SJC gold price (existing crawler — only the *gap* vs world is new math); CNY/DXY from main-server FX fetch. Owner: dev-macro-indicators + dev-vps-crawls.
- **Unlocks:** 2 primary + the FX/liquidity tracks of both new skills.

> **Bonus (low-cost, no new crawl):** extend `get_credit_flow_signal` and the VIRA/VARA survey path so T-23 (bank-survey consensus cross-check) returns a real distribution {mean, dispersion, hawk/dove outliers} rather than the current static-seed estimate. This is an EXTEND, not a new tool — flagged here because it pairs with #4/#5.

---

## Agent upgrades

### market-watcher (heaviest — owns the macro/anomaly surface)
- Add **CPI peak-detection** (T-21): each cycle, check if CPI YoY momentum is rolling over; emit a `cpi_peaked` regime note. Stop treating any single-month CPI print as a trend (T-32 leading-data principle).
- Encode **oil→CPI pass-through is near-immediate in VN** (T-20) — drop the old "lag" assumption; oil shock hits all baskets within the same month.
- Add the **CNY-coupling FX rule** (T-28): VND only stresses materially when CNY weakens vs USD; when CNY holds/strengthens (as now, ~+3.3% YTD), down-weight VND-depreciation alarms even if DXY is up.
- Add **SJC-vs-world gold gap** as a policy/FX-stress proxy (T-27): a *narrowing* gap (now ~8M VND vs historic ~20M) = easing domestic stress.
- Add **China PPI/CPI imported-inflation watch** (T-43): PPI leads CPI ~3 months; before alarming, decompose which PPI component moved and whether it hits VN consumer baskets directly.
- Watch for **"fake FDI"** (T-41): FDI registration spikes that are really parent-co loss-cover injections — corroborate against the electronics-margin trap before reading FDI as growth.

### unified-agent / CHEF (TNB 6-layer walk)
- Layer-1 macro paragraph now sources from `macro-health-read` (real/nominal-aware) instead of the raw `get_macro_snapshot` snapshot.
- Add the **full BOP walk** (T-39) and the **"thiếu tiền" fiscal-trap** narrative (T-31: budget surplus parks deposits at treasury/SBV → system liquidity tight despite profits) when synthesising the banking/rates dish.
- When the dish touches electronics / IZ / banking sectors, pull `trade-fx-pressure-decomp` so the macro→sector convergence reflects the deficit anatomy, not just the headline.

### digest-predict (weekly calibration + thesis)
- Adopt the **bank-survey consensus cross-check** (T-23): report VIRA/VARA mean + dispersion for CPI/IRS/interbank/FX alongside the system's own forecast; flag when the system diverges from consensus.
- Apply the **~1-year trade-cycle duration prior** (T-42): do not forecast deficit mean-reversion inside 2–3 months; model 6–12 month FX-pressure scenarios per `trade-fx-pressure-decomp` cycle_stage.

### bctc-analyst
- Add **revenue-up / volume-flat tagging** (T-19) for retail/consumer tickers (MWG cited): when revenue grows but real consumption is flat, label growth as `price_driven` (lạm phát) not volume — feed into the QoQ/YoY beat/miss read.
- For **electronics-assembly / FDI tickers** (Samsung-ecosystem, chip/RAM assemblers), add the **import-cost-spike vs sticky-output-price intercompany-loss** flag (T-37): chip/RAM up 5–6× while output price sticky ⇒ assembler margin −30–45%; this is a parent-co transfer-pricing artifact, not a standalone solvency signal.

### news-scout
- Add a **"fake FDI" / loss-cover capital-injection** detector (T-41): FDI-increase headlines that coincide with reported assembler losses → route as a WORK/context signal, not a bullish FDI signal.

### tran-ngoc-bau (strategy supervisor)
- Add an **adversarial cross-examination gate** (T-45): before a macro dish is published, confirm at least one "phản biện" round occurred (a claim was challenged and either defended with data or down-weighted). The 07-06 China-PPI exchange (Báu vs Thành) is the model — disagreement that forces decomposition, not consensus theater.

---

## Already-covered (maps to existing T-1..T-14)

Very little of 07-06 overlaps the prior company-level corpus — it is a different (macro) layer. The only genuine touchpoints:

- **Decompose-before-conclude / 3-question discipline (T-44, lines 399–410)** — a *meta-rule* version of what `value-trap-avoidance` Step 4 (conviction test) and `four-factor-synthesis` already enforce at company level. Folded in as an EXTEND note on `four-factor-synthesis` rather than a new skill, since the structure (which component → direct/indirect → shock-or-trend) generalises the existing "name a specific catalyst" rule.
- **Bank-debt-presence-as-quality-signal** — *not* re-derived here, but note the transcript's banking-liquidity discussion (lines 293–335) is consistent with the existing `ownership-governance-screen` NO-BANK-TRUST flag (T-10). No change needed.
- **Gold/oil/usdVnd regime signals** — already in `get_macro_snapshot` and `regime-extraction`; the transcript *refines the interpretation* (T-27 SJC gap, T-28 CNY coupling) rather than introducing the raw signals, hence AGENT-UPGRADE not SKIP.

No technique was dropped as "too vague": the macro reasoning here is unusually concrete (explicit weights, ratios, thresholds), which is why almost everything actions to a tool or skill.
