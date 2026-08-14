<!-- size-justification: ~775L — TE-T16 split (2026-08-06, agent-father): Steps 1.5-8 of chef's
     TNB 6-layer dish-recipe body, relocated verbatim from chef.md at the existing intraday
     silent-exit hard gate (chef.md Step 1) so that silent-intraday fires (~5/day) never pay to
     load this unreachable tail. Sequential 8-step dish-recipe decision framework (TNB 6-layer);
     dual-output Step 7 (MARKET plain-VI / WORK TNB-auditable) is one atomic responsibility; Step
     7.5 QUALITY VERDICT GATE checks all 5 required sub-checks (L2/L3/L4/BizCtx/gap-catalogue) as
     one deterministic block; Step 7.6 persist-JSON write-authorization + CYCLE_DATE-pin comments
     are load-bearing anti-recurrence guards, not changelog — splitting any of these further would
     break the single-enforcement-point guarantee. No logic changed by the relocation; full change
     history in git log. Design ref: docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-16.
     FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (architect brief 2026-08-07, FOLLOW-UP-1, agent-father
     2026-08-13): +44L (731→775, incl. this header note) — 8 one-line Checkpoint pointers inserted at every step boundary
     between the gate-fire and Step 7 (Steps 1.5/2/3/4/5/6/6.5/6.7), each jumping to the new
     chef-telemetry.md § Degraded-Floor Recovery on budget/tool-failure/uncertainty. No new section,
     in-place growth only, same pattern as every prior dated entry in this header. -->
> Parent: [./chef.md](./chef.md)

# Unified Agent — Chef Dish Body (Steps 1.5-8, TNB 6-Layer Recipe)

Entered ONLY from `chef.md` after the Step 1 gate fires (≥1 cluster qualifies) or `$DISH_TYPE` is
`morning` / `eod` / `evening` (guaranteed-publish windows). NEVER entered on an intraday-silent exit
— that path returns from `chef.md` directly and this file is never loaded.

Input: same `$DISH_TYPE` env passed into `chef.md`, plus the session state accumulated in
`chef.md` Steps 0.5/0/1 (signal groups, `$BIZ_CTX_SIGNALS`, qualifying clusters, published-marker claim).

**Tools:** `docs/agents/tools/package/unified-agent.md`

> Error boundary → skill: `.claude/skills/cowork-boundary/SKILL.md`

**Knowledge (lazy-load before Step 1.5 — moved here from chef.md per TE-T16; only Steps 1.5+
below consume these, so the chef.md silent-intraday exit path never pays for them):**
- `docs/standards/tnb-methodology.md` (6-layer framework)
- `docs/standards/tnb-methodology-layers.md` (state transitions, thresholds)
- `docs/standards/tnb-methodology-valuation.md` (Layer 6 gap catalogue)
- `docs/standards/market-analysis.md` (4-level cascade)
- `docs/references/kinh-dich-layer.md` (Kinh Dịch overlay)

---

## Step 1.5 — MACRO-HEALTH READ (Layer-1 source — run before cluster analysis)

→ skill: `.claude/skills/macro-health-read/SKILL.md`

Store result as MACRO_HEALTH. This replaces the raw `get_macro_snapshot` snapshot as the sole source for TNB Layer-1 macro paragraph. Log `is_estimate=true` tracks.

**T-31 / Fiscal-trap narrative:** When MACRO_HEALTH.liquidity.verdict = TIGHT despite apparent profitability in the banking/rates sector, check for the "thiếu tiền" root cause: budget surplus parking deposits at SBV treasury → system liquidity tight despite individual bank profits. The transmission: government under-spends → deposits remain at SBV → commercial-bank reserve levels tight → OMO outstanding rises. Include this narrative in the Layer-2 banking/rates section when applicable.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 2 — LAYER 1 (data discipline check)

For each qualifying cluster: verify signals cite **state transitions**, not just levels.

Flags to check (per `tnb-methodology-layers.md`):
- PMI crossing 50 (expansion ↔ contraction) — use MACRO_HEALTH.production MA, not raw print (T-16)
- USD/VND crossing 25,500 or 26,500 resistance
- CPI trend reversal (accelerating vs decelerating) — use MACRO_HEALTH.inflation.cpi_peaked (T-21)
- Volume 2x+ average (accumulation vs distribution)

Mark any level-reporting-only gap in the draft for Layer 6 fix.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 3 — LAYER 2+3 (US/VN economic stacks)

**US stack:**
- Manufacturing PMI (above/below 50 + direction)
- Consumer sentiment (trend)
- Fed rate + EFFR-IORB spread (tightening/easing posture)
- Global risk sentiment / geopolitical event flag (NEW) — from news-scout `chain_catalyst` signals with `event_type` in `[trade_war, geopolitical_conflict*, macro]` carrying a war/geopolitical marker in `payload.detail` (see `docs/agents/news-scout/flow/stage-signals.md` § Geopolitical/War Signal Dispatch). If ≥1 such signal is open on the bus this cycle (`get_open_chain_findings` or bootstrap signal cache), cite it explicitly: event summary + direction + confidence. If none present, satisfy this element with an explicit gap token `[gap:geopolitical_event_absent]` — absence of war/geopolitical signals is a valid, common state, not a failure. `*` `geopolitical_conflict` is LANE B; `trade_war`/`macro`-tagged war items already flow today.

**VN stack:**
- USD/VND vs 26,500 level (carry posture) — source: MACRO_HEALTH.fx
- CPI trend (inflationary pressure) — source: MACRO_HEALTH.inflation.cpi_peaked (T-21)
- FX reserves trend via VIRA data (not WiData — off-limits)
- **Foreign-room context (P0 indicator):** When available, `get_foreign_room()` provides per-ticker foreign-room utilization. Derive room exhaustion from high room_utilization_pct across watchlist. Use to refine FII flow thesis: high utilization (>80%) + rising rates → severe carry unwind risk; normal utilization → standard carry analysis applies.
- **Market sentiment context (P0 indicator):** `get_market_sentiment_index()` provides market-wide sentiment z-score (news_sentiment_z). When FII thesis involves sentiment-driven inflow/outflow, correlate against this metric: sentiment_z > +2.0 while FII net-selling = divergence signal (profession vs retail).
- **T-39 / BOP walk:** For any dish touching FX, banking, or trade: walk Current Account + Financial Account + E&O. The E&O line is the swing factor (FDI offshore parking). Source: `trade-fx-pressure-decomp` TRADE_FX.fx_incidence if available this cycle.

**Thesis mapping:** US → VN via carry/FII flow chain. If US tightening → FII net-sell pressure on VN → document the transmission. Enrich with foreign-room utilization and market sentiment divergence signals if available.

**Momentum & Relative Strength Context (P0 indicators):** When available, `get_roc_momentum()` provides 5-day rate-of-change (roc) with z-score normalization (z_score) and decile ranking (decile = 1-10 ranking vs recent history). `get_relative_strength()` provides relative strength rank (rs percentile vs watchlist) and composite momentum score. Use to refine entry/exit timing: decile ≥ 8 (strong momentum) + high RS percentile → accumulation signal; decile ≤ 2 (weak momentum) + low RS → distribution signal. When discussing ticker strength thesis, cite decile + RS percentile context if available.

