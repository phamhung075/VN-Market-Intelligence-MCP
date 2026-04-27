# Task: BA-1345 — Requirement Spec for Sprint 1345

**Status:** Pending
**Owner:** BA (Business Analyst)
**Priority:** HIGH
**Date Initiated:** 2026-04-27

---

## Context

**Previous Sprint Outcome:**
Sprint 1344 (2026-04-27) completed: Fixed 9 pre-existing test failures (6536→7371 pass, 213→0 fail). All merged. BCTC PDF pipeline recovered in Sprint 1343.

**Current Operational Status:**
Infrastructure baseline stable. Remaining operational issues require hardening to prevent pipeline degradation.

---

## Vision (from SPRINT_GOAL.md)

Harden news ingestion, validate BCTC extraction quality, restore stale external APIs, and fix cascade routing to prevent analysis pipeline degradation.

---

## Confirmed Open Issues (live verified 2026-04-27)

### Issue 1: Reuters + Trading Economics Outage (HIGH)
- **Symptom:** 50 consecutive failures over 7 hours
- **Impact:** News data pipeline stale; morning/evening briefing signal degradation
- **Scope:** Investigation + fallback source implementation
- **Questions for BA spec:**
  1. Root cause: API outage vs. credential/auth issue vs. rate limit?
  2. Which fallback sources should be primary? (newsapi.org? finnhub? marketwatch? other?)
  3. Fallback SLA: how long until we should downgrade to secondary source?

### Issue 2: VNM/VEA BCTC Extraction Corruption (HIGH)
- **Symptom:** Impossible financial figures (VNM: Assets 957T << Equity 18,829T; VEA: Operating margin 330%, Total Liab=0)
- **Impact:** Value-investor analysis signals unreliable for these tickers
- **Root cause:** PDF OCR quality issue or data parsing corruption?
- **Scope:** Confidence scoring + validation + low-conf skip logic
- **Questions for BA spec:**
  1. Should we extract confidence scores from OCR (pdfparse quality metrics)?
  2. Validation rules: what thresholds for "impossible" figures? (e.g., assets < equity, margin > 100%)
  3. Low-conf handling: skip alert generation? log warning? still report but flag?

### Issue 3: Polymarket API Stale (MEDIUM)
- **Symptom:** Markets data fetchedAt=2026-04-01 (26 days old)
- **Impact:** Prediction market alerts unreliable
- **Scope:** Fetch schedule + staleness check
- **Questions for BA spec:**
  1. Current fetch frequency? (should be daily minimum, spec says 2x daily)
  2. SLA: if data >24h stale, what action? (skip alerts? log warning? downgrade severity?)

### Issue 4: VN-Index Cascade Incomplete (MEDIUM)
- **Symptom:** Cascades only to VIC channel, no market-wide broadcast
- **Impact:** Sector alerts missing market context (only tech sector sees alerts, not entire market)
- **Scope:** Routing fix + test validation
- **Questions for BA spec:**
  1. Current cascade logic: why only VIC? (hardcoded or config error?)
  2. Should broadcast to MARKET channel also? (affects all subscribers)
  3. Scope: all sectors or just VN-Index?

---

## Scope (5 Tasks)

| Task ID | Title | Layer | Size | Owner |
|---------|-------|-------|------|-------|
| 1345a | Reuters + TE fallback sources | Infrastructure | M | Ops/Developer |
| 1345b | BCTC extraction confidence audit | Domain/Test | M | Developer |
| 1345c | Polymarket staleness fix + fetch schedule | API | S | Ops |
| 1345d | VN-Index cascade breadth fix | Domain | S | Developer |
| 1345e | Integration test + dashboard validation | Test | S | QA |

---

## Success Metrics (Acceptance Criteria)

- [ ] News pipeline has ≥2 fallback sources for Reuters + TE (no 7h blackouts)
- [ ] BCTC extraction reports confidence scores in logs; low-confidence (≤0.3) skipped with alert
- [ ] Polymarket refresh runs ≥2x daily; fetchedAt within 24h
- [ ] VN-Index cascade broadcasts to MARKET channel (not just VIC)
- [ ] All 7371 baseline tests pass; zero regressions

---

## BA Spec Requirements

Write `docs/REQ_1345.md` with:

1. **Problem Statement** — summarize each of the 4 issues above
2. **Success Criteria** — confirm AC above + any missing criteria BA identifies
3. **Acceptance Checklist** — for each subtask (1345a–1345e), what constitutes "done"?
4. **Dependencies** — any blockers? (e.g., VPS health, API access, credentials)
5. **Edge Cases** — what happens if fallback sources are also down? (graceful degradation)
6. **Rollback Plan** — if a fix breaks something, how to revert quickly?

---

## Reference Links

- SPRINT_GOAL.md: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/SPRINT_GOAL.md`
- TASKS.md: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/TASKS.md`
- Project Stats: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/project-stats.json`

---

## Decision Log

**Why separate BCTC audit (1345b) from low-conf skip logic?**
- Need visibility into confidence distribution first
- May require data migration if extraction quality improves
- Splitting allows parallel work (1345a + 1345d while developer investigates 1345b)

**Why Polymarket is MEDIUM not HIGH?**
- Prediction market is secondary signal (news + price are primary)
- But 26 days stale is unacceptable for any signal

**Why cascade breadth in this sprint?**
- Related to data quality + context propagation
- Small scope with high user impact (market-wide visibility)

---

## Next Step

BA writes `docs/REQ_1345.md` per spec requirements above. Return with spec + any missing AC clarifications.

