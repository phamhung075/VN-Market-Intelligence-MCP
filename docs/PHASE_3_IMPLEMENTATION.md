# Phase 3: Full 30-Stock Rollout Implementation

**Timeline:** Week of 2026-04-29 (Mon-Fri, 5 trading days)

**Scope:** Enable all 30 ledger files for daily batch cycles

**Success Metric:** Zero data loss, 100% message delivery, conviction scores within expected ranges

---

## Pre-Launch Verification (Before Monday 2026-04-29)

### Checklist 1: Ledger Files Ready

```bash
# Count all 30 files
ls docs/analysis-briefs/*.md | wc -l
# Expected: 30

# Verify archive directory exists
[ -d docs/analysis-briefs/archive ] && echo "✓ Archive dir exists"

# Check all files have 5 sections
for ticker in VNM FPT VCB KDC VJC; do
  echo "=== $ticker ==="
  grep -c "## \[" docs/analysis-briefs/$ticker.md
  # Expected: 5 (Report Analyzer, News Scout, Market Watcher, Insider Tracker, Unified Agent)
done
```

### Checklist 2: Configuration Confirmed

```bash
# Check analysisMode is set
jq '.analysisMode' docs/data/project-stats.json
# Expected: "value_investor"

# Check briefingFilesCreated count
jq '.briefingFilesCreated' docs/data/project-stats.json
# Expected: 30

# Check Alert Commander has analysis_mode gate
grep -n "ANALYSIS MODE CHECK" cowork-workspace-team-claude-desktop/05-alert-commander.md
# Expected: found at line ~31-40
```

### Checklist 3: Agent Files Modified

```bash
# News Scout has BATCH 2 ENTRY section
grep -n "BATCH 2 ENTRY" cowork-workspace-team-claude-desktop/01-news-scout.md
# Expected: found

# Market Watcher has BATCH 4 EOD SUMMARY section
grep -n "BATCH 4 EOD SUMMARY" cowork-workspace-team-claude-desktop/04-market-watcher.md
# Expected: found

# Unified Agent has QUARTERLY SYNTHESIS section
grep -n "QUARTERLY SYNTHESIS" cowork-workspace-team-claude-desktop/unified-agent.md
# Expected: found

# Unified Agent has SPECIAL EVENT DETECTION section
grep -n "SPECIAL EVENT DETECTION" cowork-workspace-team-claude-desktop/unified-agent.md
# Expected: found
```

### Checklist 4: Test Suite Baseline Confirmed

```bash
cd apps/mcp-server
bun test 2>&1 | grep "Ran.*tests"
# Expected: "Ran 6740 tests across 616 files"
# (or 6520 pass + 213 fail on detailed run)
```

---

## Launch Configuration (Monday 2026-04-29)

### Step 1: Activate Cowork Agents

The cowork agents need to start their daily cycles. Depending on how they're scheduled:

**Option A: Manual Cowork Sessions (User-Triggered)**
```
User opens Claude Desktop and invokes agents:
- /news-scout → Runs Batch 2 at 05:00 UTC
- /market-watcher → Runs Batch 4 at 16:00 UTC
- /unified-agent → Runs quarterly syntheses at Q-end
```

**Option B: Automated Cowork Schedule (System-Driven)**
```
Server cron job at 01:00, 05:00, 08:00, 16:00 UTC sends:
  POST /cowork/invoke agent=news-scout
  POST /cowork/invoke agent=market-watcher
  POST /cowork/invoke agent=insider-tracker
  POST /cowork/invoke agent=unified-agent (if special event or quarterly)
```

**Confirm which option applies:**
```bash
# Check if cowork has scheduler integration
grep -r "cowork" .claude/knowledge/*.md | grep -i schedule
# or
grep -r "invoke.*agent" apps/mcp-server/src | head -5
```

### Step 2: Enable MARKET Channel Messaging

Confirm cowork agents can send to Telegram MARKET channel:

```bash
# Check agent files have send_telegram(channel="market", ...)
grep -n "send_telegram.*market" cowork-workspace-team-claude-desktop/04-market-watcher.md
# Expected: found (line ~150)

# Verify Telegram credentials loaded
grep "TELEGRAM_INFO_MARKET_GROUP_ID" .env
# Expected: non-empty
```

### Step 3: Monitor First Batch

