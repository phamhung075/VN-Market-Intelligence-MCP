<!-- size-justification: 227L — telemetry extracted to chef-telemetry.md (S1 split); remaining content is the 6-layer TNB recipe protocol (Steps 0–7) which is a single atomic responsibility; Steps 0–7 are a sequential decision framework that must be read end-to-end per dish cycle and cannot be factored without breaking recipe coherence -->
> Parent: [./main.md](./main.md)

# Unified Agent — Chef Flow (TNB 6-Layer Recipe)

Executes for all dish windows: Morning (05:23) / Intraday (:13 market hrs) / EOD (08:37) / Evening (19:37).
Input: `$DISH_TYPE` = `morning` | `intraday` | `eod` | `evening`

**Tools:** `.claude/tools/package/unified-agent.md`

> Error boundary → skill: `.claude/skills/cowork-boundary/SKILL.md`

**Knowledge (lazy-load before Step 0):**
- `docs/standards/tnb-methodology.md` (6-layer framework)
- `docs/standards/tnb-methodology-layers.md` (state transitions, thresholds)
- `docs/standards/tnb-methodology-valuation.md` (Layer 6 gap catalogue)
- `docs/standards/market-analysis.md` (4-level cascade)
- `docs/references/kinh-dich-layer.md` (Kinh Dịch overlay)

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `unified-agent`)

---

→ Telemetry spec (ENTRY / CLOSE / FAILED / SILENT / try-catch boundary): `.claude/flows/unified-agent/chef-telemetry.md`

> Error boundary → skill: `.claude/skills/cowork-boundary/SKILL.md`

---

## Step 0 — GATHER

Read all `docs/signals/*.json` with `mtime` within last 24h (or since last dish logged in notebook).

Collect file groups:
- `price_anomaly_*` — from market-watcher
- `news_impact_*` — from news-scout
- `bctc_signal_*` — from financial-analyst
- `fundamental_*` — from report-analyzer

Also call:
- `get_market_hexagram()` — market-wide Kinh Dịch state
- `get_macro_snapshot()` — US/VN macro snapshot
- `get_agent_signals(hours=24)` — cross-agent signal index

Note signal count + IDs for LOG step.

---

## Step 1 — CLUSTER (convergence detection)

Group signals by ticker, then by sector.

**Convergence rule — a cluster qualifies when ANY of these is true:**

| Rule | Definition |
|---|---|
| Ticker convergence | ≥2 distinct signal types for the same ticker in same 24h window (e.g. price_anomaly + news_impact for ACB) |
| Sector convergence | ≥3 signals (any type) targeting tickers in the same sector in same 24h window |
| Macro-micro contradiction | A macro signal contradicts the micro signal for a watchlist ticker (e.g. TIGHTENING regime + active BUY alert on VCB) |
| Extreme individual signal | Any signal with `severity=CRITICAL` OR any TA reading outside 2-sigma (RSI < 15 or > 85) |

**Intraday gate:** if `$DISH_TYPE == intraday` AND 0 clusters qualify →
emit SILENT Telemetry per `.claude/flows/unified-agent/chef-telemetry.md § SILENT Telemetry`
→ return `DONE: intraday-silent | PIPELINE: complete` and EXIT. No MARKET message.

**Gate-fired contract:** When ≥1 cluster qualifies (or `$DISH_TYPE` is `morning` / `eod` / `evening`), Steps 2–8 are MANDATORY. The agent MUST proceed through all steps and publish. Self-refusal — any English prose such as "I cannot complete the full end-to-end execution here" or "these require sequential MCP calls" — is a flow violation. If an unrecoverable blocker is hit, emit `FAILED` telemetry with `reason="<actual error>"` and EXIT non-zero. There is no third path between SENT and FAILED.

**Morning/EOD/Evening:** always continue even if 0 clusters (publish regime-state update at minimum).

---

## Step 2 — LAYER 1 (data discipline check)

For each qualifying cluster: verify signals cite **state transitions**, not just levels.

Flags to check (per `tnb-methodology-layers.md`):
- PMI crossing 50 (expansion ↔ contraction)
- USD/VND crossing 25,500 or 26,500 resistance
- CPI trend reversal (accelerating vs decelerating)
- Volume 2x+ average (accumulation vs distribution)

Mark any level-reporting-only gap in the draft for Layer 6 fix.

---

## Step 3 — LAYER 2+3 (US/VN economic stacks)

**US stack:**
- Manufacturing PMI (above/below 50 + direction)
- Consumer sentiment (trend)
- Fed rate + EFFR-IORB spread (tightening/easing posture)

**VN stack:**
- USD/VND vs 26,500 level (carry posture)
- CPI trend (inflationary pressure)
- FX reserves trend via VIRA data (not WiData — off-limits)

**Thesis mapping:** US → VN via carry/FII flow chain. If US tightening → FII net-sell pressure on VN → document the transmission.

---

## Step 4 — LAYER 4 (4-pillar valuation)

For each watchlist ticker in a qualifying cluster, map against all 4 pillars:

