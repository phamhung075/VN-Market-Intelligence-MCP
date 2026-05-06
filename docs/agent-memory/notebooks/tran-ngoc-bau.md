# Tran Ngoc Bau — Working Notebook

**Last updated:** 2026-05-06 ~19:30 UTC | Cycle: 1 (baseline)

---

## Quality Baseline (established cycle 1 — 2026-05-06)

- MARKET message quality score: N/A (0 alerts fired today — infra outage)
- Format error rate: 0% (no alerts fired to audit)
- Confidence floor violations: UNKNOWN (7/9 signals missing confidence in log)
- Signal dedup candidates/day: 0 (no violations)
- Agent methodology compliance: 50% active (4/8 agents had sessions; market-watcher GAP-1)

---

## Known Issues

### GAP-1: market-watcher — `post_agent_signal` schema validation errors [HIGH]
- First seen: 2026-05-06
- Linked: TASK-1365 (graph node confirmed)
- Effect: price_anomaly signals (HCM, POW, VRE) blocked from bus → alert-commander Step 3b override cannot run
- Action: escalated to BUG channel. Requires developer code fix, not flow edit.
- Track: occurrence count = 1

### GAP-2: news-scout — confidence not serialized in signal ledger log [MEDIUM]
- First seen: 2026-05-06
- Effect: 7/9 signals missing confidence value in session log. Brier calibration retroactively blocked.
- Action: monitor. Auto-cure trigger = 3 cycles.
- Track: occurrence count = 1

### GAP-3: FALSE — Docker/MCP gateway was NOT down [RETRACTED]
- Originally reported as "down since 05:13 UTC" — this was a cascading hallucination
- Actual state: All 9 Docker services were UP with 14h+ uptime throughout the day
- Root cause: agents read prior session logs saying "MCP down" and copied the claim without trying
- Lesson: ALWAYS attempt the tool call before declaring infrastructure failure

---

## Recurring Patterns

(Track systematic issues here — 3+ occurrences triggers auto-cure)

| Pattern | First seen | Count | Trigger at |
|---------|-----------|-------|-----------|
| post_agent_signal schema error (market-watcher) | 2026-05-06 | 1 | 3 |
| confidence missing in news-scout ledger | 2026-05-06 | 1 | 3 |

---

## Agent Reliability Scores (cycle 1 — 2026-05-06)

| Agent | Methodology | Format | Regime | Overall |
|-------|-------------|--------|--------|---------|
| news-scout | GOOD | GOOD | GOOD | GOOD |
| market-watcher | NEEDS ATTENTION (schema errors blocked signals) | OK | GOOD | NEEDS ATTENTION |
| alert-commander | GOOD | N/A (0 fires) | GOOD | GOOD |
| qa-responder | GOOD | N/A (empty queue) | N/A | GOOD |
| financial-analyst | NO DATA | NO DATA | NO DATA | NO DATA |
| report-analyzer | NO DATA | NO DATA | NO DATA | NO DATA |
| digest-predict | NO DATA | NO DATA | NO DATA | NO DATA |
| unified-agent | NO DATA | NO DATA | NO DATA | NO DATA |

---

## Calibration Tracking

| Signal Type | Date | Count | Avg Confidence | Verified Hit Rate | Brier |
|------------|------|-------|---------------|------------------|-------|
| urgent_news | 2026-05-06 | 4 | UNKNOWN (7 missing) | TBD | TBD |
| chain_catalyst | 2026-05-06 | 3 | 0.72 (1 logged) | TBD | TBD |
| price_anomaly | 2026-05-06 | 3 | 0.75–0.82 (not posted) | TBD | TBD |

---

## Next Actions

- Cycle 2: verify GAP-1 (schema) still open or resolved by developer
- Cycle 2: verify GAP-2 (confidence logging) recurs in news-scout
- Cycle 3: if either gap recurs 3x → draft auto-cure for flow file
- Baseline MARKET message audit when infra restored and alerts actually fire
- Request `get_signal_effectiveness()` data once gateway stable 24h
