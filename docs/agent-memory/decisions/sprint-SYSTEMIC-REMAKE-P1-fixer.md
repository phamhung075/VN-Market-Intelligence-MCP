# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · fixer

**Sprint goal:** Phase-1 containment-now: port proven cowork LOOP-07 no-work gate into dev-team + auditor engines (RC-IDLE-LOOPS), drain parked detector fixes + READ->RESOLVED closure (RC-DETECTOR), stop narrative drift (RC-DRIFT).
**Agent:** fixer
**Started:** 2026-07-10T19:45:00Z

---

### STEP fixer-S1 · fixer · 2026-07-10T19:45:00Z
**task-id:** FIX-PM-DJGATE1-JOURNAL-FILENAME
**what-done:** Fixed two defects in pm's ARCH-DAILY-FOREIGN-FLOW-TABLE completion: (1) migrated journal from wrongly-named arch-daily-foreign-flow-table-pm-atomization.md to canonical sprint-SYSTEMIC-REMAKE-P1-pm.md, (2) corrected orch-state status from "DONE" to "DONE_VERIFIED" for done_verified lane coherence.
**what-considered:**
- Leave wrongly-named file in place — rejected, breaks DJ-GATE-1 grep pattern and is clutter
- Migrate content + delete old file — chosen, restores canonical naming per .claude/skills/decision-journal/SKILL.md § Resolve Sprint ID
- Manually edit orch-state — rejected, violates SSOT-write contract
- Use orch-apply.sh with jq — chosen, maintains Zod validation + CAS guard + atomic rename
**why-decision:** DJ-GATE-1 grep pattern docs/agent-memory/decisions/sprint-*-*.md (used by merge-gate script) now finds pm's entry. Status-lane coherence enforced elsewhere per existing pattern (scripts/dev-mcp-server-djgate1-journal-fix-doneverified.jq). Both mechanisms are infrastructure gates, not cosmetic.
**why-change:** No change from design — pure defect correction matching 07-10T01:07Z QA-discovered gap (docs/incidents/) same class, different proximate cause.

### STEP fixer-S2 · fixer · 2026-07-10T20:00:00Z
**task-id:** FIX-BOUNDED1-DEPENDS-ON-LEGACY-FIELD-UNION
**what-done:** Fixed `scripts/devteam-backlog-promote-bounded1.jq` `effective_depends_on($detail_items)` function to union both the modern `.depends_on` field AND the legacy `.depends` field (pre-schema-rename, observed in 71 detail rows) at each precedence location (inline board row OR detail_ref'd docs/data/orch/archive/backlog-detail.json entry). Pattern: changed `(.depends_on | as_dep_array)` to `((.depends_on | as_dep_array) + (.depends | as_dep_array))` for both inline and detail-item cases. Updated header comments (lines 61–68) to document legacy field union explicitly. Dry-ran fixed script: confirmed exit 0, confirmed `FIX-SBV-FETCHER-ZERO-VALUE-EMIT` (which carries `.depends:["FIX-SBV-FX-VPS-FETCHER-UNHEALTHY"]` in detail and `status:TODO` for that dependency) is now correctly EXCLUDED from promotion; top eligible candidate is `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH`.
**what-considered:**
- Deduplicate merged depends+depends_on arrays — REJECTED: unnecessary complexity; `deps_satisfied` predicate only needs to check if ANY dep is unresolved, doesn't care about duplicates.
- Add separate legacy-field migration sweep (separate task) — DEFERRED: fixer mandate is targeted scope; migration tooling is backlog decision (belongs to ops/PO triage).
- Modify comment placement — REJECTED: header prose at lines 53–79 is SSOT per file convention ("This spec is the SSOT"); any accuracy drift will cause recurring false-positives; update in-place.
**why-decision:** The 2026-07-08 `FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE` was incomplete: it covered the modern schema but overlooked the 71 legacy `.depends` entries co-resident in the same detail_items array, creating a silent-skip path for blocked rows (confirmed: 2026-07-07T19:07Z promotion attempt picked `FIX-SBV-FETCHER-ZERO-VALUE-EMIT` despite its unresolved `FIX-SBV-FX-VPS-FETCHER-UNHEALTHY` dependency). Root cause: schema was renamed but not migrated wholesale; detail.json retains both field names. Precedent: `effective_supervised()` (2026-07-09 fix) and `effective_children()` (2026-07-10 fix) follow the same dual-field union pattern — this fix aligns DEPENDS-ON to the same standard.
**why-change:** Router manual RAW-verification caught the defect and reverted the bad promotion (commit `ae0731abf`); this is the second occurrence of BOUNDED-1 promotion picking an ineligible row (first: 2026-07-08 `FACTORY-TECHANALYSIS-delete-orphaned-ts-service`). Recurring-bug escalation policy (2+ occurrences → permanent fix, not patches) mandates closure via automation + root-cause elimination, not manual oversight.
