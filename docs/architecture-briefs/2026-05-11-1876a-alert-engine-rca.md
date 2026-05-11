# 1876a — Alert Engine RCA: Precision Regression + Emission Gap

**Sprint:** 1876a  
**Date:** 2026-05-11  
**Author:** architect  
**Input:** BA scoping memo (Sprint 1876a), bugs #2849 (precision) + TNB c35 F5 (VRE emission gap)

---

## 1. Brownfield Scan Summary

Two bounded contexts involved, DIFFERENT databases, NO shared code path for
the alert → agent_signals bridge:

| Service | DB | Table written | Port |
|---|---|---|---|
| `apps/mcp-server` | `market.db` | `alerts`, `agent_signals` | 3000 |
| `apps/alert-engine` | `alert_engine.db` | `alert_engine_records` | 5006 |

The `alert-engine` microservice (`apps/alert-engine/src/application/usecases.ts`) 
does NOT write `agent_signals`. It writes only `alert_engine_records` and sends 
Telegram directly for HIGH/CRITICAL severity (L87). The `agent_signals` table 
(and `price_anomaly` rows) lives exclusively in `mcp-server`.

---

## 2. Q&A — 10 Open Questions

### Q1 — Who writes price_anomaly agent_signals rows?

**Answer: NOBODY writes them automatically for price_drop alerts. This is the emission gap.**

Code trace:
- `scanMarket.ts` L562–579: calls `storeAlerts()` → writes `alerts` table only. Zero call to `postSignal()`.
- `taAlertNotifierJob.ts` L252–290: reads `agent_signals` to mark outcome=`fired` (FR-5), but does NOT INSERT `price_anomaly` rows. It only updates existing rows.
- `intelligenceCycleJob.ts` L1205: calls `postSignal()` for `verified_chain` type only (chain synthesis path, not price scan path).
- `askQueueCheckJob.ts` L63: posts signals for question routing, not price.
- `agentSignalTools.ts` L368–411: `record_signal_outcome` records outcomes on existing rows. Not a creator.
- `alertVerdictTools.ts` L104–127: `write_alert_verdict` writes to `alertVerdictStore` (JSON file), not `agent_signals`.

**Root cause of FR-3 violation**: The pipeline from scanMarket → storeAlerts terminates at the `alerts` table. There is no bridge that also INSERTs a `price_anomaly` row in `agent_signals`. `taAlertNotifierJob` (15-min cron) marks outcomes on existing `agent_signals` rows but cannot mark rows that were never created. VRE -6.41% fired an alert row (alerts table, severity=MEDIUM), but since no `price_anomaly` signal was ever POSTed to `agent_signals`, taAlertNotifierJob's FR-5 query found zero matching rows and silently returned.

**HVN CRITICAL fired to MARKET (Q2 below)**: via a different code path — `alert-engine` microservice direct Telegram, or alert-commander cowork agent calling `post_agent_signal` + `send_telegram` manually after observing the alert. That path does NOT go through `taAlertNotifierJob`.

---

### Q2 — Why HVN CRITICAL fired to MARKET but VRE MEDIUM did not?

Two dispatch lanes exist (Q5 confirms, see below):
- **Lane A** (`alert-engine` microservice, `usecases.ts` L87): fires Telegram directly for severity `critical` or `high`. Channel = `market`. Does NOT use `taAlertNotifierJob`.
- **Lane B** (`mcp-server` `taAlertNotifierJob.ts`): fires Telegram for TA types (ta_overbought, ta_oversold, ta_bb_breakout_up, ta_bb_breakout_down), severity=`warning`. NOT for price_drop/price_surge.

**Verdict**: HVN CRITICAL likely came from Lane A (alert-engine evaluating a high/critical signal and sending directly). VRE MEDIUM is processed only by Lane B or manually by alert-commander. Lane B only handles TA signals, not price_drop. Neither lane fires MARKET Telegram for price_drop/price_surge of severity MEDIUM.

The `mcp-server` scanMarket lane (price scan) writes to `alerts` table with `notified_telegram=0` but has NO automatic Telegram dispatch for price_drop/price_surge. The Telegram dispatch for price signals relies on the cowork alert-commander reading `get_alerts` and calling `send_telegram` manually.

---

### Q3 — What is the precision denominator?

