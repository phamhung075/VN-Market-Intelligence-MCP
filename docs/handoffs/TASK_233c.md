# TASK-233c: Manual Smoke Test — Market-Hours Execution + Observation Log

**Status:** Todo
**Type:** QA Manual Test
**Owner:** QA
**Effort:** 2h (execution) + 1h (report writing)
**Depends:** 233b (must be merged to main first)
**Timing:** During Vietnam trading hours (09:00–15:00 UTC+7, roughly 02:00–08:00 UTC)

---

## Objective

Execute 5-phase manual smoke test during live Vietnam market hours. Validate that:
1. Primary signals flow with confidence_penalty=1.0 (no fallback)
2. Fallback injection triggers fallback routing (confidence_penalty=0.8075)
3. Exhaustion escalates to WORK channel
4. Auto-recovery returns to primary path
5. All signal_quality_audit entries logged correctly

Document all observations in `reports/SPRINT_REPORT_233.md`.

---

## Pre-Test Setup (08:50 UTC+7)

### 1. Deploy Latest Main Branch

```bash
# Ensure main branch is up to date
git checkout main
git pull origin main

# Verify 233b is merged
git log --oneline -5 | grep "233"
# Expected: commit for TASK-233b present

# Install + build
bun install
bun test                    # All 27 assertions pass
bun tsc --noEmit            # No type errors
```

### 2. Start MCP Server

```bash
# ONLY method: launchctl restart
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp

# Wait 5 seconds for startup
sleep 5

# Verify health
curl http://localhost:3000/health
# Expected: { "status": "ok", "timestamp": "..." }
```

### 3. Verify Database Ready

```bash
# Check signal_quality_audit table exists
sqlite3 ~/.vn-market-intelligence/data.db ".schema signal_quality_audit"
# Expected: table definition with all 16 columns
```

### 4. Prepare Circuit Breaker Injection Script

Create temporary script `/tmp/inject-breaker.sh`:

```bash
#!/bin/bash
# Inject VPS circuit breaker "open" state for news + prices
# (Implementation depends on your circuit breaker registry API)

# If circuit breaker has HTTP endpoint (port 3001 or similar):
# echo "CIRCUIT_OPEN:news,prices" | nc localhost 3001

# OR if manual: modify Bun.env temporarily
# Set FORCE_CIRCUIT_OPEN=news,prices

echo "Circuit breaker injection active (15 minutes)"
sleep 900  # 15 minutes
echo "Restoring circuit breaker"
```

### 5. Open Multiple Terminal Windows

- **Terminal 1**: Monitor MCP logs
  ```bash
  tail -f ~/.vn-market-intelligence/mcp.log
  ```
- **Terminal 2**: Monitor SQLite audit table
  ```bash
  sqlite3 ~/.vn-market-intelligence/data.db "SELECT COUNT(*) FROM signal_quality_audit;"
  ```
- **Terminal 3**: Telegram / test runner (invoke agents)
- **Terminal 4**: Circuit breaker injection (when needed)

---

## Phase 1: Primary Success Path (09:00–09:15 UTC+7)

**Objective**: Validate primary signals flow with no fallback penalty.

### Execution

1. Run market analysis agents normally (no injection):
   ```bash
   # Trigger market analysis cycle (depends on your agent scheduler)
   # E.g., POST /messages with "run_market_analysis" command
   ```

2. Monitor signals reaching MARKET channel (Telegram or logs)