**52-Week Proximity Context (P0 indicator):** When available, `get_52w_proximity()` provides percentage distance from 52-week high (pct_from_52w_high) and low (pct_from_52w_low). Use to assess valuation/risk positioning: pricing near 52w-high (pct_from_52w_high > -5%) + weak momentum → resistance risk; pricing near 52w-low (pct_from_52w_low < 20%) + rising momentum → recovery opportunity. Flag in Layer 3 thesis when positioning is extreme.

**Insider Activity Context (P0 indicator):** When available, `get_insider_sentiment()` provides aggregate insider net sentiment score (net_sentiment_score) reflecting insider buy/sell signal. High positive score (insider buying concentration) + bullish technical setup → corroborating thesis; negative score (insider selling) contradicting bullish thesis → flag as Layer 6 risk divergence. When insider data is unavailable (honest-NULL per `FIX-VPS-SSC-INSIDER-502`), note as a gap explicitly.

**Electronics/IZ/banking sectors:** When any qualifying cluster involves these sectors, invoke `trade-fx-pressure-decomp` (skill: `.claude/skills/trade-fx-pressure-decomp/SKILL.md`) and incorporate TRADE_FX.fx_incidence and margin_trap_flag into the sector layer narrative. Degraded mode (TRADE_FX.is_estimate=true) → note gap explicitly.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 4 — LAYER 4 (4-pillar valuation)

For each watchlist ticker in a qualifying cluster, map against all 4 pillars:

| Pillar | Vietnamese | Check |
|---|---|---|
| Money supply | Lượng tiền | Credit growth, M2, banking liquidity |
| Capital cost | Chi phí vốn | Interest rate environment, bond yields |
| Earnings outlook | Triển vọng lợi nhuận | BCTC trend, sector revenue, business-context fact from `$BIZ_CTX_SIGNALS` if present for this ticker (see mandatory sub-step below) |
| Valuation risk | Rủi ro định giá | P/E vs sector, premium/discount |

Confidence scoring:
- All 4 aligned → high conviction (cite in dish)
- 2-3 aligned → medium conviction
- <2 aligned → low conviction (flag in dish, do not recommend action)

**Business-context citation (mandatory when `$BIZ_CTX_SIGNALS` has an entry for this ticker):**
For each ticker in a qualifying cluster with a `$BIZ_CTX_SIGNALS[<TICKER>]` entry, the
earnings-outlook pillar's rationale text for that ticker MUST quote or closely paraphrase ≥1 of the
`product`/`customer`/`ops`/`mgmt` field values, attributed to the source file. Store the result:
```
$BIZ_CTX_CITED[<TICKER>] = { field: "product"|"customer"|"ops"|"mgmt", text: "<cited excerpt>",
                              source: "<source_file>" }
```
Do NOT fabricate a citation for a ticker with no `$BIZ_CTX_SIGNALS` entry — cite only where gathered
data actually exists for that specific ticker this cycle. Do NOT pull in a ticker that is not already
part of this cycle's qualifying clusters/conviction_calls[] purely to satisfy this requirement (see
§5 Blocker Q1 for the one open policy question this raises). If `$BIZ_CTX_SIGNALS` is empty for
EVERY ticker in the dish, `$BIZ_CTX_CITED` stays empty and the Step 7.5 gap-token path applies —
this is the honest floor, identical in spirit to the Step 1 degraded-dish floor and the Step 5
`$L5_GAP_TOKEN` floor.

**Volatility & Breadth Context (P0 indicators):**
When available, use `get_volatility_indicators()` and `get_breadth_thrust()` to adjust conviction:
- High volatility (gk_vol_20d_pct elevated, vol_regime='high') + bullish thesis → cap conviction at MEDIUM (increased realization risk)
- Weakening breadth (mclellan_osc negative, zweig_max_consecutive declining) + sector bullish thesis → flag divergence in Layer 6 (sector enthusiasm not supported by breadth)
- Compressed volatility (vol_regime='compressed') + bearish thesis → cap conviction at MEDIUM (asymmetric risk on volatility expansion)

**Momentum, Relative Strength & Insider Context (P0 indicators):**
When available, use the momentum/RS/52w-proximity/insider indicators to refine conviction and risk assessment:
- Bullish thesis (EPS ↑, COC low, valuation attractive) + strong momentum (decile ≥ 8) + high RS percentile + positive insider_sentiment → elevate conviction to HIGH (accumulation confirmation)
- Bullish thesis + weak momentum (decile ≤ 2) + low RS percentile → cap conviction at MEDIUM (thesis not yet confirmed by accumulation; requires patience)
- Bearish thesis + falling momentum (decile ≤ 2) + low RS percentile → elevate conviction to HIGH (distribution confirmation)
- Pricing at 52w-high with falling momentum + thesis reversal (e.g., EPS forecast cut) → elevate risk flag to Layer 6 (top-of-range vulnerability)
- Pricing at 52w-low with rising momentum + recovery thesis + positive insider_sentiment → flag as oversold recovery opportunity (cite decile + insider_sentiment in conviction narrative)

**Cycle phase declaration (MANDATORY — TNB Step H):**
After scoring pillars, declare the investment-clock phase and matching pyramid tier:

| Phase | Signal pattern | Pyramid tier |
|---|---|---|
| Expansion | M2 ↑, COC low, EPS ↑, POL neutral/easing | Equity (growth + cyclical) |
| Slowdown | M2 flat/↓, COC rising, EPS mixed, POL tightening | Fixed income / quality equity |
| Contraction | M2 ↓, COC high, EPS ↓, POL tightening | Cash / defensive |
| Recovery | M2 ↑, COC falling, EPS bottoming, POL easing | Equity (value + recovery) |

Write one line per cluster in session state:
```
[phase: <expansion|slowdown|contraction|recovery>] [tier: <equity|fixed_income|cash|defensive>] — rationale: <one sentence citing the pillar evidence>
```
If phase is ambiguous (mixed pillar signals), declare `[phase: transition]` and cap conviction at MEDIUM regardless of pillar score.
Include this line verbatim in Block B (Step 7 WORK detail) inside the Layer 4 section.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 5 — LAYER 5 (Kinh Dịch overlay)

<!-- FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION (2026-07-29, PO c119, 2nd occurrence — live 503
     corroboration: get_system_status showed 7x "[WARN] kinhdich: service unreachable - omitting
     hexagram block - 503: insufficient price data for market reading - requires at least 7..." on
     the same evening a dish had ZERO hexagram content anywhere and no L5 gap token). Root cause:
     a kinhdich/get_portfolio_conviction error was previously treated as "nothing to say" and the
     step fell through silently — indistinguishable, to every downstream reader and to the dish's
     own quality gate, from "layer walked, nothing notable."

     REUSABLE RULE (state once — applies to EVERY layer's data source, not just L5; the same dish
     also silently missed + left untokened business-context, a second instance of this exact
     pattern): any layer step whose data-source call errors or returns empty MUST emit an explicit
     [gap:<X>] token carrying the upstream error text into BOTH (i) $LAYERS_WALKED_SUMMARY (Step 7.5)
     and (ii) known_gaps[] (Step 7.6 JSON, see that step's Implementation rules for the fix on the
     business-context side of this same rule). A silently-omitted layer is NEVER acceptable — the
     floor is an honest, tokened gap, same principle as the Step 1 degraded-dish floor.

     Explicitly NOT this fix's job: asserting $QUALITY_VERDICT over L5 (that is
     FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION, a separate row — do not merge). This
     fix only guarantees the gap is TOKENED and VISIBLE; it does not change full-vs-degraded. -->

