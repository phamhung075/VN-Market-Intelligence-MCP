# Decision Journal — Sprint INFOCARD-EXPAND-FETCH · dev-frontend

**Sprint goal:** Epic INFOCARD-EXPAND-FETCH — kill "Invalid Date" on cascade-macro info card via ONE reusable date-parse helper
**Agent:** dev-frontend
**Started:** 2026-06-16T18:30:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-16T18:30:00Z
**task-id:** FIX-CASCADE-CARD-INVALID-DATE
**what-done:** Created app/lib/formatDate.ts with 4 exports (parseDate, formatDateVi, formatDateOnlyVi, formatSignalTimestamp); replaced 4 brittle inline date-parse sites across 3 route files.
**what-considered:**
- Only option: single shared helper in app/lib/ (application layer per DDD map) consumed by all 4 call sites; per-card surgery would violate /goal#2 generic mandate and produce recurring bugs as new formats land.
- Considered reusing ClientTimestamp component — rejected: it is SSR-suppressed React, not usable for string output in formatSignalTime or in server-side logic.
- Helper location: app/lib/formatDate.ts — consistent with DDD "application" layer (non-api, non-domain, non-component); formatters that are pure string→string live here.
**why-decision:** Single helper covers ALL 4 call sites + is backend-format-agnostic (works with both current SQLite bare-format AND the upcoming ISO-normalised format from FIX-SIGNALS-STOCK-FULL-DETAIL) — zero coupling to backend sprint ordering.
**why-change:** No deviation from task spec; fast-track classification respected (no new abstractions beyond what was required).
