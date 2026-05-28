<!-- size-justification: 264L — telemetry extracted to chef-telemetry.md (S1 split); dual-output Step 7 splits MARKET (plain-VI) from WORK (TNB-auditable) — atomic responsibility, cannot split without breaking recipe coherence; Steps 0–7 are a sequential decision framework that must be read end-to-end per dish cycle -->
> Parent: [./main.md](./main.md)

# Unified Agent — Chef Flow (TNB 6-Layer Recipe)

Executes for all dish windows: Morning (05:23) / Intraday (:13 market hrs) / EOD (08:37) / Evening (19:37).
Input: `$DISH_TYPE` = `morning` | `intraday` | `eod` | `evening`

**Tools:** `docs/agents/tools/package/unified-agent.md`

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

→ Telemetry spec (ENTRY / CLOSE / FAILED / SILENT / try-catch boundary): `docs/agents/unified-agent/flow/chef-telemetry.md`

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
emit SILENT Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § SILENT Telemetry`
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

## Step 7 — WRITE DISH (Dual-Output)

Produce **two outputs** from the synthesized analysis: Block A for the user (MARKET channel — plain Vietnamese), Block B for TNB audit (WORK channel — analyst detail).

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
- Citation Discipline: every paragraph-2 claim MUST cite ≥1 of: signal ID, source file, source_tier. Claims without citations are a FLOW VIOLATION — self-correct or downgrade to "unverified observation".
- Metadata footer: "TNB layers walked: Layer 1–6 | Signal IDs consumed: [...] | source_tier values cited: [...]"
- Full hexagram names in Hán-Việt (`Lão Âm Hào 6`) — TNB expects canonical terminology.

**Send:**
```
send_telegram(channel="work", message="[CHEF-DETAIL] <DISH_TYPE> <HH:MM UTC>\n" + <Block_B_text>)
```

The `[CHEF-DETAIL]` prefix is mandatory — it allows tran-ngoc-bau's audit flow to filter WORK messages precisely.

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

→ After notebook append: emit CLOSE Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § CLOSE Telemetry`
→ On exception (Steps 0–7): emit FAILED Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § FAILED Telemetry`

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