For each qualifying cluster ticker:
- Call `get_portfolio_conviction(ticker)`. **Error/empty-return handling (mandatory — do not fall
  through silently):** if the call errors (any non-2xx status or exception) or returns an
  empty/no-data response, set `$L5_GAP_TOKEN = "[gap:L5_kinhdich_unavailable: " + <verbatim
  upstream error text, e.g. "503: insufficient price data for market reading - requires at least
  7..."> + "]"` and continue to the next ticker — Kinh Dịch is one overlay among six; its absence
  never blocks publication, but it must never be silent. If the call succeeds: per-ticker hexagram
  state is embedded in the response. Per memory `feedback_chef_kinhdich_confab`: this is the
  authoritative source for per-ticker hexagrams; `get_market_hexagram` returning 501 does NOT
  indicate hexagram data is unavailable.
- Flag Lão Dương (老陽, peak Yang) or Lão Âm (老陰, peak Yin) explicitly — these are reversal signals.

If `$L5_GAP_TOKEN` was set for ANY ticker this cycle, carry it (dedup identical error text) into
Step 7.5 and Step 7.6 per the reusable rule above. Leave `$L5_GAP_TOKEN` unset/empty when every
call this cycle succeeded — do not emit a gap token for a layer that was genuinely, successfully walked.

For dish header: if `get_market_hexagram()` returned a result in Step 0, use it as market-wide context. If it was absent/501 (`market_hexagram=unavailable`), skip the market-wide hexagram header line — do NOT abort or degrade conviction.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 6a — CONVICTION GATE (four-factor synthesis scenario check)

→ skill: `.claude/skills/four-factor-synthesis/SKILL.md`

For each ticker in a qualifying cluster, invoke four-factor-synthesis. Check the returned `scenario` field:
- **Scenario 4 (SKIP-GOVERNANCE or SKIP-FUNDAMENTALS):** HARD BLOCK on publication. Do NOT include this ticker in any MARKET message, WORK message, or published recommendation. Log the block reason and skip to next ticker.
- **Scenario 1/2/3:** Proceed to Step 6 (gap catalogue).

Rationale: Scenario 4 signals a fundamental disqualifier (governance red flag or failed financials); publishing a thesis on Scenario 4 violates TNB Layer 6 (gap catalogue) and invites reputation damage. CHEF must not publish Scenario 4 tickers under any circumstance.

---

## Step 6 — LAYER 6 (gap catalogue)

<!-- AUTO-CURE c98 2026-06-17 (tran-ngoc-bau): F-GOLD-THRESHOLD-BREACH — gold >$4,300 used as
     phase-override driver in 3+ consecutive dishes without being cited as an explicit L6 gap entry.
     Added mandatory gold-threshold regime-drift check below. -->

Scan the draft narrative against gap catalogue from `tnb-methodology-valuation.md §Layer 6`:

| Gap type | Fix required |
|---|---|
| Single-pillar thesis | Add the other 3 pillars or state "insufficient data — cannot confirm" |
| Inverted causality | Reverse the causal chain; re-check |
| Source risk | Flag if only 1 source; add caveat |
| Lagged indicator | Note lag; add forward-looking supplement |
| Regime drift | Re-check current macro regime before asserting |

**Gold threshold regime-drift check (mandatory when gold is a cluster driver):**
If gold price is >$4,300 AND gold is cited as a safe-haven / phase-override signal in any cluster narrative, add this explicit L6 gap entry to the dish:
```
[L6-gap: gold >$4,300 active — regime-drift risk: gold-driven phase override may lag actual risk-off reversal; flag as regime-drift until gold retraces below $4,300 or EFFR-IORB confirms liquidity tightening]
```
This entry must appear in the WORK [CHEF-DETAIL] Block B Layer 6 section. It may be omitted from the MARKET plain-VI message.

<!-- AUTO-CURE c111 2026-07-16 (tran-ngoc-bau): F-L6-SINGLEPILLAR-GAP-UNENFORCED — the
     "Single-pillar thesis" row has existed in the gap-catalogue table above since inception,
     but (unlike the gold >$4,300 check) no automated check ever compared it against the
     `pillars_aligned_count` field already computed per ticker in Step 4. Confirmed recurring
     3+ consecutive evening dishes: 07-14 (BSR 2/4, VHM 1/4, VIC 1/4), 07-15 (BSR/VHM/VIC all
     2/4), 07-16 (VIC 2/4, VHM 2/4, VCI 0/4, ACB 1/4) — EVERY conviction call in all 3 dishes
     scored below the 3-pillar bar and NONE was ever cited as an explicit L6 gap entry. -->
**Single-pillar thesis check (mandatory for every conviction call):**
For each entry in `conviction_calls[]` (Step 4), if `pillars_aligned_count < 3`, add this explicit L6 gap entry to the dish (one per under-threshold ticker):
```
[L6-gap: single-pillar thesis — <ticker> <pillars_aligned_count>/4 pillars aligned; per tnb-methodology-valuation.md Layer 6, add the missing pillars or state "insufficient data — cannot confirm"]
```
This entry must appear in the WORK [CHEF-DETAIL] Block B Layer 6 section and be added to `$L6_GAP_TOKENS` (same list Step 6 already carries to Step 8b). It may be omitted from the MARKET plain-VI message. Does not change `$QUALITY_VERDICT` or the conviction score itself — pure gap-catalogue disclosure, same risk profile as the gold-threshold check above.

Apply fixes before Step 7. If a gap cannot be fixed (missing data) → flag explicitly in dish.

<!-- AUTO-CURE c110 2026-07-15 (tran-ngoc-bau): F-L6-AUDIT-VISIBILITY-GAP — the notebook
     "Layers walked" line (Step 8b) only ever surfaces the 5 Step-7.5 data-availability gap
     tokens ([gap:L2_...]/[gap:L3_...]/[gap:L4_...]/[gap:business_context_...]/
     [gap:L6_gap_catalogue_not_enumerated]) — it never carries the genuine `[L6-gap: ...]`
     methodological-risk entries this step produces (single-pillar / inverted-causality /
     source-risk / lagged-indicator / regime-drift). Three consecutive tran-ngoc-bau audit
     cycles (c108, c109, c110), MCP-blocked and reading unified-agent.md as a file-proxy for
     the WORK [CHEF-DETAIL] message, misdiagnosed this as chef "conflating" L6 into data-gap
     tokens — the distinction was always present in this step, just invisible downstream. -->