3. Query audit table for primary signals:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT COUNT(*) as total,
            SUM(source_fallback) as fallback_count
     FROM signal_quality_audit
     WHERE created_at >= datetime('now', '-15 minutes');
   "
   ```

### Observations to Record

- [ ] **Total signals posted**: Count from audit query
- [ ] **Fallback signals**: Should be 0 (or very low, only if VPS had transient issues)
- [ ] **Confidence penalties**: All should be 1.0
- [ ] **Sample alert check**: Pick 5 random alerts from MARKET channel
  - [ ] `source_fallback=false` in metadata (if visible)
  - [ ] Confidence scores 95–100 range
  - [ ] Prices match live HOSE/HNX quotes

### Expected Outcome

```
✓ 50–100 signals posted (depends on alert frequency)
✓ 0 fallback signals
✓ All confidence_penalty = 1.0
✓ All confidence_score_final = 95–100
```

---

## Phase 2: Inject VPS Circuit Breaker (09:15–09:30 UTC+7)

**Objective**: Validate fallback routing + confidence penalty application.

### Execution

1. Activate circuit breaker injection (09:15 UTC+7):
   ```bash
   # Simulate VPS outage for news + prices
   bash /tmp/inject-breaker.sh &
   # OR manually modify Bun.env
   ```

2. Monitor agent logs for fallback routing decision:
   ```bash
   grep -i "circuit.*open\|fallback.*triggered" ~/.vn-market-intelligence/mcp.log
   ```

3. Run market analysis cycle (agents should auto-route to fallback):
   ```bash
   # Trigger market analysis
   ```

4. Query audit table for fallback signals:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT
       signal_type,
       COUNT(*) as count,
       SUM(source_fallback) as fallback_count,
       AVG(confidence_score_final) as avg_confidence_final,
       MAX(fallback_source) as fallback_source
     FROM signal_quality_audit
     WHERE created_at >= datetime('now', '-15 minutes')
     GROUP BY signal_type;
   "
   ```

5. Spot-check 5 alerts from MARKET channel:
   - [ ] Verify `source_fallback=true` metadata
   - [ ] Verify `confidence_penalty=0.8075` applied
   - [ ] Verify fallback_source (cache, yahoo, etc.)
   - [ ] Confidence scores reduced vs primary (70–90 range for fresh cache)

### Observations to Record

- [ ] **Time breaker activated**: 09:15 UTC+7
- [ ] **Signals affected**: Count from audit query
- [ ] **Fallback routing triggered**: Log evidence (grep above)
- [ ] **Fallback sources used**: cache | yahoo | domestic_rss
- [ ] **Confidence penalty applied**: Verify 0.8075 in audit table
- [ ] **Sample alerts**: Document 5 alerts with metadata

### Expected Outcome

```
✓ Circuit breaker state visible in logs
✓ Fallback router triggered (reason: "circuit_breaker_open")
✓ 40–80 signals from fallback (depends on frequency)
✓ source_fallback=1 in audit entries
✓ confidence_penalty=0.8075 applied
✓ confidence_score_final reduced (70–90 range for fresh cache)
✓ No signals reach MARKET without source_fallback metadata
```

---

## Phase 3: Exhaust All Fallbacks (09:30–09:45 UTC+7)

**Objective**: Validate escalation callback fires when all sources exhausted.

### Execution

1. Corrupt cache (simulate exhaustion):
   ```bash
   # Clear market_prices table (or rename it)
   sqlite3 ~/.vn-market-intelligence/data.db "
     ALTER TABLE market_prices RENAME TO market_prices_backup;
   "
   ```

2. Mock domestic RSS to return 503:
   ```bash
   # Depends on your fetcher implementation
   # E.g., export MOCK_DOMESTIC_RSS_ERROR=503 before agent cycle
   ```

3. Keep circuit breaker open (from Phase 2)

4. Trigger news agent cycle (should exhaust all retries + fallbacks):
   ```bash
   # Trigger news analysis agent
   ```

5. Monitor WORK channel for escalation message:
   - [ ] Message arrives <5 seconds after exhaustion
   - [ ] Template matches: `[01-NEWS-SCOUT] VPS news pipeline exhausted...`
   - [ ] Includes service name, agent name, error summary

6. Query agent_status table:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT agent_name, status, failure_reason, last_failure_at
     FROM agent_status
     WHERE agent_name LIKE '%news%'
     ORDER BY last_failure_at DESC LIMIT 1;
   "
   ```

7. Query agent_log table for detailed error:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT agent_name, failure_reason, error_summary
     FROM agent_log
     WHERE agent_name LIKE '%news%'
     AND created_at >= datetime('now', '-10 minutes')
     ORDER BY created_at DESC LIMIT 1;
   "
   ```

### Observations to Record

- [ ] **Time exhaustion detected**: Note exact timestamp
- [ ] **Escalation message received**: Screenshot or log paste
- [ ] **Message template correct**: Includes [01-NEWS-SCOUT], service names
- [ ] **Error count**: How many failure attempts before escalation
- [ ] **Agent status**: status = "degraded" | "halted"
- [ ] **Escalation latency**: <5 seconds after exhaustion detected

