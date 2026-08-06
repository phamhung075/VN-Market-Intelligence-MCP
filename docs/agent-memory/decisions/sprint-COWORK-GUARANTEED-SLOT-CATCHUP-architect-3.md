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

### STEP architect-S2 · architect · 2026-08-06T07:36:18Z
**task-id:** FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND
**what-done:** Designed 2 in-place edits to main.md Step 0b (WF-1 task_status source-array widen + new WF-1b terminal-lane self-heal branch; WF-2 row-lookup widen as defense-in-depth) + a new synthetic-fixture regression verifier spec; wrote full design into the row's `architect_review_note`, set `next_agent=developer`, moved `backlog[]→ready[]` for RLC pickup.
**what-considered:**
- Widen WF-1's task_status source lanes only (no new branch) — rejected: "DONE" still != "BLOCKED" so the existing `if` never fires; the S2 spawn still happens. Only an explicit new branch that JUMPs away satisfies AC-2.
- Patch WF-2's should_hold alone to add done[]/done_verified[] — rejected as the SOLE fix: a non-supervised terminal row already yields should_hold=false today and would STILL fall through to S2; kept only as literal-AC-1 defense-in-depth, documented as provably unreachable once WF-1b lands.
- Reuse `is_terminal_task_status`/`normalize_task_status` (scripts/lib/devteam-eligibility.jq, already backing wip_in_progress + wrapper-autoclose) vs. a fresh literal DONE/DONE_VERIFIED check — chose reuse (always_extend_not_duplicate).
**why-decision:** Traced the exact control-flow reason should_hold-only or lane-widen-only fixes silently fail to prevent the S2 spawn (neither JUMPs away); WF-1b mirrors the BLOCKED carve-out's proven shape (idle-reset + JUMP TO drain-signals) minus its lane-move, since a terminal row is already correctly lane-placed by the closing specialist (INV-GATEWAY-1 — it just can't write `.head`).
**why-change:** Found the row's stated duplicate-mint already self-resolved by po (`po_dedup_fold_20260806T0726`) before this pass started — no dedup work needed, verified live via jq/python before writing (file had been concurrently edited since first read).
