# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · architect

**Sprint goal:** cowork guaranteed-slot catch-up + related supervised-lane FIX rows
**Agent:** architect
**Started:** 2026-08-06T07:01:55Z

---

### STEP architect-S1 · architect · 2026-08-06T07:01:55Z
**task-id:** GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC
**what-done:** Wrote plan-only architecture brief (docs/architecture-briefs/2026-08-06-guard-cowork-notebook-agent-write-boundary.md) for the recurring cowork-agent self-edit-flow-doc class.
**what-considered:**
- Strip Edit/Write from the 7 agents — rejected, already false-premised by PO's own row note (breaks docs/signals/*.json routing, ~207 committed files by design).
- Patch each of the 15 flow-file call sites individually — rejected, violates always_extend_not_duplicate; traced root cause to ONE shared skill (cowork-end-cycle → doc-self-heal) with zero boundary awareness.
- New bespoke boundary-config file vs extending docs/data/system-map.json .project.agents[] — chose extend (CLAUDE.md names it the structural-data SSOT; agents[] entries already exist).
- New heavy improvement_proposal-style PO-critique lane for doc-fix-proposal vs a light single-verify lane — chose light (factual/schema-typo class doesn't need 5-field critique + LANE-A/B/C; reuses edit.md apply engine as-is).
**why-decision:** Root-caused via grep (cowork-end-cycle Step 3 → doc-self-heal, loaded by all 7 at 15 sites incl. the exact incident's own "Doc self-heal" self-report string) rather than treating 4 instances as 4 separate agent bugs — fixes the single control point instead of the symptom sites. Mechanism (PreToolUse hook keyed on the verified Claude Code agent_type hook field, confirmed by reading the installed CLI's own Zod schema, not assumed) makes the boundary real per the row's explicit ask ("mechanism, not prose"); doc-self-heal's new Step 0 gives the redirected agent something to DO instead of a dead end, closing item 3 in the same design.
**why-change:** No change from plan; PLAN-ONLY scope honored throughout — no code/config shipped, brief + board update + signal only.
