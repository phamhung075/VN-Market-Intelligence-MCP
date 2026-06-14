# Decision Journal — Sprint DOCLANG-SERIALIZE · po

**Sprint goal:** Adopt DocLang .dclg.xml as canonical OUTPUT format for pdf-extractor extractions (additive); Phase 2 authored-docs conversion gated behind a feasibility spike.
**Agent:** po
**Started:** 2026-06-14T07:10:37Z

---

### STEP po-S1 · po · 2026-06-14T07:10:37Z
**task-id:** DOCLANG-SERIALIZE
**what-done:** Opened sprint from user directive project-doclang-priority-format; Phase 1 (BA-DOCLANG-SERIALIZE, build) active, Phase 2 (SPIKE-DOCLANG-AUTHORED-DOCS) gated behind Phase 1 ship.
**what-considered:**
- Build both scopes now — REJECTED: Phase 2 = huge docs-DAG blast radius, format mismatch (DocLang=extracted content, not authored md).
- Bundle Phase 2 into Phase 1 — REJECTED: couples low-risk additive serializer to risky agent-flow-reader breakage.
- Re-run validation question — REJECTED: prior SPIKE-DOCLANG-OTSL-OVERLAP already proved net-new=0; directive scope is OUTPUT format, not gate. No contradiction.
**why-decision:** Phase 1 is where DocLang genuinely fits (additive output, single zone, reuses spike serializer). Phase 2 needs evidence (what-breaks/benefit) before any conversion — gate it.
**why-change:** Matches PO recommendation in directive; only refinement = explicit scope_out distinguishing this OUTPUT-format scope from the prior killed GATE scope (Option A).

### STEP po-S2 · po · 2026-06-14T16:12:08Z
**task-id:** (ambient triage — weekend signal drain)
**what-done:** Triaged 4 uncommitted signals (3 context-bloat + 1 FPT routine BCTC); both already groomed to backlog by po-S50; archived all 4 to processed/.
**what-considered:**
- Promote CLEAN-CONTEXT-BLOAT to ready[] for Sunday code-janitor dispatch
- Promote ROUTE-BCTC-FPT to ready[] for Sunday bctc-analyst dispatch
- Defer both to weekday cadence + just archive consumed signals
**why-decision:** Bloat overage self-attenuated 28L→4L (dev-technical-analysis already under cap); P3 notebooks OVERWRITE to cap each cycle. FPT signal ALL_PASS/no-escalation/no waiting consumer. Neither clears the bar for off-market Sunday dispatch. Board stays idle.
**why-change:** No change from router guidance — leave board idle, no orch-state mutation.
