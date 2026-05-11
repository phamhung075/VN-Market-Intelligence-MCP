# Unified Agent Notebook
Last updated: 2026-05-11 | Sprint: current

## This Session
Weekly verification cycle (20:01 UTC Sunday). Checked for digest-predict weekly — found calibration-report (ID 471, 13:00 UTC) as weekly content proxy. No digest-predict agent message found specifically, but weekly prediction data IS present. Observed 4 new BUG reports, logged without claiming.

## Patterns
- get_system_status EOF appearing as recurring failure (2 consecutive, flagged in BUG 2843) — may need ops investigation
- price_drop alert precision chronic: 50% vs 60% threshold, 2nd consecutive cycle (BUG 2844)
- BCTC OCR corruption pattern persisting: FPT and VNM Q4 both zero/near-zero confidence (BUG 2841, 2842)
- FII carry spread remains negative (-33bp VND) → sustained outflow risk for banking sector

## Carry-over
- Clarify: is `calibration-report` agent the same as `digest-predict`? Flow expects `digest-predict` but only `calibration-report` sends Sunday 13:00 weekly message
- BID: news impact (deposits -82,000B, FII selling) — monitor Monday open vs 42,000 VND support
- BUG 2843 (get_system_status EOF) and BUG 2844 (price_drop precision) unresolved — ops should claim

---

## Recent session — 2026-05-10 (20:01 UTC — weekly verification)

**Mode:** WEEKLY_VERIFY | **Trigger:** Sunday weekly flow

**Digest check:** No explicit digest-predict message. Found calibration-report (ID 471, 13:00 UTC) — Brier Score 0.1646, 3 resolved predictions. Treated as proxy. No escalation.

**BUG reports observed (DO NOT CLAIM — observe only):**
- 2841: FPT 2025-Q4 BCTC low confidence (0.10) — OCR corruption
- 2842: VNM 2025-Q4 BCTC low confidence (0.00) — OCR corruption
- 2843: get_system_status EOF (2 consecutive) — health step skipped
- 2844: price_drop precision 50% (8/16 < 60% threshold) — 2nd consecutive cycle

**Exit:** COMPLETE | Escalation: NONE | Next cycle hint: monitor BID Monday open.

### Daily Review (21:01 UTC)
- Mode: DAILY_REVIEW | Freshness: news STALE 2.5h (>2h limit, feedback submitted LOW) | prices STALE 60h (expected: weekend/closed)
- System: OK | Circuit breakers: all green | Rate-limit warns: vnstock BID/VDC (transient)
- Sources blocked: Reuters RSS, TradingEconomics (10 consecutive errors, known)
- Alerts 24h: 7 sent, 1 HIGH/CRITICAL, 0 unnotified
- News 24h: 10 articles — bullish bias (VN-Index targeting 2000, gold up)
- Bugs (new): 4
  - 2841: FPT 2025-Q4 BCTC low confidence (0.10) — OCR corruption suspicion
  - 2842: VNM 2025-Q4 BCTC low confidence (0.00) — OCR corruption (pre-existing)
  - 2843: get_system_status EOF — stale bug, system now OK (live probe passed)
  - 2844: price_drop precision 50% (8/16 < 60%) — 3rd cycle flagged
- Pending feedback: 24 items | Open high/critical warnings: 18
- Telegram WORK: summary sent ✅ | BUG channel: send failed (known: TELEGRAM_REPORT_BUG_CHANNEL_ID issue)
**Exit:** COMPLETE | Next: weekly flow Sun 23:30 UTC

