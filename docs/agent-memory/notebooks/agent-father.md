# Agent Father — Notebook

## Fix (router-direct dispatch, P1) 2026-08-06T10:16Z FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE
- **Root cause:** Step 0b's 3 resume gates (WF-1 task_status lookup, WF-1b terminal-lane,
  WF-2 should_hold) all scanned `[in_progress, active_sprints, done, done_verified]` (WF-1/
  WF-1b) / `[in_progress, review, qa, done, done_verified]` (WF-2) — neither included `ready[]`.
  A row handed off into `ready[]` while `.head` still names it `in_progress` (measured live
  2026-08-06T09:48Z on `UC-CRITIC-HOOKS-ENFORCEMENT`: architect finished, wrote
  `next_agent=developer` on row + `.head`, left the row `ready[]`-resident) is invisible to
  every carve-out and falls through to a duplicate S2 spawn. 5th instance of the
  pipeline-resume duplicate-spawn family (`feedback_pipeline_resume_stale_placeholder_duplicate_spawn_risk`).
  Live board had already self-healed by the time I read it (`.head` back to idle) — reproduced
  the exact scenario with synthetic scratch fixtures instead (positive: `ready[]`-resident
  head-pin correctly short-circuits before S2; negative: genuine `in_progress[]` row still
  resolves to normal resume) run against the real jq filters before committing.
- **`docs/agents/dev-team/flow/main.md` (AC-1 + AC-2):** WF-1's `task_status` array and WF-2's
  `$row` array both gained `(.task_board.ready // [])[]`, APPENDED LAST (after
  done/done_verified) to preserve the `first`-prefers-live-copy STATUSFLIP-LANEMOVE ordering
  discipline. New **WF-1c READY-LANE check** inserted between WF-1b (terminal-lane) and WF-2
  (supervised-hold) — mirrors WF-1b's shape: `task_status == "READY"` → idle-reset `.head`, NO
  lane-move (row already correctly resident in `ready[]`), JUMP TO drain-signals, **before**
  WF-2 ever evaluates `should_hold` on it (a `ready[]`-resident row is staged, not "held" —
  WF-2's hold/resume contract doesn't apply). Chose this disposition over the alternative
  (folding `ready[]` into WF-2's hold semantics) because a staged row was never resumed in the
  first place, so "hold until po_goahead" is the wrong mental model for it — explicitly stated
  per PO's AC-2 requirement, not left implied by the array widening alone. WF-2's ordinal
  retitled BLOCKED→TERMINAL-LANE→READY-LANE→WF-2; S2 fall-through summary line corrected to
  name all three carve-outs; top-of-file changelog + Reusable Scripts section updated in place.
- **`docs/agents/po/flow/supervised-goahead.md` (AC-3):** re-synced Step 1's `should_hold` jq
  to be byte-identical to `main.md`'s corrected block — the file had drifted on TWO axes: (1)
  its `$row` array was still 3 lanes against `main.md`'s already-widened 5 (from the
  same-day `FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND`, never mirrored here), (2) it used
  a `-L scripts/lib` + bare `include "devteam-eligibility"` mechanism instead of `main.md`'s own
  `include "scripts/lib/devteam-eligibility";` — two working-but-textually-different ways to
  load the same library, which defeats a literal byte-diff drift guard. Fixed both; diffed the
  two files' jq program text (normalized only for the per-file `--arg tid` bash variable name)
  to confirm byte-identical. Fixed the stale `469-478`/`467-483` line references (also stale in
  `docs/agents/po/flow/main.md`'s own pointer) — switched both to a named-section pointer
  (`§ WF-2 SUPERVISED-HOLD check`) with an explicit "line numbers drift, re-read live" caveat
  rather than a hardcoded number, since this exact file has now drifted from `main.md` twice.
- **AC-4/AC-5 (verifier extension + drift guard, `scripts/`) — NOT implemented, flagged as a
  companion developer row** per PO's own split precedent (TE-T02/TE-T12, `scripts/` outside
  `commit_zone.allowed`): documented the exact spec as a new Reusable Scripts PENDING bullet in
  `main.md` (positive/negative control for WF-1c + a mechanical byte-diff drift guard between
  the two `should_hold` copies) and dropped `signal_queue` row `age-20260806T101656` (`to: po`)
  — read-back confirmed present. Did NOT mint the board row myself (`commit_zone.excluded`
  covers `orch-state.json` structurally, not just commits).
- **Board:** lane-moved `backlog[]→review[]`, `status=REVIEW`, `next_agent=qa` via
  `orch-apply.sh` (router explicitly directed this in the dispatch prompt, same precedent as
  TE-T16 below). **Did NOT commit** `orch-state.json` myself — flagged via the same signal row
  above. Verified both pre-existing regression verifiers still PASS after the widening:
  `devteam-pipeline-resume-terminal-lane-verify.sh` and `po-goahead-producer-verify.sh`.

