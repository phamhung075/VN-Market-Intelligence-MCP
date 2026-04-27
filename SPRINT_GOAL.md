# Sprint Goal

## Sprint 1345 — News + Analysis Pipeline Hardening + Data Quality (2026-04-27)

**Status:** GREEN - Infrastructure + data quality sprint. Autonomous initiation by PO.

**Background:**
Sprint 1344 COMPLETE (7371 pass / 0 fail). BCTC pipeline recovered (1343), critical infrastructure bugs fixed (foreignFlow CB, python3). Remaining operational issues require hardening.

**Confirmed Open Issues (live verified 2026-04-27):**

1. **Reuters + Trading Economics Outage (HIGH)** — 50 consecutive failures (7h), news data pipeline stale. Impact: morning/evening briefing signal degradation.
2. **VNM/VEA BCTC Extraction Corruption (HIGH)** — Impossible financial figures (VNM: Assets 957T << Equity 18,829T; VEA: Operating margin 330%, Total Liab=0). PDF OCR quality issue or data corruption.
3. **Polymarket API Stale (MEDIUM)** — Markets data fetchedAt=2026-04-01 (26 days old). Prediction market alerts unreliable.
4. **VN-Index Cascade Incomplete (MEDIUM)** — Cascades only to VIC, no market-wide broadcast fix found. Sector alerts missing context.

**Vision:**
Harden news ingestion, validate BCTC extraction quality, restore stale external APIs, and fix cascade routing to prevent analysis pipeline degradation.

**Scope:**

| Task ID | Title | Layer | Size | Owner |
|---------|-------|-------|------|-------|
| 1345a | Reuters + TE fallback sources | Infrastructure | M | Ops/Developer |
| 1345b | BCTC extraction confidence audit | Domain/Test | M | Developer |
| 1345c | Polymarket staleness fix + fetch schedule | API | S | Ops |
| 1345d | VN-Index cascade breadth fix | Domain | S | Developer |
| 1345e | Integration test + dashboard validation | Test | S | QA |

**Success Metrics:**
- News pipeline has ≥2 fallback sources for Reuters + TE (no 7h blackouts)
- BCTC extraction reports confidence scores in logs; low-confidence (≤0.3) skipped with alert
- Polymarket refresh runs ≥2x daily; fetchedAt within 24h
- VN-Index cascade broadcasts to MARKET channel (not just VIC)
- All 7371 baseline tests pass; zero regressions

**Blockers:** None. Ready to spawn BA for spec.

**Next Agent:** BA (write requirement spec for SPRINT_GOAL.md)

---

## Retrospective: Sprint 1343–1344

**1343:** BCTC PDF pipeline recovery — watchlist restore (30 tickers), HOSE PDF discovery (multi-source), VPS skip endpoint, integration test. All merged 2026-04-27.

**1344:** Fix 9 pre-existing test failures (6536→7371 pass, 213→0 fail). Baseline elevated. All merged 2026-04-27.

Cumulative: 358 tasks completed, infrastructure stable.

---

**Decision Log:**
- Why not immediately repair Reuters/TE manually? → Root cause unclear (API outage vs. credential issue). BA spec will define investigation scope.
- Why BCTC audit vs. skip low-confidence? → Already skipping zero-confidence; need visibility into confidence distribution and extraction quality improvement.
- Why Polymarket staleness is MEDIUM not HIGH? → Prediction market is secondary signal; news + price are primary. But 26 days stale is unacceptable.
- Why cascade breadth in this sprint? → Related to data quality; small scope (S task) with high impact (market-wide alerts).

---

**Size Estimate:** M (10–12h: 2h TE investigation + fallback, 3h BCTC audit + reporting, 1h Polymarket fix, 1h cascade fix, 2h testing)

**Priority:** HIGH (news pipeline blackout, data integrity validation, stale external APIs)

**Dependencies:** None. Ready to proceed independently.