### Expected Outcome

```
✓ News agent stops processing (status="degraded")
✓ Escalation message posted to WORK <5s
✓ agent_status.failure_reason = "vps_exhausted_all_fallbacks"
✓ agent_log includes error summary (last 3 errors)
✓ Price agent continues unaffected (isolated failure)
```

---

## Phase 4: Recovery (09:45–10:00 UTC+7)

**Objective**: Validate auto-recovery to primary path (no manual intervention).

### Execution

1. Remove circuit breaker injection:
   ```bash
   # Kill inject-breaker.sh process
   killall bash  # or more specific
   # OR restore FORCE_CIRCUIT_OPEN env var
   ```

2. Restore cache:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     ALTER TABLE market_prices_backup RENAME TO market_prices;
   "
   ```

3. Restore domestic RSS (remove 503 mock)

4. Trigger market analysis cycle (agents should auto-recover):
   ```bash
   # Trigger market analysis
   ```

5. Monitor logs for recovery:
   ```bash
   grep -i "circuit.*closed\|primary.*restored\|recovery" ~/.vn-market-intelligence/mcp.log
   ```

6. Query audit table for recovery transition:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT
       created_at,
       source_fallback,
       confidence_penalty,
       confidence_score_final
     FROM signal_quality_audit
     WHERE signal_type = 'price'
     AND ticker IN ('VNM', 'FPT')  -- sample tickers
     AND created_at >= datetime('now', '-15 minutes')
     ORDER BY created_at DESC
     LIMIT 10;
   "
   ```
   Expected: transition from fallback (source_fallback=1) → primary (source_fallback=0)

7. Verify agent status recovered:
   ```bash
   sqlite3 ~/.vn-market-intelligence/data.db "
     SELECT agent_name, status FROM agent_status
     WHERE agent_name LIKE '%news%' OR agent_name LIKE '%price%';
   "
   ```

### Observations to Record

- [ ] **Time injection removed**: 09:45 UTC+7
- [ ] **Recovery latency**: How long until primary signals resume
- [ ] **Confidence recovery**: Confirm final confidence scores return to 95–100
- [ ] **Agent status**: Transitions from "degraded" → "ok"
- [ ] **Signal metadata**: source_fallback transitions from 1 → 0
- [ ] **No manual intervention required**: All recovery automatic

### Expected Outcome

```
✓ Agents detect circuit breaker closed within 2 cycles
✓ Primary signals resume automatically
✓ source_fallback=0, confidence_penalty=1.0 in new signals
✓ confidence_score_final recovers to 95–100 range
✓ Agent status transitions from "degraded" → "ok"
✓ No manual restart needed
```

---

## Phase 5: Metrics Extraction & Report Writing (10:00 UTC+7)

**Objective**: Summarize observations in `reports/SPRINT_REPORT_233.md`.

### SQL Queries for Metrics

```bash
# 1. Total signals by source (primary vs fallback)
sqlite3 ~/.vn-market-intelligence/data.db "
  SELECT
    source_fallback,
    COUNT(*) as count,
    ROUND(AVG(confidence_score_final), 1) as avg_confidence
  FROM signal_quality_audit
  WHERE created_at >= '2026-04-21T02:00:00Z'  -- start of test window
  AND created_at <= '2026-04-21T08:00:00Z'    -- end of test window
  GROUP BY source_fallback;
"

# 2. Fallback sources used
sqlite3 ~/.vn-market-intelligence/data.db "
  SELECT
    fallback_source,
    COUNT(*) as count,
    ROUND(AVG(confidence_score_final), 1) as avg_confidence
  FROM signal_quality_audit
  WHERE source_fallback = 1
  AND created_at >= '2026-04-21T02:00:00Z'
  GROUP BY fallback_source;
"

# 3. Staleness distribution
sqlite3 ~/.vn-market-intelligence/data.db "
  SELECT
    staleness_warning,
    COUNT(*) as count,
    ROUND(AVG(price_age_minutes), 1) as avg_age_minutes
  FROM signal_quality_audit
  WHERE source_fallback = 1
  GROUP BY staleness_warning;
"

# 4. Escalations fired
sqlite3 ~/.vn-market-intelligence/data.db "
  SELECT COUNT(*) as escalation_count
  FROM agent_log
  WHERE failure_reason = 'vps_exhausted_all_fallbacks'
  AND created_at >= '2026-04-21T02:00:00Z';
"
```

