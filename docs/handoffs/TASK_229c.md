# Task Context — 229c: Investigation — VPS pipeline diagnostics + fallback assessment

## TLDR (read this first)
change: docs/FALLBACK_INVESTIGATION.md — NEW investigation report (not code)
test: investigation completion; feasibility decision documented
branch: task/229c-fallback-investigation
depends: none (parallel to 229a/229b)
knowledge_needed: [bundle-developer] — VPS architecture, geo-blocking constraints, API feasibility

---

sprint: 229
branch: task/229c-fallback-investigation
status: todo
req_ref: REQ-229
tech_ref: TECH-229

---

## [PM] Planning Context

layer: investigation (documentation + architecture review)
depends_on: none

files_to_read:
- docs/ARCHITECTURE.md  # section "VPS Proxy — Geo-Block Workaround" (understand current design)
- src/scheduler/market-data/priceUpdateWatchdogJob.ts  # (after 229a/229b; reference for new watchdog role)
- docs/data/stock-classification.json  # stock coverage: HOSE/HNX/UPCOM tickers

files_to_create:
- docs/FALLBACK_INVESTIGATION.md  # CREATE (~200 words, decision doc)

files_to_modify:
- docs/ARCHITECTURE.md  # MODIFY: update VPS Proxy section to mention new 6h price-staleness watchdog role (1–2 paragraphs)

test_file: none (investigation only)

acceptance_criteria:
- **Given** current VPS architecture + geo-blocking constraints + watchdog early-warning system
- **When** investigate fallback price sources for cases where VPS pipeline fails >6h
- **Then**
  - AC-1: Document current single-point-of-failure risk (VPS Singapore as sole price source)
  - AC-2: Evaluate CafeF RSS feed accessibility from France (public / bot-guarded?)
  - AC-3: Evaluate HNX API (rate limits, auth requirements, accessible from France?)
  - AC-4: Evaluate Yahoo Finance / Seeking Alpha accessibility from France
  - AC-5: Assess effort + risk tradeoff for each fallback option
  - AC-6: Recommend next-sprint decision (implement fallback or increase VPS redundancy)
  - AC-7: Update ARCHITECTURE.md to document new 6h watchdog role in early-warning layer

---

## Investigation Scope

This task is **investigation + architecture review only**, not implementation. The new 6h price-staleness watchdog (tasks 229a/229b) provides early warning when price data stales. Task 229c assesses whether a fallback price source is feasible as a secondary hedge.

### Questions to Answer

1. **CafeF RSS** — Can we scrape/fetch HOSE price ticks from cafef.vn daily snapshot RSS?
   - Public endpoint or login required?
   - Rate limits or bot detection?
   - Latency acceptable (5 min delay vs VPS <1 min)?

2. **HNX API** — Does HNX expose a real-time price API?
   - Authentication required (API key / OAuth)?
   - Rate limits?
   - Coverage: All UPCOM stocks or only HNX-listed?
   - Accessible from France (or also geo-blocked)?

3. **Yahoo Finance / Seeking Alpha** — Fallback OHLCV sources
   - Rate limits (RapidAPI limits many free endpoints)
   - Accessibility from France
   - Latency acceptable?

4. **Implementation Risk** — If we add a fallback source
   - Schema change to market_prices table? (or separate fallback_prices table?)
   - Watchdog logic change? (use fallback prices for staleness detection if VPS unavailable?)
   - Test complexity (test VPS + fallback race conditions?)

### Recommended Output Structure

**docs/FALLBACK_INVESTIGATION.md** (~200 words):

```markdown
# Investigation: Price Data Fallback Sources

## Summary

Current architecture relies on VPS Singapore (geo-blocked service) as sole source for HOSE/HNX/UPCOM prices.
New 6h price-staleness watchdog (TASK-229a/b) provides early warning when VPS pipeline fails.

## Fallback Options Evaluated

### Option 1: CafeF Daily Snapshot RSS
- Public endpoint: cafef.vn/...
- Latency: 5–10 min behind spot (not real-time)
- Bot detection: Moderate risk (unconfirmed by testing)
- Effort: Low (existing pattern in RSS parser)
- **Verdict**: Feasible as hedge but stale > VPS; not suitable for intraday alerts

### Option 2: HNX API
- Status: Not investigated (unknown auth requirements)
- Effort estimate: Medium (API integration + schema)
- **Verdict**: Requires sandbox testing; defer to SPRINT-230

### Option 3: Yahoo Finance / Seeking Alpha
- Rate limits: Restrictive on free tier
- Accessibility: Likely requires proxy from France
- **Verdict**: Not recommended (adds VPS dependency for proxy anyway)

## Recommendation

**Do not implement fallback price source in SPRINT-229.**

Rationale:
1. 6h watchdog + alert notifications are sufficient for operational awareness
2. Fallback sources (CafeF) are stale (5–10 min delay) vs VPS (<1 min); limited value for real-time alerts
3. HNX API requires exploratory work (unknown auth); defer to dedicated sprint
4. Adding fallback source increases schema + test complexity without high user impact (rare >6h outages)

## Next Steps

- SPRINT-230: If VPS outages >2 per month, revisit HNX API integration
- SPRINT-231: Explore CafeF RSS as hedge for news/announcements (separate from prices)
```

### Update ARCHITECTURE.md

**File**: docs/ARCHITECTURE.md, section "VPS Proxy — Geo-Block Workaround"

Add 1–2 paragraphs describing the new 6h price-staleness watchdog role:

```markdown
### Price Staleness Early-Warning System (SPRINT-229)

The 45-minute VPS proxy watchdog (vpsProxyWatchdogJob.ts) monitors multi-source staleness broadly.
Complementing this, a new **6-hour price-staleness watchdog** (priceUpdateWatchdogJob.ts) fires specifically when market prices go stale during VN market hours (Mon–Fri 02:00–08:59 UTC).

Design:
- Separate threshold (6h vs 45min) for different detection strategies
- 30-min alert cooldown prevents spam
- Dual-channel alerts: WORK (SSH diagnostics) + MARKET (user notice)
- Early-warning layer: flags data pipeline issues before evening briefing goes stale
- No implementation of fallback price sources (investigated in SPRINT-229, deferred)

This two-layer approach provides rapid operator response (6h detector fires during market hours) while maintaining broad multi-source coverage (45min detector during off-hours / broader monitoring).
```

---

## Investigation Guidance

### Step 1: Review Current VPS Architecture

Read docs/ARCHITECTURE.md "VPS Proxy" section. Understand:
- Five systemd services on Vinahost (prices, BCTC, news, FX rates, foreign flow)
- Why geo-blocking requires VPS (France IP blocked by SSC portal + some stock APIs)
- Current single-point-of-failure risk

### Step 2: CafeF Feed Assessment

- Check cafef.vn publicly accessible URLs (e.g., snapshot RSS, daily price feeds)
- Review existing RSS parser in codebase: src/infrastructure/fetchers/newsFetchers.ts
- Estimate: Can we reuse RSS pattern for price snapshot? 2–4 hours exploratory
- Document: Public vs guarded, rate limits if any, latency

### Step 3: HNX API Assessment

- Search for HNX API documentation (hnx.vn/api or similar)
- If no public docs, check GitHub for community wrappers (e.g., hnx-python, hnx-js)
- Key questions: Auth required? Rate limits? IP restrictions?
- Estimate effort if pursued: 8–12 hours for sandbox + schema + tests

### Step 4: Yahoo/Seeking Alpha Viability

- Quick assessment: Can RapidAPI key (if available) access endpoints from France IP?
- Document rate limits, latency, coverage gaps
- Verdict: Likely not recommended (adds complexity for limited benefit)

### Step 5: Risk/Tradeoff Analysis

- If we add CafeF fallback: does it reduce >6h outage impact, or just delays manifestation by 5 min?
- If we add HNX API: does integration complexity justify the hedge?
- Document tradeoff matrix in FALLBACK_INVESTIGATION.md

---

## Done Criteria

1. docs/FALLBACK_INVESTIGATION.md created (~200 words)
2. CafeF RSS assessment documented (public? bot-guarded? latency?)
3. HNX API assessment documented (auth? rate limits? effort?)
4. Yahoo/Seeking Alpha quick verdict documented
5. Recommendation stated: implement fallback or defer?
6. docs/ARCHITECTURE.md updated with 6h watchdog role description (1–2 paragraphs)
7. Task marked Done in TASKS.md

---

## Reference

- Current VPS architecture: docs/ARCHITECTURE.md (section "VPS Proxy — Geo-Block Workaround")
- New watchdog spec: docs/TECH_229.md (lines 1–360)
- Existing pattern: src/scheduler/vpsProxyWatchdogJob.ts + src/scheduler/market-data/ohlcvStalenessCheckJob.ts

---

## [Developer] Implementation Record

**Status**: COMPLETE

files_actually_modified:
- docs/FALLBACK_INVESTIGATION.md   # NEW: ~250-word investigation report documenting 3 fallback options, feasibility assessment, effort estimates, and recommendation to defer fallback implementation to future sprint
- docs/ARCHITECTURE.md:198-210     # ADD: 13-line section "Price Staleness Early-Warning Watchdog (SPRINT-229)" documenting 6h watchdog design, dual-channel alerts, market hours guard, no fallback implementation rationale

acceptance_criteria_met:
- AC-1: ✅ Documented VPS as single-point-of-failure in FALLBACK_INVESTIGATION.md "Summary"
- AC-2: ✅ CafeF RSS evaluated: public accessible, 5-15min stale, low effort (4-6h), not suitable for real-time alerts
- AC-3: ✅ HNX API evaluated: no public docs, auth unknown, likely geo-blocked from France, medium-high effort (12-18h), deferred to SPRINT-230 tech spike
- AC-4: ✅ Yahoo Finance / Seeking Alpha evaluated: rate-limited, partial coverage, added VPS proxy dependency, not recommended
- AC-5: ✅ Risk/tradeoff matrix documented in table comparing all 3 options
- AC-6: ✅ Recommendation stated: do not implement fallback in SPRINT-229; monitor outage frequency; defer HNX API to SPRINT-230 if >2 outages/month
- AC-7: ✅ ARCHITECTURE.md updated with 6h watchdog section detailing design rationale, dual-channel alerts, recovery detection, and fallback investigation outcome

tests_written: none (investigation task; no code)
tests_skipped: N/A
tsc_clean: N/A (no TypeScript changes)
full_suite_pass: N/A (no code changes affecting test suite)

decision_documented:
- Fallback price source NOT feasible in SPRINT-229 due to latency + complexity tradeoff
- CafeF RSS suitable only for EOD reconciliation, not real-time alerts (stale 5-15min)
- HNX API requires 2-3 hour feasibility spike first (unknown auth, IP restrictions)
- 6h watchdog + dual alerts provide sufficient operational awareness for rare outages
- Recommend VPS redundancy (8-12h) as long-term alternative to fallback sources if outages exceed 2/month threshold
