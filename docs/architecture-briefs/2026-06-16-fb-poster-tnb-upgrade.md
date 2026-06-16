# FB Market Poster — TNB 6-Layer + T-45 Adversarial Upgrade

**Date:** 2026-06-16
**Task:** FB-POSTER-TNB-UPGRADE (P1)
**Investigator:** agents-architect
**Mode:** read-only; no production changes
**Reference deliverable:** `docs/social/fb-post-2026-06-16.md`
**Reference workflow output:** `/private/tmp/claude-501/-Users-admin-Documents-Hung---works-----PROJET---labo-VN-Market-Intelligence-MCP/73ea6e42-2057-485f-9eb1-1b5f7ef117a3/tasks/w5entyjvn.output`
**Target file:** `docs/agents/fb-market-poster/flow/main.md`

---

## Problem Statement

The current `fb-market-poster` flow (STEP 1 → STEP 3) produces a generic recap whenever
CHEF/unified-agent upstream synthesis is thin or silent. On 2026-06-16 CHEF ran at 06:22
UTC and exited with 0 clusters (silent intraday gate). At 20:07 VN (13:07 UTC) the
fb-market-poster was left with no synthesized intelligence in
`docs/agent-memory/notebooks/unified-agent.md`. Without a fallback that walks the full
top-down methodology independently, the flow degrades to a recap: symmetric
"có thể tăng / có thể giảm" framing, no sector rotation thesis, no per-ticker verdict,
no adversarial self-check.

The root cause is NOT a data gap. Live gateway tools (`get_market_context`,
`get_market_foreign_flow`, `get_ticker_intelligence` ×25, `get_technical_indicators` ×16,
`get_macro_snapshot`) all returned real, citable, varied data on 2026-06-16. The gap is
**synthesis**: the flow has no step mandating a top-down causal walk, no per-ticker
conviction schema, and no adversarial pre-compose pass that can catch cross-ticker
contamination (a reputation score attributed to the wrong ticker), false-precision levels
(22.918 / 79.597 with no source), or estimate-vs-fact conflation (HPG "+515k = cleanest
flow signal" when that number is is_estimate=true/net_bn=null and noise-scale at 1.68%
of daily volume).

A manual 4-phase workflow (TNB walk → conviction → T-45 adversarial → compose) proved
this on the same data set, producing a post that dropped the HPG conviction call,
corrected GAS's misattributed reputation score, fixed CPI 5.46→3.61, and demoted the
foreign-bank-exit thesis from directive to flag — all before the post reached compose.

---

## Affected Flows and Files

| File | Change Type |
|---|---|
| `docs/agents/fb-market-poster/flow/main.md` | Insert STEP 2b (TNB walk) + STEP 2c (T-45 adversarial gate) + per-ticker conviction schema; widen STEP 1b data fetch list |
| No other agent files affected | — |

Existing STEP structure preserved: STEP 0 bootstrap, STEP 1 synthesized-source read, STEP 1b live enrichment, STEP 2 forward-looking read, STEP 3 compose, STEP 4 jargon gate (STEP 4a hard-fail unchanged), STEP 4 validation checks, STEP 5–8 write/notify/log.

---

## Root-Cause Map

```
CHEF silent (0 clusters)
  → unified-agent.md: thin/no EOD dish
    → STEP 1 grounding check: passes if VN-Index value present (any source)
      → STEP 2 / STEP 3: no synthesis mandate
        → Compose from raw data without top-down causal walk
          → Post = recap, not analysis
            → No sector rotation thesis, no per-ticker verdict, no adversarial check
              → "có thể tăng / có thể giảm" framing ships
```

The fix inserts a **mandatory synthesis gate** between STEP 1b (live enrichment, data is
already pulled) and STEP 3 (compose). It does not touch STEP 0, STEP 1, STEP 4a jargon
gate, STEP 4 validation checks, STEP 5–8, or the 3-section output structure.

---

## CHEF→FB-Poster Handoff Contract

The current contract is: STEP 1 reads `docs/agent-memory/notebooks/unified-agent.md` and
extracts the `[LATEST]` entry. If that entry exists and has a VN-Index value + ≥1
sector/ticker move, the grounding check passes and the cycle continues.

