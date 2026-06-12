# Decision Journal — Sprint QUE-TOOLTIP-DRY · ba

**Sprint goal:** Every Kinh Dich hexagram rendered on the frontend shows a plain-Vietnamese description tooltip on hover, served from SSOT (que-reference / emit-reference) — NEVER hardcoded.
**Agent:** ba
**Started:** 2026-06-12T11:30:00Z

---

### STEP ba-S1 · ba · 2026-06-12T11:30:00Z
**task-id:** BA-QUE-TOOLTIP-DRY
**what-done:** Enumerated all frontend quẻ render sites (3 locations: 2 pages + 1 component), verified data reachability via two codegen pipelines, defined FR/NFR/blockers for shared QueName tooltip.
**what-considered:**
- only path: exhaustive grep + source read of all routes/components; no ambiguity found
**why-decision:** Direct source read is the only reliable method per contract-from-live-payload lesson.
**why-change:** no change from plan