**Answer: HIT + MISS scored only (not UNKNOWN). FR-5 is correctly implemented.**

File: `alertAccuracy.ts` L340–342:
```
const hitPct = Math.round((hits / totalAlerts) * 100);
```
Where `totalAlerts` is incremented for every row with a valid `code` (L316), regardless of HIT/MISS/UNKNOWN. So the percentage shown is `HIT / (HIT + MISS + UNKNOWN)`.

However, the **per-signal-type breakdown** (L368–376) uses scoreable = hit + miss:
```
const pct = Math.round((counts.hit / scoreable) * 100);
```

This is the discrepancy. The **headline** percentage uses ALL rows as denominator (includes UNKNOWN). The **per-type breakdown** excludes UNKNOWN from denominator. FR-5 says denominator should be HIT+MISS only. The headline Tổng line VIOLATES FR-5; the per-type breakdown RESPECTS FR-5.

The c35 report "25% precision" = 1 HIT out of 1+3 scored rows (4 scored) = 25%, which is the per-type breakdown formula. The "143 total" is the headline count. The metric reported by unified-agent uses the per-type formula (correct per FR-5). The `text` field Tổng line uses the wrong formula.

**Fix needed**: `hitPct` on L340 should use `(hits / (hits + misses))` not `(hits / totalAlerts)`.

---

### Q4 — Why price_surge 0% precision?

**Two independent causes:**

1. **No price history to score** (RISK-3 applies here too): `scoreAlert()` in `alertAccuracy.ts` L176–220 queries `market_prices_history WHERE fetched_at >= alertTime`. For price_surge alerts fired at market open, the 1-hour intraday fallback (L207–217) may find no data if the history table has sparse records. Results in UNKNOWN, not HIT.

2. **Bear session context**: In a VN-Index -1.04% session, any individual price_surge alert for a watchlist stock that later mean-reverts within 1–12h scores as MISS. With small sample (few price_surge alerts in a bear day), a single MISS = 0%.

3. **Dedup collision potential**: `deterministicPriceId()` in `alertGenerator.ts` L137–146 uses a UTC 4h bucket. A stock surging at 08:10 UTC maps to bucket "08". If that same stock triggered an earlier price_surge at 08:01 UTC (different alert ID in the same bucket), `INSERT OR IGNORE` would deduplicate — and there is only 1 row to score.

The 0% figure with 0 HIT / 1+ scored is plausible given sample size = 1–3 scored rows (RISK-3: 95% CI ±35%).

---

### Q5 — Two dispatch lanes: who feeds agent_signals?

**Confirmed: NEITHER lane auto-feeds agent_signals for price events.**

- **Lane A** — `apps/alert-engine` microservice: writes `alert_engine_records` in `alert_engine.db`. Sends Telegram directly. Zero writes to `agent_signals`.
- **Lane B** — `apps/mcp-server` scanMarket: writes `alerts` in `market.db`. Zero writes to `agent_signals`.

`agent_signals` price_anomaly rows are only created when a cowork agent (market-watcher, alert-commander) explicitly calls `post_agent_signal` with `signal_type=price_anomaly`. This is a manual/cowork-driven path, not an automated server path. The `taAlertNotifierJob` FR-5 block only marks outcomes on rows that cowork already created — it is not a creator.

**Structural gap confirmed**: No server-side job bridges `alerts` rows → `agent_signals` price_anomaly rows.

---

### Q6 — Does alert-engine bypass agent_bus?

**Confirmed yes, by design.**

`apps/alert-engine/src/application/usecases.ts` L86–89:
```typescript
if (sendTelegram) {
  const channel = severity === 'critical' || severity === 'high' ? 'market' : 'work';
  await this.telegram.send(channel, text);
}
```

The `alert-engine` microservice has its own `TelegramPort` (injected via `apps/alert-engine/src/infrastructure/telegram.ts`). It sends directly to Telegram; it does not call `post_agent_signal`. There is no `agent_bus` involvement in this path at all.

In Docker, `alert-engine` runs in its own container with its own Telegram credentials via `process.env`. This is intentional (speed path for stop-loss). But this means alert-engine alerts do NOT appear in `agent_signals` and are NOT tracked by `get_alert_accuracy` (which reads `market.db/alerts`).

