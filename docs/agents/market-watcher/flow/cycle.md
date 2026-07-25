<!-- size-justification: 309L — atomic price-monitoring flow; sigma-threshold logic, channel routing, coverage-rotation floor, and execution-contract guard are step-by-step coupled; exceeds 200L cap (pre-existing debt, split out of scope); history in git log. FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER 2026-07-25: replaced prose read-modify-write (Step 0-sweep + Step 5c) with calls to the deterministic scripts/agents-flow/coverage-stamp.sh, +18L incl. a documented transport-gap caveat (agent holds no Bash — see caveat inline). -->
# Market Watcher — Cycle Flow

**Tools:** `docs/agents/tools/package/market-watcher.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap (market context 24h, agent signals) | watchlist prices

## Output
`price_anomaly` signals on bus | WORK status | chain confirmations

> Channel rule: MARKET = EOD summary (eod.md, 16:00 UTC) ONLY. Cycle status → WORK. Errors → BUG. Never route "N stocks monitored / 0 anomalies" to MARKET.

---

**Execution contract (read first — every invocation, every mode):** Once this flow is entered (`mode=market|prepost|offhours`), Step 0-GW through Step 5b are MANDATORY — the agent MUST make the real `mcp__gateway__call_tool` calls for each step and reach a terminal action. There is no third path between (a) a completed Step 5 notebook cycle entry + Step 5b WORK ping and (b) an explicit Step 0-GW gateway-down EXIT (dual-probe confirmed, no sibling corroboration in the 15-min window).

Self-refusal is a flow violation — 2x confirmed (2026-06-28, 2026-07-12T04:04Z — `FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD`): writing a step-by-step "execution plan" to the notebook that frames Step 0-GW/0/1/2/3/4 as future actions ("Step 0-GW: Gateway probe — verify...", "Next phase requires...") instead of calling them now is equivalent to the English-prose self-abort prohibited by `no_self_abort` (`docs/agents/market-watcher/init.md`). The Step 5 notebook write records what WAS DONE this cycle, in past tense, from real tool outputs — never a forward-looking plan.

---

**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with `market-watcher`. Run BEFORE bootstrap. On gateway dead: write signal file + BLOCKED notebook + EXIT. See skill for full protocol and explicit prohibitions.

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `market-watcher`)

**0a. Rapid market cap screen** → skill: `.claude/skills/rapid-market-cap-screen/SKILL.md`
For each ticker in watchlist, run the rapid screen BEFORE price analysis. SKIP-MICRO or SKIP-EXPENSIVE tickers are logged and dropped from the subsequent price evaluation loop.

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME, US10Y_SIGNAL, DXY_SIGNAL

Set adaptive thresholds (no tool call):
```
TIGHTENING → sigma_threshold=1.5σ | volume_multiplier=1.5x | downside_bias=true
EASING     → sigma_threshold=2.5σ | volume_multiplier=2.5x | downside_bias=false
NEUTRAL    → sigma_threshold=2.0σ | volume_multiplier=2.0x | downside_bias=false
```

Prepost floor (apply after regime block, no tool call):
```
if mode=prepost:
  sigma_threshold    = max(sigma_threshold, 2.5)   # suppress illiquid-hour noise
  volume_multiplier  = max(volume_multiplier, 2.5x) # suppress illiquid-hour noise
```
Rationale: pre/post-market liquidity is thin; regime thresholds as low as 1.5σ/1.5x would over-fire on unchanged EOD prices. The floor lifts both parameters to the EASING-equivalent level regardless of regime. Off-hours duplicate guard (Step 4, AutoCure 2026-05-14 TNB c47) continues to suppress same-closing-price re-emissions independently.

Offhours floor (apply after regime block, no tool call):
```
if mode=offhours:
  sigma_threshold    = max(sigma_threshold, 2.5)   # prepost-equivalent floor — overnight/weekend prices unchanged
  volume_multiplier  = max(volume_multiplier, 2.5x) # prepost-equivalent floor — overnight/weekend prices unchanged