## Split (router-direct dispatch, P1) 2026-08-06T09:45Z TE-T16 (TOKEN-ECONOMY-AUDIT wave 3)
- Split `docs/agents/unified-agent/flow/chef.md` at its existing Step-1 intraday silent-exit
  gate, per `docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-16`.
  `chef.md` (893L→206L) keeps ONLY Step 0.5 (published-marker gate) + Step 0 (GATHER) +
  Step 1 (CLUSTER/intraday-gate). New `docs/agents/unified-agent/flow/chef-dish.md` (731L)
  holds Steps 1.5-8 (macro-health read, 6-layer walk, dual-output WRITE DISH, quality-verdict
  gate, JSON persist, log/RETURN) — entered via "Run sub-flow" only when the gate fires or
  `$DISH_TYPE` is a guaranteed window. The 5-file TNB knowledge lazy-load block (was declared
  "before Step 0", unconditionally) moved with the body to chef-dish.md, header retitled
  "before Step 1.5" — confirmed via grep that none of those 5 files are referenced anywhere
  in Steps 0.5/0/1, only in Steps 2/6/7.5. Pure relocation, verified byte-identical (Python
  string-containment check both ways) — no logic changed, no step renumbered.
- Repointed 3 stale `chef.md Step 7.6` cross-refs in `docs/agents/unified-agent/init.md`
  (capabilities/responsibilities/constraints.synthesis_write) to `chef-dish.md Step 7.6`
  since the JSON-persist step moved. `chef.md § Gate-fired contract` refs elsewhere
  (`.claude/agents/unified-agent.md`, init.md `no_self_abort`) needed no change — Step 1
  stays in chef.md. `main.md` needed no edit (dispatches `chef.md` unconditionally; internal
  step structure is chef.md's own concern).
- **Board:** TE-T16 moved `backlog[]→review[]`, `status=REVIEW`, `next_agent=qa` via
  `orch-apply.sh` (router explicitly directed this write in the dispatch prompt — status-flip
  = lane-move in one write, per its instruction). **Did NOT commit** `docs/data/orch/orch-state.json`
  myself — `commit_zone.excluded` (`FU-AGENT-FATHER-ORCH-SCOPE`) stands regardless of the
  write being directed; dropped `signal_queue` row `to: router` flagging the pending commit
  (same shape as the prior `FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED` entry below).
  Doc commit (`docs/agents/unified-agent/flow/chef.md` + `chef-dish.md` + `init.md`) done
  and pushed within my own zone.

## Fix (router-direct dispatch, P1) 2026-08-06T09:41Z FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED
- Edited `docs/agents/dev-team/flow/main.md` per architect's `architect_review_note`
  (brief `docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md`):
  rewrote idle-tick Review-Lane QA-Drain from hardcoded `qa[]<1` single-claim to
  `QA_CAP=10`/`TAKE_BUDGET` batch-claim (absorbs `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP`'s
  main.md half, zone-correct per `po_routing_ruling_20260721`), and inserted a new
  head-decoupled invocation section at the Session-Gate→Step-1 anchor (after
  SECONDARY-Drain, before Step 1) using the identical batch shape — reachable on busy
  ticks, closing the gap where QA-Drain's independent `qa[]` budget was never evaluated
  outside the head-idle fall-through. Updated SECONDARY-Drain's cross-refs + the Lane ×
  Gate Coverage Matrix `review[]` row + 2 stale `qa[]<1` numeric mentions elsewhere in
  the file (DRS budget note, AC-3 bullet) for consistency. `scripts/devteam-review-claim-qa-drain.jq`
  (developer's parallel `FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP` row, uncommitted mid-edit
  at time of writing) already implements the matching `--argjson take_budget`/
  `sort_by([priority_rank,age])`/batch shape — confirmed compatible before writing the
  caller side. Committed `92ff5fb43`, pushed clean (size-lint PASS, tsc PASS).
- **Mid-task incident:** a peer `git reset` on the shared working tree wiped 3 of 4
  uncommitted `Edit` calls (only the last-applied insertion survived) — caught via the
  Edit tool's "modified on disk" warning + `git diff --stat` mismatch, re-applied all 3
  lost edits, re-verified full diff before committing. No data loss, but flags the
  shared-working-tree collision risk class again (see `feedback_subagent_branch_checkout_hijacks_shared_working_dir.md`).
- **Left for router/PO:** `docs/data/orch/orch-state.json` board flip (`ready[]→review[]`
  or `done[]`) — no signal_queue-linked exception applies to this router-direct
  dispatch, so `commit_zone.excluded` stands; doc work is complete and pushed.