The contract gap: the flow treats a CHEF dish as a **synthesis replacement** (if CHEF
produced it, use it; if not, have nothing). It must treat a CHEF dish as a
**synthesis accelerator** (if CHEF walked the 6 layers, use it as Layer-1+2 input; if
not, the agent walks them itself).

**Revised contract (agent-father to implement):**

```
$chef_dish_available = (unified-agent.md[LATEST].date == TODAY AND
                        unified-agent.md[LATEST].layers_walked == true AND
                        unified-agent.md[LATEST].clusters > 0)

IF $chef_dish_available:
  → Use CHEF sector map + regime call as Layer 1-2 starting state for STEP 2b.
  → Skip independent macro-pull (macro already read in STEP 1b).
  → Proceed to STEP 2b Layer-3 (regime) with CHEF state as input.

IF NOT $chef_dish_available (CHEF silent or thin):
  → STEP 2b walks ALL 6 layers from STEP 1b live data.
  → No reduced path. Graceful degradation = own top-down walk, not recap.
```

CHEF EOD dish format is compatible: it emits `layers_walked: true/false`, cluster count,
phase declarations per sector, and a macro summary — all usable as Layer 1-2 seeds.

---

## Recommended Implementation: New Steps to Insert

Agent-father must insert **STEP 2b** and **STEP 2c** into
`docs/agents/fb-market-poster/flow/main.md`, between the current STEP 2 and STEP 3.

### STEP 2b — TNB 6-Layer Top-Down Walk (mandatory synthesis gate)

**Purpose:** Produce a structured intermediate synthesis object (`$tnb_synthesis`) that
STEP 3 compose reads instead of raw data. If CHEF is available, seed from CHEF dish.
If not, derive from STEP 1b live tool results.

The six layers, each MANDATORY (not optional):

**Layer 1 — Macro momentum (investment clock)**
- Inputs (from STEP 1b `macro` + `market_context`): CPI YTD % (is_estimate flag), IIP
  manufacturing YTD % (is_estimate flag), VND/USD, DXY, Brent, gold, trade balance.
- Output: `clock_phase` = Growth↑/↓ × Inflation↑/↓ → one of: Recovery / Overheat /
  Stagflation / Slowdown. Attach `is_estimate` to each input used.
- Rule: NEVER use a figure marked is_estimate=true as a hard clock classifier. If the
  decisive input is estimated, record clock_phase as "unconfirmed / lean {X}" not "{X}".
- CPI source discipline: use only NSO YTD figure from `get_macro_snapshot` as delivered.
  Do NOT carry forward a number from a prior session; re-read each cycle.

**Layer 2 — FX / capital flow pressure**
- Inputs: usdvnd, DXY, carry spread from `$carry_usable` (STEP 1b already computed).
- Output: FX_regime = Appreciation / Depreciation / Neutral; carry verdict = Tight /
  Neutral / Loose (use `$carry_usable` flag — if false, label carry as "unavailable").
- Coherence check: if foreign flow direction and FX direction conflict (e.g. VND weaker
  but foreigners buying), flag as "FX thesis weakened — flow data contradicts blanket FX
  exit narrative." Do NOT assert FX as cause when same-session foreign buys are on the
  same VND-denominated assets.

