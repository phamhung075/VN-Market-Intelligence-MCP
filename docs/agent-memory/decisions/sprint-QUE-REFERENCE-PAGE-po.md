# Decision Journal — Sprint QUE-REFERENCE-PAGE · po

**Sprint goal:** ONE Kinh Dich reference page showing detailed plain-Vietnamese description of all 64 hexagrams, served from kinh-dich-service SSOT, never hardcoded.
**Agent:** po
**Started:** 2026-06-12T15:13:17Z

---

### STEP po-S1 · po · 2026-06-12T15:13:17Z
**task-id:** ARCH-QUE-REFERENCE-PAGE
**what-done:** Opened sprint QUE-REFERENCE-PAGE from user feature request; verified data foundation live; ruled PO-Q1/Q2/Q3; dispatched architect for lightweight design.
**what-considered:**
- BA scope-enumeration stage first — REJECTED: scope unambiguous (1 page, known 64-entry SSOT), no render-site enumeration needed unlike QUE-TOOLTIP-DRY.
- New server endpoint to serve descriptions — REJECTED (scope_out): codegen-from-static-file is the proven QUE-TOOLTIP-DRY pattern; prefer it unless architect proves insufficient.
- Extend single generated file vs second detail file — DEFERRED to architect (ruled the field-set must extend, not the exact file shape).
**why-decision:** Data foundation (que-reference.js 64 entries, 9+ vi fields + 6 phases) verified present and rich; codegen currently emits only 2 fields (PO-Q3 tooltip scope) so MUST extend for detail page; architect rules exact emitted shape without regressing tooltip.
**why-change:** Skipped BA stage vs default po→ba→architect because request is a single well-scoped page on an already-enumerated SSOT — BA would add no scope value.
