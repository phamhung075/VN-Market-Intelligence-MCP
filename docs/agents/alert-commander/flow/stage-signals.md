> Parent: [./cycle.md](./cycle.md)

# Alert Commander — Stage 3: Signal Matrix + Routing

**3. Signal Matrix**

> Note: `chain_catalyst` signals are NOT evaluated at this table — they are routed unconditionally to Step 3c. Step 3c applies the threshold. Do not suppress chain_catalyst here.

Base thresholds (NEUTRAL): `verified_chain` conviction ≥ 0.80 | `urgent_news` conviction ≥ 0.60 | `chain_catalyst` conviction ≥ 0.75
Regime-conditioned adjustments:
- `TIGHTENING`: verified_chain ≥ 0.85 | bullish urgent_news ≥ 0.75 | chain_catalyst ≥ 0.85
- `EASING`: verified_chain ≥ 0.75 | urgent_news ≥ 0.55 | chain_catalyst ≥ 0.70
- `NEUTRAL`: base thresholds (0.80 / 0.60 / 0.75)

| Signal | Condition | Action |
|--------|-----------|--------|
| `verified_chain` | conviction ≥ regime threshold | CRITICAL |
| `urgent_news` | conviction ≥ regime threshold | MARKET |
| `chain_catalyst` | — | → route to Step 3c (do NOT evaluate threshold here) |
| `price_anomaly` | confirmed via `get_alerts` | CRITICAL |
| `legal_risk` | any | CRITICAL now |
| `crisis_velocity` | any | CRITICAL now |

> **Clarification (alert-commander, discovered live 2026-07-12):** `urgent_news`'s "MARKET" action above is NOT a CRITICAL-always bypass — per `docs/policies/alert-policy.md` § Alert Commander Event Scope, only `verified_chain`/`legal_risk`/`crisis_velocity` fire unconditionally. A conviction-qualifying `urgent_news` signal still passes through the cycle.md Firing Gate (position-danger 3-cond / watchlist-opportunity 4-cond) — it does not fire MARKET on its own unless it also satisfies one of those two event conditions. Recurring `freshness-sla-monitor` synthetic `urgent_news` signals (infra SLA-breach noise, not real market news) are suppressed under this rule every cycle, correctly.

**3b. Price-validation override** (runs only when signal.confidence < regime_threshold)

For each signal where conviction < regime_threshold:
  <!-- L-9 (1968c-P03): signal_type="price_anomaly" filter applied server-side — reduces payload ~50%.
       Only price_anomaly signals returned; no client-side type filtering needed. -->
  1. Call `get_agent_signals` with `signal_type="price_anomaly"` AND `status="all"` to get price validation signals for `stock_code=signal.stockCode` (filter by stockCode client-side from the filtered result):
```
call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "alert-commander",
  "status": "all",
  "signal_type": "price_anomaly",
  "hours_back": 2
})
```
  2. From returned signals, keep only those where `stock_code == signal.stockCode`. Parse `finding_data.move_sigma` from each hit.
  3. If any hit has `move_sigma >= 4.0` AND `payload.impact_score >= 6`:
     → set `effective_confidence = 0.75`, add annotation `"price-validated override"`
     → escalate as if threshold met
  4. Log: `"[Override] [TICKER] confidence boosted {original}→0.75 (price_anomaly move_sigma={N}, impact={M})"`
  5. Call `record_signal_outcome(original_signal_id, "confirmed", "price-validation override")`

> WARNING: chain_catalyst signals MUST reach Step 3c. If a chain_catalyst signal appears in the bootstrap, do NOT suppress it at the Step 3 matrix table — pass it directly to Step 3c regardless of confidence score. Step 3c applies the threshold.

**3c. chain_catalyst processing**
For each `chain_catalyst` signal from signal bus:
  1. Read `finding_data.confidence`, `finding_data.direction`, `finding_data.event_type`, `finding_data.affected_stocks`
  2. Apply regime threshold (see Step 3 matrix): confidence ≥ threshold → proceed
  3. Direction routing:
     - `bearish` → CRITICAL alert (position-danger)
     - `bullish` + earnings event_type → MARKET alert (watchlist-opportunity)
     - `bullish` + macro/trade_war event_type → MARKET alert with regime caveat
     - `neutral` → WORK channel only, do not fire MARKET
  <!-- L-9 (1968c-P03): signal_type="chain_catalyst" filter applied server-side — returns only
       chain_catalyst signals for conflict detection. Reduces payload vs. full result set. -->
  4. Conflict check: call `get_agent_signals` with `signal_type="chain_catalyst"` for conflict detection — if two signals for same ticker have conflicting `direction` → append conflict warning from `payload.detail` (earningsConflictDetector sets this):
```
call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "alert-commander",
  "status": "all",
  "signal_type": "chain_catalyst",
  "hours_back": 2
})
```
  5. Log: `"[ChainCatalyst] [TICKER] event={event_type} dir={direction} conf={confidence:.2f} → {CRITICAL|MARKET|suppressed}"`
  6. Call `record_signal_outcome(signal_id, "fired"|"suppressed", reason)`

> **Clarification (alert-commander, discovered live 2026-07-13):** `get_agent_signals(signal_type="chain_catalyst")` returns a human-formatted Vietnamese text summary, not raw JSON — `finding_data.confidence` is not a literal field in that response. In practice the embedded `Chi tiết` text carries a `regime_adj_score=N` (0–10 scale, e.g. `regime_adj_score=6` → confidence≈0.6), separate from the "Mức độ ảnh hưởng: N/10" (impact_score) line. Treat `regime_adj_score/10` as the confidence value to compare against the Step 3 regime threshold table when no other numeric confidence is present. `affected_stocks` may also be absent from the text summary (macro/regional events with no specific ticker) — in that case the signal cannot satisfy position-danger's per-ticker gate even if direction=bearish and confidence clears threshold; route to WORK/suppress instead of CRITICAL.