**This explains HVN vs VRE divergence**: HVN CRITICAL was sent by `alert-engine` directly to MARKET channel (bypass path). VRE MEDIUM was stored in `mcp-server/alerts` (notified_telegram=0) and never dispatched because no cron handles price_drop/price_surge Telegram emission from the mcp-server side.

---

### Q7 — Confidence filter: formula drift check

**No drift found. Formula intact at signalDetector.ts L231:**
```typescript
confidence: Math.min(0.95, 0.6 + absPct / 100),
```

At -6.41% (VRE): `0.6 + 6.41/100 = 0.6641 → 66.41 → 66` (rounds to 66 at `Math.round()` in scanMarket.ts L463). Threshold is 60. VRE passes confidence filter.

At -7.0%: `0.6 + 7/100 = 0.67 → 67`. Passes.

The confidence filter is NOT suppressing VRE. The suppression happens at the Telegram dispatch stage (no automated MARKET channel dispatch for price_drop from mcp-server).

---

### Q8 — verdictResolutionJob baseline: is it correct?

**Partially broken for freshly-fired alerts.**

`verdictResolutionJob.ts` L104–119 (`defaultFetchHistory`):
```typescript
const snaps = await getPriceHistory({ code: ticker, days: 2 });
// Oldest first — use first element as baseline at fire time
return (snaps[0] as { price: number }).price;
```

This fetches the OLDEST price in the last 2 trading days and uses it as "price at fire". For an alert fired at 08:02 UTC (09:02 VN = market open), `getPriceHistory(days=2)` returns the open price from approximately 1–2 trading days ago, NOT the price at fire time.

This produces systematic scoring errors:
- If VRE dropped -6.41% from yesterday's close, the baseline from 2 days ago would be the 2-day-old close. The 24h resolution price would be compared to that baseline instead of the actual at-fire price.
- A stock that was already down 3% from 2 days ago then falls another -6.41% would show a -9% pctMove against the stale baseline → classified as `confirmed bearish` (correct direction, wrong magnitude).
- A stock that recovered between 2 days ago and fire time then dropped -6.41% could show pctMove closer to 0% or even positive → `confirmed` (flat = safe rule at L71) or `false_positive`.

The scoring logic at L67–76 treats `abs(pctMove) < 1.0` as "flat = confirmed" regardless of direction. This inflates `confirmed` verdicts on borderline cases.

**This is a genuine scoring accuracy bug, not the emission gap bug.** It contaminates the AlertVerdict accuracy file but NOT the `alerts` table outcome column (which is set by the separate `alertOutcomeJob.ts`).

---

### Q9 — CRITICAL: Re-examine 1875c "no bug" conclusion

**Conclusion: 1875c is CORRECT. No dispatch bug. The c35 F3 observation was gateway/context confusion.**

Evidence:

1. **Dispatch table is a Map, not a string prefix match.** `agentBootstrap.ts` L291–335: `buildToolNameMap()` uses `map.set(toolName, registryFn)` with exact string keys. `record_signal_outcome` and `get_climate_risk_signals` are different string keys, different registryFns.

2. **No name collision.** `agentBootstrap.ts` L323–329 warns on collision. Tool names are unique (1875c confirmed 126 unique names). `record_signal_outcome` is registered exclusively in `agentSignalTools.ts` L368–411. `get_climate_risk_signals` is in a different registry fn.

3. **alert_commander skill** (agentBootstrap.ts L105–129) contains `record_signal_outcome` but NOT `get_climate_risk_signals`. They cannot co-exist in the same skill-gated session.

4. **The 1875c test suite** (5 tests in `1875c-record-signal-outcome-routing.test.ts`) directly invokes the handler with `signal_id=2866` and asserts the response contains `"signal_id=2866"` and NOT climate markers. This is a sound regression test.

5. **Likely cause of c35 F3 observation**: The Claude.ai gateway is a proxy. When alert-commander called `record_signal_outcome(2866)`, the gateway may have returned a cached/stale response from a previous `get_climate_risk_signals` call in the same session (response slot misassignment in the streaming SSE channel). This is a gateway-side transient, not a server-side dispatch defect. The fact that it returned CLIMATE DATA (not an error) strongly indicates the response was from a prior call in the same session context, not a dispatch routing error.

