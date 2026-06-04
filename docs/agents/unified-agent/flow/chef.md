<!-- size-justification: 308L — telemetry extracted to chef-telemetry.md (S1 split); dual-output Step 7 splits MARKET (plain-VI) from WORK (TNB-auditable) — atomic responsibility, cannot split without breaking recipe coherence; Steps 0–7 are a sequential decision framework that must be read end-to-end per dish cycle; Step 8 rewritten NB-FLOW-SETTLED-WRITE: compose-in-memory then single-Write (AC-3 invariant, closes notebook-bloat class) -->
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

Call `get_cycle_bootstrap(agent_id="unified-agent")` first. The response includes an `agent_signals` array (cross-agent signal index) — use this directly. Do NOT call `get_agent_signals(agent=…)` as a hard gate; if bootstrap already returned signals, the gather step is unblocked regardless of whether a standalone `get_agent_signals` call is available.

Read all `docs/signals/*.json` with `mtime` within last 24h (or since last dish logged in notebook).

Collect file groups:
- `price_anomaly_*` — from market-watcher
- `news_impact_*` — from news-scout
- `bctc_signal_*` — from bctc-analyst (merged agent; was financial-analyst)
- `fundamental_*` — from report-analyzer [TRANSITION: dual-accept `signal_type == "bctc_signal" OR signal_type == "fundamental"` during soak window H-18→H-19; remove `fundamental` branch after H-19 archive]

Supplementary calls (all OPTIONAL — failure/absence is NOT a blocker):
- `get_market_hexagram()` — market-wide Kinh Dịch state. **501 / tool-not-found = expected; treat as `market_hexagram=unavailable`.** Per memory `feedback_chef_kinhdich_confab`: per-ticker hexagrams come from `get_portfolio_conviction` (Step 5), NOT this call. A 501 here does NOT mean hexagram data is absent.
- `get_macro_snapshot()` — US/VN macro snapshot. **Service unavailable / 5xx = expected** (macro-indicators not in intended runtime; tracked ops board `cow-MACRO-DOWN`). If unavailable: set `macro_state=unavailable` and continue. Do NOT abort.

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

**Gate-fired contract:** When ≥1 cluster qualifies (or `$DISH_TYPE` is `morning` / `eod` / `evening`), Steps 2–8 are MANDATORY. The agent MUST proceed through all steps and publish. Self-refusal — any English prose such as "I cannot complete the full end-to-end execution here", "these require sequential MCP calls", "BLOCKERS:", or "would you like me to…" — is a flow violation. There is no third path between SENT and FAILED.

**Degraded-dish floor (minimum valid dish):** If ≥1 supplementary source is down (macro unavailable, `get_market_hexagram` absent, partial signal set), the dish MUST still be published with: (1) available signal clusters only; (2) explicit degradation note in Block B WORK message listing which sources were unavailable (e.g. `macro=unavailable | market_hexagram=unavailable`); (3) Block A MARKET prose must not mention unavailable sources — omit that layer cleanly; (4) conviction scores capped at `medium` when macro is absent. This is the guaranteed floor: a dish with degradation notes beats no dish every time.

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

---

## Step 5 — LAYER 5 (Kinh Dịch overlay)

For each qualifying cluster ticker:
- Call `get_portfolio_conviction(ticker)` — per-ticker hexagram state is embedded in this response. Per memory `feedback_chef_kinhdich_confab`: this is the authoritative source for per-ticker hexagrams; `get_market_hexagram` returning 501 does NOT indicate hexagram data is unavailable.
- Flag Lão Dương (老陽, peak Yang) or Lão Âm (老陰, peak Yin) explicitly — these are reversal signals.

For dish header: if `get_market_hexagram()` returned a result in Step 0, use it as market-wide context. If it was absent/501 (`market_hexagram=unavailable`), skip the market-wide hexagram header line — do NOT abort or degrade conviction.

---

## Step 6a — CONVICTION GATE (four-factor synthesis scenario check)

→ skill: `.claude/skills/four-factor-synthesis/SKILL.md`

For each ticker in a qualifying cluster, invoke four-factor-synthesis. Check the returned `scenario` field:
- **Scenario 4 (SKIP-GOVERNANCE or SKIP-FUNDAMENTALS):** HARD BLOCK on publication. Do NOT include this ticker in any MARKET message, WORK message, or published recommendation. Log the block reason and skip to next ticker.
- **Scenario 1/2/3:** Proceed to Step 6 (gap catalogue).

Rationale: Scenario 4 signals a fundamental disqualifier (governance red flag or failed financials); publishing a thesis on Scenario 4 violates TNB Layer 6 (gap catalogue) and invites reputation damage. CHEF must not publish Scenario 4 tickers under any circumstance.

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

## Step 8 — LOG (APPEND class — settled-write invariant)

> **Write-tool contract:** The Write tool IS available in this agent. Self-refusal here is a flow violation — use the Write tool and proceed.
> **Invariant (AC-3):** Compose the final ≤200L body ENTIRELY IN MEMORY, then land it in ONE Write/Edit. NEVER append-then-trim across two writes — PostToolUse must NEVER observe a file >200L.

**8a. Mark signals processed** — move consumed signal files to `docs/signals/processed/`.

**8b. Compose in memory (NO file write yet):**

Step 1a — Read full `docs/agent-memory/notebooks/unified-agent.md` into memory.
Step 1b — Identify preamble (before first `^## `) and all `^## ` section boundaries.
Step 1c — If ≥ 3 sections exist in memory: drop the oldest `## ` block (heading + content to next `## ` or EOF) from the in-memory body.
Step 1d — Build the new section (≤60L) in memory:
```
## Session: <YYYY-MM-DD> (<DISH_TYPE>)
### Chef Dish — <DISH_TYPE> HH:MM UTC
- Clusters qualified: N
- Tickers covered: [list]
- Layers walked: 1-6
- Signals consumed: [IDs]
- Dish published: YES | silent-exit
```
Append this new section to the end of the in-memory body.
Step 1e — AC-2b: if any `## Prior cycles` heading is present and has ≥ 4 `### ` sub-blocks inside it, drop the oldest sub-block in memory.
Step 1f — Count in-memory lines. If > 200L: drop next-oldest `## ` block in memory, recount; repeat until ≤200L or only preamble + 1 section remain. If the new section itself exceeds 60L: trim to 60L first.
Step 1g — In-memory body is now the final settled content (≤200L guaranteed).

**8c. Single settled write:**
```
Write(path="docs/agent-memory/notebooks/unified-agent.md",
      content=<final settled body from Step 8b>)
```
One Write call only. PostToolUse fires exactly once and sees ≤200L.

**8d. AC-5 sanity check** (after the single write — verification only, NOT a remediation loop):
```bash
NB_LINES=$(wc -l < docs/agent-memory/notebooks/unified-agent.md | tr -d ' ')
[ "$NB_LINES" -gt 200 ] && echo "[chef LOG] BUG: compose logic failed — fix Step 8b and re-write once"
```

**8e. Commit** (mutex-guarded) → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md, docs/signals/processed/*]
git add docs/agent-memory/notebooks/unified-agent.md docs/signals/processed/
git commit -m "chore(memory/unified-agent): chef <DISH_TYPE> <YYYY-MM-DD>"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
(skip the notebook-write step in cowork-end-cycle — notebook already written above; keep session-log + doc-self-heal + self-critique steps)

→ After notebook commit: emit CLOSE Telemetry per `docs/agents/unified-agent/flow/chef-telemetry.md § CLOSE Telemetry`
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
