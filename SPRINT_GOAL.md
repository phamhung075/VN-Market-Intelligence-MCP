# Sprint Goal

## Sprint 1343 — BCTC PDF Pipeline Recovery (2026-04-26)

**Status:** RED - Critical operational blocker. Initiated by ops diagnostic.

**Critical Issues (ops 2026-04-26):**

1. **HOSE Portal React SPA Migration** — PDF discovery returns 0 results for all HOSE-listed tickers (BID, EIB, FPT, VCB, HPG, VNM, etc.). The old direct-URL pattern no longer works.
2. **VPS Skip Feedback Loop Broken** — `fetch-bctc.sh` on VPS never reports SKIP (PDF not found) back to MCP → `bctc_vps_queue.attempts` stays 0 → infinite retry loop every 6h with zero output.
3. **Watchlist Data Loss** — Post-microservices migration: only 2 tickers in DB (FPT, VCB) vs. 30 before. 28 tickers missing Q4/2025 reports.
4. **Missing Q4 Reports** — 28 tickers have no 2025 Q4 financial data (critical for value-investor analysis mode).

**Vision:**
Restore the BCTC financial data pipeline to full operational capacity. Enable value-investor analysis system (Sprint 1336) to function with complete watchlist coverage and current financial reports.

**Scope:**

| Task ID | Title | Layer | Size | Owner |
|---------|-------|-------|------|-------|
| 1343a | Watchlist restore + Q4 backfill | DB/CLI | S | Developer |
| 1343b | HOSE PDF discovery fix (RED tests) | Domain/Test | S | Developer |
| 1343c | HOSE PDF discovery fix (implementation) | Fetcher | M | Developer |
| 1343d | VPS skip endpoint + fetch-bctc.sh update | API/Ops | S | Developer |
| 1343e | Integration test + QA | Test | S | QA |

**Success Metrics:**
- Watchlist has 30 tickers in DB (restored from migration loss)
- HOSE PDF discovery returns valid URLs for BID, EIB, FPT, VCB, HPG, VNM, etc. (7 test cases)
- `bctc_vps_queue.attempts` increments on SKIP events (POST `/api/bctc-skip` called)
- All 30 tickers have Q4/2025 reports fetched via BCTC + VPS pipeline
- No infinite retry loops in logs (attempt count properly tracks)

**Blockers:** None. Ready to spawn developer.

**Next Agent:** Developer (execute 1343a–1343d in parallel, then QA for 1343e)

---

## Retrospective: Sprint 1338–1342

**1338:** Documentation cleanup — 359 stale handoff docs deleted, knowledge references updated.

**1339:** PriceConfirmation catalyst correlation fields — RED tests + GREEN implementation (market-data microservice).

**1340:** (Current) Awaiting sprint initialization.

**1341a–1341b:** Catalyst context fields + UrgentNews signal type.

**1342a–1342b:** DB integrity check job (RED + GREEN phases).

All merged to main. Baseline stable: 6520 pass / 213 fail.

---

**Decision Log:**
- Why not cafef.vn or vietstock.vn as fallback? → Prefer SSC API if available; fallback sources added in 1343c if needed.
- Why restore 30 tickers vs. audit missing ones? → Ops dashboard shows 30-ticker baseline was intentional (user watchlist). Restore from git history or config.
- Why POST /api/bctc-skip not retry in fetch-bctc.sh? → Skip endpoint marks status='skipped' so fetch-bctc.sh doesn't loop on that ticker again.

---

**Size Estimate:** M (8–10h total: 1h watchlist restore, 2h PDF discovery RED, 2–3h discovery implementation, 1h VPS endpoint, 1h integration test + QA)

**Priority:** CRITICAL (data pipeline broken, value-investor system non-functional, 28 tickers stale)

**Dependencies:** None. No blockers on other sprints.
