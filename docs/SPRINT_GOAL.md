## Sprint 1862 — ACTIVE

**Status:** Active | **Scheduled:** 2026-05-09

# Sprint 1862 Goal

## Vision
Stabilize data pipeline reliability (vnstock + RSS), eliminate signal noise (dedup), and correct stale system metadata. TNB audit cycles 21-22.

## Scope
IN: vnstock rate limiter tuning (DONE 1862a), report-analyzer enum (DONE 1862b), vnstock_events deploy gap (DONE 1862d), Cowork MCP access investigation (1862c), Error Boundary standardization (1862e), Reuters/TE RSS regression fix (1862f), news-scout signal dedup for repeated ticker+direction (1862g), hardcoded tool counts in knowledge files (1862h), stale project-stats.json infra status (1862i).
OUT: New feature work, Cowork architecture redesign, BCTC pipeline changes.

## Success Metric
- [DONE] vnstock sync completes full watchlist cycle without RATE_LIMITED errors on any ticker
- [DONE] report-analyzer agent boots successfully via MCP enum
- [DONE] vnstock_events NOT NULL constraint failure resolved for JSH
- Cowork scheduled-task MCP access root cause documented with fix deployed or workaround
- 7 dev-team flows have Error Boundary section 6.2
- Reuters/TE error count drops below 15 (from 42) and stays stable across 3 TNB cycles
- news-scout does not fire same-ticker same-direction urgent_news more than once per 4h window
- Knowledge files reference project-stats.json instead of hardcoded counts
- project-stats.json infrastructureStatus reflects actual server state
- Baseline >= 8804

---

## Sprint 1860 — DONE

**Status:** DONE | **Closed:** 2026-05-09

BUG channel hygiene: 3 root causes making BUG channel unusable (old messages never deleted, monitoring reports accumulate forever, identical reports filed every cycle). 5 tasks: 2 FIX (recurring bugs) + 3 SPRINT-S.

---

## Sprint 1858 — DONE

**Status:** DONE | **Closed:** 2026-05-08

2 FIX: pollNews all-dark cooldown 4h->24h (1858a) + logVpsPush silent failure fixed with safeLogVpsPush wrapper (1858c).

---

## Historical

Full history: `docs/TASKS_ARCHIVE.md` (Sprints 1777–1848)

---