Store every `[L6-gap: ...]` entry emitted in this step into `$L6_GAP_TOKENS` (empty list if
none this cycle). This list is carried to Step 8b for the notebook write.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 6.5 — SYNTHESIZE (causal chain — mandatory before WRITE DISH)

For each qualifying cluster (from Step 1), write ONE causal-chain sentence in this exact form:

```
[global event] → [VN macro propagation] → [sector reaction] → [ticker: end state]
```

Example: "Fed hawkish hold → VND carry pressure +0.4σ → banking sector net-sell by foreigners → VCB price +4.12% on SOE inflow contradicts the macro signal."

Rules:
- One sentence per qualifying cluster. No exceptions — if no global event is identifiable, start from VN macro.
- If any link in the chain is missing (no data for that level), write the chain with an explicit gap marker: `[gap: <what is missing>]` at the missing position AND set conviction to LOW for that cluster regardless of pillar score.
- Example with gap: "[gap: no US macro signal in cycle] → [gap: carry regime unavailable — macro is_estimate=true] → banking sector under foreign pressure → [gap: no news_impact for VCB] — conviction LOW."
- If conf=0.50 on all signals for a cluster (uncertain source baseline), label: `[uncertain-source baseline]` after the ticker state and treat as LOW conviction.
- **Carry/FII provenance rule (DSI-CONSUMER-HONORS-ISESTIMATE):** The carry spread, carry regime, and any FII-flow thesis derived from the US-VN rate differential MAY ONLY appear in the causal chain when `get_macro_snapshot` returns `carry.is_estimate=false` AND `carry.carrySpread != null`. If `is_estimate=true` OR `carrySpread=null`, insert `[gap: carry regime unavailable — macro is_estimate=true]` at that chain position and do NOT compute a spread from the raw `fedFundsRate` / `vndDepositRate` fields. Never recompute deposit−fed manually from raw rate fields.
- If `$BIZ_CTX_CITED[<ticker>]` is set for the ticker in this cluster's chain, the `[ticker: end
  state]` component of the causal-chain sentence MUST include the cited fact (or an immediate
  trailing clause carrying it) — e.g. "...VCB price +4.12% on SOE inflow, ROE 16.7% vs sector 17.6%
  (bctc_signal_VCB_20260811_routine.json)." This does not change the chain's required shape; it is
  additive content at the ticker-state position.
- Store all chain sentences in session state — they become the mandatory spine of paragraph 2 in Step 7.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 6.7 — NUMERIC INDICATOR ANTI-FABRICATION GATE (mandatory — run before WRITE DISH)

<!-- FIX-CHEF-FABRICATED-TA-NUMBERS 2026-06-15: root cause was dish id 753 (2026-06-15 06:21:50)
     containing "VHM RSI 9.8, VIC RSI 7.4" — fabricated single-digit values with no cycle tool
     source. These contradicted all live sources. This gate closes the fabrication vector. -->

### Rule AF-1 — No numeric indicator without a live cycle source

CHEF MUST NOT emit any numeric value for the following indicator classes in any published message (MARKET or WORK channel) unless that exact number was returned by a tool called **in the current dish cycle**:

- RSI (any variant: RSI(14), RSI(9), etc.)
- MACD value or histogram
- Bollinger Band width, position, or σ distance
- Moving average values (MA5, MA20, MA50, EMA)
- Any "standard deviation" or σ figure applied to price

**Current cycle tool inventory:** `get_cycle_bootstrap`, `get_market_hexagram`, `get_portfolio_conviction`, `get_macro_snapshot`. NONE of these return a computed numeric RSI, MACD, BB, or σ value for a ticker.

Therefore: **in every dish cycle until `get_technical_indicators` is explicitly added to Step 0 GATHER, CHEF publishes ZERO numeric indicator values.** Qualitative TA language derived from `get_portfolio_conviction`'s conviction level, signal direction, trend arrow (↗/↘/→), and alert count is permitted and preferred.

**`get_portfolio_conviction` plain-text trap:** The tool's dashboard narrative may contain phrases like "RSI 70+ (overbought)" or "Overextended" in its ticker detail section. These are the tool's own editorial labels — they are NOT live RSI readings CHEF may cite as current. CHEF must read conviction score, direction, and alert counts from this output — never extract and relay a numeric RSI token from it as a current indicator value.

### Rule AF-2 — Qualitative-only TA vocabulary (until `get_technical_indicators` is live in cycle)

When discussing technical posture, use ONLY:
- Conviction level from `get_portfolio_conviction`: CAO / TRUNG BÌNH / THẤP
- Direction: BUY / HOLD / SELL / NEUTRAL
- Trend arrow: ↗ tăng / ↘ giảm / → đi ngang
- Alert count: "N cảnh báo trong 7 ngày"
- Kinh Dịch state: plain Vietnamese name (no Hán-Việt in MARKET)
- Qualitative regime: "áp lực bán", "tín hiệu tích lũy", "cẩn trọng" — WITHOUT attaching a fabricated number

**Dependency:** Once `FIX-TA-GOSVC-NA-DESPITE-DEPTH` lands and `get_technical_indicators` returns non-N/A values, add `get_technical_indicators(code)` to the Step 0 GATHER supplementary calls list. At that point, RSI/MACD/BB values sourced from that call in the same cycle MAY be cited verbatim. Until then, this prohibition is absolute.

### Step 6.7 Pre-Publish Self-Check (run before every send_telegram call)

Before constructing the `send_telegram` call for either Block A or Block B, CHEF MUST mentally scan the composed text for the following token patterns:

```
BLOCKED tokens: RSI \d+\.?\d* | MACD \d+\.?\d* | BB \d+\.?\d* | σ \d+\.?\d* | MA\d+ = \d+ | roc -?\d+\.?\d* | z_score -?\d+\.?\d* | decile \d+ | percentile \d+ | rs \d+ | composite_score \d+\.?\d* | pct_from_52w_high -?\d+\.?\d* | pct_from_52w_low -?\d+\.?\d* | net_sentiment_score -?\d+\.?\d*
```

**If any blocked token is found in the text:**
1. Check: was the corresponding tool (`get_technical_indicators` for TA indicators, or `get_roc_momentum`/`get_relative_strength`/`get_52w_proximity`/`get_insider_sentiment` for the new momentum/strength/52w/insider families) called this cycle with a response containing that exact number? If YES → token is permitted.
2. If NO (no corresponding tool call, or the number does not match the tool response) → STRIP the numeric token entirely. Replace with the qualitative equivalent (e.g. "roc -0.4" → "tâm lý suy yếu"; "percentile 75" → "xếp hạng mạnh") OR remove the clause entirely if no qualitative equivalent is meaningful.
3. Log the strip action in Block B WORK message: `[AF-GATE: stripped fabricated indicator "<original token>"]`.
4. If more than 2 blocked tokens are found in one dish → escalate: add `[AF-GATE: ESCALATION — >2 indicator tokens stripped; recipe review needed]` to the WORK message.

This self-check is NOT optional. Bypassing it is a flow violation equivalent to bypassing Step 6a Scenario-4 block.

### Rule AF-3 — Narrative Truth Gate (CCATO detector — run before send_telegram)

→ skill: `.claude/skills/claim-truth-gate/SKILL.md`

Before constructing EITHER Block A or Block B `send_telegram` call, invoke the claim-truth-gate on the composed narrative to detect CCATO (Claim Contradicts Authorized Tool Output).

Invoke (choose Block A or Block B text accordingly):
```
GATE_EXIT = skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed Block A or Block B text>
  agent_id  = "unified-agent"
  cache     = <this cycle's tool-call results, or null>
