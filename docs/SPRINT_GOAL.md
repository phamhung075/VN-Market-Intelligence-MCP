## Sprint 1860 — ACTIVE

**Status:** Active | **Scheduled:** 2026-05-09

BUG channel hygiene: 3 root causes making BUG channel unusable (old messages never deleted, monitoring reports accumulate forever, identical reports filed every cycle). 5 tasks: 2 FIX (recurring bugs) + 3 SPRINT-S.

Success: 5 tasks merged, BUG channel shows only actionable reports, monitoring reports auto-expire after 72h, duplicate submit_feedback calls within 4h suppressed at DB level, Telegram deletion failures block row from being marked processed. Baseline >= 8804.

---

## Sprint 1858 — DONE

**Status:** DONE | **Closed:** 2026-05-08

2 FIX: pollNews all-dark cooldown 4h->24h (1858a) + logVpsPush silent failure fixed with safeLogVpsPush wrapper (1858c).

---

## Sprint 1849 — DONE

**Status:** DONE | **Closed:** 2026-05-07

Telegram report resolution tracking: schema (resolution, resolved_at, claimed_by, claimed_at), store functions (markResolved, listUnresolvedReports, listResolvedReports), MCP tool upgrade, flow update (prevent infinite monitoring loops).

---

## Historical

Full history: `docs/TASKS_ARCHIVE.md` (Sprints 1777–1848)

---