```
Rationale: off-hours fires (00:00Z, 04:00Z, weekends) scan unchanged EOD prices; same easing-equivalent floor as prepost prevents over-firing on stale data. Step 4 AutoCure c47 duplicate guard remains the primary suppression gate — the threshold floor is a secondary defence so that even sweep-forced tickers require a genuine ≥2.5σ move to emit a new signal.

## Step 0-sweep — load coverage state + build sweep list

```
WATCHLIST = call_tool(server="vn-market", tool="get_watchlist", arguments={})
  (was previously used undefined here — now fetched explicitly, folded into this task's fix)

STALE_TICKERS = scripts/agents-flow/coverage-stamp.sh --agent market-watcher --list-stale
  --watchlist <WATCHLIST.active codes, comma-joined>
  → JSON array, ≤ sweep_config.sweep_batch_size (default 3) entries, oldest/never-covered
    first. Script owns the 48h-staleness filter (sweep_config.max_staleness_hours, default
    48) — do NOT hand-derive this list; that non-determinism is what made the sweep dead
    (FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER). Fail-silent if coverage-state.json is
    missing (same as before: every ticker treated as never-covered).
  ⚠ TRANSPORT GAP (open 2026-07-25 — see task note on the board row): this agent holds no
    Bash (.claude/agents/market-watcher.md:5) and cannot invoke the script directly yet.
    Until a Bash-capable caller wires this in, fall back to the equivalent hand-filter (prior
    behaviour: null OR >48h vs COVERAGE_STATE.tickers[t].last_covered_market_watcher, sorted
    oldest-first, take ≤3) for THIS read-only sub-step — bounded risk (filter, not a
    document rewrite). Do NOT apply this fallback to Step 5c's write below.

For each ticker in STALE_TICKERS:
  → include in Step 1 price analysis even if move < sigma_threshold
  → set coverage_sweep_forced=true; log: "[SWEEP] <TICKER> forced (last_covered: <ts or never>)"
  → do NOT emit price_anomaly signal for sweep-only tickers (no real anomaly detected)
    (sweep-forced entries reach the notebook/log only — NOT the signal bus)
```

**1. Price analysis** (stocks with moves > adaptive sigma_threshold):
`get_price_history(code)` 30d | `get_sector_comparison(code)` stock vs sector? | `get_patterns(stockCode, eventKeyword)` | `get_technical_indicators(code)` RSI/BB/MACD | `get_ticker_intelligence(code)` growth/quality

Per stock: apply sector flags before emitting signal:
- `DXY_SIGNAL=USD STRENGTHENING` + sector in (banking, realty) → `fx_pressure=true`
- `US10Y_SIGNAL=RISK-OFF` + large-cap with high FII exposure → `pe_compression_risk=true`

**1b. Evidence Fragment Recording** (TASK-EVIDENCE-HOP2-AGENTS FR-2.1 — feeds prediction-engine LR pipeline):

`get_technical_indicators` returns a plain-text report ending in a conclusion block (live-verified `technicalIndicatorTools.ts:471-484`): `Kết luận: N/M chỉ báo TĂNG — <phrase>` then `Tổng thể: <TĂNG|GIẢM|TRUNG TÍNH>` (RSI/MACD/MA/BB direction-agreement consensus — no separate structured JSON fields exist). Parse the `Tổng thể` line: `TĂNG`→bullish, `GIẢM`→bearish, `TRUNG TÍNH`→neutral. Magnitude = `N/M` (tangCount/total from the `Kết luận` line for bullish, giamCount/total for bearish), clamped `[0.3, 1.0]`; neutral → `magnitude=0.3`.

Per stock priced this cycle (reuse Step 1's `get_technical_indicators(code)` call — no new fetch):
```
call_tool(server="vn-market", tool="record_evidence_fragment", arguments={
  "stock": "<TICKER>",
  "evidence_type": "price_momentum_5d",
  "direction": "<bullish|bearish|neutral per Tổng thể parse>",
  "magnitude": "<consensus_ratio, clamp 0.3-1.0>",
  "confidence": 0.6,
  "source_agent": "market-watcher",
  "ttl_days": 14
})
```
Then re-run `get_technical_indicators(code, days=120)` (longer lookback than Step 1's default) and repeat with `evidence_type="price_momentum_20d"` (net-new type, no seeded LR rows yet — honest cold-start per architecture brief §0-C3/RISK-4, not a defect).

`price_momentum_5d` is the PRIMARY seeded, near-trust-threshold target (bullish+bearish, `n=1` each, ready to accumulate) — highest-coverage wiring across the full watchlist every cycle. Do not invent other type names; these two are the only seeded/approved `price_momentum_*` strings (architecture brief §0-C3).

**2. Market indicators** (run in parallel with price analysis for enrichment context):
```
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={})
call_tool(server="vn-market", tool="get_breadth_thrust", arguments={})
call_tool(server="vn-market", tool="get_vn_liquidity_state", arguments={})
call_tool(server="vn-market", tool="get_roc_momentum", arguments={})
call_tool(server="vn-market", tool="get_relative_strength", arguments={})
call_tool(server="vn-market", tool="get_52w_proximity", arguments={})
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={})
```
If successful: extract volatility regime (rv_10d_pct/rv_20d_pct/rv_60d_pct, gk_vol_20d_pct), breadth indicators (mclellan_osc, mclellan_summation, zweig_max_consecutive, breadth_z_score), liquidity state (omo.net_outstanding_bn_vnd with blocked_reason for honest-NULL, interbank_1w.rate_1w_pct, policy_rates fields), momentum indicators (roc, z_score, decile), relative strength metrics (rs, percentile, composite_score), 52-week proximity (pct_from_52w_high, pct_from_52w_low), and insider sentiment (net_sentiment_score). Store as MARKET_INDICATORS context. Use to enrich price anomaly interpretation (e.g., if volatility elevated or breadth weakening, adjust sigma threshold interpretation; if momentum weak or 52w positioning extreme, flag additional risk context). If any tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and continue with price analysis only.

**2b. Macro read** → skill: `.claude/skills/macro-health-read/SKILL.md`
Store result as MACRO_HEALTH. Log any `is_estimate=true` tracks. The MACRO_HEALTH output feeds Step 4 signal enrichment.

**T-20 / oil→CPI:** Oil-shock pass-through to VN CPI is near-immediate (same month, all baskets). Drop the "lag" assumption. When oil spikes: immediately flag `cpi_pressure_imminent=true` without waiting for the next CPI print.

**T-21 / CPI peak-detection:** Check MACRO_HEALTH.inflation.cpi_peaked each cycle. If `cpi_peaked=true`, emit a `macro_regime_note` in session log: "CPI rolling over — front-loaded shock absorbed." Do NOT treat any single-month CPI print as establishing a trend.

**T-27 / SJC vs world gold gap:** Narrowing gap (current ~8M VND vs historic ~20M) signals easing domestic stress. Read direction, not level. Widening = stress building.

**T-28 / CNY coupling:** VND stresses materially only when CNY weakens vs USD. If CNY holds or strengthens (e.g. +3.3% YTD), DOWN-WEIGHT VND-depreciation alarms even if DXY is rising. Log: `cny_coupling_active = MACRO_HEALTH.fx.cny_coupling_active`.

**T-32 / leading-data principle:** Read sector movers and high-frequency signals BEFORE the next GSO print arrives. Anticipate the official series; do not wait for it.

**T-43 / China PPI imported-inflation:** PPI leads CPI ~3 months. Before alarming on imported inflation, identify WHICH PPI component moved and WHETHER it hits VN consumer baskets directly (manufacturing inputs → 1–2 month lag; energy → near-immediate).

**T-41 / Fake-FDI detector:** FDI-registration spikes that coincide with reported assembler losses are capital injections covering accumulated trading losses, not growth signals. Corroborate FDI spikes against MACRO_HEALTH.investment.fdi_quality_note and `trade-fx-pressure-decomp` margin_trap_flag before treating FDI as bullish.

**Supply chain + sector**
`get_sector_rotation()` | `get_supply_chain_exposure()` BDI/rates | `get_climate_risk_signals()` typhoon/El Niño | `get_energy_grid_signals()` hydro levels

`get_sector_rotation()` post-processing:
- `CARRY_REGIME=HOT_MONEY_INFLOW`: identify top 3 sectors by FII net buy → flag `hot_money_concentration=true` for those sectors. Include in session log.

**3. Enrich chains**
`get_open_chain_findings(minutes_back=15)` → post price confirmation signals

**4. Signal anomalies**
Move > adaptive sigma_threshold | volume spike > volume_multiplier | VaR breach → post signal:

> **[AutoCure 2026-05-14 TNB c47] Off-hours duplicate guard:** Before posting any `price_anomaly` signal in an off-hours cycle (market CLOSED), check: has the same `stock_code` + same `move_pct` (i.e. unchanged closing price) already generated a signal in this calendar session (since last market open)? If yes → **SKIP signal, log as SUPPRESSED: "off-hours duplicate — same closing price, signal already emitted this session (id=XXXX)"**. Rationale: off-hours crons re-scan unchanged EOD prices every N hours; re-emitting is noise not signal. Only emit a NEW signal if `move_pct` has changed (intraday pre-market move) or if 24h+ have elapsed since the original signal.

**Step 4f — CLAIM-TRUTH GATE (per each anomaly, before dispatch)**

→ skill: `.claude/skills/claim-truth-gate/SKILL.md`

Real-time alert flows must not block indefinitely on narrative contradictions. Invoke the gate on each composed alert narrative (title + detail) before posting to alert-commander.

Invoke (per each anomaly to be signaled):
```
GATE_EXIT = skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed alert text: title + detail>
  agent_id  = "market-watcher"
  cache     = <this cycle's tool-call results, or null>
