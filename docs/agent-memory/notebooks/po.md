# PO Notebook

## c · 2026-06-05T21:06Z — KICKOFF sprint ORCH-DASH-DECISION-DRILLDOWN (user feature request)

**Trigger.** Operator request (2 msgs): make DONE tasks on http://localhost:3001/dashboard/orchestration clickable → dropdown showing that task's Decision Journal detail. Router pre-scouted format/zones/design.

**Sprint goal written.** ORCH-DASH-DECISION-DRILLDOWN, lead=architect, status=active. Three legs: F1 join-key design, F2 server-side parse of sprint-*.md → structured JSON on GET /api/orchestration, F3 Remix accordion UI on DONE rows. First task BA-ORCH-DASH-DECISION-DRILLDOWN (SPRINT-S, zone:multi) appended to backlog (23→26 incl. 2 prior FUs). Sprint umbrella lock claimed (task:ORCH-DASH-DECISION-DRILLDOWN, claimed:true).

**CENTRAL DESIGN DECISION handed to architect (confirm, not PO-decide).** Journal STEP blocks are tagged `<agent-id>-S<N>` — NO task-id today, so no join key from a decision to a task_board task. Options: (a) add optional task-id to STEP format + re-inject at journal-write step in dev/qa/architect/cowork flows (precise, forward-only, needs agent-father) vs (b) sprint-group-only (coarse, works with existing data). Forwarded router rec = BOTH (optional task-id for forward precision + sprint fallback bucket for legacy back-compat).

**Scope fenced tight (one feature).** scope_out: UI editing, non-DONE expansion, journal backfill, new storage backend, auth. Anti-patterns flagged in goal: no raw-markdown-to-browser (parse server-side — data-serve-integrity lesson: verify WHICH layer serves /api/orchestration before dispatch, likely apps/mcp-server not the not-deployed Go plane); no DONE-off-a-green-badge; new task-id field delivers ZERO live join until agents re-flow it (derived-needs-reflow lesson) → fallback bucket is mandatory back-compat.

**Orch-state write.** read-full → jq → `[ -s tmp ]` + 3-key sentinel (new sprint_id AND exactly-one BA task AND head still==FIX-MW-OFFHOURS-DISPATCH) → atomic mv. Did NOT touch .head — dev-team's in-flight FIX-MW pointer left intact. Rationale in journal sprint-ORCH-DASH-DECISION-DRILLDOWN.md (po-S1/po-S2).

**Carry-over (next tick / on BA return):**
- Review BA spec when it returns (→ po/review-ba-spec.md). Verify it names the LIVE serving layer for /api/orchestration and pins the BOTH join-key decision (or architect's confirmed alternative).
- At QA signoff: raw-verify the LIVE dashboard myself (click a DONE task, confirm dropdown renders STEP fields, confirm empty state on a no-entry task, confirm loader payload is JSON not markdown) — not a green badge. Confirm touched container rebuilt.
- Prior tick still open: FIX-MW-OFFHOURS-DISPATCH (dev-team, head); CTG refine pickup (FU-CTG-REFINE-PICKUP); bctc-analyst CTG proof point.