```

**Exit-code handling:**
- `0` = PASS → proceed to `send_telegram` call(s).
- `1` = FAIL — contradiction detected; signal emitted to `po`. Self-correct:
  1. Read stdout: `[FAIL] dimension=... tool=... ticker=...`
  2. Call the named tool directly.
  3. Rewrite the offending sentence using real returned values.
  4. Re-run this skill with corrected text.
  5. Second-pass PASS → proceed to `send_telegram`.
  6. Second-pass FAIL → write honest gap (e.g. "công cụ chưa trả được <dimension>") and proceed to send (no hard block for CHEF because the message must publish).
- `2` = config-error → fail-loud: `send_telegram(channel="bug", message="[unified-agent] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Script fires `narrative_contradiction` on FAIL. Do NOT suppress it.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 7 — WRITE DISH (Dual-Output)

Produce **two outputs** from the synthesized analysis: Block A for the user (MARKET channel — plain Vietnamese), Block B for TNB audit (WORK channel — analyst detail).

**CRITICAL: send_telegram call contract (anti-fabrication guardrail FIX-CHEF-SENDTELEGRAM-ARGSHAPE)**
EVERY send_telegram call in this step MUST use the named-parameter record form: `send_telegram(channel="<channel>", message="<message_text>")`. Never pass the message as a bare string or channel as a positional argument. Bare-string calls trigger "expected record received string" parser failure. Correct pattern:
```
send_telegram(channel="market", message=<Block_A_text>)
send_telegram(channel="work", message="[CHEF-DETAIL] ..." + <Block_B_text>)
```
Incorrect (FORBIDDEN):
```
send_telegram("market", <Block_A_text>)          # bare string message
send_telegram(market, message=...)               # channel as unquoted var
send_telegram("expected record received string") # any bare string
```

---

### Block A — MARKET message (plain Vietnamese, user-facing)

**Audience:** Non-technical user reading on a phone. Goal: comprehensible in 30 seconds.

**Structure (3–6 sentences total):**
1. What happened today — plain direction + delta % (e.g. "Thị trường hôm nay giảm nhẹ, VN-Index mất khoảng 0.8%").
2. What is driving it — plain Vietnamese (e.g. "Dòng tiền ngoại rút ra khỏi nhóm ngân hàng do áp lực tỷ giá USD/VND tăng").
3. What it means for the watchlist — name tickers in plain context (e.g. "VCB và TCB chịu áp lực bán, trong khi HPG hưởng lợi từ đơn hàng xuất khẩu").
4. Kinh Dịch context (optional, only if meaningful reversal signal): plain Vietnamese name only, no Hán-Việt code or hào numbers (e.g. "Quẻ thị trường đang ở trạng thái đỉnh Yang — tín hiệu cần thận trọng với đà tăng").
5. What to watch next — one concrete trigger (e.g. "Theo dõi mức kháng cự 26,500 VND/USD trong phiên ngày mai").

**Format rules:**
- Full diacritics, flowing prose.
- NO inline citations (`#ID`, `price_anomaly_*`, `tier-1`).
- NO metadata block (no "TNB layers walked", no "Signal IDs consumed").
- NO `[gap: ...]` markers.
- NO σ / bp / pp notation.
- NO Hán-Việt hexagram codes (`Lão Âm Hào 6`) — use plain Vietnamese name only.
- NO bullet-point ticker dumps. Every MARKET message is narrative prose.
- NO numeric indicator values (RSI, MACD, BB, σ, MA) unless `get_technical_indicators` was called this cycle — see Step 6.7 AF-1. When in doubt: qualitative only.
- Khi nhắc đến cổ phiếu HCM, lần đầu tiên trong tin phải viết `HCM (cổ phiếu)` hoặc `HCM (mã CK)` để phân biệt với thành phố; khi nhắc đến thành phố luôn dùng `TP. HCM`.

**Send:**
```
send_telegram(channel="market", message=<Block_A_text>)
```

---

### Block B — WORK analyst detail (TNB-auditable)

**Audience:** tran-ngoc-bau audit. Contains the full 6-layer analysis.

**Content:** Full analyst narrative — identical in depth to the former single MARKET dish:
- Causal-chain sentences from Step 6.5 verbatim (including `[gap: ...]` markers)
- Paragraph 2 with inline citations: signal ID (`#3350`), source file (`price_anomaly_*`), source_tier
- Citation Discipline: every paragraph-2 claim MUST cite ≥1 of: signal ID, source file, source_tier. Claims without citations are a FLOW VIOLATION — self-correct or downgrade to "unverified observation". **When `$BIZ_CTX_CITED[<ticker>]` is set for a ticker discussed in paragraph 2, citing the source filename alone is NOT sufficient — the actual cited fact text (from `$BIZ_CTX_CITED[<ticker>].text`) MUST also appear**, not merely its filename.
- Metadata footer: "TNB layers walked: Layer 1–6 | Signal IDs consumed: [...] | source_tier values cited: [...]"
- Full hexagram names in Hán-Việt (`Lão Âm Hào 6`) — TNB expects canonical terminology.

**Send:**
```
send_telegram(channel="work", message="[CHEF-DETAIL] <DISH_TYPE> <HH:MM UTC>\n" + <Block_B_text>)
```

The `[CHEF-DETAIL]` prefix is mandatory — it allows tran-ngoc-bau's audit flow to filter WORK messages precisely.

---

## Step 7.5 — QUALITY VERDICT GATE (deterministic — run AFTER Step 7, BEFORE Step 8)

<!-- F-EVENING-QUALITY-OVERCLAIM fix 2026-06-24: closes the false-full badge class where
     a dish self-reports QUALITY:full while L2/L4/L6 are silently absent or partial.
     This gate is the single enforcement point for the quality verdict in ALL dish windows
     (morning / intraday / eod / evening). No path may write QUALITY:full without passing
     all five sub-checks below. Mirrors EOD rigor into every path deterministically. -->
<!-- AUTO-CURE c108 2026-07-13 (tran-ngoc-bau) — FIX-CHEF-STEP75-L3-BIZCTX-FLOOR:
     root cause confirmed by direct code read (chef.md pre-fix): this gate checked ONLY
     L2 (sub-check a) and L4 (sub-check b) — it never checked L3 (VN macro: USD/VND+CPI+VIRA)
     or business context (product/customer/ops/mgmt), despite both being required by
     tnb-methodology.md and tnb-methodology-layers.md. This let dishes self-report
     QUALITY:full while L3/CPI/VIRA and business context were silently absent —
     confirmed on 2026-07-13's eod (08:56) and evening (19:49) dishes (both QUALITY:full,
     neither cites CPI or VIRA/FX-reserves, neither cites business context), and matches
     F9 (business-context absent, 10+ consecutive assessable dishes) and F4 (VIRA gap,
     persisting many cycles) tracked in docs/agent-memory/notebooks/tran-ngoc-bau.md.
     Adds sub-checks (c) and (d) below, mirroring sub-check (a)'s gap-token floor pattern
     so a genuinely-unavailable source (VIRA scraper down; no bctc_signal_*/fundamental_*
     data this cycle — see bctc-analyst BCTC-EXTRACT-QUALITY sprint, AS-OF-2026-07-13 "14/16 filed tickers
     serve-layer-blocked" figure — historical, NOT current status) still allows QUALITY:full as long as the gap is
     explicitly tokened, not silently dropped. -->

Before writing the notebook entry or the RETURN block, evaluate the following five sub-checks against the work performed in Steps 2–6 of this cycle:

```
# Sub-check (a) — US macro layer (L2) presence
# MINIMUM FLOOR (AutoCure tran-ngoc-bau c103 2026-06-30 — FIX-CHEF-STEP75-L2OK-CARRY-PROXY-FLOOR):
# "Substantively walked" requires at least ONE of the following concrete US macro elements:
#   - US PMI value cited (ideally with sub-components) from get_macro_snapshot Step 3
#   - EFFR–IORB spread cited with a numeric value from get_macro_snapshot Step 3
#   - A global risk sentiment / geopolitical event cited in Step 3 (NEW 4th US-stack
#     element — event summary + direction/confidence, per LANE A brief
#     docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md §2 A4)
# Carry trade spread alone (e.g. "carry 1.37pp NEUTRAL") is NOT sufficient —
# it is a source_tier-3 derived proxy of the US/VN rate differential and does NOT
# represent a US macro stack walk (PMI, consumer sentiment, Fed liquidity plumbing).
# If neither PMI, EFFR-IORB, nor a geopolitical event signal is available (macro_health
# unavailable AND no open chain_catalyst geopolitical signal), an explicit gap token is
# REQUIRED — write [gap:macro_health_missing], [gap:US_macro_unavailable], or
# [gap:geopolitical_event_absent] in the Block B WORK message and in the L6 gap catalogue.
L2_OK = (US PMI value cited in Step 3 with a numeric data point)
        OR (EFFR-IORB spread cited in Step 3 with a numeric value)
        OR (a global risk sentiment / geopolitical event cited in Step 3, per the NEW 4th US-stack element — event summary + direction/confidence)
        OR (at least one explicit gap token was written for L2,
            e.g. [gap:macro_health_missing], [gap:US_macro_unavailable], or [gap:geopolitical_event_absent])

# Sub-check (b) — all 4 valuation pillars named (L4)
# Each pillar must be either cited with data OR explicitly flagged missing in Step 4
L4_PILLARS_OK = (lượng_tiền cited OR flagged_missing)
            AND (chi_phi_von cited OR flagged_missing)
            AND (trien_vong_loi_nhuan cited OR flagged_missing)
            AND (rui_ro_dinh_gia cited OR flagged_missing)

# Sub-check (c) — VN macro layer (L3) presence
# MINIMUM FLOOR (AutoCure tran-ngoc-bau c108 2026-07-13 — FIX-CHEF-STEP75-L3-BIZCTX-FLOOR):
# TNB Layer 3 requires three elements per tnb-methodology-layers.md: USD/VND vs 26,500
# (source: MACRO_HEALTH.fx), CPI trend (source: MACRO_HEALTH.inflation.cpi_peaked), and
# FX reserves via VIRA. USD/VND alone — cited as a raw level in nearly every dish — is only
# 1 of 3 required elements and does NOT by itself satisfy the VN macro stack walk. CPI and
# VIRA/FX-reserves are each individually satisfied by a cited value OR an explicit gap token
# (VIRA scraper outage is a known, tracked upstream condition — see F4 in tran-ngoc-bau
# notebook — so this floor does not block QUALITY:full when the gap is tokened honestly).
L3_OK = (USD/VND level cited from MACRO_HEALTH.fx)
        AND (CPI trend cited from MACRO_HEALTH.inflation.cpi_peaked
             OR an explicit gap token was written, e.g. [gap:CPI_unavailable])
        AND (FX reserves / VIRA cited
             OR an explicit gap token was written,
             e.g. [gap:VIRA_unavailable] or [gap:FX_reserves_unavailable])

# Sub-check (d) — business context presence (product / customer / ops / management)
# MINIMUM FLOOR (AutoCure tran-ngoc-bau c108 2026-07-13 — FIX-CHEF-STEP75-L3-BIZCTX-FLOOR):
# tnb-methodology.md's foundational philosophy requires every investment thesis to be
# anchored in the business behind the ticker, sourced from bctc_signal_* or fundamental_*
# gatherer signals read in Step 0 GATHER. At least ONE ticker in the dish must cite ≥1
# business-context field (product/customer/ops/management) OR the gap must be explicitly
# flagged when no bctc_signal_*/fundamental_* data was available this cycle for any
# watchlist ticker in the dish (a frequent, currently-tracked upstream condition — see
# bctc-analyst BCTC-EXTRACT-QUALITY sprint).
BIZ_CTX_OK = ($BIZ_CTX_CITED is non-empty for ≥1 ticker in conviction_calls[] this cycle —
              i.e. Step 4's mandatory citation sub-step actually fired, not merely asserted)
             OR ($BIZ_CTX_SIGNALS was legitimately empty this cycle — see chef.md Step 0 —
                 AND an explicit gap token was written, e.g. [gap:business_context_unavailable])

# Sub-check (e) — gap catalogue enumerated if any layer is partial/missing
ANY_LAYER_PARTIAL = (L2_OK relied on a gap token)
                 OR (L3_OK relied on a gap token for CPI or VIRA/FX-reserves)
                 OR (BIZ_CTX_OK relied on a gap token)
                 OR (NOT all 4 L4 pillars cited with data)
                 OR (any other layer scored PARTIAL/FAIL in this cycle)
GAP_CATALOGUE_OK = (NOT ANY_LAYER_PARTIAL)
                OR (Step 6 gap catalogue was explicitly enumerated with ≥1 [gap:X] token
                    in the Block B WORK message sent in Step 7)

# Verdict
if L2_OK AND L3_OK AND L4_PILLARS_OK AND BIZ_CTX_OK AND GAP_CATALOGUE_OK:
  $QUALITY_VERDICT = "full"
  $CONVICTION_CAP  = (no additional cap)
  $LAYERS_WALKED_SUMMARY = "1-6 (full)"
else:
  $QUALITY_VERDICT = "degraded"
  $CONVICTION_CAP  = "MEDIUM"   # cap all per-ticker conviction scores retroactively
  # List every failed sub-check as a gap token for the notebook
  $FAILED_CHECKS = []
  if NOT L2_OK:           $FAILED_CHECKS.append("[gap:L2_US_macro_absent_no_gap_token]")
  if NOT L3_OK:           $FAILED_CHECKS.append("[gap:L3_VN_macro_incomplete]")
  if NOT L4_PILLARS_OK:   $FAILED_CHECKS.append("[gap:L4_partial_pillar_coverage]")
  if NOT BIZ_CTX_OK:      $FAILED_CHECKS.append("[gap:business_context_absent]")
  if NOT GAP_CATALOGUE_OK: $FAILED_CHECKS.append("[gap:L6_gap_catalogue_not_enumerated]")
  $LAYERS_WALKED_SUMMARY = "partial — " + join($FAILED_CHECKS, " ")

# L5 (Kinh Dịch) gap-token append — FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION.
# Runs AFTER the verdict above on BOTH branches and does NOT participate in the full/degraded
# computation (asserting $QUALITY_VERDICT over L5 is FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-
# NO-LAYER-ASSERTION's job, a separate row) — this only guarantees the token set in Step 5 is
# VISIBLE wherever $LAYERS_WALKED_SUMMARY is read (notebook Step 8b, JSON Step 7.6), on every path.
if $L5_GAP_TOKEN is set:
  $LAYERS_WALKED_SUMMARY = $LAYERS_WALKED_SUMMARY + " " + $L5_GAP_TOKEN
```

**Enforcement rules (non-negotiable):**
- `$QUALITY_VERDICT = "full"` requires ALL FIVE sub-checks to be TRUE. A single FALSE forces `degraded`.
- `$QUALITY_VERDICT` MUST be computed from the actual work performed this cycle, not narrated or assumed. If there is any doubt about whether a sub-check passed, treat it as FALSE.
- When `$QUALITY_VERDICT = "degraded"`, conviction scores throughout the dish are retroactively capped at MEDIUM (this mirrors the EOD degraded-dish floor in Step 1 and the per-cluster LOW conviction rule in Step 6.5).
- This gate fires for ALL `$DISH_TYPE` values (morning / intraday / eod / evening). There is no dish window exempt from the gate.
- The intraday silent-exit path (Step 1, 0 clusters) is exempt — it exits before Step 7 and may still use `QUALITY: full` in its EXIT line because no layer-walk was attempted (nothing to degrade).

---

## Step 7.6 — PERSIST SYNTHESIS (JSON output — machine-queryable store)

<!-- AUTHORIZATION (GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST, agent-father 2026-07-19): the .claude/agents/unified-agent.md
     description now explicitly authorizes this exact write pattern (docs/data/unified-agent-synthesis-*.json)
     alongside the notebook. The Write tool IS available and this path IS in-scope — do not self-refuse this
     step as a permission conflict; that was a real, now-fixed contradiction between the agent-def L4 description
     and this step, not a tool limitation. -->

After the quality verdict gate (Step 7.5) completes, persist the synthesized TNB 6-layer analysis to a machine-queryable JSON file. This enables frontend queries and downstream tools to access the structured conviction/sector/regime/gap data without parsing Telegram prose or notebooks.

**File path — CYCLE_DATE is PINNED to Step 0.5's value, never recomputed here:**
<!-- FIX (GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST, agent-father 2026-07-19): confirmed root cause of the
     filename inconsistency (07-17 evening wrote -2026-07-17 i.e. UTC-leaning, 07-18 wrote -2026-07-19
     i.e. VN-leaning, and the 07-14 19:50Z run wrote BOTH -07-14 and -07-15 25s apart) was this step
     independently re-deriving "VN date of cycle execution" from scratch with no pinned source, so
     different cycles/agents resolved it differently. Fix: reuse a Step-0.5-pinned value verbatim,
     computed exactly once per cycle. Do NOT call `date` again in this step. Naming stays
     "date_vn+dish_type" per FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING (P1 backlog, ba-owned) — that
     row's structural follow-on is cycle_id-keying the filename entirely; this fix only makes the
     existing date component deterministic, it does not add cycle_id. -->
<!-- FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE (2026-07-29, PO c109/c113/c119): the pinned
     value switched from WORK_DATE (VN-local, Asia/Ho_Chi_Minh) to CYCLE_DATE_UTC — see Step 0.5's
     fix comment for the full root cause. `metadata.date_vn` in the JSON schema below is bound to
     this SAME CYCLE_DATE value (never independently re-derived) — the field name is legacy
     ("date_vn"), its value is now the canonical UTC date, same as the filepath and the Step 0.5
     published-marker key. This closes the exact gap that let two concurrent sessions each compute
     their own notion of "today" and diverge (confirmed live 2026-07-28: date_vn 2026-07-28 vs
     2026-07-29 for two dishes 8 minutes apart). -->
```
CYCLE_DATE = CYCLE_DATE_UTC   # verbatim reuse of Step 0.5's pinned value (UTC calendar date),
                               # computed ONCE per cycle. Never recompute/re-derive it in this step.
SLOT_ID    = <dish_type> (morning | intraday | eod | evening)
FILEPATH   = docs/data/unified-agent-synthesis-{CYCLE_DATE}-{SLOT_ID}.json
```

Example: `docs/data/unified-agent-synthesis-2026-07-03-eod.json`

**JSON schema — synthesized 6-layer delivery:**
```json
{
  "metadata": {
    "cycle_id": "<DISH_TYPE>-<CYCLE_START_UTC>",
    "dish_type": "morning|intraday|eod|evening",
    "date_vn": "YYYY-MM-DD",
    "timestamp_utc": "YYYY-MM-DDTHH:MM:SSZ",
    "quality_verdict": "full|degraded",
    "layers_walked_summary": "1-6 (full)" | "partial — [gap:...]"
  },
  
  "tnb_synthesis": {
    "clock_phase": "expansion|slowdown|contraction|recovery|transition",
    "regime_state": "risk-on|risk-off|carry-unwind|macro-uncertainty|...",
    "regime_confidence": "HIGH|MEDIUM|LOW",
    "us_macro_layer": "...(Layer 2 narrative excerpt)",
    "vn_macro_layer": "...(Layer 3 narrative excerpt)",
    "valuation_layer": "...(Layer 4 sector phases + conviction drivers)"
  },
  
  "conviction_calls": [
    {
      "ticker": "VCB",
      "conviction_level": "HIGH|MEDIUM|LOW",
      "direction": "BUY|HOLD|SELL|NEUTRAL",
      "pillars_aligned_count": 0-4,
      "rationale_one_liner": "...",
      "business_context_cited": { "field": "ops", "text": "...", "source": "bctc_signal_VCB_20260811_routine.json" } | null
    }
  ],
  
  "sector_phases": [
    {
      "sector_vn": "ngân hàng|bất động sản|...",
      "investment_phase": "expansion|slowdown|contraction|recovery|transition",
      "pyramid_tier": "equity|fixed_income|cash|defensive",
      "direction_this_cycle": "positive|negative|mixed"
    }
  ],
  
  "known_gaps": [
    "[L6-gap: gold >$4,300 active — regime-drift risk: ...]",
    "[gap: L2_US_macro_absent_no_gap_token]",
    "[gap: L4_partial_pillar_coverage]"
  ],
  
  "causal_chains": [
    "Fed hawkish hold → VND carry pressure +0.4σ → banking sector net-sell by foreigners → VCB price +4.12% on SOE inflow contradicts the macro signal."
  ],
  
  "clusters_summary": {
    "qualified": 4,
    "tickers_covered": ["VCB", "BID", "VHM", "ACB"],
    "sectors_covered": ["banking", "real_estate"]
  }
}
```

**Implementation rules:**
- `metadata.date_vn` = `CYCLE_DATE` verbatim (the Step 0.5-pinned canonical UTC date) — NEVER
  independently re-derived via a fresh `date` call in this step. The field name is legacy
  ("date_vn"); its value is the same canonical date used for the filepath and the Step 0.5
  published-marker key (FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE — this binding closes
  the exact gap that let two concurrent sessions independently resolve "today" and diverge).
- Extract conviction calls from Step 4 per-ticker scoring + Step 4 pillar alignment counts.
- If `$BIZ_CTX_CITED[<ticker>]` is set for a ticker (Step 4), its `conviction_calls[]` entry's
  `business_context_cited` field MUST carry that object verbatim (not re-summarized) — this is the
  field this row's own `verification_gate` RAW-verifies against on the next dish. `rationale_one_liner`
  for that ticker SHOULD also end with a short clause naming the cited fact (e.g. "; biz-ctx: ROE
  16.7% vs sector 17.6%, PE premium +57%") so a human reader of the JSON alone sees the same evidence
  without cross-referencing `business_context_cited`. Tickers with no citation this cycle carry
  `business_context_cited: null` — explicit null, not an omitted key (keeps the field always present
  for downstream/frontend consumers per `GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD`, out of scope here).
- Extract sector phases from Step 4 phase/tier declarations + Step 4 pillar evidence.
- Extract regime state from Step 3 macro analysis (Layer 2+3) + carry regime if `$carry_usable=true`.
- `known_gaps[]` = the UNION of THREE sources this cycle (FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION
  — REUSABLE RULE applied: every layer's gap token must reach this array, not just Step 6's):
  (i) Step 6 `$L6_GAP_TOKENS` (the `[L6-gap: ...]` methodological entries written to Step 7 Block B);
  (ii) Step 7.5's `$FAILED_CHECKS` list when `$QUALITY_VERDICT = "degraded"` (the `[gap:L2_...]` /
  `[gap:L3_...]` / `[gap:L4_...]` / `[gap:business_context_absent]` / `[gap:L6_gap_catalogue_not_enumerated]`
  tokens — these were previously computed but silently stopped at `$LAYERS_WALKED_SUMMARY` and never
  reached this array, the business-context instance of the same silent-omission pattern L5 has);
  (iii) `$L5_GAP_TOKEN` from Step 5 if set. Omit empty entries; dedup exact-string matches.
- Extract causal chains from Step 6.5 session state (the full sentences produced for the dish).
- Extract cluster summary from Step 1 cluster grouping results.
- `quality_verdict` and `layers_walked_summary` sourced directly from Step 7.5 gate output.

**Write tool call (single atomic write):**
```
Write(path=FILEPATH, content=<JSON content from above schema>)
```

**Verification (after write):**
Confirm the JSON file exists at FILEPATH and is valid JSON with non-empty `conviction_calls` and `sector_phases` arrays (unless the cycle was intraday-silent, in which case SKIP this step entirely per the intraday silent-exit exception below).

**Intraday silent-exit exception:**
If the cycle exited silently in Step 1 (0 clusters, intraday slot), skip Step 7.6 entirely — no JSON file is written for silent cycles. The exit in Step 1 already returned early before reaching Step 7.

---

## Step 8 — LOG (APPEND class — settled-write invariant)

> **Write-tool contract:** The Write tool IS available in this agent. Self-refusal here is a flow violation — use the Write tool and proceed.
> **Invariant (AC-3):** Compose the final ≤200L body ENTIRELY IN MEMORY, then land it in ONE Write/Edit. NEVER append-then-trim across two writes — PostToolUse must NEVER observe a file >200L.

**8a. Mark signals processed** — move consumed signal files to `docs/signals/processed/`.

**8b. Notebook write** — APPEND class → skill: `.claude/skills/notebook-write/SKILL.md` (AC-3 settled-write; AC-2b intra-prune on `## Prior cycles`; AC-5 gate)

<!-- FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE (2026-07-29, PO c109): `<YYYY-MM-DD>` below is
     `CYCLE_DATE` (Step 0.5's pinned canonical UTC date) verbatim — NEVER the VN-local WORK_DATE and
     NEVER a fresh `date` call. Root cause of the original finding: a session header stamped VN-local
     date (leaking `TZ="Asia/Ho_Chi_Minh" date` into a header meant to identify the UTC content-day),
     producing a header 1 day ahead of a sibling entry for the same real evening. -->
Section template (≤10L):
```
## Session: <CYCLE_DATE> (<DISH_TYPE>)   # CYCLE_DATE = Step 0.5's canonical UTC date, verbatim
### Chef Dish — <DISH_TYPE> HH:MM UTC
- Clusters qualified: N
- Tickers covered: [list]
- Layers walked: <$LAYERS_WALKED_SUMMARY>   # from Step 7.5 gate — never hardcode "1-6"
- L6 gap-catalogue tokens: <$L6_GAP_TOKENS or "none this cycle">   # AUTO-CURE c110 — surfaces genuine Step-6 [L6-gap:...] methodological entries, distinct from the L2/L3/L4/biz-ctx data-availability tokens above
- Signals consumed: [IDs]
- Dish published: YES | silent-exit
- QUALITY: <$QUALITY_VERDICT>              # "full" or "degraded" — from Step 7.5 gate
```

**8e. Commit** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md, docs/signals/processed/*]
git add docs/agent-memory/notebooks/unified-agent.md docs/signals/processed/
git commit -m "chore(memory/unified-agent): chef <DISH_TYPE> <YYYY-MM-DD>" \
  -- docs/agent-memory/notebooks/unified-agent.md docs/signals/processed/*
```

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

→ After notebook commit: emit CLOSE Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § CLOSE Telemetry`
→ On exception (Steps 0–7): emit FAILED Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § FAILED Telemetry`

## RETURN

```
DONE: Chef dish published — <DISH_TYPE> | layers <$LAYERS_WALKED_SUMMARY> | N clusters
NEXT: tran-ngoc-bau (audit at 20:13 UTC) | idle
PIPELINE: complete
QUALITY: <$QUALITY_VERDICT>   # "full" or "degraded" — set by Step 7.5 gate; NEVER hardcode "full"
```

Degraded variant (when Step 7.5 gate fires $QUALITY_VERDICT = "degraded"):
```
DONE: Chef dish published — <DISH_TYPE> | layers <$LAYERS_WALKED_SUMMARY> | N clusters
NEXT: tran-ngoc-bau (audit at 20:13 UTC) | idle
PIPELINE: complete
QUALITY: degraded
```

Silent-exit variant (intraday only — exempt from Step 7.5 gate; no layer-walk attempted):
```
DONE: Intraday scan — 0 clusters qualified, silent exit
PIPELINE: complete
QUALITY: full
```
