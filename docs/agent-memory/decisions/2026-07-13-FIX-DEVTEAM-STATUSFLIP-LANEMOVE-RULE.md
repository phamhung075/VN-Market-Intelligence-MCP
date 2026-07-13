# Decision Journal — FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE

**task-id:** FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE
**date:** 2026-07-13 (dev-team cron tick 08:07Z closeout)
**dispatcher:** dev-team router → agent-father (router HAND-DISPATCH; non-dev owner ⇒ BOUNDED-1-ineligible)
**status:** DONE_VERIFIED (verified_by=dev-team)

## Context
P1, 3rd-confirmed recurring bug (status-flip ≠ lane-move). BOUNDED-1 dry-run picked this row on the 08:07Z tick, but its BOARD `owner=cowork-refactory-expert` (non-dev — cowork .md only) + `next_agent=null` with **no `backlog-detail.json` entry** slipped both promote-gate non-dev checks (they key off the detail layer). Router WITHHELD the auto-launch and routed to PO. PO groomed (commit `57aa86350`): re-routed owner+next_agent→**agent-father** (dispatch SKILL line 47 — dev-team flow-doc lifecycle), added the missing detail entry, and minted the board-fallback gate FIX `FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE`. Router RAW-verified the groom, moved the row →in_progress + head-active (`6c71deb42`), then hand-dispatched agent-father (PO YES).

## Decision
Doc-only rule edit. Recurring symptom: agents patch a task's `.status` to a terminal/review token (REVIEW/QA/DONE/DONE_VERIFIED/BLOCKED) but leave the task OBJECT in its old `.task_board.<lane>[]` array → WIP miscounts + stranded rows (≈9 observed) because WIP/coherence are computed by ARRAY MEMBERSHIP, not by reading `.status`. agent-father added a MUST-clause: any status-flip to a terminal/review token MUST, in the SAME `orch-apply.sh` write, (a) move array-membership into the matching lane[] and (b) sync `.head` if the task is head.active_task_id; a status-flip without the lane-move is FORBIDDEN. SSOT clause placed in `execute-tier.md` (the sub-doc with headroom) with a thin back-pointer in `main.md`, mirroring the `ops/flow/db.md` § FORBIDDEN pattern. The sibling gap `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` was explicitly NOT conflated.

## Verification (RAW — verified_by=dev-team, not badge-trusted)
- Commit `226bb755c` on HEAD; exactly 2 files (`execute-tier.md` +15, `main.md` +3/-1); **no code, no DB, no orch-state, no peer files** touched (git show --stat = 2 docs only; peer dirty files unchanged).
- SSOT clause present + coherent: `execute-tier.md:102-110`, header `## MUST — Status-Flip = Lane-Move (CANONICAL:SSOT-STATUSFLIP-LANEMOVE)`; (a) lane-move + (b) `.head` sync obligations; explicit FORBIDDEN statement; rationale names the true mechanism (WIP by array membership, not `.status`) + the failure mode (`.status`=REVIEW while object physically in `in_progress[]`). Merge-Gate step 6 pointer added.
- Thin pointer present: `main.md:647`, one line after the Step 3 execute-tier.md sub-flow pointer.
- ≤200L discipline honored: SSOT in `execute-tier.md` (112L, under limit); main.md received only +2 pointer lines. main.md's 697L is **pre-existing sanctioned debt** (documented size-justification header, escape-valve for the ≤200L rule) — not introduced or materially worsened by this change; a main.md split is out of scope here.
- No QA-code gate: policy/doc edit with no test surface — the RAW clause-content verification IS the gate (same disposition as FIX-OPS-AUDITTRAIL-TIMESTAMP-BYPASS-GUARDRAIL).

## Follow-up
- `FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE` (P2/S, developer, `scripts/`) — board-level non-dev-owner fallback for rows with no detail entry (10-row exposed class); remains in backlog for BOUNDED-1 to drain. Rules-fix is now correct on the board; the code gate that would have caught this pick's mis-route is the follow-up.
- Sibling `SPIKE-BCTC-REPARSE-CADENCE-GUARD-ROOTCAUSE-VERIFY` (dev-mcp-server) still parked in backlog.
- No deploy required — doc takes effect on the next dev-team flow read; not part of the user-gated mcp-server rebuild batch.
- Meta: this is the 5th field-by-field promote-gate patch; PO's standing consolidation directive (unify the sibling `select()` chain into one `is_detail_non_autodispatchable` predicate + board-owner fallback) should absorb the minted FIX rather than adding a 6th sibling.