**Monday 2026-04-29 at 01:00 UTC (08:00 VN):**

Check if Batch 1 runs successfully:
```bash
# Monitor agent memory session logs
ls -ltr docs/agent-memory/sessions/*market-watcher* | tail -1
# Should have entry for 2026-04-29

# Check for any errors
tail -50 docs/agent-memory/sessions/2026-04-29-market-watcher.md | grep -i "error"
# Expected: none
```

**Monday 2026-04-29 at 16:00 UTC (23:00 VN):**

Check Batch 4 (EOD summary):
```bash
# Check if MARKET messages sent
# (Look in Telegram MARKET channel for 30 messages)

# Check if ledger files updated
for ticker in VNM FPT VCB KDC VJC; do
  COUNT=$(grep -c "2026-04-29" docs/analysis-briefs/$ticker.md)
  echo "$ticker: $COUNT entries"
done
# Expected: 2+ entries per stock (Batches 1 + some others by end of day)
```

---

## Daily Monitoring (Week of 2026-04-29)

### Each Morning (After 08:00 UTC Market Open)

```bash
# Quick health check
echo "=== Ledger Growth Check ==="
for ticker in VNM FPT VCB KDC VJC; do
  YESTERDAY=$(date -d "1 day ago" +%Y-%m-%d)
  COUNT=$(grep -c "$YESTERDAY" docs/analysis-briefs/$ticker.md)
  echo "$ticker (yesterday): $COUNT entries"
done

# Check for write errors
echo "=== Error Check ==="
find docs/agent-memory/sessions -name "*.md" -mtime -1 -exec grep -l "ERROR\|FAILED" {} \;
# Expected: none
```

### Each Evening (After 16:00 UTC Market Close)

```bash
# Verify EOD messages sent
echo "=== MARKET Channel Messages ==="
# Check Telegram MARKET channel for today's EOD summaries
# Expected: 5-30 messages in format:
#   VNM — EOD (YYYY-MM-DD)
#   FPT — EOD (YYYY-MM-DD)
#   VCB — EOD (YYYY-MM-DD)
#   ... (up to 30 stocks)

# Verify ledger entries
echo "=== Ledger Entry Count ==="
TODAY=$(date +%Y-%m-%d)
for ticker in VNM FPT VCB KDC VJC; do
  COUNT=$(grep -c "$TODAY" docs/analysis-briefs/$ticker.md)
  echo "$ticker: $COUNT entries"
done
# Expected: 4-5 entries per stock (batches 1, 2, 3, 4)
```

### Weekly Summary (Friday 2026-05-03)

```bash
# Full week ledger growth
echo "=== Week 2026-04-29 to 2026-05-03 ==="
for ticker in VNM FPT VCB KDC VJC; do
  COUNT=$(grep "2026-04-2[9-9]\|2026-05-0[1-3]" docs/analysis-briefs/$ticker.md | wc -l)
  echo "$ticker: $COUNT entries"
done
# Expected: 20+ entries per stock (4-5 per day × 5 days)

# Check for any write failures
echo "=== Error Summary ==="
grep -r "write.*fail\|ERROR\|FAILED" docs/agent-memory/sessions/ | wc -l
# Expected: 0 (or minimal, <5 unrelated errors)

# Verify test suite still clean
cd apps/mcp-server && bun test 2>&1 | grep "Ran.*tests"
# Expected: same as baseline (6740 tests)
```

---

## Success Criteria (Advance to Phase 4)

### Must-Pass Criteria

✅ **Ledger Write Success:** 100% of expected entries written
- Expected: 4-5 entries per stock per day × 30 stocks × 5 days = 600-750 total entries
- Acceptable failure rate: <1% (6-7 entries max)

✅ **MARKET Message Delivery:** 90%+ of EOD messages sent
- Expected: 30 messages per day × 5 days = 150 total messages
- Acceptable failure rate: <10% (15 messages max failed)

✅ **Data Integrity:** No truncated or corrupted entries
- All entries include YoY/QoQ comparison format
- All entries have timestamp + context
- No duplicate entries

✅ **Conviction Scoring:** Scores within expected ranges
- Expected range: 1-10
- If special events occur, conviction should increase by 1-2 points
- No scores <1 or >10 (clamping)

✅ **Test Suite Baseline:** No regressions
- 6740 tests maintained
- 6520 pass / 213 fail (same as baseline)

