> Parent: [./cycle.md](./cycle.md)

# Alert Commander — Stage 4-5: Dispatch + Log

**Step 4a-pre — CLAIM-TRUTH GATE (emit signal on MISMATCH — proceed with time-sensitivity override)**

→ skill: `.claude/skills/claim-truth-gate/SKILL.md`

Real-time alert flow: before dispatching each alert to MARKET, run the gate to detect narrative contradictions. On FAIL, emit `narrative_contradiction` signal but do NOT hard-block the dispatch.

Invoke (per each pending alert):
```
GATE_EXIT = skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed alert text>
  agent_id  = "alert-commander"
  cache     = <this cycle's tool-call results, or null>
```

**Exit-code handling (time-sensitivity override):**
- `0` = PASS → proceed to Step 4a MARKET send.
- `1` = FAIL — contradiction detected; signal emitted to `po` by script. Self-correct:
  1. Call the named tool directly.
  2. Rewrite the offending sentence using real returned values.
  3. Re-run this skill.
  4. Second-pass PASS → proceed to dispatch.
  5. **Second-pass FAIL → write honest gap and proceed to dispatch anyway** (time-sensitivity: real-time alerts must fire promptly).
- `2` = config-error → fail-loud: `send_telegram(channel="bug", message="[alert-commander] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Script emits `narrative_contradiction` on FAIL (first pass); record it in session log with alert ID and ticker.

---

**Published-marker gate (AC extension, discovered live 2026-07-23 06:13Z — doc-self-heal, was undocumented tribal knowledge):** Before the FIRST `send_telegram(channel="market")` of this cycle (i.e. only when the Firing Gate above has already resolved to a fire — never claim on a silent-exit cycle), claim a tombstone lock: `task_claim(task_id="published:alert-commander-market:<nominal_tick>", task_kind="cowork-slot", owner_agent="alert-commander", owner_client_session=<expanded session id>, ttl_seconds=900)`. `<nominal_tick>` = this cycle's dispatched tick (e.g. `2026-07-23T06:00Z`), NOT a calendar date — tick-scoped (not date-scoped like chef's daily-dish marker, see `docs/agents/unified-agent/flow/chef.md` § Step 0.5) because this agent legitimately fires more than once per day on distinct tickers/events; a date-scoped key would wrongly block a second same-day legitimate fire. `claimed:false` → EXIT without sending (a peer session already published this exact tick). `claimed:true` → proceed to send; on success the marker is a **tombstone — never call `task_release`**, TTL is its sole expiry (mirrors `docs/agents/unified-agent/flow/chef.md` § Step 0.5 and the live `published:chef-*`/`published:digest-*` rows in `task_list_held`).

**4a. MARKET channel**
Pre-send: `get_market_snapshot()` — divergence > 5% → discard, max 2 attempts
- > 3 pending → `send_alert_digest(alerts=[], channel="market")`
- ≤ 3 → `send_telegram(channel="market", message=<alert_text>)` per alert — format: `docs/standards/alert-message-format.md` (Vietnamese, full diacritics)

> **Clarification (alert-commander, discovered live 2026-07-15):** `alert-message-format.md`'s 5-section narrative (up to 1,350 graphemes) predates the Sprint 1949 event-only redesign and conflicts with it. For this agent's actual firing model, the binding format constraint is `urgent_format_max_chars: 140` (agent `init.md` + `alert-policy.md` § Alert Commander Event Scope, both more recent/specific SSOT) — compose a single-line ≤140-char Vietnamese urgent message, NOT the 5-section narrative. Treat `alert-message-format.md` as scoped to any legacy/non-event-only HIGH/CRITICAL digest path only.

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

**write_alert_verdict** (default order: call after `send_telegram` AND `mark_alert_read`, before Step 4b):
- Input: `ticker` (alert.ticker), `direction` (bullish|bearish, from signal), `conviction` (0–1, from signal), `alertSource` (signal_type: urgent_news|verified_chain|chain_catalyst|price_anomaly|position_danger|watchlist_opportunity|legal_risk|crisis_velocity), `firedAt` (ISO 8601 now)
- Output: `{ success: true, id, verdict: "pending", duplicate?: true }` — `duplicate:true` means a PENDING verdict already exists for this (ticker, alertSource) pair (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK dedup guard); the echoed `id`/`verdict` are the EXISTING row, not a new one.
- On success: log `"Verdict {id} recorded as pending for {ticker}"` → continue to Step 4b
- On error: log to session → `send_telegram(channel="work", message="[alert-commander] BUG: write_alert_verdict failed for {ticker}")`

**Pre-check ordering exception (2026-07-04, discovered live):** when a `legal_risk` (or other CRITICAL-tier) bus signal LOOKS like a re-emission of a story already fired this session/day for the same ticker, call `write_alert_verdict(ticker, alertSource)` FIRST — before `send_telegram` — and inspect the response. If `duplicate:true` → SUPPRESS (do not `send_telegram`, call `record_signal_outcome(signal_id, "suppressed", "duplicate — pending verdict <id> already exists")` instead). Only proceed to `send_telegram` when the response has no `duplicate` flag (genuinely new (ticker, alertSource) pair). This is NOT a violation of the "never suppress legal risk" policy — `write_alert_verdict`'s own dedup guard is a concrete system signal, not an ad hoc conviction/judgment gate, and prevents duplicate user-facing MARKET alerts when an upstream gatherer (e.g. news-scout) re-posts the same underlying story under a new signal ID.

**4b. WORK channel** — ULTRA tier per `.claude/skills/caveman/SKILL.md` (cycle-status ping = inter-agent state change):
```
[ac] HH:MM — N sigs | fired:X sup:Y | next:TIME
```

> Tier: ULTRA. ≤80 chars target. Silent cycles (no MARKET send): skip WORK entirely per `no_cycle_headers: true` constraint.

**5. Notebook write** — APPEND class → skill: `.claude/skills/notebook-write/SKILL.md` (AC-2 retention: keep last 3 `## ` sections; AC-3 settled-write; AC-4 blank-state fallback)