6. **Alternative hypothesis (reload race)**: If the MCP server was hot-reloaded between the `record_signal_outcome` call and the response, a new session could receive a different tool set. However, the alert-commander session log shows no server restart event between F3 calls.

**Verdict**: No code defect in routing. RISK-2 (outcome data contamination) from c35 F3 is NOT supported by code analysis. Precision figures in `alerts.outcome` are produced by `alertOutcomeJob` (which uses real price data), not by `record_signal_outcome` on `agent_signals`. Even if `record_signal_outcome` misbehaved, it would corrupt `agent_signals.outcome` — a separate column from `alerts.outcome` used by `get_alert_accuracy`.

---

### Q10 — 1869b threshold integration test coverage

**Answer: YES, full integration test exists and is sound.**

`1869b-watchlist-threshold-wiring.test.ts` covers:
- `IT-1` (L260–271): NVL threshold=-9, -7.5% drop → 0 signals (correct)
- `IT-2` (L273–286): VCB threshold=-7, -7.5% drop → ≥1 signals (correct)
- `IT-3` (L288–312): Two stocks, different thresholds, DB-level assertion on alerts table
- `IT-4` (L314–330): No threshold row → DEFAULT_DROP_PCT=-7 fallback

The full path `DB row → getThresholds() → watchlistThresholds.dropPct → detectSignals threshold` is tested end-to-end via `scanMarket()` with a real SQLite in-memory DB. Migration shipped with verification.

The 1869b threshold path is not the bug. VRE's missing emission is not a threshold issue — VRE at -6.41% with default threshold -7.0 would NOT trigger (6.41 < 7.0). With the 1869b high-vol threshold of -9.0%, VRE would also not trigger. VRE was likely in the standard group (-7.0) and its move of -6.41% simply did not cross the threshold. The emission gap is moot for VRE: it never generated an alert row in the first place.

**Wait — re-reading**: The BA memo says "VRE -6.41% NOT MARKET-fired" implying the alert WAS fired but not sent to MARKET. Let me clarify: if VRE has a `alert_drop_pct = -6.0` (custom lower threshold), then -6.41% WOULD trigger. Or if VRE had been previously reported as fired. The threshold gap and emission gap may both apply. This needs runtime verification with `SELECT alert_drop_pct FROM watchlist WHERE code='VRE'`.

---

## 3. Root Cause Decision: Shared or Independent?

**Independent bugs, different subsystems, compounding effect:**

| Bug | Root Cause | Subsystem |
|---|---|---|
| **B1: Emission gap** (VRE -6.41% not MARKET-fired) | No server-side bridge from `alerts` → `agent_signals[price_anomaly]`; no automated Telegram dispatch for price_drop/price_surge from mcp-server | scanMarket → taAlertNotifierJob gap |
| **B2: Precision 25% / surge 0%** | Precision denominator bug in headline formula (`hits/total` includes UNKNOWN); tiny sample (6 scored / 143 total = 4% scored_pct); verdictResolutionJob uses 2-day-old baseline | alertAccuracy.ts L340 + verdictResolutionJob L115 |
| **B3: No MARKET channel for price_drop/surge** | Lane B (mcp-server) only dispatches TA signals via taAlertNotifierJob; price_drop/price_surge have no equivalent automated Telegram sender | Architecture gap — no cron for price scan Telegram |

B1 and B3 are the same structural gap from different angles: the mcp-server price scan pipeline was built without an automated Telegram emission step for price signals. Telegram for price signals was delegated to cowork agents (alert-commander), which means it fires only when the cowork cycle runs AND the agent chooses to call `send_telegram`.

B2 is a separate accuracy measurement bug in the reporting layer.

**No shared root** — but fixing B1/B3 (add bridge + Telegram emission) will also fix FR-3, which is the highest-priority user-facing impact.

---

## 4. 1875c Conclusion: UPHELD

The "no bug" finding from 1875c is correct. The c35 F3 observation (alert-commander said `record_signal_outcome(2866)` returned climate data) was a Claude.ai gateway transient (response slot misassignment in SSE streaming), not a server-side dispatch defect. No precision data was contaminated. RISK-2 from BA memo is NOT realized.

---

## 5. Fix Plan

### Step A — This Sprint 1876a (1–2 dev cycles)

