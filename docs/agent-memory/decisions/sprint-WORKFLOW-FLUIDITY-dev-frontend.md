# Decision Journal — Sprint WORKFLOW-FLUIDITY · dev-frontend

**Sprint goal:** WF-1 task_release + atomic .head idle-reset on all STOP paths
**Agent:** dev-frontend
**Started:** 2026-06-06T22:38:00Z

---

### STEP dev-frontend-S1 · dev-frontend · 2026-06-06T22:40:00Z
**task-id:** FIX-ORCH-DONE-GRID-COLS
**what-done:** Fixed DONE-list div-grid column drift by extracting DONE_GRID const (fixed px/fr tracks, no auto/max-content) shared by header and all data rows; moved status_note from inline Status cell to DecisionAccordion banner; added min-w-0 + break-words + line-clamp-2 to Title cell.
**what-considered:**
- only: per-row grid containers with minmax(Npx,auto) expand each row's tracks from its own content — extracting one shared track set with fixed widths is the only structural fix; CSS Grid requires co-located containers to align columns (table or shared parent grid).
**why-decision:** Fixed px tracks (120/110/90/130px) chosen for ID/Owner/Status/Zone (values are short labels); `minmax(0,1fr)` for Title gives it majority space while allowing proper shrink; removing auto eliminates content-driven expansion entirely.
**why-change:** no change from plan