---

## Observation Checklist (Required for SPRINT_REPORT_233.md)

Copy into your report:

```markdown
## Observation Checklist

### Phase 1: Primary Success (09:00–09:15)
- [ ] Total primary signals: [COUNT]
- [ ] Fallback signals: [COUNT] (expected: 0–5)
- [ ] All confidence_penalty = 1.0: ✓
- [ ] Confidence scores 95–100: ✓

### Phase 2: Fallback Injection (09:15–09:30)
- [ ] Circuit breaker state logged: ✓
- [ ] Fallback router triggered: ✓
- [ ] Fallback signals: [COUNT] (expected: 40–80)
- [ ] Confidence penalty = 0.8075: ✓
- [ ] Fallback sources used: [cache|yahoo|domestic_rss]
- [ ] Confidence scores 70–90: ✓

### Phase 3: Exhaustion (09:30–09:45)
- [ ] News agent exhausted: ✓
- [ ] Escalation message sent <5s: ✓
- [ ] Agent status = "degraded": ✓
- [ ] Error log includes 3+ failures: ✓
- [ ] Price agent unaffected: ✓

### Phase 4: Recovery (09:45–10:00)
- [ ] Circuit breaker closed: ✓
- [ ] Primary signals resume: ✓
- [ ] Confidence recovered to 95–100: ✓
- [ ] Agent status → "ok": ✓
- [ ] No manual restart needed: ✓

### Phase 5: Metrics
- [ ] Total signals: [COUNT]
- [ ] Primary signals: [COUNT] ([%])
- [ ] Fallback signals: [COUNT] ([%])
- [ ] Avg confidence (primary): [XX]
- [ ] Avg confidence (fallback): [XX]
- [ ] Staleness warnings: [COUNT]
- [ ] Escalations: [COUNT]
```

---

## Report Template (reports/SPRINT_REPORT_233.md)

Create file `reports/SPRINT_REPORT_233.md`:

```markdown
# SPRINT-233 Observation Log — Market-Hours Smoke Test

**Date**: 2026-04-21 (Vietnam time: 09:00–15:00 UTC+7, UTC: 02:00–08:00)
**Tester**: [Your name]
**Environment**: Local MCP server, live database
**Sprint Goal**: Validate cowork resilience (fallback chains + confidence penalty)

## Test Execution Summary

| Phase | Time Window | Status | Notes |
|-------|-------------|--------|-------|
| Phase 1: Primary Success | 09:00–09:15 | ✓ PASS | [brief summary] |
| Phase 2: Fallback Injection | 09:15–09:30 | ✓ PASS | [brief summary] |
| Phase 3: Exhaustion | 09:30–09:45 | ✓ PASS | [brief summary] |
| Phase 4: Recovery | 09:45–10:00 | ✓ PASS | [brief summary] |

## Metrics Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Total signals logged | [N] | >100 | ✓ |
| Primary signals | [N] ([%]) | >60% | ✓ |
| Fallback signals | [N] ([%]) | <30% | ✓ |
| Avg confidence (primary) | [XX] | 95–100 | ✓ |
| Avg confidence (fallback) | [XX] | 70–90 | ✓ |
| Staleness warnings | [N] | <10 | ✓ |
| Escalations fired | [N] | ≥1 | ✓ |

## Detailed Observations

### Phase 1: Primary Success Path (09:00–09:15)

[Paste observations from Phase 1 checklist above]

**Sample alerts verified**:
1. [Alert 1 ticker]: confidence=[XX], source_fallback=false
2. [Alert 2 ticker]: confidence=[XX], source_fallback=false
3. [Alert 3 ticker]: confidence=[XX], source_fallback=false
4. [Alert 4 ticker]: confidence=[XX], source_fallback=false
5. [Alert 5 ticker]: confidence=[XX], source_fallback=false

### Phase 2: Fallback Injection (09:15–09:30)

[Paste observations from Phase 2 checklist above]

**Fallback sources used**:
- Cache: [COUNT]
- Yahoo: [COUNT]
- Domestic RSS: [COUNT]

**Sample alerts verified**:
1. [Alert 1 ticker]: confidence=[XX], source_fallback=true, fallback_source=cache, age=[X]min
2. [Alert 2 ticker]: confidence=[XX], source_fallback=true, fallback_source=yahoo
3. [Alert 3 ticker]: confidence=[XX], source_fallback=true, fallback_source=cache, age=[X]min
4. [Alert 4 ticker]: confidence=[XX], source_fallback=true, fallback_source=domestic_rss
5. [Alert 5 ticker]: confidence=[XX], source_fallback=true, fallback_source=cache

### Phase 3: Exhaustion + Escalation (09:30–09:45)

[Paste observations from Phase 3 checklist above]

**Escalation message** (from WORK channel):
```
[01-NEWS-SCOUT] VPS news pipeline exhausted. All retries + cache + fallback exhausted.
Failure reason: vps_exhausted_all_fallbacks
Last 3 errors:
  1. Primary timeout (30s)
  2. Cache empty
  3. Domestic RSS 503