```

**Exit-code handling (time-sensitivity override per brief §4.6):**
- `0` = PASS → proceed to post_agent_signal dispatch for this anomaly.
- `1` = FAIL — contradiction detected; signal emitted to `po`. Self-correct:
  1. Call the named tool directly.
  2. Rewrite the offending sentence (title/detail) using real returned values.
  3. Re-run this skill.
  4. Second-pass PASS → proceed to post_agent_signal.
  5. **Second-pass FAIL (tool genuinely errors) → write honest gap in detail and PROCEED to post_agent_signal anyway** (time-sensitivity override: real-time flow must alert promptly; do NOT hold).
- `2` = config-error → fail-loud: `send_telegram(channel="bug", message="[market-watcher] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Script fires `narrative_contradiction` on FAIL (first pass only).

```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "market-watcher",
  "to_agent": "alert-commander",
  "signal_type": "price_anomaly",
  "stock_code": "<TICKER>",
  "payload": { "title": "<TICKER> +X.XX% (Yσ)", "detail": "<summary of anomaly>" },
  "finding_data": { ... see schema below ... },
  "ttl_minutes": 120,
  "chain_depth": 0
})
```
`downside_bias=true` (TIGHTENING): negative moves escalate priority one level (MEDIUM→HIGH, LOW→MEDIUM) before routing.
```json
{
  "finding_data": {
    "move_pct": "<price_change_pct>",
    "move_sigma": "<abs(price_change_pct) / (dailyStdDev * 100)>",
    "price_change_pct": "<price_change_pct>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "adjusted_threshold": "1.5σ",
    "fx_pressure": false,
    "pe_compression_risk": false
  }
}
```
Schema: `PriceAnomalyFindingDataSchema` in `apps/mcp-server/src/domain/signals/signalTypes.ts`.
- **Required:** `move_pct` (number), `move_sigma` (number)
- **Optional:** `ref_price` (number), `window_days` (int >= 1), `price_change_pct` (number), `regime` (string), `adjusted_threshold` (string), `fx_pressure` (boolean), `pe_compression_risk` (boolean)
- Extra fields are accepted (passthrough).

Note: `move_sigma = abs(price_change_pct) / (dailyStdDev * 100)` where `dailyStdDev` is the rolling 30-day standard deviation of daily returns (fraction, e.g. 0.015 for 1.5%) already computed in step 1 via `get_price_history`. Both `move_pct` and `price_change_pct` carry the same signed percentage value; `move_pct` is the canonical field consumed by downstream agents (financial-analyst, alert-commander), and `price_change_pct` is kept for legacy compatibility.

**5. Notebook write** — **OVERWRITE class** (≤80L hard cap). Full-file replace each cycle; no section accumulation.
<!-- Fixes ITEM-05 (1967b/1968b2): APPEND→OVERWRITE. L-7 (1968b2): commit deferred to eod.md. -->

> Invariant: timestamp = current UTC (`date -u`). NEVER speculate or round to future minute.
> If unsure: call `get_cycle_bootstrap` to refresh time anchor.

Overwrite `docs/agent-memory/notebooks/market-watcher.md` with (≤80L total):
```
# Market Watcher — Notebook
**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** <current_sprint>

## Carry-over
[recover any carry-over items from previous notebook before overwriting]

## Cycle (HH:MM–HH:MM)
- Stocks: N | Anomalies: M (>Xσ) | Volume spikes: K | Chain confirms: L
- Regime: REGIME | DXY: DXY_SIGNAL | US10Y: US10Y_SIGNAL | fx_pressure: [tickers] | pe_risk: [tickers]

## Metrics (cycle YYYY-MM-DD HH:MM UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | N |
| signals_emitted | N |
| signals_suppressed | 0 |
| sweep_tickers_forced | N |
| coverage_state_updated | yes\|no |
| exit_status | complete\|blocked\|empty |
```

**5c. Coverage-state update** (deterministic scripted write, after notebook overwrite):
```
TICKERS_COVERED = tickers priced this cycle (both anomaly-driven AND sweep-forced) — the SAME
  set, nothing added or dropped.

scripts/agents-flow/coverage-stamp.sh --agent market-watcher --tickers <TICKERS_COVERED, comma-joined>
  → surgical jq patch: sets ONLY .tickers[T].last_covered_market_watcher = now for T in
    TICKERS_COVERED; every other key/ticker/field — including news-scout's own field on the
    SAME ticker — is preserved byte-for-byte. Wrapped in a task_claim("coverage-state:main")
    mutex, serializing against news-scout's own write (co-ships
    FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE). Also repairs the top-level sweep_config key
    if it is missing.
  FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER: this REPLACES "for each ticker priced, set
  X=now" prose executed by hand — that prose, re-run against a 57-entry blob every cycle,
  blanket-stamped ALL tickers (measured live), making the 48h staleness trigger permanently
  unsatisfiable. Do NOT regenerate/overwrite the whole file as a substitute for this step.

  ⚠ TRANSPORT GAP (open 2026-07-25): this agent holds no Bash (.claude/agents/market-watcher.md:5)
  and cannot invoke the script directly today — closing this needs either a Bash grant
  (governance decision) or an MCP-tool wrapper (dev-mcp-server zone); neither is decided yet.
  Until resolved: if this step cannot execute, SKIP the coverage-state write entirely this
  cycle and log `[coverage-write-skipped: no-transport]` on the WORK ping — do NOT fall back
  to a full-file rewrite, that reintroduces the exact bug this task fixed.
```

**Post-write wc guard** (OVERWRITE class — fail-loud):
```bash
NB_LINES=$(wc -l < docs/agent-memory/notebooks/market-watcher.md | tr -d ' ')
if [ "$NB_LINES" -gt 80 ]; then
  echo "[market-watcher] FAIL: notebook ${NB_LINES}L > 80L cap — trim template before commit"
  exit 1
fi
```

> Notebook written to disk every cycle. Git commit deferred to eod.md (market close batch). Off-hours cycles retain per-cycle commit.
> If EOD flow fails before commit → recovery: `docs/protocols/head-lock-self-cure.md`.

**Step 4e — Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`

```
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0 via cycle-bootstrap skill>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/market-watcher.md
  FETCH_RESULT_COUNT = count of tickers priced in Step 1 (items_fetched)
  FETCH_MACRO_TS     = MACRO_HEALTH.fetchedAt (from macro-health-read skill Step 2)
  AGENT_ID           = "market-watcher"
```

On PASS → continue to WORK ping + log_agent_work below.
On FAIL → skill exits; do not continue to Step 5b.

---

**5b. WORK** — ULTRA tier per `.claude/skills/caveman/SKILL.md` (cycle-status ping = inter-agent state change):
```
[mw] HH:MM — N stocks | anom:X vol:Y chain:Z | next:TIME
```

> Tier: ULTRA. ≤80 chars target. Drop articles, labels. Abbreviate: anom=anomalies, vol=volume spikes, chain=chain confirms.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

**Skills available to this agent (lazy-load — load only when the task requires it):**
- Excel/XLSX data export → skill: `.claude/skills/xlsx/SKILL.md` (trigger: task requires producing a price/anomaly data spreadsheet for offline review)