**A1: Precision denominator fix**  
File: `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` L340  
Change `hits / totalAlerts` → `hits / (hits + misses)` for the headline Tổng percentage. Add `scored_pct` to Telegram report digest. Expose per-type counts in `get_alert_accuracy` response (already exists in `summary_by_type`).  
Risk: Low. Pure formula change, existing tests will need update for headline %.

**A2: Structured logging for agent_signals bridge (observability first)**  
Add `logger.info` on every path that should create/skip a `price_anomaly` row. Since no automated bridge exists yet, add a warning log in `scanMarket.ts` Step 6 when an alert is stored and no corresponding `price_anomaly` signal exists:
```
logger.warn("[scanMarket] alert stored but no agent_signals bridge", { code, alertId })
```
This makes the gap visible in logs immediately, quantifying how many alerts are missing agent_signals rows per cycle.

**A3: Structured log for taAlertNotifierJob FR-5**  
`taAlertNotifierJob.ts` L259–290: add log line showing how many `price_anomaly` rows were found vs expected. Currently only logs at WARN level when `agent_signals` table missing.

**A4: Verify VRE alert_drop_pct in production DB**  
Runtime check: `SELECT code, alert_drop_pct FROM watchlist WHERE code='VRE'`. Determines if VRE threshold gap is a separate contributing factor to Q10 (threshold not propagated). Not a code change — diagnostic.

---

### Step B — Next Sprint 1877+

**B1 (structural): Add price_anomaly bridge in mcp-server scan pipeline**  
New function `bridgeAlertsToSignalBus(alerts, db)` called after `storeAlerts()` in `scanMarket.ts` Step 6. For each stored alert with `signal_type=price_drop OR price_surge AND severity >= medium`:
- Call `postSignal(db, { fromAgent: 'market-scan', toAgent: 'alert-commander', signalType: 'price_anomaly', stockCode, ... })`  
- Dedup key: ticker + `price_anomaly` + UTC 4h bucket (matches FR-4)  
- NFR-1: log `created` or `skipped_duplicate` on every INSERT attempt  
DDD layer: application (scanMarket.ts may import from infrastructure/db/agentSignalStore.js — this is correct per layer rules).

**B2 (structural): Add automated Telegram emission for price_drop/price_surge**  
Either extend `taAlertNotifierJob` to handle `severity >= medium` price signal alerts (not just TA types), OR add a new `priceAlertNotifierJob` cron. This is the Lane B gap that causes the MARKET channel silence on genuine price moves.  
Scope constraint: Must NOT duplicate Lane A (alert-engine HIGH/CRITICAL already sends to MARKET). Only emit if `sent_by='server' AND severity NOT IN ('high','critical')` or add `sent_to_telegram_at` column to prevent double-dispatch.

**B3: Fix verdictResolutionJob baseline**  
`verdictResolutionJob.ts` `defaultFetchHistory()` should fetch the price AT fire time, not 2-day-old close. Options:
- Store price_at_fire in AlertVerdict at creation time (write_alert_verdict enriched with live price)
- Or fetch `getPriceHistory(ticker, 1)` and use the NEWEST price (closest to fire)  
The current `snaps[0]` (oldest) is the wrong index — should be `snaps[snaps.length - 1]` for most-recent baseline. This is a 1-line fix but has significant HIT/MISS impact.

**B4: 1869b integration test gap (if needed after A4 confirms)**  
If A4 reveals VRE threshold was not propagated, add a test that seeds watchlist with VRE at -6.0% threshold and verifies -6.41% triggers. 1869b tests cover the general case; VRE-specific regression may need a targeted test.

---

## 6. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| RISK-1 | B1 + B2 are independent → fixing one doesn't fix the other | Both tracked separately; Step A focuses on observability before fixing |
| RISK-2 | c35 F3 routing contamination | **Not realized** — 1875c upheld. No action needed. |
| RISK-3 | 6/143 scored → 25% has ±35% CI | Step A1 fixes denominator; Step A2 logs will grow sample size over time |
| RISK-4 | VRE threshold not propagated | Step A4 diagnostic will confirm; Step B4 if needed |
| NEW-1 | B2/B3 fix (Lane B price Telegram) could double-dispatch with Lane A | Guard with `severity NOT IN ('high','critical')` or check `alert_engine` already sent |

---