**Layer 3 — Regime label**
- Combine Layer 1 + 2 + foreign flow net direction + liquidity signal.
- Output: `regime` string (e.g. "SELECTIVE / LATE-CYCLE — cheap equities, money not
  tight, inflation above threshold, foreign net sell concentrated in banks").
- Attach confidence: HIGH (all inputs is_estimate=false) / MEDIUM / LOW.

**Layer 4 — Sector rotation (money in / money out + why)**
For EACH sector with watchlist coverage, produce one record:
```
{
  sector: string,
  phase: Recovery | Expansion | Slowdown | Contraction,
  direction: up | flat | down,
  thesis: 2-3 sentences naming specific tickers + flow evidence + macro linkage,
  where_money_rotates: "INTO {sector} — {reason}" | "OUT OF {sector} — {reason}" | "NEUTRAL",
  is_estimate_flags: [list of estimated inputs used in thesis]
}
```
Rule: a thesis may NOT assert a directional rotation claim if the only supporting
flow figure is is_estimate=true AND net_bn=null. Downgrade to "suggestive" in that case.

**Layer 5 — Per-ticker conviction**
For each ticker to be named in the post, produce one record using this schema:
```
{
  ticker: string,
  verdict: MUA_TICH_LUY | GIU | GIAM_TY_TRONG | TRANH | QUAN_SAT,
  watch_zone: string (price range or condition — omit if no verified TA data),
  condition: string ("nếu X thì Y — ngược lại nếu Z thì W"),
  reason: string (3-5 bullet points of evidence, each tagged is_estimate=true/false),
  risk: string (single most important thesis-breaker),
  conviction: cao | trung binh | thap,
  data_quality: FULL | PARTIAL | NO_TA (flag if TA was not fetched this run)
}
```
Rule: if `data_quality = NO_TA`, verdict MUST be QUAN_SAT or GIU — never MUA_TICH_LUY
or GIAM_TY_TRONG on absent technical data. If TA was fetched but an individual field
(support level, resistance level) has no traceable source in the tool output, omit that
field entirely. Do NOT synthesize support/resistance levels.

**Layer 6 — Valuation + uncertainty caveats**
- EY spread (from `get_macro_snapshot` — cite is_estimate flag, cite the value verbatim).
- Carry spread (from `$carry_usable` — if false, omit carry claim entirely).
- Named estimation gaps: breadth counts (null), liquidity in tỷ đồng (null if not
  returned), foreign net in tỷ đồng (null if net_bn=null). Record each as a
  `known_gap` entry so STEP 3 compose never fills these with fabricated numbers.

Store all six layer outputs as `$tnb_synthesis` in working memory.

**CHEF shortcut:** If `$chef_dish_available = true`, Layer-1 clock_phase and Layer-3
regime MAY be seeded from CHEF's published phase declarations — but each input must still
carry is_estimate provenance. CHEF's cluster map is used as Layer-4 sector records (one
per sector), updated with fresh STEP 1b flow data pulled this run.

---

### STEP 2c — T-45 Adversarial Gate (mandatory pre-compose, hard-fail on severity=drop)

**Purpose:** For each high-conviction claim in `$tnb_synthesis`, attempt independent
refutation before allowing it into the compose step. Claims that fail must be softened
or dropped. This mirrors the T-45 phase of the expert roundtable methodology.

**Scope:** Run adversarial checks on EVERY ticker verdict of conviction=cao AND on the
top-level regime call. Ticker verdicts of conviction=trung binh or thap: run if evidence
is sparse; skip if time budget exhausted (log skip).

**For each checked claim, produce:**
```
{
  claim: string (the assertion being checked),
  holds: true | false,
  severity: confirm | soften | drop,
  refutation: string (specific counter-evidence found, or "none found — claim survives"),
  corrected_note: string (what to say instead if holds=false),
  estimate_flag: bool (true if any input to the claim was is_estimate=true)
}
```

**Hard-fail rules (block compose on these):**

1. **Cross-ticker contamination:** if a piece of evidence (score, news item, flow figure)
   was attributed to the wrong ticker in Layer 5, severity=drop that claim. The agent must
   re-verify attribution before using a score or signal. Example of the class: reputation
   score belonging to VNM cited as GAS's score.

2. **False-precision levels:** if a support/resistance level was cited to sub-VND
   precision (e.g. 22.918, 79.597) and cannot be traced to a specific tool output field in
   this run, severity=drop the level. Replace with a round-number approximation or omit.
   Rule: only cite a level if it appears in `get_technical_indicators` or
   `get_ticker_intelligence` output for this session. No carry-forward from prior sessions.

3. **is_estimate=true cited as fact:** if a claim uses an estimated figure as a hard
   assertion (e.g. "+515k net buy = cleanest signal" when net_bn=null / is_estimate=true),
   severity=soften minimum. If the entire conviction call rests on a single estimated
   figure, severity=drop.

4. **Noise-scale foreign flow:** if a per-ticker foreign flow figure (in shares) is less
   than 5% of the ticker's own daily volume as returned by `get_ticker_intelligence`,
   it is noise-scale. Do NOT present noise-scale flow as directional conviction. Demote to
   "worth watching" or omit.

5. **Internal contradiction:** if the claim cites both a news headline and a tool data
   point that contradict each other on the same ticker (e.g. flow tool says net-buy,
   headline says net-sell for the same name), severity=soften minimum. The post must
   surface the contradiction explicitly rather than picking one side.