> **Field-precision note (alert-commander, discovered live 2026-07-21):** the 2026-07-13 clarification above is scoped to the `get_agent_signals(signal_type="chain_catalyst")` text-summary response path. A DIFFERENT shape can arrive via `get_cycle_bootstrap`'s `agent_signals[]` array: a raw JSON signal object carrying BOTH a top-level `confidence_score` field AND an embedded `regime_adj_score=N` inside `payload.detail` text — these two numbers can diverge (e.g. `confidence_score=75` vs `regime_adj_score=5.5` on the same signal). Prefer `regime_adj_score/10` as the Step 3c confidence for chain_catalyst evaluation even when a top-level `confidence_score` is also present: the top-level field is populated generically across unrelated signal types (including `freshness-sla-monitor` infra-noise `urgent_news` with `confidence_score` 70-90 that carries no real market conviction), while `regime_adj_score` is the value this table's regime-threshold comparison was actually designed against.

> **Extension (alert-commander, discovered live 2026-07-17):** the same no-ticker gate applies symmetrically on the bullish side. A `bullish` + macro/trade_war chain_catalyst signal with no `affected_stocks` ticker cannot satisfy watchlist-opportunity's per-ticker gate either (kinhDichConfidence/kinhDichSignal are inherently per-stock) — even if confidence clears the regime threshold, route to WORK/suppress instead of MARKET. Only fire MARKET for a bullish/macro chain_catalyst when it carries a specific ticker.

> **Carve-out (agents-architect brief 2026-07-21, GLOBAL-GEOPOLITICAL-SIGNAL-COVERAGE): market-wide geopolitical advisory.** The no-ticker suppression above (2026-07-13/07-17 clarifications) assumes a per-ticker-only routing model (`position-danger` / `watchlist-opportunity` are both inherently single-stock gates per `docs/policies/alert-policy.md`). It does not fit a genuinely market-wide event. When a `chain_catalyst` signal has `event_type` in `[trade_war, geopolitical_conflict*, macro]` AND the **top-level `stock_code` argument was omitted** by the poster (not `finding_data.affected_stocks`, which the schema requires non-empty and which this text-rendering path never surfaces — see field-precision note above) AND `direction=bearish` AND `confidence` ≥ the Step 3 regime threshold → route to **MARKET as a market-wide advisory**, distinct from a per-ticker CRITICAL alert:
> - Message format: same ≤140-char urgent format as any MARKET post (`docs/policies/alert-policy.md`), framed as a market-wide caveat (e.g. "[VN thị trường] Rủi ro địa chính trị/thương mại lan rộng — <1-line summary>. Theo dõi danh mục.") — do NOT imply a specific stock is in danger.
> - Does NOT bypass the regime-threshold confidence gate (Step 3) — only the per-ticker requirement.
> - Symmetric: a bullish market-wide `chain_catalyst` under the same conditions routes to MARKET as a market-wide opportunity note, same format constraint (mirrors the existing 2026-07-17 symmetric-suppression precedent, now symmetric-carve-out).
> - `*` `geopolitical_conflict` is a LANE B (code) enum value — until it ships, no signal will ever carry it and this clause is a no-op for that value specifically. `trade_war`/`macro` already work today (LANE A, zero code dependency, see `docs/agents/news-scout/flow/stage-signals.md` § Geopolitical/War Signal Dispatch).
> - **write_alert_verdict ticker convention (alert-commander, first live fire 2026-07-22 04:29Z):** `write_alert_verdict` requires a non-empty `ticker` string — there is no market-wide/no-ticker option in its schema. Use the literal `"VNINDEX"` as the ticker for a market-wide advisory fired under this carve-out (do NOT pick an arbitrary single stock from the affected sector — that would misattribute the advisory to one name, contradicting the "do NOT imply a specific stock is in danger" instruction above). `alertSource="chain_catalyst"`, `conviction` = the same regime_adj_score/10 used for the Step 3 threshold check.
> - **`event_type` is not literally exposed either (alert-commander, discovered live 2026-07-23T02:11Z):** same opacity as the `confidence`/`regime_adj_score` field noted above — `get_agent_signals(signal_type="chain_catalyst")`'s text render never prints a literal `event_type=` token, so the carve-out's `[trade_war, geopolitical_conflict, macro]` gate must be inferred from headline/detail content, not read off a field. Do NOT default to "probably macro" for every no-ticker, threshold-clearing chain_catalyst — a signal that is itself a recap/analysis of the market's own domestic price action (e.g. "VN-Index giảm N điểm, thị trường mất X tỷ VND vốn hóa", sector-wide selloff framed as crisis/fear, no external trade/policy/military trigger named) reads as `crisis`/`sector_event`, not `macro`, and does NOT qualify for the carve-out even if `regime_adj_score` clears the Step 3 threshold — it falls back to the standard no-ticker suppression rule. Reserve the carve-out for signals whose content names an actual external catalyst (war/strike/tariff/sanctions/trade-policy-shift) per news-scout's WAR_GEOPOLITICAL_KEYWORDS trigger in `docs/agents/news-scout/flow/stage-signals.md` § Geopolitical/War Signal Dispatch — a market crash restating its own VN-Index delta is a symptom being reported, not a geopolitical/macro catalyst causing one. First live instance: signals 8899/8900 (2026-07-23T02:10Z, "VN-Index giảm 74.98 điểm... rơi tự do" + "khối ngoại bán ròng" recap) — 8899 cleared confidence (0.80 ≥ 0.75) but was suppressed under this reasoning, not routed to MARKET.
