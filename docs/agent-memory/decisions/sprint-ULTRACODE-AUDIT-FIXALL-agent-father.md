# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · agent-father

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** agent-father
**Started:** 2026-07-13T20:15:21Z

---

### STEP agent-father-S1 · agent-father · 2026-07-13T20:15:21Z
**task-id:** UC-RDL-P1
**what-done:** Doc-only correction of the sprint-task chain-mutex `task_id` VALUE prefix in two SKILL.md
files, per architect adjudication `docs/architecture-briefs/2026-07-13-uc-rdl-p1-lock-namespace-adjudication.md`.
`.claude/skills/dispatch-claim/SKILL.md`: Canonical Namespace table row (L39) `sprint-task:<task-id>` →
`task:<task-id>`; §Sprint-Task Outer Wrap (L267-284) intro prose + `task_id` code value + closing rule
all realigned to `task:<task_id>`, explicitly distinguishing id-prefix from `task_kind` (which stays
`sprint-task`). `.claude/skills/task-lock/SKILL.md` Quick Reference example (L29) `"<kind>:<id>" //
e.g. "sprint-task:TASK_1974"` → `"task:<id>" // e.g. "task:TASK_1974"`.
**what-considered:**
- Whether to also reword the L269 intro sentence ("the same principle applies with `sprint-task:`
  prefix") — not explicitly named in the brief's line-level spec, but it sits inside the same
  269-283 section as the two explicitly-named edits and would otherwise directly contradict the
  code block two lines below it. Chosen: fix it too, for section-internal consistency; still zero
  scope creep (same section, same file, same underlying drift).
- Whether to touch the historical handoff `docs/handoffs/TASK_1979-p1-af-4-task-lock-skill-rebind.md`
  (also contains `task_id="sprint-task:TASK_1974"` twice) surfaced by the AC4 regression grep —
  rejected: it is a completed, historical task spec, not a live SKILL/flow file; brief explicitly
  scopes the fix to the two SKILL.md files ("No other file needs to change"); out-of-scope edit
  would violate the hard constraint "Edit ONLY the two `.claude/skills/*.md` files."
- Line 492 (`dispatch-claim/SKILL.md` "LIFTED TO ROUTER SCOPE..." provenance prose) — left as-is per
  brief's explicit instruction; verified unchanged post-edit (historical changelog, not a live rule).
- CLAUDE.md §PRE-CLAIM Phase B `intent:` pattern — NOT touched (Conclusion A of the brief rejected
  merging `intent:`/`task:` as a false positive); verified `git diff CLAUDE.md` empty post-commit.
**verification:** `grep -n 'sprint-task:'` re-run post-edit on both target files returns 0 hits inside
code/table rows (only the explicitly-preserved L492 provenance line remains, which does not contain
the literal string). Repo-wide `grep -rn 'task_id.*"sprint-task:' .claude/ docs/` returns hits only in
(a) audit/adjudication brief prose quoting the old text as evidence, (b) `orch-state.json` next_action
prose describing this exact fix, (c) the historical `TASK_1979` handoff doc — none are live SKILL
files, all expected/out-of-scope per brief. `git diff -- <the 2 files>` shows a clean, minimal diff;
`git status --porcelain` confirms none of the ~89 dirty peer files were staged. Commit `18885ff50`
touches exactly `.claude/skills/dispatch-claim/SKILL.md` + `.claude/skills/task-lock/SKILL.md`.
**owner:** agent-father (sole historical committer of both files per brief's routing rationale).

### STEP agent-father-S2 · agent-father · 2026-07-31T01:10:34Z
**task-id:** UC-ASL-P6
**what-done:** Purged the phantom-protocol DASHBOARD.md references from system-auditor's flow docs and aligned `signal-dashboard/SKILL.md`'s hot-path write text to the orch-apply.sh CAS contract.
**what-considered:**
- Reconciled the row's flagged discrepancy first: `flow/` has only main.md/page-freshness.md/tier1-overrides.md/tier1-probe.md, no init.md — the agent's init.md lives one level up at `docs/agents/system-auditor/init.md`. Row's citation is accurate read that way; not itself a phantom reference.
- main.md + tier1-probe.md: already fully disambiguated by a prior sprint (FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED, 2026-07-29) naming `docs/data/DASHBOARD.md` as the live target and explicitly forbidding `docs/handoffs/DASHBOARD.md` (confirmed still exists, 650B, untouched since 2026-07-20 — the real phantom). No edit needed there except one residual (next bullet).
- init.md (top-level identity) was NOT touched by that prior sprint: 3 bare ambiguous "DASHBOARD.md" mentions remained (L49/L95/L142) — L95 (forbidden_outputs) internally contradicted this same file's own not_my_job routing statement (L36: findings go to `.signal_queue`). Fixed all 3 to name `docs/data/DASHBOARD.md` + `scripts/emit-dashboard-row.sh`.
- main.md RETURN block `NEXT: po (via DASHBOARD.md)` — grepped every po flow file, zero reads DASHBOARD.md; genuine phantom-PROTOCOL claim (not just a stale path). Fixed to `po (via orch-state.json .signal_queue row)` per this file's own inter_agent contract.
- SKILL.md L11 "Write protocol" cited a stale pre-orch-apply.sh brief (bare temp-then-rename), contradicting its own CONCURRENT WRITERS CAS-guard mandate 2 sections below + `dashboard-protocol.md`'s WRITE step 4 (already correct). Fixed to name `orch-apply.sh` directly — scope limited to SKILL.md per task instruction; the same-class stale header line in `dashboard-protocol.md`'s own preamble (L12) was left untouched (out of explicit scope), flagged for follow-up.
**why-decision:** Task named exactly 4 files; investigated each rather than trusting the row's "phantom" framing was still current. main.md/tier1-probe.md's phantom-FILE-path defect was already closed; init.md and main.md's RETURN line still carried the phantom-PROTOCOL class (routing claims to a file nobody reads) the task title targets.
**why-change:** Did NOT flip the board row BACKLOG→REVIEW or touch `orch-state.json` — own init.md `commit_zone` excludes it from agent-father commits except a signal-queue DONE-mark, and this dispatch (direct po manual-dispatch board row, no linked signal_queue row) has no such exception. Doc work is complete; only the board-row write is deferred to router/po.
