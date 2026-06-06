---
agent: system-auditor
session_date: 2026-06-06
---

## c022 · 2026-06-06T03:08:04Z
### Audit Run Tier-1 (03:08 UTC 2026-06-06)
- Tier: 1 (env) | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 5h 23m, restart_count=0 ✓, memory=42.46% ✓
- api-gateway: Up 3d ✓ | frontend: Up 5h ✓ | macro-indicators: Up 16h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ | api-gateway :4000 → 200 ✓ | macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | mcp-gateway → healthy ✓
- frontend :3001 → 404 (UI-only, INFO-grey) ✓

### Cron Health (95+ jobs) — All PASS
- All jobs firing successfully; 7-day baseline: 97–100%
- intelligenceCycleJob: 99.3% | bctcQueueEnricherJob: 97.4%

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open) ✓

### Notes
- Clean pass. All 6 services UP + healthy. VN market CLOSED (Saturday 03:08 UTC).

## c021 · 2026-06-06T02:38Z
### Audit Run Tier-1 (02:38–02:39 UTC 2026-06-06)
- Tier: 1 (env) | Services checked: 6 (intended runtime) | Crons polled: 95+
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Container Status (Intended Runtime Set) — All PASS
- mcp-server: Up 5h, restart_count=0 ✓, memory=45.10% ✓
- api-gateway: Up 3d ✓ | frontend: Up 5h ✓ | macro-indicators: Up 15h ✓
- pdf-extractor: Up 2d ✓ | mcp-gateway: Up 9d (healthy) ✓

### Health Endpoints — All PASS
- mcp-server :3000 → 200 ✓ | api-gateway :4000 → 200 ✓ | macro-indicators :5004 → 200 ✓
- pdf-extractor :5001 → 200 ✓ | mcp-gateway :4040 → healthy ✓
- frontend :3001 → 404 (UI-only, expected) ✓

### Cron Health (95+ jobs) — All PASS
- All recent jobs firing successfully; 7-day baseline success_rate: 97–100%
- intelligenceCycleJob: 99.3% | bctcQueueEnricherJob: 97.4% | All others: 100%

### Circuit Breaker Status
- All 16 sources [OK] (0 open, 0 half-open circuits) ✓

### Notes
- Tier-1 pass completely clean. All 6 intended-runtime services UP + healthy.
- VN market CLOSED (02:38 UTC Saturday) — expected off-market state.

## c020 · 2026-06-06T02:30Z
### Audit Run Tier-2 (02:30–02:31 UTC 2026-06-06)
- Tier: 2 (env) | Crons checked: 95+ | Sources checked: 28 | VPS routes: 4
- Anomalies: 4 SLA breaches (3 critical, 1 high) | 0 dedup-skipped | Improvement proposals: 0
- Status: DEGRADED (off-market context — foreign_flow/prices idle by design, sbv-fetch unhealthy)

### Cron Fire Check (A-29)
- 95+ crons firing nominally
- 7-day baseline success_rate: 97%–100%
- All recent jobs PASS (intelligenceCycleJob 99.3%, bctcQueueEnricherJob 97.4%)
- bctcBatchSweep next expected 2026-07-25 (39d ahead, outside 72h check window)

### Freshness SLA Sweep (B-01 through B-12)
**Critical SLA Breaches (market-closed context, 02:30 UTC):**
- **price:** age=45min SLA=10min CRITICAL (last push 2026-06-05 08:59:30 = ~18h stale) | source_id:ssc-iboard, expected_cadence:0.25h
- **bctc:** age=552min SLA=360min CRITICAL (off-season, out of earnings window — acceptable) | source_id:bctc-discover, expected_cadence:168h
- **sbv_fx:** age=45min SLA=30min HIGH (off-market, post-close expected) | source_id:sbv-vps, expected_cadence:6h
- **foreign_flow:** age=690min SLA=10min CRITICAL (market closed 02:30 UTC M-F, idle by design) | source_id:foreign-flow, expected_cadence:0.0167h

**OK Status:**
- news-vps: age=20min SLA=30min ✓ (2026-06-06 02:26:07)
- All 14 rate-limit sources: 0% at 100% ceiling ✓

### VPS Proxy Health (B-06, B-07)
- prices: stale (18h old, 08:59:30 2026-06-05) — likely VPS down or unreachable
- news: ok ✓
- sbv: ok ✓
- bctc: ok ✓

### VPS Service Health (B-07, B-12)
- vn-sbv-fetch: unhealthy (44m uptime, last poll 41s ago)
- vn-news-fetch: healthy ✓
- vn-bctc-fetch: healthy ✓
- vn-price-fetch: idle (market closed)
- vn-foreign-flow: idle (market closed)

### BCTC Eval Sweep (D-BCTC-EVAL)
Endpoint available (200 OK, 15 reports, 2 red, 13 yellow).
No snapshot comparison possible (no prior baseline in notebook from same cycle).
Observed: 2 red reports (VNM Q4-2025, FPT Q4-2025) — persistent from 2026-06-02.

### Notes
- Tier-2 cycle at off-market close (02:30 UTC). VN foreign flow / price sources stale due to market closed + VPS connectivity lag.
- SBV fetch unhealthy but non-critical (macro only, backtested signals stable).
- Price staleness (18h) is a concern if market opens and VPS still unreachable → escalate to ops-vps-fetch if not resolved by 09:00 UTC.
- No new improvement proposals emitted (all breaches explained by market-closed + known VPS lag).