> Invariant: timestamp = current UTC via `date -u +"%Y-%m-%dT%H:%M:%SZ"`, used verbatim — never speculate, never a future minute, never an entry for a cycle that has not fired yet.

**One `## c<NNN> · <ISO-timestamp>` section per cycle** — NOT the old perpetual `## This session` + `### Alert Cycle` sub-block (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29: that shape has exactly one `## `, so the drop-oldest-section pruner has nothing to drop and safe-fails forever). `<NNN>` = 1 + highest existing `c<NNN>` in file (blank-state → `c1`).

Template (target ≤700B/≤8L — full tool-call narration goes in `log_agent_work`'s `context` field, NOT here; this notebook is a scannable ledger, not a transcript):
```
## c<NNN> · <ISO-timestamp> (slot=<dispatched slot>, tick=<nominal tick>)
- Signals: [count by type] | Fired: N | Suppressed: M | MARKET: X
- ChainCatalyst: N fired | M suppressed | event_types: [list]
- Regime: REGIME | Carry: CARRY_REGIME (CARRY_SPREAD%) | Pivot window: pivot_window_active
```
Before composing, refresh the preamble line: `SPRINT=$(jq -r '.head.active_task_id // "idle"' docs/data/orch/orch-state.json 2>/dev/null || echo "idle")` → `**Last updated:** $(date -u +"%Y-%m-%d %H:%M UTC") | **Sprint:** $SPRINT` (same UTC source as 1865a; `jq` failure/null → `idle`).

Compose per skill Step 1 — drop oldest `## c<NNN>` section(s) while >3 sections OR while the body would exceed 200L OR 12000B (this file ran 10x over the byte cap historically at 632B/line; check bytes explicitly, not lines alone) — then land ONE settled Edit/Write. AC-5 gate: `wc -l` ≤200 AND `wc -c` ≤12000, both BLOCKING.

`log_agent_work(...)` first (narration goes here), then the settled notebook write above.

**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/alert-commander.md]
# intent: "chore(memory/alert-commander): notebook YYYY-MM-DD"
git add docs/agent-memory/notebooks/alert-commander.md
git commit -m "chore(memory/alert-commander): notebook YYYY-MM-DD" -- docs/agent-memory/notebooks/alert-commander.md
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