### Should-Have Criteria

🟢 **Special Event Detection:** At least one detected during week
- Earnings release, policy change, or insider transaction
- Full 112-tool analysis triggered
- Message sent to MARKET with high-conviction context

🟢 **Agent Memory:** All sessions logged
- docs/agent-memory/sessions/2026-04-29-*.md through 2026-05-03-*.md
- Each agent has session record for each cycle

🟢 **Configuration:** analysisMode consistently value_investor
- No trader alerts to MARKET channel
- Only special events and daily summaries to MARKET

---

## Failure Scenarios & Recovery

### Scenario 1: Write Failures >5%

**Symptom:** Many stocks missing ledger entries after market close

**Investigation:**
```bash
# Check ledger file permissions
ls -la docs/analysis-briefs/*.md | head -5
# Expected: all readable/writable by current user

# Check disk space
df -h docs/analysis-briefs/
# Expected: >100 MB free

# Check for file locking
lsof docs/analysis-briefs/*.md 2>/dev/null | head -10
# Expected: none (if SQLite, may show locks)

# Check agent error logs
grep -r "write\|permission\|disk" docs/agent-memory/sessions/ | tail -10
```

**Recovery:**
1. Stop cowork agents (pause scheduled runs)
2. Check file system health
3. Re-verify directory permissions: `chmod 755 docs/analysis-briefs/`
4. Clear any stale locks: `lsof | grep analysis-briefs | awk '{print $2}' | xargs kill -9` (if safe)
5. Resume agents after verification

**Rollback if unrecoverable:**
```bash
git revert 36c044ae  # Undo Phase 2 test commit
git revert 3c1b7bea  # Undo Phase 1 merge
# Investigate root cause before Phase 3 retry
```

### Scenario 2: Message Delivery <90%

**Symptom:** MARKET channel missing EOD messages

**Investigation:**
```bash
# Check Telegram authentication
grep "TELEGRAM_.*MARKET" .env
# Expected: token and group ID present

# Check agent send_telegram logs
grep -r "send_telegram\|MARKET\|failed" docs/agent-memory/sessions/ | tail -20

# Check network connectivity
curl -s https://api.telegram.org/botTOKEN/getMe | jq .ok
# Expected: true
```

**Recovery:**
1. Verify Telegram token still valid (check Telegram bot admin)
2. Check network from VPS to Telegram (if geo-blocked)
3. Increase retry count in send_telegram logic
4. Verify MARKET group ID is correct

### Scenario 3: Conviction Scores Outside Range

**Symptom:** Scores <1 or >10, or stuck at single value

**Investigation:**
```bash
# Check conviction calculation in unified-agent.md
grep -A 30 "CONVICTION SCORE\|conviction.*formula" cowork-workspace-team-claude-desktop/unified-agent.md

# Check actual scores in ledger
grep "CONVICTION\|conviction" docs/analysis-briefs/VNM.md
# Look for pattern (should vary based on signals)

# Check which signals are firing
grep -r "Fundamentals\|Sentiment\|Technical\|Insider\|Macro\|Kinh_Dich" docs/analysis-briefs/ | head -20
```

**Recovery:**
1. Verify formula in unified-agent.md matches specification
2. Check if special events are being detected (triggers higher scores)
3. If all scores identical: formula likely broken, fix and re-run
4. If scores clustering at extremes: adjust weighting factors

### Scenario 4: Agent Memory Not Logged

**Symptom:** Missing session files in docs/agent-memory/sessions/

**Investigation:**
```bash
# Check if agents are writing session logs
ls -ltr docs/agent-memory/sessions/ | tail -20

# Check for agent invocation errors
grep -r "session.*fail\|log.*fail" docs/agent-memory/ | head -10

# Verify MCP memory tools are available
grep -r "append_session_record\|update_memory" .claude/knowledge/mcp-tools.md
```

**Recovery:**
1. Ensure agents are calling `append_session_record()` after each cycle
2. Check MCP server health: `curl http://localhost:3000/health`
3. Verify database connectivity for memory storage
4. Manual fallback: agents log to WORK channel if memory write fails

---

## Sign-Off Criteria (Phase 4 Ready)

When all 5 days complete, verify:

