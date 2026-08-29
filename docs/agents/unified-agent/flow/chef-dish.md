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
     in-place growth only, same pattern as every prior dated entry in this header.
     FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION (PO triage 2026-07-21, 3x recurrence
     incl. widened scope 2026-08-14, agent-father 2026-08-14): +95L (806→901, incl. this header note
     — the "775L" baseline above had already drifted to 806L pre-existing this edit from untouched
     interim edits, same pattern as chef.md's own header note on this file's sibling row; out of
     scope for this fix). Step 7.5 QUALITY VERDICT GATE rewritten from a narrative self-grade
     ("evaluate against the work performed in Steps 2-6") into an ASSEMBLY-then-assert mechanism: the
     step now assembles the exact literal field text/objects Step 7.6 persists, then scores all
     sub-checks (5 existing + 2 new: SCHEMA_OK, DIRECTION_OK) as substring/key/enum tests against
     that assembled text — closing the two-independent-judgements defect that let the 5 pre-existing
     sub-checks self-certify "full"/pass BIZ_CTX_OK three more times despite already being written in
     prose. Step 7.6 correspondingly shrinks to a pure write + mandatory post-write Read-back
     self-check (no independent field re-extraction). No new section, no split — same
     single-enforcement-point guarantee, now backed by a mechanical assembly+assertion instead of
     narrative recollection.
     FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING FR-8 (PO 2026-08-14 scope-widening on this row's own
     post-fix RAW-verification failure, agent-father 2026-08-14): +88L (914→1002, incl. this header
     note and the negative-control example added below AC-3's, mirroring that section's own precedent).
     This is exactly the follow-on
     the paragraph above deferred ("c130 Headline #1's deeper defect... a conviction-direction-vs-
     source-data contradiction... tracked on the BIZCTX row, not conflated here"). Step 7.5 gains an
     8th ASSEMBLY-then-assert sub-check, (h) VALUATION_GATE_OK, same single-pass mechanism as (f)
     SCHEMA_OK/(g) DIRECTION_OK: binds conviction direction to the `valuation.verdict`/`kinhdich.note`
     fields chef.md Step 0 now also collects into `$BIZ_CTX_SIGNALS` (see that file's own header note,
     same date) — an AVOID-gated ticker cannot silently ship a BUY/ACCUMULATE call; it self-corrects
     to HOLD before Step 7.6 writes unless the rationale carries an explicit, data-defended
     `[override:valuation_avoid — ...]` clause (T-45 adversarial-discipline convention, same as
     `tran-ngoc-bau/flow/audit-methodology.md`'s adversarial gate). New Step 4 sub-step, new
     `valuation_gate` field on `$CONVICTION_CALLS`/`conviction_calls[]`, new Step 7.6 post-write
     self-check #5. No new section, no split — same single-enforcement-point guarantee.
     FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION, redispatch 1 (qa CHANGES_REQUESTED
     2026-08-23 on the 2026-08-14 fix's own AC-4 RAW-verify, agent-father 2026-08-23): +87L
     (1040→1127, incl. this header note; the "1002" baseline above had drifted to 1040 from untouched
     interim edits, not corrected here). The 2026-08-14 fix replaced a narrative VERDICT with a
     narrative ASSERTION — still narrative, and it stopped none of the 19 non-conformant dishes in the
     live 69-dish corpus, including the one written after it landed
     (unified-agent-synthesis-2026-08-22-chef-evening.json: 9 top-level keys, reshaped metadata, no
     [gap:schema_nonconformant_corrected] token). Three changes: (1) Step 7.6's 5-item narrative
     post-write checklist becomes ONE literal copy-executable `jq` command whose exit code is the
     verdict — unified-agent HAS the Bash grant, so this is executable, not aspirational; (2)
     SCHEMA_OK widens to metadata's own key-set and the dish_type enum, the exact two gaps qa proved;
     (3) new SLOT → dish_type mapping table in Step 7.6 — three different names exist for the same
     four slots (init.md schedule keys, chef.md Step 0.5 SLOT_ID, the dish_type enum) and copying the
     schedule key into the payload is the root cause of 8 live off-enum dish_type values. Calibrated
     by replaying the shipped command over all 69 live dishes: 50 pass, 19 fail, zero exit-code
     inconsistency. Flagged NOT fixed (needs its own row, changes the on-disk naming contract every
     consumer globs): chef.md Step 0.5 and .claude/agents/unified-agent.md define FILEPATH's SLOT_ID as
     `chef-evening` while this file defines it as `evening`; both forms exist on disk for the same
     slot on the same day.
      FIX-CHEF-EVENING-L2L3-SILENT-GAP (tnb c137 finding #1 HIGH, 2nd consecutive confirmed evening
      2026-08-25/26, agent-father 2026-08-29): +108L (1128→1236, incl. this header note) — closes
      the silent-gap mechanism where the evening dish's L2 (US macro: PMI/consumer-sentiment/
      EFFR-IORB) and L3 (CPI/VIRA/FX-reserves) were absent from the synthesis JSON with NO [gap:]
      token (live: unified-agent-synthesis-2026-08-26-chef-evening.json, us_macro_layer=carry+gold+
      oil only, vn_macro_layer=USD/VND+valuation only, known_gaps=2 L6 entries only). Three
      coordinated changes: (1) Step 3 gains a MANDATORY per-element presence-or-gap-token floor for
      every US/VN stack element, collecting $MACRO_GAP_TOKENS — a partial macro read can no longer
      be composed as a "walked" layer; (2) Step 7.5 sub-check (a) L2_OK's geopolitical clause is
      tightened so a bare gold/oil "risk-off" price-level sentence can no longer self-certify as the
      4th US-stack element (event citation required), the ASSEMBLY unions $MACRO_GAP_TOKENS into
      $KNOWN_GAPS_SO_FAR, and a negative-control example replays the exact 2026-08-26 evening text
      through sub-checks (a)/(c) proving both fire; (3) Step 7.6's post-write jq gains
      l2_floor/l3_floor CONTENT clauses (in addition to shape clauses) so a persisted file that
      silently omits L2/L3 fails the command's exit code even if its shape is canonical — re-
      calibrated over the live 79-file corpus: 37 pass / 42 fail (shape-only pre-fix: 55/24 over the
      same corpus; honest self-flag baseline 08-23/24 evenings still pass both new clauses). No
      schema change, no new section; in-place growth on Steps 3/7.5/7.6, same pattern as every
      prior dated entry in this header. -->
> Parent: [./chef.md](./chef.md)

# Unified Agent — Chef Dish Body (Steps 1.5-8, TNB 6-Layer Recipe)

Entered ONLY from `chef.md` after the Step 1 gate fires (≥1 cluster qualifies) or `$DISH_TYPE` is
`morning` / `eod` / `evening` (guaranteed-publish windows). NEVER entered on an intraday-silent exit
— that path returns from `chef.md` directly and this file is never loaded.

Input: same `$DISH_TYPE` env passed into `chef.md`, plus the session state accumulated in
`chef.md` Steps 0.5/0/1 (signal groups, `$BIZ_CTX_SIGNALS`, qualifying clusters, `MARKER_KEY`/
`MARKER_TTL` from Step 0.5's Phase-1 probe — the Phase-2 claim itself now happens in THIS file,
Step 7, immediately before Block A; UC-CCA-P3-FR3-CHEF R1 cross-file threading, see chef.md
Step 0.5's own note).

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

**Per-element presence-or-gap-token floor (MANDATORY — FIX-CHEF-EVENING-L2L3-SILENT-GAP; closes the
silent-gap mechanism where a partial macro read shipped as a "walked" L2/L3 with NO `[gap:]` token —
2nd consecutive confirmed evening occurrence 2026-08-25/26, tnb c136/c137 finding #1):** every
required element of the US stack (PMI, consumer sentiment, Fed rate + EFFR-IORB spread) and of the
VN stack (USD/VND, CPI, VIRA/FX-reserves) MUST appear in the composed layer text EITHER as a cited
live value from THIS cycle's tool calls OR as an explicit per-element `[gap:<element>_unavailable]`
token. A layer that cites only a subset (e.g. carry-spread + gold + oil with no PMI, or USD/VND +
valuation with no CPI/VIRA — the exact 2026-08-26 evening shape) is a FLOW VIOLATION: it must NEVER
be composed as if the layer were walked, and it must NEVER pass through Step 7.5/7.6 untokened. This
is the same reusable rule Step 5 already states for L5's data source, applied to every L2/L3 element:

```
MANDATORY TOKENS (one per element, ONLY when that element has no live value this cycle):
  US stack: [gap:PMI_unavailable] [gap:consumer_sentiment_unavailable] [gap:EFFR_IORB_unavailable]
  VN stack: [gap:USDVND_unavailable] [gap:CPI_unavailable] [gap:VIRA_unavailable] [gap:FX_reserves_unavailable]
  (the geopolitical element's own [gap:geopolitical_event_absent] fallback already exists above —
  keep it; the gap token MAY combine with the element tokens, e.g. "[gap:US_macro_unavailable]" as a
  shorthand for all three US tokens, but ONLY if the narrative then says WHICH elements are absent)
```

Collect every such token emitted this step into `$MACRO_GAP_TOKENS` (a list in session state, empty
list if all elements were cited with live values). This list is carried to Step 7.5's ASSEMBLY and
unioned into `$KNOWN_GAPS_SO_FAR` (see Step 7.5 sub-check (e) + Step 7.6 known_gaps[]), so the L2_OK
and L3_OK sub-checks see the tokens and the persisted JSON carries them. A silently-omitted element
is NEVER acceptable — the floor is an honest, tokened gap, identical in spirit to the Step 1
degraded-dish floor and the Step 5 `$L5_GAP_TOKEN` floor.

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

**Valuation-gate discipline (mandatory when `$BIZ_CTX_SIGNALS[<TICKER>].valuation.verdict` is set for
this ticker — FR-8, PO 2026-08-14 scope-widening):**
`bctc-analyst` already computes a machine-readable publish gate per ticker
(`docs/agents/bctc-analyst/flow/stage-analyze.md`: `valuation_verdict=AVOID` → "do NOT post bullish
signal"). When `$BIZ_CTX_SIGNALS[<TICKER>].valuation.verdict == "AVOID"`, this ticker's thesis MUST
NOT conclude a BUY or ACCUMULATE direction this cycle unless the rationale explicitly engages and
defends the override with data — T-45 adversarial discipline, the same convention as
`tran-ngoc-bau/flow/audit-methodology.md`'s adversarial gate ("a claim that was challenged and either
defended with data or explicitly down-weighted"); silent disregard of the gate is never acceptable.
Two valid outcomes only:
1. **Honour the gate (default):** direction is HOLD / SELL / NEUTRAL for this ticker this cycle.
2. **Engaged override (rare, must be defended):** direction stays BUY only if the rationale text
   contains a literal `[override:valuation_avoid — <data-backed justification>]` clause naming the
   specific evidence that outweighs the AVOID verdict (e.g. a confirmed catalyst the valuation gate
   does not price in). A bare restatement of the bullish thesis is NOT a justification — it must name
   what makes THIS AVOID wrong, not merely why the ticker looks attractive otherwise.
Store the result:
```
$VALUATION_GATE[<TICKER>] = { verdict: $BIZ_CTX_SIGNALS[<TICKER>].valuation.verdict,
                               note: $BIZ_CTX_SIGNALS[<TICKER>].valuation.note,
                               override_engaged: true|false,
                               override_rationale: "<text>" | null }
```
Tickers with no `$BIZ_CTX_SIGNALS[<TICKER>].valuation` entry this cycle are not gated —
`$VALUATION_GATE[<TICKER>]` stays unset (no valuation data available this cycle, nothing to enforce
against; do not treat a missing verdict as an implicit AVOID or an implicit clearance).

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

Invoke (Path A — MCP-native, this agent's default per SKILL.md; choose Block A or Block B text accordingly):
```
GATE_VERDICT = call_tool(server="vn-market", tool="narrative_truth_gate", arguments={
  post_body: <composed Block A or Block B text>,
  agent_id:  "unified-agent",
  cache:     <this cycle's tool-call results, or null>
})
```

**Verdict handling** (`GATE_VERDICT` = first line of the tool response text; see SKILL.md Verdict contract):
- `PASS` → proceed to `send_telegram` call(s).
- `FAIL (N contradiction(s))` — contradiction detected; signal emitted server-side to `po`. Self-correct:
  1. Read the response text: `[FAIL] dimension=... tool=... ticker=...`
  2. Call the named tool directly.
  3. Rewrite the offending sentence using real returned values.
  4. Re-run this skill with corrected text.
  5. Second-pass PASS → proceed to `send_telegram`.
  6. Second-pass FAIL → write honest gap (e.g. "công cụ chưa trả được <dimension>") and proceed to send (no hard block for CHEF because the message must publish).
- `CONFIG_ERROR: <reason>` (`isError:true` on response) → fail-loud: `send_telegram(channel="bug", message="[unified-agent] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Tool fires `narrative_contradiction` server-side on FAIL. Do NOT suppress it.

**Checkpoint:** If you cannot continue past this point for any reason (budget, tool failure,
uncertainty), STOP — do not narrate a scope-clarification or self-abort. Jump directly to
`chef-telemetry.md § Degraded-Floor Recovery` using whatever session state exists. This is
cheaper than explaining why you cannot continue.

---

## Step 7 — WRITE DISH (Dual-Output)

**Published-marker gate — Phase 2 (commit point, MANDATORY, gates BOTH Block A and Block B) →**
skill: `.claude/skills/published-marker-gate/SKILL.md` (agent-id=unified-agent).

<!-- UC-CCA-P3-FR3-CHEF (agent-father, 2026-08-14, R1): the load-bearing half of the cross-file
     threading fix — chef.md Step 0.5 now only probes; THIS is where the real claim happens.
     Placed at the top of Step 7, before either block is composed/sent, so a failed claim skips
     the WHOLE step (both Block A and Block B) — matching today's pre-existing binary EXIT
     semantics (a dish either fully publishes or fully doesn't; there is no partial-block state).
     `MARKER_KEY`/`MARKER_TTL` are the exact values chef.md Step 0.5's Phase-1 probe computed,
     carried forward as session state — do NOT recompute (session-scoped: this file is only ever
     entered from chef.md in the same session, per that file's own TE-T16 split note). -->

```
CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              MARKER_KEY,   # from chef.md Step 0.5's Phase-1 probe
  task_kind:            "cowork-slot",
  owner_agent:          "unified-agent",
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, coordinationTools.ts:104-110;
    substitute the real value, NEVER write the literal text "$CLAUDE_CODE_SESSION_ID">",
  ttl_seconds:          MARKER_TTL    # from chef.md Step 0.5's Phase-1 probe
})

if CLAIM.claimed != true:
  log "[chef] publish blocked (Phase-2 claim) — already published key=" + MARKER_KEY
  EXIT with: "DONE: duplicate-publish blocked | PIPELINE: complete | QUALITY: full"
  # a peer claimed between chef.md's Phase-1 probe and this Phase-2 claim — do NOT send anything,
  # neither Block A nor Block B.
```

If `claimed == true`: proceed immediately to composing and sending Block A and Block B below.
NEVER call `task_release` on success or any exit after this point — successful send, failed
send, exception, process death: all leave the marker in place. TTL is the sole expiry path.

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
<!-- FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION (PO triage 2026-07-21, RECURRED
     2026-07-31 and 2026-08-14 morning/eod/evening — 3 confirmed live occurrences of THIS gate
     self-certifying "full" while its own persisted payload lacked the mandatory content, DESPITE
     the 5 sub-checks above already existing in prose. Root cause (agent-father 2026-08-14, cross-
     checked against tnb-audit c130's independent finding "wiring present but not executed" on the
     sibling BIZCTX row): the sub-checks were graded against "the work performed in Steps 2-6" — a
     narrative recollection — while Step 7.6 (below) independently re-extracted the actual JSON
     field text from the same steps. Two independent judgements of "the same" cycle CAN disagree,
     and did — e.g. 07-21 morning certified full with tnb_synthesis.us_macro_layer containing
     Fed-funds-only content (no PMI, no EFFR-IORB, no L2 gap token); 2026-08-14 evening certified
     BIZ_CTX_OK via the gap-token branch while $BIZ_CTX_SIGNALS was NOT actually empty that cycle
     (DXG bctc_signal was in-window — c130 Headline #1, RAW-verified). Fix: this step now ASSEMBLES
     the exact field text Step 7.6 will persist (the same extraction Step 7.6 used to perform
     independently — moved up here; Step 7.6 now performs ZERO re-derivation), then every sub-check
     is a literal substring/key/enum test against that assembled text, not a judgement call about
     what happened earlier. PO's same-cycle scope-widening (`po_scope_widening`, task board) added
     sub-checks (f) SCHEMA_OK and (g) DIRECTION_OK for two more live 2026-08-14 defects found by the
     same audit: eod emitted a wholly different JSON shape (tnb_layers/clustering/signals/
     thesis_summary, zero conviction_calls key — c130 Headline #2, schema non-conformance not a
     data gap) and evening emitted direction values ACCUMULATE/RISK_OFF plus a macro label
     MACRO_BRENT in the ticker field (enum violation). Same single-pass mechanism covers all three
     widened domains — not three separate patches, per PO's directive. NOT this fix's scope: c130
     Headline #1's deeper defect (chef's ACCUMULATE call actively contradicting DXG's own upstream
     bctc valuation.verdict=AVOID gate) is a conviction-direction-vs-source-data contradiction, a
     different defect class from "was business context cited at all" — tracked on the BIZCTX row
     (REVIEW lane), not conflated here; this fix only makes business_context_cited's NULL-vs-token
     assertion mechanical, it does not cross-reference valuation verdicts. -->

Before writing the notebook entry or the RETURN block, run the ASSEMBLY block below, then score all
seven sub-checks against the assembled text/objects — not against a recollection of "what was done in
Steps 2-6." A sub-check is TRUE only if the literal assembled value contains the required
token/shape/enum member; if there is any doubt, treat it as FALSE (unchanged rule, now applied to
concrete text instead of narrative).

**ASSEMBLY (run once, before scoring — Step 7.6 Writes these exact variables verbatim; it performs NO
independent re-extraction):**
```
$US_MACRO_LAYER_TEXT  = <the Layer 2 narrative text composed in Step 3 — verbatim, this exact string
                         becomes tnb_synthesis.us_macro_layer in Step 7.6>
$VN_MACRO_LAYER_TEXT  = <the Layer 3 narrative text composed in Step 3 — verbatim, this exact string
                         becomes tnb_synthesis.vn_macro_layer in Step 7.6>
$VALUATION_LAYER_TEXT = <the Layer 4 narrative text composed in Step 4 (sector phases + conviction
                         drivers) — verbatim, this exact string becomes tnb_synthesis.valuation_layer>
$CONVICTION_CALLS     = [ { ticker, conviction_level, direction, pillars_aligned_count,
                            rationale_one_liner, business_context_cited, valuation_gate }, ... ]
                        — one entry per ticker in a Step-1 qualifying cluster: conviction_level +
                        pillars_aligned_count from Step 4's per-ticker scoring, direction from the
                        BUY/HOLD/SELL/NEUTRAL vocabulary composed in Step 7 (Step 6.7 AF-2),
                        business_context_cited = $BIZ_CTX_CITED[ticker] (Step 4) verbatim or null,
                        valuation_gate = $VALUATION_GATE[ticker] (Step 4, FR-8) verbatim or null.
                        This is the EXACT array Step 7.6 writes as conviction_calls[].
$KNOWN_GAPS_SO_FAR    = union of $L6_GAP_TOKENS (Step 6) + $L5_GAP_TOKEN (Step 5, if set)
                        + $MACRO_GAP_TOKENS (Step 3, if set — FIX-CHEF-EVENING-L2L3-SILENT-GAP: the
                        per-element US/VN stack tokens, so sub-checks (a)/(c) below can see them) —
                        the same union rule Step 7.6 documents for known_gaps[], computed here so
                        this gate can see it before scoring sub-check (e).
```

```
# Sub-check (a) — US macro layer (L2) presence — literal scan of $US_MACRO_LAYER_TEXT
# MINIMUM FLOOR (AutoCure tran-ngoc-bau c103 2026-06-30 — FIX-CHEF-STEP75-L2OK-CARRY-PROXY-FLOOR):
# Carry trade spread alone (e.g. "carry 1.37pp NEUTRAL") is NOT sufficient — it is a source_tier-3
# derived proxy of the US/VN rate differential and does NOT represent a US macro stack walk.
L2_OK = ($US_MACRO_LAYER_TEXT contains "PMI" with an adjacent numeric value)
        OR ($US_MACRO_LAYER_TEXT contains "EFFR" AND "IORB" with an adjacent numeric spread)
        OR ($US_MACRO_LAYER_TEXT cites a genuine geopolitical/risk-sentiment EVENT — a named
            chain_catalyst event (e.g. "US-Iran escalation", "China trade tensions") with a
            direction/confidence clause, per docs/architecture-briefs/2026-07-21-global-
            geopolitical-signal-coverage.md §2 A4. A bare gold/oil price-level sentence such as
            "Gold at $4646 USD exceeds risk-off threshold" is NOT an event citation — it is a
            price level, and it does NOT satisfy this clause (FIX-CHEF-EVENING-L2L3-SILENT-GAP:
            the 2026-08-26 evening dish's entire L2 was exactly this shape and self-certified))
        OR ($US_MACRO_LAYER_TEXT or $KNOWN_GAPS_SO_FAR literally contains an L2 gap token, e.g.
            [gap:macro_health_missing], [gap:US_macro_unavailable], [gap:geopolitical_event_absent],
            or any of Step 3's per-element US tokens: [gap:PMI_unavailable],
            [gap:consumer_sentiment_unavailable], [gap:EFFR_IORB_unavailable])
If $US_MACRO_LAYER_TEXT is empty or unset, L2_OK is FALSE unless the 4th clause's gap token is present.

# Sub-check (b) — all 4 valuation pillars named (L4) — literal scan of $VALUATION_LAYER_TEXT +
# $CONVICTION_CALLS
L4_PILLARS_OK = (every entry in $CONVICTION_CALLS has a numeric pillars_aligned_count 0-4, AND
                 $VALUATION_LAYER_TEXT names or explicitly flags-missing all 4 pillar labels:
                 lượng tiền, chi phí vốn, triển vọng lợi nhuận, rủi ro định giá)

# Sub-check (c) — VN macro layer (L3) presence — literal scan of $VN_MACRO_LAYER_TEXT
# MINIMUM FLOOR (AutoCure tran-ngoc-bau c108 2026-07-13 — FIX-CHEF-STEP75-L3-BIZCTX-FLOOR): USD/VND
# alone does NOT satisfy L3 — CPI and VIRA/FX-reserves are each independently required (cited or
# gap-tokened).
L3_OK = ($VN_MACRO_LAYER_TEXT contains a USD/VND level)
        AND ($VN_MACRO_LAYER_TEXT contains "CPI" OR $KNOWN_GAPS_SO_FAR contains [gap:CPI_unavailable])
        AND ($VN_MACRO_LAYER_TEXT contains "VIRA" or "FX reserves" OR $KNOWN_GAPS_SO_FAR contains
             [gap:VIRA_unavailable] or [gap:FX_reserves_unavailable])

# Sub-check (d) — business context presence — literal null-check on $CONVICTION_CALLS[].
# business_context_cited (NOT a recollection of "did Step 4's sub-step fire" — the array entry
# itself, the exact value Step 7.6 persists). The gap-token branch requires MECHANICALLY confirming
# $BIZ_CTX_SIGNALS is a literal empty dict (zero keys) this cycle — not a narrated "no files found";
# c130 Headline #1 (2026-08-14 evening, DXG) is exactly the failure this closes: the gap-token
# branch was claimed while $BIZ_CTX_SIGNALS held a genuine, in-window DXG entry.
BIZ_CTX_OK = (≥1 entry in $CONVICTION_CALLS has business_context_cited != null)
             OR ($BIZ_CTX_SIGNALS is a literal empty dict — zero keys — this cycle, checked against
                 the actual dict from chef.md Step 0, AND $KNOWN_GAPS_SO_FAR literally contains
                 [gap:business_context_unavailable])

# Sub-check (e) — gap catalogue enumerated if any layer is partial/missing
ANY_LAYER_PARTIAL = (L2_OK relied on a gap token)
                 OR (L3_OK relied on a gap token for CPI or VIRA/FX-reserves)
                 OR (BIZ_CTX_OK relied on a gap token)
                 OR (NOT L4_PILLARS_OK)
                 OR (any other layer scored PARTIAL/FAIL in this cycle)
GAP_CATALOGUE_OK = (NOT ANY_LAYER_PARTIAL)
                OR ($KNOWN_GAPS_SO_FAR literally contains ≥1 [gap:X] token)

# Sub-check (f) — SCHEMA CONFORMANCE (widened scope 2026-08-14, PO — mandatory for EVERY $DISH_TYPE
# including eod; unified-agent-synthesis-2026-08-14-eod.json emitted tnb_layers/clustering/signals/
# thesis_summary and ZERO conviction_calls key — a wholesale shape substitution, not a data gap)
SCHEMA_OK = (the assembled payload's top-level keys are EXACTLY {metadata, tnb_synthesis,
             conviction_calls, sector_phases, known_gaps, causal_chains, clusters_summary} — the ONE
             schema in Step 7.6, identical for every $DISH_TYPE, no dish-type-specific exception)
        AND (metadata's OWN keys are EXACTLY {cycle_id, dish_type, date_vn, timestamp_utc,
             quality_verdict, layers_walked_summary} — no extras, none missing)
        AND (metadata.dish_type is EXACTLY one of morning|intraday|eod|evening — the SCHEDULE-ENTRY
             name is NOT the dish_type, see Step 7.6's slot mapping table)
        AND (tnb_synthesis has exactly {clock_phase, regime_state, regime_confidence, us_macro_layer,
             vn_macro_layer, valuation_layer})
        AND (conviction_calls is present as a top-level array — even [] — never renamed, omitted, or
             replaced by a differently-shaped field)
# DO NOT self-adjudicate the four clauses above by eyeballing the payload. They are the SAME clauses
# Step 7.6's mandatory post-write `jq` command executes, and that command's exit code is the only
# verdict that counts. Scoring SCHEMA_OK "by reading" is what shipped 19 non-conformant dishes out of
# 69 in the live corpus (measured 2026-08-23), including the one dish written AFTER the 2026-08-14
# assertion fix landed: top-level keys 4x, metadata keys 1x, dish_type enum 6x, tnb_synthesis keys 3x,
# direction enum 7x. A narrative assertion over a payload is still a narrative — the defect this whole
# row exists to close, one level down.

# Sub-check (g) — DIRECTION ENUM CONFORMANCE (widened scope 2026-08-14, PO — evening dish emitted
# ACCUMULATE/RISK_OFF as direction and MACRO_BRENT as a ticker)
DIRECTION_OK = (every $CONVICTION_CALLS entry's direction is exactly one of
                "BUY" | "HOLD" | "SELL" | "NEUTRAL" — case-sensitive literal enum membership)
           AND (every entry's ticker is an actual ticker symbol from a Step-1 qualifying cluster —
                never a macro/commodity/composite label such as "MACRO_BRENT"; macro/commodity
                context belongs only in tnb_synthesis narrative text, never in conviction_calls[].ticker)

# Sub-check (h) — VALUATION-GATE CONFORMANCE (FR-8, PO 2026-08-14 scope-widening — the 2026-08-14
# evening dish issued ACCUMULATE on DXG against bctc_signal_DXG_20260814_routine.json's own
# machine-readable valuation.verdict=AVOID gate, silently ignored, no override ever logged)
VALUATION_GATE_OK = for every $CONVICTION_CALLS entry where valuation_gate != null AND
                     valuation_gate.verdict == "AVOID":
    (entry.direction is NOT "BUY" and the raw pre-DIRECTION_OK-correction direction is NOT
     "ACCUMULATE" either)
    OR (valuation_gate.override_engaged == true AND valuation_gate.override_rationale is non-empty
        AND rationale_one_liner literally contains "[override:valuation_avoid")
Entries with valuation_gate == null or valuation_gate.verdict != "AVOID" do not participate in this
check (nothing to gate — same opportunistic-only floor as BIZ_CTX_OK/NFR-3 on this row's own FR-3).
**Ordering note:** score this BEFORE any DIRECTION_OK ACCUMULATE→BUY remap is applied — a raw
"ACCUMULATE" against an AVOID gate must fail (h) on its own terms, not be silently laundered into a
passing "BUY" by (g)'s enum-correction running first.

# Verdict — single pass, all eight ANDed
if L2_OK AND L3_OK AND L4_PILLARS_OK AND BIZ_CTX_OK AND GAP_CATALOGUE_OK AND SCHEMA_OK AND DIRECTION_OK AND VALUATION_GATE_OK:
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
  if NOT SCHEMA_OK:
    # NOT a data-availability gap — self-correct the assembled payload to the mandated schema (map
    # any tnb_layers/clustering/signals/thesis_summary-style content into the 7 keys above) BEFORE
    # Step 7.6 writes anything. The token below documents that a correction occurred; it never
    # excuses writing the wrong shape to disk.
    $FAILED_CHECKS.append("[gap:schema_nonconformant_corrected]")
  if NOT DIRECTION_OK:
    # Also self-correct FIRST — map each non-enum direction to the nearest of BUY/HOLD/SELL/NEUTRAL
    # (e.g. ACCUMULATE→BUY, RISK_OFF→HOLD or SELL per that ticker's own thesis stance) and remove any
    # macro/composite ticker label from $CONVICTION_CALLS (it belongs in tnb_synthesis narrative
    # text) BEFORE Step 7.6 writes anything.
    $FAILED_CHECKS.append("[gap:direction_enum_violation_corrected]")
  if NOT VALUATION_GATE_OK:
    # NOT a data-availability gap — self-correct BEFORE Step 7.6 writes: downgrade direction to HOLD
    # for every offending entry (never silently ship BUY/ACCUMULATE against an unengaged AVOID gate).
    # This correction takes PRECEDENCE over DIRECTION_OK's ACCUMULATE→BUY remap for the same entry —
    # if both (g) and (h) fail on one ticker, the result is HOLD, not BUY. If the model genuinely
    # intends an engaged override, it must add the `[override:valuation_avoid — <justification>]`
    # clause to rationale_one_liner AND set valuation_gate.override_engaged=true BEFORE this check
    # re-runs — do not fabricate the override marker just to pass the gate; an unjustified override
    # is a worse failure than an honest HOLD.
    $FAILED_CHECKS.append("[gap:valuation_gate_violation_corrected]")
  $LAYERS_WALKED_SUMMARY = "partial — " + join($FAILED_CHECKS, " ")

# L5 (Kinh Dịch) gap-token append — FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION.
# Runs AFTER the verdict above on BOTH branches and does NOT participate in the full/degraded
# computation — this only guarantees the token set in Step 5 is VISIBLE wherever
# $LAYERS_WALKED_SUMMARY is read (notebook Step 8b, JSON Step 7.6), on every path.
if $L5_GAP_TOKEN is set:
  $LAYERS_WALKED_SUMMARY = $LAYERS_WALKED_SUMMARY + " " + $L5_GAP_TOKEN
```

**Illustrative negative-control example (AC-3 — proves the assertion actually fires, not merely
always-degrades):** synthetic dish, L2 stripped — `$US_MACRO_LAYER_TEXT = ""` (Step 3 produced no
Layer-2 narrative this cycle) and `$KNOWN_GAPS_SO_FAR` carries no L2 token. Sub-check (a): `"PMI"` not
found, `"EFFR"`/`"IORB"` not found, no geopolitical clause, no gap token in either scanned string →
`L2_OK = FALSE`. Every other sub-check independently TRUE on the synthetic remainder (L3/L4/BizCtx/
gap-catalogue/schema/direction all pass) still forces the overall AND to FALSE →
`$QUALITY_VERDICT = "degraded"`, `$FAILED_CHECKS = ["[gap:L2_US_macro_absent_no_gap_token]"]`,
`$LAYERS_WALKED_SUMMARY = "partial — [gap:L2_US_macro_absent_no_gap_token]"`. This is a mechanical
substring-absence result, not a judgement call — the same rule applied to a dish where
`$US_MACRO_LAYER_TEXT` genuinely contains `"PMI 52.3"` would score `L2_OK = TRUE` regardless of any
other layer's state. Contrast with the pre-fix mechanism: a narrative "was PMI cited in Step 3?"
self-grade has no mechanical tie to `$US_MACRO_LAYER_TEXT`'s actual content — exactly how 07-21/07-31/
08-14 certified "full"/passed BIZ_CTX_OK with absent or Fed-funds-only L2 content and a genuinely
non-empty `$BIZ_CTX_SIGNALS`.

**Illustrative negative-control example (L2L3-SILENT-GAP — proves sub-checks (a)/(c) fire on the
EXACT live 2026-08-26 evening shape tnb c137 finding #1 confirmed, closing the "gold risk-off
passes for L2" loophole):** `$US_MACRO_LAYER_TEXT = "Fed carry spread 1.37pp maintains moderate
premium with no immediate tightening signal. Gold at $4646 USD exceeds risk-off threshold. Oil
neutral at $86.69 USD."` (no PMI, no consumer sentiment, no EFFR-IORB) and `$VN_MACRO_LAYER_TEXT =
"USD/VND at 25920 exceeds 25000 threshold (BEARISH), creating import cost pressure. Valuation
FAIRLY_VALUED with earnings yield 6.70% exceeding deposit rate 5.00%."` (no CPI, no VIRA), with
`$KNOWN_GAPS_SO_FAR` = the 2 L6 entries the real file carried (single-pillar + gold regime-drift,
NEITHER covering L2/L3). Scoring: sub-check (a) — `"PMI"`+numeric not found, `"EFFR"`/`"IORB"` not
found, no named geopolitical EVENT (the gold sentence is a price level, NOT an event citation per
the tightened clause), no L2 gap token → `L2_OK = FALSE` → `[gap:L2_US_macro_absent_no_gap_token]`.
Sub-check (c) — USD/VND level present BUT `"CPI"` absent AND `$KNOWN_GAPS_SO_FAR` carries no
`[gap:CPI_unavailable]`, `"VIRA"`/`"FX reserves"` absent AND no `[gap:VIRA_unavailable]`/
`[gap:FX_reserves_unavailable]` → `L3_OK = FALSE` → `[gap:L3_VN_macro_incomplete]`. Both tokens land
in `$FAILED_CHECKS` → `known_gaps[]` (Step 7.6 union) and `$LAYERS_WALKED_SUMMARY` — the exact
output the real 2026-08-26 evening dish lacked. This is a mechanical substring-absence result on
the real persisted text, not a judgement call.

**Illustrative negative-control example (FR-8 — proves sub-check (h) actually fires on the exact live
instance PO cited):** live 2026-08-14 evening dish, DXG. `$BIZ_CTX_SIGNALS["DXG"].valuation.verdict =
"AVOID"` (from `bctc_signal_DXG_20260814_routine.json`), so `valuation_gate = { verdict: "AVOID",
note: "valuation_verdict=AVOID — do NOT post bullish signal", override_engaged: false,
override_rationale: null }`. The composed `$CONVICTION_CALLS` entry for DXG carried `direction =
"ACCUMULATE"` and a `rationale_one_liner` with no `[override:valuation_avoid` clause anywhere. Scoring
sub-check (h): `valuation_gate.verdict == "AVOID"` → gated; `direction` is `"ACCUMULATE"` → first
clause FALSE; `override_engaged == false` → second clause FALSE → `VALUATION_GATE_OK = FALSE` for this
entry, which forces the overall AND to FALSE regardless of every other sub-check's state →
`$QUALITY_VERDICT = "degraded"`, `direction` self-corrected to `"HOLD"` BEFORE Step 7.6 writes,
`$FAILED_CHECKS` includes `"[gap:valuation_gate_violation_corrected]"`. Contrast with a dish where the
same rationale instead read "...ACCUMULATE — `[override:valuation_avoid — foreign-flow +129K cp today
confirms accumulation despite the AVOID-priced PE, a live catalyst the quarterly valuation note does
not capture]`" and `valuation_gate.override_engaged = true`: sub-check (h)'s second clause is TRUE,
`VALUATION_GATE_OK = TRUE` for that entry, and `direction` ships as composed (still subject to every
other sub-check independently).

**Enforcement rules (non-negotiable):**
- `$QUALITY_VERDICT = "full"` requires ALL EIGHT sub-checks to be TRUE. A single FALSE forces `degraded`.
- Every sub-check is scored against the literal ASSEMBLY variables above — the SAME variables Step 7.6
  writes verbatim. There is no second, independent judgement anywhere in this pipeline (AC-2). If a
  sub-check's required text is not literally present in the assembled variable, the sub-check is FALSE
  — narrating that the work "was done" is not evidence.
- `(f) SCHEMA_OK`, `(g) DIRECTION_OK`, and `(h) VALUATION_GATE_OK` failures are corrected BEFORE Step
  7.6 writes — Step 7.6 never persists a wrong-shape object, an out-of-enum direction/ticker value, or
  an unengaged BUY/ACCUMULATE against an AVOID gate, even transiently. These are output-validity
  requirements, not data-availability gaps like (a)-(e); the gap token documents that a correction
  occurred, it never substitutes for the correction.
- When `$QUALITY_VERDICT = "degraded"`, conviction scores throughout the dish are retroactively capped at MEDIUM (this mirrors the EOD degraded-dish floor in Step 1 and the per-cluster LOW conviction rule in Step 6.5).
- This gate fires for ALL `$DISH_TYPE` values (morning / intraday / eod / evening) — including
  sub-checks (f)/(g)/(h), which apply identically regardless of dish type. There is no dish window exempt.
- The intraday silent-exit path (Step 1, 0 clusters) is exempt — it exits before Step 7 and may still use `QUALITY: full` in its EXIT line because no layer-walk was attempted (nothing to degrade).

---

## Step 7.6 — PERSIST SYNTHESIS (JSON output — machine-queryable store)

<!-- AUTHORIZATION (GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST, agent-father 2026-07-19): the .claude/agents/unified-agent.md
     description now explicitly authorizes this exact write pattern (docs/data/unified-agent-synthesis-*.json)
     alongside the notebook. The Write tool IS available and this path IS in-scope — do not self-refuse this
     step as a permission conflict; that was a real, now-fixed contradiction between the agent-def L4 description
     and this step, not a tool limitation. -->

After the quality verdict gate (Step 7.5) completes, persist the synthesized TNB 6-layer analysis to a machine-queryable JSON file. **This step performs NO independent field extraction or re-derivation — every field below is Step 7.5's assembled ASSEMBLY variable, written verbatim (FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION, agent-father 2026-08-14: this single-assembly-then-write is what closes AC-2 — one pass, not two independent judgements of the same cycle).** This enables frontend queries and downstream tools to access the structured conviction/sector/regime/gap data without parsing Telegram prose or notebooks.

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

**SLOT → `dish_type` MAPPING (mandatory — FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION,
agent-father 2026-08-23):** three different names exist for the same four slots and this step is where
they collide. `metadata.dish_type` takes the RIGHTMOST column and nothing else — never the cron
schedule-entry key, never `chef.md`'s prefixed `SLOT_ID`:

| `init.md` schedule key | `chef.md` Step 0.5 `SLOT_ID` | → `metadata.dish_type` (the ONLY legal value) |
|---|---|---|
| `morning_dish` | `chef-morning` | `morning` |
| `intraday_scan` | `chef-intraday` | `intraday` |
| `eod_dish` | `chef-eod` | `eod` |
| `evening_preview` | `chef-evening` | `evening` |

Root cause of 8 live off-enum `dish_type` values (`evening_preview` x6, `eod_dish` x1,
`convergence_scan` x1, measured across the 69-dish corpus 2026-08-23): the schedule-entry key was
copied straight into the payload field. The enum at line ~890 below is the contract; this table is
how you reach it.

> **Open conflict, deliberately NOT resolved here (needs its own row — changes the on-disk naming
> contract that TNB audit / QA AC-4 probes / every consumer globs):** the FILEPATH above resolves
> `SLOT_ID` via `chef-dish.md`'s definition (`evening`), while `chef.md` Step 0.5 and
> `.claude/agents/unified-agent.md`'s own description both define `SLOT_ID` as `chef-evening`. Both
> forms exist on disk for the same slot on the same day (`...-2026-07-30-evening.json` AND
> `...-2026-07-30-chef-evening.json`). Do not silently pick one while working this step.

**JSON schema — synthesized 6-layer delivery (this is the ONE schema Step 7.5 sub-check (f) SCHEMA_OK
asserts against — identical for every `$DISH_TYPE` including `eod`, no dish-type exception):**
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
      "business_context_cited": { "field": "ops", "text": "...", "source": "bctc_signal_VCB_20260811_routine.json" } | null,
      "valuation_gate": { "verdict": "AVOID", "note": "...", "override_engaged": false, "override_rationale": null } | null
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

**Field mapping (FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION, agent-father 2026-08-14 —
each field below is the Step 7.5 ASSEMBLY variable of the same purpose, written verbatim; this step
does NOT re-derive, re-summarize, or independently re-extract any of them — that would reintroduce the
exact two-independent-judgements defect this fix closes):**
- `metadata.date_vn` = `CYCLE_DATE` verbatim (the Step 0.5-pinned canonical UTC date) — NEVER
  independently re-derived via a fresh `date` call in this step. The field name is legacy
  ("date_vn"); its value is the same canonical date used for the filepath and the Step 0.5
  published-marker key (FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE — this binding closes
  the exact gap that let two concurrent sessions independently resolve "today" and diverge).
- `metadata.quality_verdict` / `metadata.layers_walked_summary` = Step 7.5's `$QUALITY_VERDICT` /
  `$LAYERS_WALKED_SUMMARY` verbatim.
- `tnb_synthesis.us_macro_layer` / `vn_macro_layer` / `valuation_layer` = Step 7.5's
  `$US_MACRO_LAYER_TEXT` / `$VN_MACRO_LAYER_TEXT` / `$VALUATION_LAYER_TEXT` verbatim.
- `conviction_calls[]` = Step 7.5's `$CONVICTION_CALLS` verbatim — already includes
  `business_context_cited` (= `$BIZ_CTX_CITED[<ticker>]` verbatim or explicit `null`, never an
  omitted key), `valuation_gate` (= `$VALUATION_GATE[<ticker>]` verbatim or explicit `null` — FR-8,
  already asserted against Step 7.5 sub-check (h)), and an already-enum-checked `direction` (Step 7.5
  sub-checks (g) and (h)). Do not rebuild this array independently from Step 4 here.
- `sector_phases[]` = extracted from Step 4 phase/tier declarations + Step 4 pillar evidence
  (unchanged — not part of the assertion mechanism, no live defect found on this field).
- `regime_state` / `regime_confidence` / `clock_phase` = extracted from Step 3 macro analysis
  (Layer 2+3) + carry regime if `$carry_usable=true` (unchanged).
- `known_gaps[]` = Step 7.5's `$KNOWN_GAPS_SO_FAR` UNION Step 7.5's `$FAILED_CHECKS` (dedup
  exact-string matches) — the same union rule as before (Step 6 `$L6_GAP_TOKENS` + Step 7.5's
  computed gap tokens + `$L5_GAP_TOKEN`), now assembled once in Step 7.5 rather than re-derived here.
- `causal_chains[]` = Step 6.5 session state (unchanged).
- `clusters_summary` = Step 1 cluster grouping results (unchanged).

**Write tool call (single atomic write):**
```
Write(path=FILEPATH, content=<JSON content, all fields per the mapping above>)
```

**Post-write RAW self-check (mandatory — AC-4).** Immediately after the Write call, run the command
below. **You have the Bash tool** (`.claude/agents/unified-agent.md` `tools:` grants it) — RUN it, do
not re-implement it by Reading the file and reasoning about the bytes. Its exit code is the verdict;
your own reading of the payload is not.

```bash
# FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION, agent-father 2026-08-23.
# Substitute FILEPATH and Step 7.5's computed $QUALITY_VERDICT. Prints SCHEMA_OK or the exact
# failing clause names, and exits non-zero on failure.
jq -r --arg qv "<Step 7.5's $QUALITY_VERDICT verbatim>" '
  . as $d
  | {
    top_keys:  (($d | keys) == ["causal_chains","clusters_summary","conviction_calls","known_gaps","metadata","sector_phases","tnb_synthesis"]),
    meta_keys: ((($d.metadata // {}) | keys) == ["cycle_id","date_vn","dish_type","layers_walked_summary","quality_verdict","timestamp_utc"]),
    dish_type: (["morning","intraday","eod","evening"] | index($d.metadata.dish_type) != null),
    verdict:   ($d.metadata.quality_verdict == $qv),
    tnb_keys:  ((($d.tnb_synthesis // {}) | keys) == ["clock_phase","regime_confidence","regime_state","us_macro_layer","valuation_layer","vn_macro_layer"]),
    cc_array:  (($d.conviction_calls | type) == "array"),
    dir_enum:  (all(($d.conviction_calls // [])[]; . as $c | ["BUY","HOLD","SELL","NEUTRAL"] | index($c.direction) != null)),
    val_gate:  (all(($d.conviction_calls // [])[]; . as $c
                 | ($c.valuation_gate == null) or ($c.valuation_gate.verdict != "AVOID")
                   or (($c.direction != "BUY") and ($c.valuation_gate.override_engaged == true)
                       and (($c.valuation_gate.override_rationale // "") != "")))),
    l2_floor:  (($d.tnb_synthesis.us_macro_layer // "") as $u
               | ($d.known_gaps // []) as $g
               | (($u | test("PMI\\s*:?\\s*[0-9]"))
                  or (($u | test("EFFR"; "i")) and ($u | test("IORB"; "i"))
                      and ($u | test("[0-9]\\s*(bp|pp|basis)")))
                  or (($u | test("chain_catalyst|geopolitic|trade war|escalat|military strike|tension"; "i"))
                      and ($u | test("risk|confidence|direction|premium|active|tension|escalat"; "i")))
                  or (any($g[]; . as $t | ($t | contains("[gap:"))
                       and ($t | test("L2|US_macro|macro_health|geopolit|PMI|EFFR|consumer_sentiment"; "i")))))),
    l3_floor:  (($d.tnb_synthesis.vn_macro_layer // "") as $v
               | ($d.known_gaps // []) as $g
               | (($v | test("USD/VND|USD-VND|USD VND"; "i"))
                  and (($v | test("CPI"; "i"))
                       or (any($g[]; . == "[gap:CPI_unavailable]"
                            or . == "[gap:L3_VN_macro_incomplete]")))
                  and (($v | test("VIRA|FX reserves|foreign reserves"; "i"))
                       or (any($g[]; . == "[gap:VIRA_unavailable]"
                            or . == "[gap:FX_reserves_unavailable]"
                            or . == "[gap:L3_VN_macro_incomplete]")))))
  }
  | (to_entries | map(select(.value == false) | .key)) as $failed
  | if ($failed | length) == 0 then "SCHEMA_OK"
    else ("SCHEMA_FAIL: " + ($failed | join(",")) + "\n") | halt_error(1) end
' "<FILEPATH>"
```

Clause → meaning: `top_keys`/`meta_keys`/`tnb_keys` = exact key-set conformance (extras fail too, not
just omissions); `dish_type` = the enum, via the slot mapping table above; `verdict` =
`metadata.quality_verdict` equals what Step 7.5 actually computed; `cc_array` = `conviction_calls` is
a top-level array; `dir_enum` = sub-check (g); `val_gate` = sub-check (h). `l2_floor`/`l3_floor`
(FIX-CHEF-EVENING-L2L3-SILENT-GAP) = the persisted Layer-2 US-stack / Layer-3 VN-stack CONTENT floors,
mirroring Step 7.5 sub-checks (a)/(c): `l2_floor` requires `us_macro_layer` to carry a numeric PMI,
an EFFR+IORB spread, or a genuine geopolitical event citation (event keyword + risk/direction
vocabulary — a bare "gold exceeds risk-off threshold" price level does NOT count), or a matching L2
gap token in `known_gaps[]`; `l3_floor` requires `vn_macro_layer` to carry a USD/VND level AND (CPI
or `[gap:CPI_unavailable]`) AND (VIRA/FX-reserves or `[gap:VIRA_unavailable]`/
`[gap:FX_reserves_unavailable]`). A file that silently omits L2/L3 content without the gap tokens
fails here even if every shape clause passes — the 2026-08-26 evening file is the live calibration
instance (it fails top_keys for schema divergence AND l2_floor/l3_floor for content absence on the
old-schema write, and would fail l2_floor/l3_floor on a canonical-schema write of the same content).

Non-zero exit (or any `SCHEMA_FAIL:` line) → re-Write ONCE with the listed clauses corrected, then run
the SAME command again. If the second run also fails, treat as `tool-error` per `chef-telemetry.md`'s
Try/Catch Boundary → Degraded-Floor Recovery — do not silently continue with an unverified persisted
file. (Skipped entirely on the intraday-silent path — see the exception immediately below.)

**Why a command and not a checklist:** the previous version of this step was a 5-item narrative
checklist and it did not stop a single one of the 19 non-conformant dishes in the live 69-dish corpus,
including `unified-agent-synthesis-2026-08-22-chef-evening.json`, written after the assertion fix
landed, which shipped 9 top-level keys and a reshaped `metadata` with no
`[gap:schema_nonconformant_corrected]` token. Re-running the command above over that whole corpus
reproduces every one of those 19 failures and passes the other 50 — so the clauses are calibrated
against real data, not invented. (FIX-CHEF-EVENING-L2L3-SILENT-GAP, 2026-08-29: `l2_floor`/
`l3_floor` were added to the same command so the CONTENT floors are enforced at persist time, not
just at Step 7.5 — re-calibrated over the live 79-file corpus: the shape-only command (pre-fix)
scores 55 pass / 24 fail; with the two content clauses added it scores 37 pass / 42 fail. All 18
additional failures are the silent-L2/L3 class — files that pass every shape clause but carry no
US/VN stack content or gap tokens (e.g. 2026-08-26 evening, which the audit confirmed, plus the
08-26 EOD the same audit scored E✗ "VIRA absent, undeclared" on). The 2026-08-23/24 evening files
— the honest self-flag baseline c134/c136 praised — pass both new clauses.)

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