Breaker state: open
Contact: architect team
```

**Agent status before recovery**:
- news-scout: status=degraded, failure_reason=vps_exhausted_all_fallbacks
- market-watcher: status=ok (unaffected by news failure)

### Phase 4: Auto-Recovery (09:45–10:00)

[Paste observations from Phase 4 checklist above]

**Recovery timeline**:
- 09:45: Circuit breaker injection removed
- 09:46: Primary VPS responding
- 09:47: First primary signal detected in audit log
- 09:48: Agent status transitions to "ok"

**Confidence recovery** (sample):
- VNM: fallback confidence=78 → primary confidence=98
- FPT: fallback confidence=73 → primary confidence=99
- BID: fallback confidence=81 → primary confidence=97

## All 10-Point Observation Checklist

- [✓] VPS health check endpoint returns state accurately
- [✓] Circuit breaker state propagates to all three agents within 30s
- [✓] Fallback router decision logged with reason code
- [✓] Confidence penalty (0.8075) applied consistently
- [✓] source_fallback=true present in all fallback signals
- [✓] Fallback tier (1/2/3) metadata logged
- [✓] Escalation message arrives in WORK channel <5s after exhaustion
- [✓] Agent status updates to "degraded" immediately on exhaustion
- [✓] Recovery to primary automatic (no manual trigger)
- [✓] No silent failures or missing signal_quality_audit entries

## Conclusion

All 15 acceptance criteria validated:
- AC-1 to AC-7: E2E test suite assertions ✓
- AC-8 to AC-10: Manual smoke test phases ✓
- AC-11 to AC-15: Edge case coverage ✓

**Recommendation**: APPROVE for production deployment.

---

**Signed**: [QA name] | **Date**: 2026-04-21 | **Time**: 10:15 UTC+7
```

---

## Success Criteria

- [ ] All 5 phases executed during Vietnam trading hours (09:00–15:00 UTC+7)
- [ ] All observations logged in checklist (100% coverage)
- [ ] `reports/SPRINT_REPORT_233.md` created with metrics + observations
- [ ] All 10-point checklist marked ✓ PASS
- [ ] No critical issues found (Phase 3 escalation expected; others nominal)
- [ ] Report signed with QA name + date

---

## Troubleshooting

| Issue | Diagnosis | Resolution |
|-------|-----------|-----------|
| MCP server won't start | Check Bun installation; verify launchctl service | `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` |
| signal_quality_audit empty | Audit logging not injected in 233b | Verify marketAnalysisJob.ts injection point; redeploy |
| Circuit breaker injection doesn't take | No HTTP/env endpoint for breaker | Manually modify Bun.env or mock in fetcher code |
| Alerts not reaching MARKET | Alert Commander not running | Check alert-commander process; restart if needed |
| Recovery doesn't trigger automatically | Agent loop may need manual trigger | Manually invoke next agent cycle via test harness |

---

## Next Steps

After report completion:
1. Commit `reports/SPRINT_REPORT_233.md` to git
2. Post summary to WORK channel: "SPRINT-233 manual test PASS"
3. Hand off to QA for review + merge to main
4. Archive sprint 233 in docs/TASKS_ARCHIVE.md
