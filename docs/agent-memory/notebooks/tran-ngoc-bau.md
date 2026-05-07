# Tran Ngoc Bau — Working Notebook

**Last updated:** 2026-05-07 (cycle 10) | Cycles completed: 10 (cycles 4-10 FULL AUDIT)

---

## Quality Baseline (cycle 10 — 2026-05-07)

- MARKET message quality score: 1 message in DB (msg#2130 = routing violation, auto-cured)
- Format error rate: N/A (no alert-commander alerts in DB this cycle)
- Signal effectiveness: price_anomaly data EXPIRED from 7d window (was 22/11/3 100%). news-scout: chain_catalyst 1/0/0, urgent_news 4/0/0
- Alert accuracy (7d): 0% hit, 96% unknown — feedback loop still broken
- Agent methodology compliance: 18 session files reviewed, 6+ agents BLOCKED today
- Auto-cures applied: 1 (GAP-3 routing guard)

---

## Known Issues

### GAP-1: market-watcher — `post_agent_signal` schema validation errors [MEDIUM]
- First seen: 2026-05-06
- Cycle 10: msg#2130 references "post_agent_signal validation failed — payload schema mismatch" at 17:40 UTC
- Track: **occurrence count = 2/3 — WORSENED from 1**

### GAP-2: news-scout — confidence not serialized in signal ledger log [LOW]
- First seen: 2026-05-06
- Cycle 10: no new evidence
- Track: occurrence count = 1 (likely resolved)

### GAP-3: Channel routing violation — non-alert messages in MARKET channel [AUTO-CURED]
- First seen: 2026-05-06 (cycle 4)
- Recurrence: 2026-05-07 cycle 5 (msg#2095), cycle 10 (msg#2130)
- **AUTO-CURE APPLIED cycle 10:** Added explicit "NEVER use channel=market for errors" guard to `.claude/flows/market-watcher/cycle.md` error boundary
- Track: **3/3 → AUTO-CURED. Monitor for recurrence.**

### GAP-4: RSS sources STOPPED [MEDIUM → PERMANENT]
- First seen: 2026-05-06 (6/6 stopped)
- Cycle 10: 10/13 OK. Reuters + TE x2 still stopped (12 consecutive errors — counter reset after system restart)
- Track: 3 sources permanently broken

### GAP-5: Alert accuracy feedback loop broken [HIGH — THRESHOLD]
- First seen: 2026-05-06
- 7d: 0% hit, 96% unknown — UNCHANGED across 5+ cycles
- Track: occurrence count = 3+ → **THRESHOLD — developer must fix outcome tracking**

### GAP-6: σ threshold data drop [RESOLVED]
- Resolved cycle 6. All stocks 358+ points ✅ READY.

### GAP-7: Regime extraction non-deterministic [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 6
- Cycle 10: no new regime data (all agents BLOCKED or no new extraction)
- Three different regimes extracted by different agents on same day: NEUTRAL, EASING, TIGHTENING
- Track: **3/3 → THRESHOLD. Developer must investigate macro_snapshot regime logic.**

### GAP-8: Sandbox/cron agents lack MCP access [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 6
- Cycle 10: alert-commander BLOCKED at 18:02, market-watcher BLOCKED 3x (14:38, 15:38, 16:38)
- Total blocked agent-cycles today: 15+ across 4+ agents
- Track: **3/3+ → THRESHOLD. Architect must fix MCP access for scheduled agents.**

### GAP-9: get_macro_snapshot Dinh Gia DB schema error [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 7
- Cycle 10: macro snapshot returned successfully (no Dinh Gia section in output — still omitted)
- Track: **3/3 → THRESHOLD. Developer must fix DB schema.**

### GAP-10: market-watcher session file overwritten [HIGH — THRESHOLD]
- First seen: 2026-05-07 cycle 8
- Cycle 10: confirmed 3 overwrites today (14:38→15:38→16:38). Prior content lost.
- Track: **occurrence count = 3/3 → THRESHOLD. Developer must fix append-only logging.**

---

## Recurring Patterns

| Pattern | First seen | Count | Trigger at | Status |
|---------|-----------|-------|-----------|--------|
| post_agent_signal schema error | 2026-05-06 | 2 | 3 | worsening |
| confidence missing in news-scout | 2026-05-06 | 1 | 3 | likely resolved |
| **non-alert msg in MARKET channel** | **2026-05-06** | **3** | **3** | **AUTO-CURED cycle 10** |
| **alert accuracy feedback loop** | **2026-05-06** | **3+** | **3** | **THRESHOLD — needs dev fix** |
| **regime extraction inconsistency** | **2026-05-07** | **3** | **3** | **THRESHOLD — needs dev fix** |
| **sandbox MCP access failure** | **2026-05-07** | **3+** | **3** | **THRESHOLD — needs architect** |
| **Dinh Gia DB schema error** | **2026-05-07** | **3** | **3** | **THRESHOLD — needs dev fix** |
| **market-watcher session overwrite** | **2026-05-07** | **3** | **3** | **THRESHOLD — needs dev fix** |

---

## Agent Reliability Scores (cycle 10 — 2026-05-07)

| Agent | Methodology | Format | Regime | Overall |
|-------|-------------|--------|--------|---------|
| news-scout | GOOD | GOOD | GOOD (NEUTRAL consistent) | GOOD |
| news-scout-cycle | GOOD | GOOD | GOOD | GOOD |
| market-watcher | BLOCKED (5x today) | — | — | NO DATA |
| alert-commander | GOOD (07:02 cycle) | GOOD | GOOD | GOOD |
| alert-commander-18h | BLOCKED | — | — | NO DATA |
| unified-agent | NEEDS ATTENTION (regime) | GOOD | MIXED | NEEDS ATTENTION |
| unified-agent-BLOCKED | BLOCKED | — | — | NO DATA |
| unified-agent-cycle | BLOCKED | — | — | NO DATA |
| report-analyzer | BLOCKED | — | — | NO DATA |
| qa-responder | GOOD | N/A (empty queue) | N/A | GOOD |
| developer | GOOD | N/A | N/A | GOOD (active fixes) |
| PO | GOOD | N/A | N/A | GOOD (triage completed) |

---

## Calibration Tracking

| Signal Type | Period | Count | Fired | Confirmed | Precision |
|------------|--------|-------|-------|-----------|-----------|
| price_anomaly | 7d | EXPIRED | — | — | was 100% |
| chain_catalyst | 7d | 1 | 0 | 0 | N/A |
| urgent_news | 7d | 4 | 0 | 0 | N/A |
| fundamental_validation | 7d | 0 | 0 | 0 | N/A |

Note: price_anomaly data expired from 7d window. market-watcher BLOCKED = no new signals.

---

## Macro Trend Tracking

| Indicator | Cycle 8 | Cycle 9 | Cycle 10 | Trend |
|-----------|---------|---------|----------|-------|
| Brent crude | $99.03 | $96.39 | $100.70 | REBOUNDED |
| Gold | — | $4,763 | $4,717.80 | DECLINING |
| DXY | — | — | 98.08 (STABLE) | NEW |
| USD/VND | — | — | 26,260 (HIGH) | PRESSURE |
| VN-Index | 1,909.01 | 1,909.01 | — (CLOSED) | STABLE |

---

## Next Actions

- **5 gaps at THRESHOLD** — all require developer/architect intervention:
  - GAP-5: alert outcome tracking (developer)
  - GAP-7: regime extraction non-deterministic (developer)
  - GAP-8: sandbox MCP access (architect)
  - GAP-9: Dinh Gia DB schema `fetched_at` column (developer)
  - GAP-10: market-watcher session overwrite — append-only logging (developer)
- GAP-1: post_agent_signal schema error at 2/3 — worsened, watch closely
- GAP-3: AUTO-CURED — monitor for recurrence in next cycles
- Signal effectiveness degrading — price_anomaly data expired, market-watcher must resume to rebuild
- System restarted (uptime 2h33m) — RSS error counters reset but underlying issues remain