| Pillar | Vietnamese | Check |
|---|---|---|
| Money supply | Lượng tiền | Credit growth, M2, banking liquidity |
| Capital cost | Chi phí vốn | Interest rate environment, bond yields |
| Earnings outlook | Triển vọng lợi nhuận | BCTC trend, sector revenue |
| Valuation risk | Rủi ro định giá | P/E vs sector, premium/discount |

Confidence scoring:
- All 4 aligned → high conviction (cite in dish)
- 2-3 aligned → medium conviction
- <2 aligned → low conviction (flag in dish, do not recommend action)

---

## Step 5 — LAYER 5 (Kinh Dịch overlay)

For each qualifying cluster ticker:
- Call `get_kinhdich_reading(ticker)` — include hexagram name + state in narrative
- Flag Lão Dương (老陽, peak Yang) or Lão Âm (老陰, peak Yin) explicitly — these are reversal signals

For dish header: use `get_market_hexagram()` result as market-wide context.

---

## Step 6 — LAYER 6 (gap catalogue)

Scan the draft narrative against gap catalogue from `tnb-methodology-valuation.md §Layer 6`:

| Gap type | Fix required |
|---|---|
| Single-pillar thesis | Add the other 3 pillars or state "insufficient data — cannot confirm" |
| Inverted causality | Reverse the causal chain; re-check |
| Source risk | Flag if only 1 source; add caveat |
| Lagged indicator | Note lag; add forward-looking supplement |
| Regime drift | Re-check current macro regime before asserting |

Apply fixes before Step 7. If a gap cannot be fixed (missing data) → flag explicitly in dish.

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
- Example with gap: "[gap: no US macro signal in cycle] → VND carry -33bp FII_OUTFLOW_RISK → banking sector under pressure → [gap: no news_impact for VCB] — conviction LOW."
- If conf=0.50 on all signals for a cluster (uncertain source baseline), label: `[uncertain-source baseline]` after the ticker state and treat as LOW conviction.
- Store all chain sentences in session state — they become the mandatory spine of paragraph 2 in Step 7.

---

## Step 7 — WRITE DISH

**Format:** 2–4 narrative paragraphs in Vietnamese with full diacritics.

**Structure:**
1. **Regime context** — market hexagram state + macro regime (TIGHTENING/EASING/NEUTRAL) + US/VN stack summary
2. **Sector/ticker thesis** — qualifying clusters, pillar alignment, convergence evidence cited. Open this paragraph with the causal-chain sentence(s) from Step 6.5 verbatim. Then expand with supporting detail.
3. **Kinh Dịch overlay** — hexagram states for key tickers; reversal signals if any
4. **Action signal or watch** — high-conviction: clear action signal; medium: watch trigger; low: no recommendation

**Citation Discipline (paragraph 2 — TNB-auditable):**
Every claim in paragraph 2 MUST cite at least one of: signal ID (e.g. `#3350`), source file (e.g. `price_anomaly_20260518T1637`), or source_tier (`tier-1`). Citation format: inline parenthetical immediately after the claim — e.g. "VCB volume 10x average (#3350, price_anomaly_20260518T1637)". Claims without citations are a FLOW VIOLATION — self-correct by adding the citation or downgrading the claim to "unverified observation" and reducing conviction.

**Metadata to include in dish:**
- TNB layers walked: cite by number (Layer 1–6)
- Signal IDs consumed: list file names or IDs
- `source_tier` values cited

**Send:**
```
send_telegram(channel="market", message=<dish_text>)
```

No atom lists. No bullet-point ticker dumps. Every MARKET message is a narrative dish.

---

## Step 8 — LOG

> **Write-tool contract:** The Write tool IS available in this agent. Self-refusal here (e.g. "I cannot directly write to the file" or "I'll compose the append that should be made") is a flow violation — use the Write tool and proceed.

1. Mark all consumed signal files as processed (append `"processed": true` or move to `docs/signals/processed/`).
2. Append to notebook `docs/agent-memory/notebooks/unified-agent.md`:
   ```
   ### Chef Dish — <DISH_TYPE> HH:MM UTC
   - Clusters qualified: N
   - Tickers covered: [list]
   - Layers walked: 1-6
   - Signals consumed: [IDs]
   - Dish published: YES | silent-exit
   ```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

→ After notebook append: emit CLOSE Telemetry per `.claude/flows/unified-agent/chef-telemetry.md § CLOSE Telemetry`
→ On exception (Steps 0–7): emit FAILED Telemetry per `.claude/flows/unified-agent/chef-telemetry.md § FAILED Telemetry`

## RETURN

```
DONE: Chef dish published — <DISH_TYPE> | layers 1-6 walked | N clusters
NEXT: tran-ngoc-bau (audit at 20:13 UTC) | idle
PIPELINE: complete
QUALITY: full
```

Silent-exit variant:
```
DONE: Intraday scan — 0 clusters qualified, silent exit
PIPELINE: complete
QUALITY: full
```