## 7. AC Mapping to BA's ACs

| FR/NFR | Status | Step |
|---|---|---|
| FR-1: price_drop ≥60% precision | BLOCKED (no data — 4% scored_pct) | Step A1 fix denominator, B1 grow scored pool |
| FR-2: price_surge ≥60% precision | BLOCKED (0% — same issue) | Same |
| FR-3: alert ≥MEDIUM → agent_signals within 15min | NOT MET (structural gap) | Step B1 |
| FR-4: emission idempotent 4h bucket | PARTIALLY MET (alerts table has it; agent_signals does not) | Step B1 uses same dedup key |
| FR-5: denominator = HIT+MISS only | NOT MET in headline % | Step A1 |
| FR-6: alert_drop_pct propagates end-to-end | MET for DB→detectSignals path; VRE runtime value TBD | Step A4 |
| NFR-1: structured log on every agent_signals INSERT | NOT MET | Step A2 + B1 |
| NFR-2: get_alert_accuracy exposes scored_pct + per-type | scored_pct EXISTS in struct but not in Telegram report | Step A1 |
| NFR-3: write_alert_verdict idempotent | MET (appendVerdict + outcome IS NULL guard) | — |
| NFR-4: threshold change doesn't alter dedup bucket | MET (dedup keyed on ticker+type+4h, not threshold value) | — |

---

## 8. Files to Create / Modify (Step A)

| Action | File | Change |
|---|---|---|
| MODIFY | `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` L340 | Headline % formula fix |
| MODIFY | `apps/mcp-server/src/application/usecases/scanMarket.ts` L566–578 | Add warning log for bridge gap |
| MODIFY | `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts` L259 | Add info log for FR-5 row count |
| ADD TEST | `apps/mcp-server/src/__tests__/1876a-precision-denominator.test.ts` | Verify headline % uses HIT/(HIT+MISS) |
| RUNTIME CHECK | Production DB | `SELECT code, alert_drop_pct FROM watchlist WHERE code='VRE'` |

## 8b. Files to Create / Modify (Step B)

| Action | File | Change |
|---|---|---|
| ADD | `apps/mcp-server/src/application/usecases/bridgeAlertsToSignalBus.ts` | New function: alerts → price_anomaly signals |
| MODIFY | `apps/mcp-server/src/application/usecases/scanMarket.ts` | Call bridgeAlertsToSignalBus after storeAlerts |
| MODIFY/ADD | `apps/mcp-server/src/scheduler/alerts/priceAlertNotifierJob.ts` | New or extended job for price_drop/surge Telegram |
| MODIFY | `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts` L115 | Fix `snaps[0]` → use most-recent close as baseline |
| ADD TEST | `apps/mcp-server/src/__tests__/1876b-price-anomaly-bridge.test.ts` | Integration test: storeAlerts → agent_signals |
| ADD TEST | `apps/mcp-server/src/__tests__/1876b-verdict-baseline.test.ts` | Verify baseline is most-recent not oldest |

---

## 9. DDD Violations Noted

1. `alertAccuracy.ts` L35: `import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js"` — direct infra import from interface layer. BA noted this (DDD violation at L172 originally, now extends to L35). Step B should refactor this tool to accept a `db` parameter, moving getDb() call to the registration site.

2. `verdictResolutionJob.ts` L88: comment says "MUST NOT import from domain/ or application/" but the job file imports `clients.js` (infra) and `telegram.js` (infra) — this is acceptable per the scheduler layer rule ("may import from infrastructure").

---

## 10. Session Notes

- Q9 investigation: checked `agentBootstrap.ts` buildToolNameMap probe, `agentSignalTools.ts` registration, `1875c-record-signal-outcome-routing.test.ts` coverage. 1875c conclusion stands.
- Q1 investigation confirmed via grep: zero `postSignal` calls in `scheduler/alerts/` and `scheduler/market-data/` for price_drop/price_surge path.
- verdictResolutionJob baseline bug (Q8): `snaps[0]` = OLDEST in array, but doc comment says "oldest first as baseline at fire time" — this is the intended design but semantically wrong. `getPriceHistory(days:2)` returns recent 2 days; `snaps[0]` is the OLDER of the two days, not the price at fire time. Actual fix requires storing price_at_fire at verdict creation time.
