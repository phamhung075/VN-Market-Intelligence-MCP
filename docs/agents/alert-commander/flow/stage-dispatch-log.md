> Parent: [./cycle.md](./cycle.md)

# Alert Commander — Stage 4-5: Dispatch + Log

**4a. MARKET channel**
Pre-send: `get_market_snapshot()` — divergence > 5% → discard, max 2 attempts
- > 3 pending → `send_alert_digest(alerts=[], channel="market")`
- ≤ 3 → `send_telegram(channel="market", message=<alert_text>)` per alert — format: `docs/standards/alert-message-format.md` (Vietnamese, full diacritics)

Append regime caveat to each MARKET alert (Vietnamese):
- `TIGHTENING` + bullish signal:
  `"Lưu ý: Tín hiệu mua trong môi trường thắt chặt (TIGHTENING). Thiên thời bất lợi — yêu cầu xác nhận chuỗi cao hơn."`
- `CARRY_REGIME=HOT_MONEY_INFLOW` + `CARRY_SPREAD > 3%`:
  `"⚠️ Dòng tiền nóng cao — carry spread hấp dẫn. Rủi ro đảo chiều FII nếu carry thu hẹp."`
- `pivot_window_active=true`:
  `"📅 Cửa sổ pivot chính sách — dữ liệu GSO/SBV sắp công bố."`
- `chain_catalyst` + `TIGHTENING` + `bullish`:
  `"Lưu ý: Xúc tác chuỗi trong môi trường thắt chặt — xác nhận thêm trước khi hành động."`
- `chain_catalyst` + `bearish` (any regime):
  `"Cảnh báo: Xúc tác tiêu cực được phát hiện — kiểm tra danh mục ngay."`

After: `mark_alert_read()` + `record_signal_outcome(..., "fired")`

**write_alert_verdict** (call after `send_telegram` AND `mark_alert_read`, before Step 4b):
- Input: `ticker` (alert.ticker), `direction` (bullish|bearish, from signal), `conviction` (0–1, from signal), `alertSource` (signal_type: urgent_news|verified_chain|chain_catalyst|price_anomaly|position_danger|watchlist_opportunity), `firedAt` (ISO 8601 now)
- Output: `{ success: true, id, verdict: "pending" }`
- On success: log `"Verdict {id} recorded as pending for {ticker}"` → continue to Step 4b
- On error: log to session → `send_telegram(channel="work", message="[alert-commander] BUG: write_alert_verdict failed for {ticker}")`

**4b. WORK channel** — ULTRA tier per `.claude/skills/caveman/SKILL.md` (cycle-status ping = inter-agent state change):
```
[ac] HH:MM — N sigs | fired:X sup:Y | next:TIME
```

> Tier: ULTRA. ≤80 chars target. Silent cycles (no MARKET send): skip WORK entirely per `no_cycle_headers: true` constraint.

**5. Notebook commit**

> Invariant: timestamp = current UTC, never future, never speculative.

### Notebook timestamp guard
- Before writing `docs/agent-memory/notebooks/alert-commander.md`, ALWAYS get current UTC via:
  ```
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  ```
- Use the returned value verbatim — NEVER speculate, NEVER round to a future minute
- NEVER write entries for cycles that have not fired yet

### Header update (required every cycle)
Before appending the `### Alert Cycle` block, update line 3 of the notebook:
```bash
SPRINT=$(jq -r '.head.active_task_id // "idle"' docs/data/orch/orch-state.json 2>/dev/null || echo "idle")
```
```
**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** $SPRINT
```
Use `date -u` exclusively — same UTC source as the session log guard (1865a). Fallback: if `jq` fails or `currentSprint` is null, `$SPRINT` = `idle`.

`log_agent_work(...)` + append `docs/agent-memory/notebooks/alert-commander.md`:
```
### Alert Cycle (HH:MM–HH:MM UTC)
- Signals: [count by type]
- Fired: N | Suppressed: M | MARKET: X
- ChainCatalyst: N fired | M suppressed | event_types: [list]
- Regime: REGIME | Carry: CARRY_REGIME (CARRY_SPREAD%) | Pivot window: pivot_window_active
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/alert-commander.md]
# intent: "chore(memory/alert-commander): notebook YYYY-MM-DD"
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/alert-commander.md
git commit -m "chore(memory/alert-commander): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`

---

## Firing Rules

**position-danger**:
- `NEUTRAL/EASING` (all 3): `stopLossHit=true` + `singleDayDrop>5%` + `newsSentiment<-0.5`
- `TIGHTENING` (2/3 sufficient): any two of the above — credit buffer thinner, earlier exit warranted
**watchlist-opportunity**:
- `TIGHTENING`: `kinhDichConfidence≥80` + `kinhDichSignal=BUY` + `newsSentiment≥0.5` + `agentsMajority=BUY`
- `EASING`: `kinhDichConfidence≥65` + `kinhDichSignal=BUY` + `newsSentiment≥0.3` + `agentsMajority=BUY`
- `NEUTRAL`: `kinhDichConfidence≥70` + `kinhDichSignal=BUY` + `newsSentiment≥0.3` + `agentsMajority=BUY`
**CRITICAL always**: `verified_chain` | `legal_risk` | `crisis_velocity`

## Value Investor Mode

`analysis_mode=value_investor` → skip trader alerts → route to WORK.
`REGIME=TIGHTENING` → additionally suppress growth-story plays (PE > 20 + no dividend yield) → route to WORK with note: `"TIGHTENING regime — ưu tiên Tốt Gỗ/cổ tức, tránh tăng trưởng PE cao"`
Always MARKET regardless: earnings release | gov policy change | large insider (>$5M or >5% stake) | supply chain disruption | sector rotation reversal (foreign flow >10%/week) | Kinh Dich shift
