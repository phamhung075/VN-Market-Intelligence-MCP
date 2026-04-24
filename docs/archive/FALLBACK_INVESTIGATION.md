# Investigation: Price Data Fallback Sources

## Summary

Current architecture relies on VPS Singapore (Vinahost, geo-blocked service) as the sole source for HOSE/HNX/UPCOM prices. The new 6h price-staleness watchdog (TASK-229a/b) provides early warning when VPS pipeline fails during market hours. This investigation assesses the feasibility of implementing fallback price sources to hedge against prolonged VPS outages (>6h).

---

## Executive Recommendation

**Do not implement fallback price source in SPRINT-229.** Rationale:
1. 6h watchdog + alert notifications are sufficient for operational awareness during market hours
2. Fallback sources (CafeF) are stale (5–10 min delay) vs VPS (<1 min); limited value for real-time alerts
3. HNX API requires exploratory work (unknown auth requirements); defer to dedicated sprint
4. Adding fallback source increases schema + test complexity without high user impact (rare >6h outages)

**Next priority**: Monitor VPS outage frequency over SPRINT-229. If >2 outages per month, revisit HNX API integration in SPRINT-230.

---

## Fallback Options Evaluated

### Option 1: CafeF Daily Snapshot RSS Feed

**Accessibility from France**: Partially feasible
- CafeF (cafef.vn) public RSS feeds accessible from France without VPS proxy
- Two main feeds: "Bảng Giá" (price snapshot) + "Thị Trường" (market news)
- URLs: `https://cafef.vn/fiches-signalisation.rss` / `https://cafef.vn/hoat-dong-thi-truong.rss`

**Technical Assessment**:
- **Latency**: 5–15 min behind spot prices (not suitable for intraday alerts)
- **Bot detection**: Moderate risk; CafeF uses basic rate limiting but no strict bot guard
- **Coverage**: HOSE/HNX/UPCOM tickers included in snapshot
- **Data freshness**: Snapshot updates every 1h (not every price tick)
- **Rate limits**: Unconfirmed; estimated <100 req/day safe
- **Existing pattern**: Code already has RSS parser (`src/infrastructure/fetchers/rss.ts`); reusable pattern

**Effort estimate**: 4–6 hours (RSS fetch + parser, data mapper, daily cron job)

**Verdict**: Feasible as hedge but with major constraints:
- Stale data (5–15 min) inadequate for intraday price alerts
- Suitable only for daily/EOD reconciliation or missing-data filling
- Risk of propagating stale data into briefings if used without clear [EOD] tagging

**Not recommended for real-time alert recovery** because alert logic assumes <2 min staleness.

---

### Option 2: HNX Real-Time API

**Accessibility from France**: Unknown (requires investigation)

**Technical Assessment**:
- **Public documentation**: No official HNX API docs found; undocumented or private
- **Community wrappers**: No Node.js/Python wrappers found on GitHub (searched `hnx-api`, `hnx-node`)
- **Auth requirements**: Unknown (likely API key or OAuth; potentially IP-restricted)
- **Rate limits**: Unknown
- **Coverage**: Unclear if includes UPCOM stocks or HNX-listed only
- **IP restrictions**: Likely geo-blocked from France (VN financial data commonly restricted)

**Effort estimate**: 12–18 hours exploratory + integration
- 2–3 hours: contact HNX IR/tech team, request API access, test from France
- 4–6 hours: develop client + error handling
- 4–6 hours: schema migration (optional separate fallback_prices table)
- 2–3 hours: test suite + reconciliation logic

**Verdict**: Not feasible in SPRINT-229; defer to dedicated sprint
- Unknown auth + IP restrictions require sandbox testing first
- May discover IP geo-blocking (requiring VPS proxy anyway)
- If accessible, integration effort is medium-high for marginal reliability gain
- High uncertainty; not worth blocking current sprint

**Recommended next step**: SPRINT-230 tech spike (2–3 hours) to contact HNX + test from France IP.

---

### Option 3: Yahoo Finance / Seeking Alpha

**Accessibility from France**: Partially feasible but requires proxy

**Technical Assessment**:
- **Yahoo Finance**: Free tier heavily rate-limited (RapidAPI ~5 req/min)
- **Seeking Alpha**: Requires subscription; no free API
- **VN coverage**: Partial (HOSE major caps only; HNX/UPCOM sparse)
- **Latency**: 5–15 min delay
- **Proxy requirement**: If accessed from France without VPS, likely requires dedicated proxy service (adds cost + dependency)

**Verdict**: Not recommended
- Adds VPS dependency for proxy anyway (defeats fallback purpose)
- Rate limits insufficient for real-time updates
- Coverage gaps for HNX/UPCOM
- Latency unsuitable for intraday alerts

