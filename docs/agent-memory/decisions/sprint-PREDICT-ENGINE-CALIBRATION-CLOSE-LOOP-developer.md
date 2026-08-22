# Decision Journal — Sprint PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP · developer

**Sprint goal:** Close the prediction-engine feedback loop (LR wired into score, calibration
feedback recurring, evidence recency bound, redundant confidence multiplier retired) — structural
ACs only, n=17 forbids any statistical refit/certification (po AC-5).
**Agent:** developer
**Started:** 2026-08-22T21:26:47Z

---

### STEP developer-S1 · developer · 2026-08-22T21:26:47Z
**task-id:** SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP (dispatch-level, no single task claimed)
**what-done:** Checked live `.task_board.in_progress` (wip_in_progress=3, cap=2 — all 3 rows genuinely
live/non-BLOCKED, updated within last 8d, none stale/zombie) and confirmed PM already correctly
encoded `depends_on` on all 6 PEC ready[] rows (PREP-FIXTURES/PREP-GETLR/FR4=[], FR1=[PREP-GETLR,
PREP-FIXTURES], FR2=[PREP-FIXTURES], FR3-FR5=[FR1]) — matches router's tier-graph description
exactly, no repair needed.
**what-considered:**
- Force-claim 1-2 tasks anyway (cap breach is on unrelated rows, not this sprint's own) — rejected:
  `wip_in_progress` (scripts/lib/devteam-eligibility.jq) is a genuine fleet-wide concurrency budget;
  a documented live incident (FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS) shows a
  miscounted/over-cap WIP froze the whole dispatch chain ~2.5h. Router's own brief flagged the
  breach explicitly and said "pick up what fits" — math says 0 fits.
- Claim 0, annotate ready[] rows, report blocked-on-WIP, let router/PM decide when a slot frees —
  chosen: safest, does not add to a documented-harmful over-cap state; the 3 live in_progress rows
  (UC-CCA-P3→qa, UC-CDC-P1→pm, FIX-SYSTEM-MAP-WATCHLIST→pm) are not developer's to clear.
**why-decision:** Respecting an already-breached shared concurrency budget outranks forcing
premature progress on a sprint that has no user-facing deadline this cycle; PREP-FIXTURES/
PREP-GETLR/FR4 remain fully eligible (depends_on=[]) the instant a slot opens.
**why-change:** No change from router's own WIP guidance — followed literally given live numbers.