**Gate outcome:** If any claim has severity=drop, that claim is REMOVED from `$tnb_synthesis`
before compose. The compose step receives only surviving claims. No claim dropped by T-45
may be reintroduced in STEP 3.

The gate does NOT block the cycle — only individual claims are dropped. If ALL
MUA_TICH_LUY calls are dropped by T-45, the post has no buy calls for that session.
This is correct behavior; do NOT manufacture buy calls to fill the section.

---

## Wiring: How STEP 3 Compose Reads the New Intermediates

STEP 3 (existing compose step) must be updated to read from `$tnb_synthesis` rather than
directly from raw notebook/tool data. The 3-section structure (Tóm tắt nhanh → Phân tích →
Dự đoán) is unchanged. The difference is what feeds each section:

| Section | Current input | New input |
|---|---|---|
| Tóm tắt nhanh | Raw STEP 1b data | STEP 1b data (unchanged — factual recap) |
| Phân tích | Ad-hoc interpretation | `$tnb_synthesis.regime` + Layer-3 regime_reason + Layer-4 rotation thesis |
| Dự đoán | `$prediction_inputs` from STEP 2 | `$tnb_synthesis.conviction.calls[]` (Layer-5 per-ticker schema) + T-45-surviving verdicts |

The per-ticker verdict block in Dự đoán maps directly from the Layer-5 schema:
- `verdict` → the action label (MUA TÍCH LŨY / GIU / GIẢM TỶ TRỌNG / TRÁNH / QUAN SÁT)
- `watch_zone` → price zone to watch
- `condition` → the if-then sentence
- `risk` → the explicit risk caveat
- `conviction` → determines how confidently to phrase the call (cao = firm recommendation;
  trung binh = suggest/watch; thap = observe only)