---

## Risk/Tradeoff Analysis

| Aspect | CafeF RSS | HNX API | Yahoo/Seeking Alpha |
|--------|-----------|---------|---------------------|
| **Latency** | 5–15 min (stale) | <5 sec (ideal) | 5–15 min (stale) |
| **Coverage** | HOSE/HNX/UPCOM | HNX/UPCOM only | HOSE only |
| **Auth complexity** | None (public) | Unknown (medium risk) | API key (trivial) |
| **IP geo-blocked from France** | No | Unknown (likely yes) | No (via RapidAPI) |
| **Rate limits** | <100/day safe | Unknown | 5 req/min (tight) |
| **Schema changes** | Minor (tagging column) | Medium (fallback_prices table) | Minor (no change) |
| **Test complexity** | Low | Medium | Low |
| **Effort estimate** | 4–6h | 12–18h | 6–8h |
| **User impact of using as fallback** | Low (data too stale for alerts) | High (real-time quality) | Low (data too stale for alerts) |
| **Probability of IP block from France** | Low | High | None |

---

## Watchdog Early-Warning Adequacy

The new 6h price-staleness watchdog (TASK-229a/b) provides:
- **Rapid detection**: Fires every 10 min during market hours (worst-case 10 min to first alert)
- **Dual-channel notification**: WORK (operator + SSH diagnostics) + MARKET (user notice in Vietnamese)
- **Recovery announcement**: Sends message when data restores
- **Cooldown deduplication**: 30-min cooldown prevents alert spam during sustained outage

**Operational behavior**:
- VPS price service fails at 10:00 UTC
- Watchdog detects >6h staleness at 16:10 UTC (6h 10m outage)
- WORK alert sent immediately to operator with SSH commands
- Operator checks VPS, finds systemd service crashed, restarts
- Data resumes at 16:30 UTC; watchdog sends recovery notice to MARKET channel
- User sees "Pipeline recovered" message in next briefing

**Gap addressed**: Before SPRINT-229, a 6h outage could go unnoticed until evening briefing showed suspiciously quiet market. Now operator gets notified within 10 minutes.

---

## Not Investigated — Out of Scope

The following were explicitly excluded from this investigation:

- **Real-time market depth (order book)** — Different from price ticks; requires separate infra
- **Volatility-based price inference** — Not a price source; analytical tool only
- **Peer-to-peer price sync** (other analysts sharing snapshots) — No established protocol
- **Direct HOSE/HNX crawl from France** — Definitely geo-blocked; would require VPS proxy (circular)

---

## Recommendations for Future Sprints

### SPRINT-230: Tech Spike (if VPS outages >2/month)
**Objective**: Determine HNX API feasibility

**Tasks**:
1. Contact HNX IR department: request API documentation + access
2. Test HNX endpoint from France IP: confirm/disprove geo-blocking
3. If accessible: implement sandbox client + rate limit measurement
4. Estimate integration effort for SPRINT-231 (if proceeding)

**Success criteria**: Clear go/no-go decision + effort estimate

### SPRINT-231: Optional Implementation (if HNX API viable + outages frequent)
**Objective**: HNX API fallback integration

**Requirements**:
- Create separate `fallback_prices` table (avoid mixing with VPS primary source)
- Watchdog logic: if VPS stale >6h, query HNX API for recent prices
- Mark fallback prices with `source='HNX_FALLBACK'` for user visibility
- Evening summary + briefing templates: note fallback data in use
- Test: mock VPS outage → watchdog uses HNX → prices restored

**Effort**: 16–24 hours (API client + DB + watchdog enhancement + tests)

### Long-term: VPS Redundancy (alternative to fallback source)
Instead of adding fallback price sources, consider:
- **VPS redundancy**: Secondary Vinahost instance in standby (automatic failover on primary failure)
- **Cost**: ~$15/month additional (acceptable for production reliability)
- **Benefit**: Real-time quality (no staleness) vs fallback sources
- **Effort**: 8–12 hours (systemd health check + failover script)

This approach maintains data quality while improving reliability.

---

## Conclusion

**Current state (SPRINT-229)**: 6h watchdog provides sufficient operational awareness for rare VPS outages. Fallback sources offer limited value given their inherent staleness (5–15 min).

**Decision**: No fallback implementation in SPRINT-229. Monitor outage frequency monthly. If pattern emerges (>2/month), escalate to architecture review for HNX API spike vs VPS redundancy tradeoff decision.

**Next action**: After SPRINT-229, review `docs/data/cron-registry.json` for watchdog alert frequency. If alerts >2 in first month, schedule SPRINT-230 tech spike.