```bash
# Final ledger check
echo "=== Final Ledger Report ==="
ENTRY_TOTAL=0
for ticker in {VNM,FPT,VCB,KDC,VJC,BID,SHB,EIB,VHM,VIC,KBC,HUT,DIG,DXG,KDH,PDR,NVL,VRE,HPG,MSN,FRT,SAB,DPM,SSI,VIX,VND,VCI,DGC,VJC,GEX,BSR}; do
  COUNT=$(grep -c "2026-04-2[9-9]\|2026-05-0[1-3]" docs/analysis-briefs/$ticker.md 2>/dev/null || echo 0)
  ENTRY_TOTAL=$((ENTRY_TOTAL + COUNT))
done
echo "Total entries (30 stocks × 5 days): $ENTRY_TOTAL"
echo "Expected: 600-750 (4-5 per stock per day)"

# Final error check
echo "=== Error Summary ==="
ERROR_COUNT=$(grep -r "ERROR\|FAILED\|write.*fail" docs/agent-memory/sessions/ 2>/dev/null | wc -l)
echo "Error lines found: $ERROR_COUNT"
echo "Acceptable: <10"

# Final test check
echo "=== Test Suite Check ==="
cd apps/mcp-server && bun test 2>&1 | grep "Ran.*tests"
```

**Sign-Off Document:**
```markdown
# Phase 3 Sign-Off Report (2026-05-03)

## Results

- **Ledger Growth:** ✅ 750 total entries (all 30 stocks, 5 days)
- **Message Delivery:** ✅ 147/150 EOD messages (98%)
- **Data Integrity:** ✅ All entries properly formatted
- **Conviction Scoring:** ✅ Scores varied 1-10 as expected
- **Test Suite:** ✅ 6740 tests, no regressions

## Issues Found & Resolved

1. [Issue description] → [Resolution]
2. [Issue description] → [Resolution]

## Recommendation

✅ **APPROVED to proceed to Phase 4 (Quarterly Archives)**

Next milestone: Quarterly archive automation at 2026-06-30 (Q2 end)
```

---

## Phase 4: Quarterly Archives (2026-06-30)

Once Phase 3 succeeds, Phase 4 is automatic:

```
2026-06-30 (First day of Q3):
  Unified Agent (post-Q2-synthesis):
    1. Read all entries from Q1-Q2 (Jan 1 → Jun 30)
    2. Copy to: docs/analysis-briefs/archive/TICKER-2026-Q1-Q2.md
    3. Delete from active file (keep Q3-Q4 only)
    4. Update active file header with archive link

Result: Active files shrink from 180 days to 90 days
Database: Daily rotation prevents unbounded growth
```

---

## Runbook Summary

| Phase | Timeline | Scope | Go/No-Go |
|-------|----------|-------|----------|
| Phase 1 | 2026-04-25 | Infrastructure (30 ledgers + 4 agents) | ✅ DONE |
| Phase 2 | 2026-04-26 | Top-5 testing (5 stocks, 1 day) | ✅ DONE |
| **Phase 3** | **2026-04-29 to 05-03** | **30-stock rollout (5 days)** | **→ IN PROGRESS** |
| Phase 4 | 2026-06-30 | Quarterly archives + consolidation | PENDING |
| Phase 5 | Q-end quarterly | Unified Agent syntheses | ONGOING |

---

## Questions to Answer Before Launch

1. **Cowork Automation:** Are agents auto-scheduled or manually invoked?
   - If auto: what's the cron schedule?
   - If manual: how does user trigger daily runs?

2. **Telegram Access:** Is MARKET channel group ID confirmed?
   - Can test message be sent? `curl POST to Telegram API`

3. **Database:** Is SQLite WAL checkpoint running daily?
   - Prevents unbounded WAL growth as we write thousands of entries

4. **Permissions:** Are all 30 ledger files user-writable?
   - Check: `touch docs/analysis-briefs/VNM.md` (should succeed)

5. **Monitoring:** Is there a dashboard or should we monitor manually?
   - Option A: User checks Telegram MARKET channel daily
   - Option B: Automated dashboard script (could create)
   - Option C: Agent memory sessions auto-reported to WORK channel

---

**Phase 3 Status:** Ready to launch Monday 2026-04-29
**Launch Checklist:** See "Pre-Launch Verification" section above
**Monitoring Guide:** See "Daily Monitoring" section above
**Success Criteria:** All 5 "Must-Pass" criteria above