### Daily Review (22:01 UTC)
- Mode: DAILY_REVIEW | Freshness: news STALE 3.5h (>2h, already flagged by #2845 at 21:03 UTC — not re-submitted) | prices STALE (weekend/closed, expected)
- System: OK (bootstrap probe passed; get_system_status EOF #2843 appears transient)
- Alerts 24h: 0 open
- News 24h: 10 articles — bullish bias (VN-Index targeting 2000, gold forecast up, HCMC stimulus)
- Bugs (new, observed — not claimed): 5
  - 2841: FPT 2025-Q4 BCTC low confidence (0.10) — OCR corruption suspicion
  - 2842: VNM 2025-Q4 BCTC low confidence (0.00) — OCR corruption
  - 2843: get_system_status EOF x2 — transient, system now OK
  - 2844: price_drop precision 50% (2nd cycle) — persistent low accuracy
  - 2845: news freshness >2h (already submitted by prior cycle)
- Telegram WORK: summary sent ✅ | BUG: observe only (not claimed/re-filed)
**Exit:** COMPLETE | Next: weekly verification Sun 23:30 UTC

### Daily Review (23:01 UTC)
- Mode: DAILY_REVIEW | Freshness: ok (news 0.2h ✅, BCTC 3.9h ✅, prices stale market closed = expected)
- System: OK (all 16 CBs clear, 0 open circuits)
- Alerts 24h: 7 total (1 HIGH/CRITICAL), 0 unnotified
- News 24h: 10 articles (6 important ≥9 score) — bullish bias (VN-Index targeting 2000, gold up, HCMC stimulus, banking deposit flows)
- Bugs (observed — not claimed/re-filed):
  - macro-refresh-job fatal connect error at 23:00 UTC
  - JSH: rate-limited x4 (cash_flow + stats exhausted)
  - MBB: rate-limited x4 (finance exhausted)
- Sources degraded: Reuters 18 failures, Trading Economics 18 failures (persistent, known)
- Pending feedback: 24 items | Open high/critical warnings: 18
- Telegram WORK: summary sent ✅
**Exit:** COMPLETE

### Weekly Verification (00:01 UTC)
- Mode: WEEKLY_VERIFY | Digest sent: yes (ID 473, calibration-report ID 471, sent 21:39 UTC Sun 10/05) | Sunday bugs: none (BUG channel empty)

## Cycle — 00:01 UTC

- **cycle_date**: 2026-05-11
- **findings**:
  - Weekly digest confirmed sent (ID 473, mcp-user proxy for digest-predict, 21:39 UTC Sun). Full weekly digest present with regime NEUTRAL, VN-Index +0.33%, FPT below stop-loss floor.
  - calibration-report also present (ID 471, Brier Score 0.1646, 3 resolved predictions — FPT bearish worst at 0.3969).
  - BUG channel empty — no Sunday bugs to observe.
- **actions**: Notebook appended. Git commit blocked (HEAD.lock stale — sandbox permission issue, file written via file tool).
- **next_cycle_hint**: Monitor BID open Monday (Âu Lạc +6% stake vs FII outflow pressure). FPT below stop-loss 74,679 — watch recovery or cut signal. price_drop precision 50% persistent — flag for calibration.
  Doc self-heal (blocked — flow files protected): `.claude/flows/unified-agent/weekly.md` step 1 — "from today" is ambiguous when trigger fires past midnight UTC; should read "from today or yesterday (Sunday) if trigger fires past midnight".
- **estimated_tokens**: 1500 (3 tool calls)

### Coordination Cycle (01:01–01:15 UTC)
- Mode: MARKET + PREDICTION_REVIEW | System: OK (all 16 CBs clear, D2D RATE_LIMITED WARN self-recovering) | Alerts: 5 (4 CRITICAL macro, 1 HIGH GAS) | Quality issues: 1 (price_drop 50% < 60% → feedback filed)
- Regime: NEUTRAL (last known from weekly 2026-05-10) | Tightening pressure signals: Brent +5σ extreme | Alignment: FPT=tech_export→TAILWIND (1.0) | Headwind exposure: 0%
- Portfolio: FPT only (-10.5%, 71,900 vs stop-loss 74,679) | VaR 95%: -1.5% normal | No conviction shifts ≥0.3
- Prediction review: 1 open market (China/Taiwan), 0 resolved → accuracy N/A
- Bugs: none new filed | Spam audit: SKIP (file inaccessible in sandbox)

## Cycle — 01:01 UTC

- **cycle_date**: 2026-05-11
- **findings**:
  - System OK: all 16 CBs clear, D2D RATE_LIMITED WARNs (self-recovering), Reuters/TE stopped (persistent known).
  - Portfolio: FPT -10.5% (71,900 VND), still below stop-loss floor 74,679. VaR 95% -1.5% (normal). Conviction 0.54 MODERATE → GIẢM BỚT unchanged.
  - Macro extremes: Brent 104.67 (+5σ at 23:30 cycle), Gold VN -5σ. GAS HIGH alert (geopolitical cooling/oil supply signal). Regime last known NEUTRAL with latent TIGHTENING pressure.
  - Prediction review: 1 open market, 0 resolved, accuracy N/A.
  - Quality: price_drop precision 50% → feedback [MEDIUM] filed via submit_feedback.
- **actions**: WORK telegram sent. Feedback submitted (price_drop accuracy). Notebook appended. Git commit blocked (HEAD.lock — sandbox permission issue).
- **next_cycle_hint**: FPT stop-loss 74,679 — watch if Monday open triggers cut signal. Brent oil extreme → watch for oil/energy sector rotation. GAS geopolitical alert: if Iran deal progresses, oil drop accelerates. BID Âu Lạc stake watch (FII outflow vs domestic anchor).
- **estimated_tokens**: 8000 (16 tool calls)

### Coordination Cycle (02:01–02:09 UTC)
- Mode: MARKET | System: OK (all 16 CBs clear, vnstock RATE_LIMITED ACB/MBB/TCB WARN normal market-open, Reuters/TE persistent down known) | Alerts: 7 open (4 CRITICAL macro Brent/Gold extreme, 2 HIGH GAS news, 1 MEDIUM VPB -6.98%) | Quality issues: 0 (alert accuracy N/A — 100% unknown, operational gap)
- Regime: UNKNOWN (get_macro_snapshot not in package) | Alignment: N/A | Headwind: N/A
- Portfolio: FPT only (-10.5%, 71,900 VND) | VaR 95%: -0.1% OK | No conviction shifts ≥0.3
- Bugs: git HEAD.lock (qa-responder, LOW, 13min — not stale yet) | Spam audit: SKIP (file too large for sandbox)

## Cycle — 02:01 UTC

- **cycle_date**: 2026-05-11
- **findings**:
  - System OK: 16 CBs clear. vnstock rate limits (ACB/MBB/TCB) normal during market open. Foreign flow fallback exhausted (early session, expected). BCTC 7h stale (off-hours, expected).
  - Macro extremes sustained: Brent 104.65 (+3.96σ), Gold 4702.9 (-3.89σ). GAS 2x HIGH news_mention (US-Iran, oil bullish). VPB -6.98% → recovered to -3.40% intraday.
  - Portfolio: FPT -10.5% unchanged. VaR -0.1% OK. Conviction MODERATE 0.54 → GIẢM BỚT. No shift ≥0.3.
  - No legal risk. No crisis signals. Supply chain stable (BDI 1,400 normal). Energy grid normal. Climate: heat risk May (IDC/KBC/GEG — not in portfolio).
  - Alert accuracy: 350 alerts all UNKNOWN (no scored outcomes) — operational gap not a bug.
  - Regime: UNKNOWN (get_macro_snapshot not in unified-agent package — set REGIME=UNKNOWN per anti-hallucination rule).
- **actions**: WORK telegram sent (clean cycle). Notebook appended. Git commit attempted.
- **next_cycle_hint**: Watch VPB at open — was -6.98%, recovered to -3.40%; determine if price_drop sustained or bounce. GAS: US-Iran developments drive oil direction. FPT stop-loss 74,679 still active concern. git HEAD.lock (qa-responder) — if still present at next cycle, escalate.
- **estimated_tokens**: 9000 (18 tool calls)