`data_quality = NO_TA` tickers must be explicitly acknowledged in the post ("không có dữ
liệu kỹ thuật phiên này") — never silently omit the caveat.

---

## Data Tools — What to Pull and What Each Returns (from 2026-06-16 run)

Agent-father must update STEP 1b to include the full tool list that the reference workflow
required. The current STEP 1b is missing several calls that proved load-bearing:

| Tool | Returns real vs estimate | Notes |
|---|---|---|
| `get_market_context` | is_estimate=false for prices; breadth null (not returned) | Primary price/alert/news source |
| `get_market_foreign_flow` | Flow in SHARES; net_bn=null (is_estimate=true); market-level direction qualitative | 98-ticker watchlist only, NOT full exchange. Always log this caveat |
| `get_ticker_intelligence` | Prices is_estimate=false; flow figures is_estimate=true | Pull for ALL watchlist active tickers (25 on 2026-06-16). Per-ticker, not just "top 5-10" |
| `get_technical_indicators` | RSI/MACD/BB: is_estimate=false when returned; individual fields may be null/corrupted | Pull for ≥15 tickers. Flag corrupted output (e.g. VNM MA20=3.68M) as is_estimate=true |
| `get_macro_snapshot` | EY spread + carry: is_estimate=false when fresh (confirmed 2026-06-16); CPI, IIP: is_estimate=false | Primary Layer-1+6 source |
| `get_legal_risk_signals` | Dated legal items; source-correlated | For T-45 governance checks |
| `get_sentiment_trend` | 7-day sentiment slope; is_estimate varies | For corporate-momentum input |
| `get_earnings_calendar` | Filing deadlines only; beat/miss = n/a | BCTC overdue flag, NOT earnings beat signal |
| `get_crisis_early_warning` | Qualitative risk flags | Background corroboration |

Current STEP 1b only calls: `get_market_snapshot`, `get_market_context`,
`get_market_foreign_flow`, watchlist `get_ticker_intelligence` (top 5-10 only),
`get_macro_snapshot`. Missing: `get_technical_indicators` (TA), `get_legal_risk_signals`,
`get_sentiment_trend`, `get_earnings_calendar`. These are required for T-45 adversarial
checks and for honest Layer-5 conviction calls.

**Update to STEP 1b:** Pull ALL watchlist active tickers via `get_ticker_intelligence`
(not just top 5-10), AND pull `get_technical_indicators` for tickers flagged as potential
post subjects, AND pull `get_legal_risk_signals` + `get_earnings_calendar` as T-45 inputs.
If individual calls error, log and continue (existing behavior). If >50% of ticker_intel
calls error, log data quality = PARTIAL.

---

## Is-Estimate Provenance Discipline (Layer-6 enforcement)

This rule exists as the carry provenance rule (`DSI-CONSUMER-HONORS-ISESTIMATE`) in STEP
1b of the current flow. It covers `$carry_usable` for the carry/FII narrative. It must be
generalized to ALL numeric claims in the post, enforced in STEP 2b (Layer 6) and STEP 2c
(T-45 check #3):

**Rule (generalized):** Any number used in the post body must carry an is_estimate flag
from its source tool. If is_estimate=true, the post MUST frame it as directional/estimated,
not as a fact. If net_bn=null (foreign flow), the post may state direction (buy/sell) but
may NOT state a VND amount. If breadth is null, the post must explicitly say the data was
not available — not omit the acknowledgment silently.

The existing carry rule is a special case of this general rule. STEP 2b Layer-6 is where
ALL gaps are recorded, so STEP 3 compose has a complete `known_gaps` list and never
silently fabricates a missing figure.

---

## Graceful Degradation Path

When `$chef_dish_available = false` (the scenario that triggered the failure):

1. STEP 2b runs its own full 6-layer walk from STEP 1b live data. No reduced path.
2. The walk may produce fewer high-conviction calls (because without CHEF's cluster
   aggregation, individual-ticker conviction may be lower). This is correct.
3. STEP 2c adversarial gate still runs. Fewer inputs = faster gate.
4. STEP 3 compose still produces a 3-section post with the surviving verdicts.
5. If T-45 drops all MUA_TICH_LUY calls: the Dự đoán section has QUAN_SAT/GIU/TRANH
   calls only. That is an honest post. The current fallback (symmetric recap) is worse
   than a post that says "no clear buy signal today — here is why."

The post produced on 2026-06-16 via the manual workflow is the reference proof that
graceful degradation to an honest top-down walk is always better than a generic recap.

---

## What Agent-Father Must NOT Change

- STEP 4a jargon gate (hard-fail, real shell execution, `scripts/fb-jargon-gate.sh`). Keep verbatim.
- The 3-section output structure (Tóm tắt nhanh → Phân tích → Dự đoán). Keep verbatim.
- The post template, disclaimer block, hashtag composition rule. Keep verbatim.
- The 16 STEP 4 validation checks. Keep all; they remain valid.
- STEP 0 bootstrap, STEP 5–8 write/notify/log. Keep verbatim.
- SELF-IDENTITY GUARD. Keep verbatim.

---

## Implementation Sequence (agent-father task order)

1. **Task A — Extend STEP 1b:** Add `get_technical_indicators` (≥15 tickers),
   `get_legal_risk_signals`, `get_sentiment_trend`, `get_earnings_calendar` calls.
   Update the "top 5-10" ticker_intel instruction to "ALL watchlist active tickers."
   Estimate: +15 lines in STEP 1b.

2. **Task B — Insert STEP 2b (TNB walk):** Full text of the 6-layer walk as specified
   above, including CHEF shortcut branch and `$tnb_synthesis` schema. This is the largest
   insertion. Estimate: +80 lines.

3. **Task C — Insert STEP 2c (T-45 gate):** Full text of the adversarial gate as specified
   above, including the 5 hard-fail rules and gate-outcome handling. Estimate: +50 lines.

4. **Task D — Update STEP 3 compose wiring:** Replace "read from $prediction_inputs / raw
   data" with "read from $tnb_synthesis.conviction.calls[]"; add the `known_gaps` pass-through
   that prevents fabrication of null fields. Estimate: +10 lines, -5 lines.

Tasks A and B may run in parallel. Task C depends on B (needs `$tnb_synthesis` schema
defined). Task D depends on C (needs T-45 output defined).

Estimated total file size increase: +150 lines (from current 497 lines to ~647 lines).
Within the 489L size note in the file header — agent-father should update that note to
reflect the new size and add a brief size-justification for the added steps.

---

## Signal to Agent-Father

Signal file: `docs/signals/fb-poster-tnb-upgrade-20260616T165057Z.json`
