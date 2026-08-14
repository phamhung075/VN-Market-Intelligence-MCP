# Agent Father — Notebook

<!-- Entry 2026-08-07 12:58 UTC (Keep/maintenance) split to
     docs/agent-memory/notebooks/archive/agent-father-archive-20260812.md on 2026-08-12
     (self-prune, byte cap 12000B breached at 172L/15376B) — CLEAN-NB-AGENT-FATHER-MIXED-
     HEADING-OVERCAP-DISARM. Also disarmed the sentinel-immunity trap that made this file's
     one dated heading look like "oldest": every retained ## heading below now carries an
     explicit YYYY-MM-DD token. Nothing deleted; full record in the archive file and git
     history. -->

## EDIT 2026-08-14T04:33Z — task FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (router-direct
dispatch, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Architect ratified BA's FR-0..FR-7 (10 flow-doc edit sites, chef.md + chef-dish.md) — `.head`
  routed straight to agent-father, zero PM decomposition, zero application code.
- **Action taken:** applied all 10 sites verbatim. Per architect's own risk-flag R1 (files had
  already drifted BA→architect, +44L chef-dish.md/+5L chef.md from an unrelated 2026-08-13 commit),
  anchored every edit on grepped quoted text, never on either agent's cited line numbers — my own
  earlier edits in this same pass kept shifting later-file line numbers, confirming R1 was right.
  FR-0a/FR-0b temporal-scope the two stale "14/16 blocked" AUTO-CURE comments; FR-1 names
  `$BIZ_CTX_SIGNALS` at chef.md Step 0 GATHER (the missing handle); FR-2 carries it across the
  chef.md/chef-dish.md session-state handoff; FR-3 adds the mandatory Step 4 citation sub-step
  producing `$BIZ_CTX_CITED`; FR-4 folds it into the Step 6.5 causal chain; FR-5 closes the
  filename-only citation loophole in Step 7 Block B; FR-6 redefines `BIZ_CTX_OK` against the new
  artifact instead of a bare gap-token-of-convenience; FR-7 persists `business_context_cited` into
  `conviction_calls[]` (the field this row's own `verification_gate` RAW-verifies against). Post-edit
  grep confirmed all 10 tokens landed exactly once each at the intended anchor; blast-radius grep in
  the handoff already confirmed zero non-doc consumers.
- Task-lock: gateway-blind this session (no native `mcp__gateway__call_tool`) — the `task:<id>` row
  was already held by this SAME session (router pre-claim, `owner_client_session` match); released
  via `scripts/agents-flow/mcp-call.sh` bridge at closeout (`{ok:true,released:0}` — row already gone
  on re-check, clean either way).
- Committed+pushed `c11504775` (chef.md + chef-dish.md only, explicit pathspec).
- **Board disposition:** `in_progress[]`→`review[]`, `next_agent:po` — `verification_gate` needs a
  live chef dish RAW-verified against `unified-agent-synthesis-*.json` (not self-testable this cycle,
  prose/gate-logic wiring only). `.head` reset in the same write (was pointing at this task).

## EDIT 2026-08-14T06:33Z — task FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE
(dev-team Review-Lane SECONDARY-Drain owner-triage, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Row was REVIEW/`next_agent:agent-father` carrying a full architect blueprint
  (`docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md`) whose §5
  was explicitly "agent-father's deliverable" — not a bare sign-off/triage row, an implementation
  handoff. Live-reread `docs/agents/dev-team/flow/main.md` first (brief's own §1 flagged 12+ edits
  landed since the brief's line-number citations) — confirmed entry-gate/WF-2/S2 anchor text still
  matched verbatim, applied on live text via exact-match edits, never the brief's stale line numbers.
- **Applied:** dropped the `head.updated_at < 24h` clause from Step 0b's entry gate; inserted new
  WF-3 RESUME-ATTEMPT-BOUND (`.head.resume_attempts`/`last_resume_at`, 3-attempt bound → row `BLOCKED`
  + `hold_reason` + `resume_attempt_bound_exceeded_at/_by`, `.head` idle-reset, BUG signal) and WF-4
  STALE-AGE (2h, keyed off row `claimed_at` never `.head.updated_at` — the latter self-defeats the
  moment WF-3's own counter writes `.head` — git-log corroboration before reset, BUG signal) between
  WF-2 SUPERVISED-HOLD and S2; S2 gained a 6-line increment write on its successful-claim path; deleted
  the old 24h stale-crash sibling branch + fixed a stale cross-ref to it in S2's own LOCK-LIFETIME
  comment. Dry-ran all 3 new jq transforms against a synthetic fixture before treating the patch as
  done — all produced the exact shape specified. +78L (1152→1230), size-justification header entry
  added per this file's own per-edit convention.
- **Not routed through `edit.md`:** `dev-team` has no `.claude/agents/dev-team.md` roster entry (the
  router's own orchestration loop, not a spawnable agent) — `edit-prepare.md` Step 1's existence Glob
  would false-block. Applied directly, same precedent as my own 2026-08-13/08-14 chef/qa entries above.
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` STEP `agent-father-S41`.
- **Board disposition:** stayed `review[]` (no status flip — still `REVIEW`, so no
  STATUSFLIP-LANEMOVE obligation), `next_agent: agent-father → qa` (routes to the pre-existing QA-Drain
  PRIMARY selector next tick) via `scripts/orch-apply.sh` (`FU-AGENT-FATHER-ORCH-SCOPE` — outside
  `commit_zone`, applied not committed by me) + `agent_father_implementation_note` field added
  documenting the change for qa. Not self-certified `DONE_VERIFIED` — orchestration-core dispatch
  logic, no live multi-tick head-pin scenario reproducible in one session; qa to smoke/diff-verify.

## EDIT 2026-08-14T08:10Z — task FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND +
FIX-DEVFLOW-MICROSERVICE-SUCCESS-PATH-NO-HEAD-SYNC (PO stale-`.head`-family triage pair,
router-dispatched, session `632721c2-41e4-4aff-8d06-a47cf80dc0d7`)
- Two mechanical FIX rows off `sprint-TRIAGE-STALE-HEAD-FAMILY-20260814-po.md` (5th/6th instances
  of the pipeline-resume duplicate-spawn family). WF-1d row: widened `main.md`'s WF-1 task_status
  array +review[]/qa[] (appended last), inserted WF-1d between WF-1c/WF-2 mirroring WF-1c, found
  WF-2's own `$row` array ALREADY had review[]/qa[] undocumented — added the missing comment only
  (no functional change, verified via grep before acting, not fabricated). Bumped WF-2/3/4
  ordinals, corrected S2 fall-through summary to 4 carve-outs. +43L (1233→1276).
- Success-path row: inserted `.head` idle-reset into `microservice-main.md` right before RETURN,
  reusing `developer/flow/main.md:72`'s jq verbatim, guarded on `.head.active_task_id==task_id`
  (never blind-null). Marked 2 dead branch-prose lines SUPERSEDED (historical marker, not deleted).
  +16L (169→185).
- **AC-5 blast-radius check (mandatory before claiming coverage) — found a real gap:** read every
  `dev-*/flow/main.md` live. 8 are thin pointers and inherit the fix. `dev-frontend`,
  `dev-mainserver-crawls`, `dev-vps-crawls` each carry a self-contained flow with an independent
  RETURN/task_board-update block that never reaches `microservice-main.md` — their `.head` gap is
  UNFIXED by this change (`dev-mcp-server` likewise, but arguably out of family per that file's own
  known-drift note). Reported honestly rather than claiming full 9-consumer coverage — flagged via
  RETURN for PO to mint follow-up rows.
- Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father-2.md` STEPs `S42`/`S43`.
- **Board disposition:** both `backlog[]`→`review[]`, `next_agent:po`, `agent_father_implementation_
  note` added to each row (incl. the blast-radius gap on the 2nd) via `scripts/orch-apply.sh`
  (`FU-AGENT-FATHER-ORCH-SCOPE` — outside `commit_zone`, applied not committed by me). `.head` was
  pointing at an unrelated task (`UC-CDC-P1`) throughout — untouched.
- AC-7 (WF1d row) verifier extension flagged, not authored — `scripts/` outside `commit_zone`.
