# SPIKE — TASK-COWORK-MUTEX-001 prior-art adjudication

- **Question:** Is TASK-COWORK-MUTEX-001 (P0) already shipped? Diff its "Step 2.4" deliverable
  against live `CLAUDE.md:14`, `.claude/skills/dispatch-claim/CARD.md:35`, and
  `.claude/skills/dispatch-claim/SKILL.md:194/:288/:563` — the five lines three prior PO triage
  passes (2026-08-08T16:06Z, 2026-08-08T20:54Z, 2026-08-11T13:22Z) cited as possible prior art but
  never diffed line-by-line. Also check siblings TASK-COWORK-MUTEX-002/003.

- **Approach tried:** No prototyping — this is a pure documentation/behaviour diff, no code to spike.
  1. Read the originating decomposition: `docs/handoffs/TASK-COWORK-MUTEX-001.md` (task handoff),
     `docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md`
     (architect ruling, §3 file-level design table, §2 FR-2 resolution rule), and
     `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-pm.md` (PM task-split rationale).
  2. Read the exact 5 cited lines in context (full files: CLAUDE.md, CARD.md, SKILL.md all read in full).
  3. `grep -rn "Step 2.4|Cross-Path Collision|COWORK_AGENTS|AGENT_SLOTS|TARGET_SLOTS|cowork-dispatch-collision-probe"` across the whole repo (`.md`/`.sh`/`.js`).
  4. `git log --oneline -- .claude/skills/dispatch-claim/SKILL.md .claude/skills/dispatch-claim/CARD.md CLAUDE.md` — checked every commit touching these 3 files since the row was minted (2026-07-30) for any cowork-slot-collision-probe work.
  5. Checked for the FR-7 test harness file (`scripts/agents-flow/cowork-dispatch-collision-probe.test.sh`) and the FR-annotation in `docs/agents/cowork-team/flow/spawn-fanout.md`.
  6. Cross-checked `docs/data/orch/orch-state.json` live rows for TASK-COWORK-MUTEX-001/002/003 (status, `depends`, `updated_at`).

- **Findings: NOT shipped. Close as NOT-shipped; the missing sub-behaviour is the entire Step 2.4 mechanism.**

  **What the row actually requires** (per architecture brief §3 item 1 + handoff AC list):
  a new `## Step 2.4 — Cowork-Slot Cross-Path Collision Probe` section in
  `dispatch-claim/SKILL.md`, inserted between `§ Phase A.5` and `§ Pattern (Phase B)`, that:
  - FR-1: recognizes the 9 cowork-slot agents via `cowork-schedule.json` `.slots[].agent`
  - FR-2: resolves `intent-key` → `TARGET_SLOTS` (`AGENT_SLOTS = jq ... .slots[] | select(.agent==$a) | .slot_id`; exact-match → `[intent-key]`, else all-slots conservative fallback)
  - FR-3: probes `task_list_held(kind="cowork-slot", expired=false)` once, then client-side filters for `task_id == "cowork-slot:"+slot_id` OR `task_id` starts with `"published:"+slot_id+":"`
  - FR-4: on hit, reuses the exact peer-collision log/telegram/EXIT text already in Phase B
  - FR-5: non-cowork agents short-circuit, zero behaviour change
  - FR-6: a 1-line `CLAUDE.md` phase-list edit (add "Step 2.4" between Phase A.5 and Phase B), landed in the **same commit** as the SKILL.md section

  **What the 5 cited lines actually are** (all read in full context, not just the single line):
  | Ref | What it actually is | Namespace it guards |
  |---|---|---|
  | `CLAUDE.md:14` | Phase B outcome-table "Peer collision" row (pre-existing, part of the 2026-05-21 outer-wrap design, last touched by `aef457f38` "shrink to pointer") | `intent:<agent>:<intent-key>` only |
  | `CARD.md:35` | Same Phase B collision branch, condensed hot-path card | `intent:<agent>:<intent-key>` only |
  | `SKILL.md:194` | Step 0a session-presence self-registration "IMPOSSIBLE" collision case (own-session presence row can't collide by construction; this is a misconfiguration guard, not a work-lock check) | `session-presence:$SID` only |
  | `SKILL.md:288` | Phase B Pattern section, same generic collision branch as CLAUDE.md:14/CARD.md:35 | `intent:<agent>:<intent-key>` only |
  | `SKILL.md:563` | Phase A.5 presence-roster duplicate-`agent_id` WARN — explicitly documented three lines below (§ "What this is NOT") as **advisory, never a gate** | cross-session `agent_id` duplication, not a lock namespace at all |

  None of the five references construct `AGENT_SLOTS`/`TARGET_SLOTS`, none read `cowork-schedule.json`,
  none call `task_list_held(kind="cowork-slot", ...)`, and none probe the `cowork-slot:<slot_id>` /
  `published:<slot_id>:<period>` keyspace. They are all instances of the **pre-existing, generic**
  `intent:` collision-response pattern (or the unrelated presence-registration/roster mechanisms) that
  predate this row's 2026-07-30 mint by weeks (`aef457f38`, `03fb2cc14`, `92ba46360` — all pre-mint).

  This is not a naming coincidence — it is the exact bug this row exists to fix. The whole point of
  `FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS` (BA spec + architect brief) is that
  `task_claim`/`task_list_held` match on **exact `task_id` string equality**, and the router's
  `intent:<agent>:<key>` namespace is a **different string** from cowork's `cowork-slot:<slot_id>` /
  `published:<slot_id>:<period>` namespace — so the existing Phase B collision check (the thing at all
  5 cited lines) structurally **cannot** detect a live cowork-slot claim, because it only ever compares
  `intent:` keys against other `intent:` keys. Step 2.4 is a **second, cross-namespace probe** that
  does not exist yet in any form. Confirmed via full-repo grep: zero hits for `Step 2.4`,
  `Cross-Path Collision`, `COWORK_AGENTS`, `AGENT_SLOTS`, `TARGET_SLOTS` outside the planning docs
  themselves (architecture brief, handoffs, PM decision journal). `git log` on all 3 target files since
  the row's mint shows only unrelated orphan-adoption/board-state-guard work
  (`234902038` "FR-1 prose sync, FR-3 board-state guard, FR-6 escalation owner_agent" — a
  **different, coincidentally-numbered** FR-1/FR-3/FR-6 set from `FIX-ORPHAN-FR1-FR3-FR6`, unrelated
  to this row's FR-1..FR-7; worth flagging so a future grep for "FR-1" doesn't conflate the two work
  streams), plus fire-election, presence-registration, and orphan-adoption features — none of which
  touch the cowork-slot collision probe.

  **Siblings TASK-COWORK-MUTEX-002/003 — same answer, and internally consistent:**
  - `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` (002's sole deliverable) does not
    exist (`ls` confirms).
  - `docs/agents/cowork-team/flow/spawn-fanout.md` has zero occurrences of "Step 2.4",
    "Cross-Path Collision", or "dispatch-claim" (003's sole deliverable — the annotation was never added).
  - Both board rows are still `status: BACKLOG`, `updated_at: 2026-07-30T18:27:29Z` (untouched since
    mint, 13 days), `depends: [TASK-COWORK-MUTEX-001]`. Since 001's deliverable does not exist, 002/003
    correctly have nothing to depend on yet — the dependency chain is coherent, not stale.

- **Recommended next step:** Do **NOT** close TASK-COWORK-MUTEX-001 — it is not shipped. Restore it to
  a normal P0 **build** task (remove the SPIKE framing, this adjudication is complete) with the
  `files`/AC it was missing, sourced directly from the architecture brief §3 file-level design table
  (already fully specified — no further design work needed, straight to `developer` implementation):
  1. `.claude/skills/dispatch-claim/SKILL.md` — new `## Step 2.4 — Cowork-Slot Cross-Path Collision
     Probe` section between `§ Phase A.5` and `§ Pattern (Phase B)`.
  2. `CLAUDE.md` line 7 (current "BEFORE spawning any agent" phase-list, item 2.5) — 1-line addition
     naming Step 2.4, **same commit** as #1 (FR-6 lockstep).
  3. `docs/agents/tools/list/task_list_held.md` — document the `expired` param (non-blocking doc-sync).
  Then TASK-COWORK-MUTEX-002 (FR-7 test harness) and TASK-COWORK-MUTEX-003 (spawn-fanout.md
  cross-reference) proceed as originally sequenced, both still correctly gated on 001.
  Update the board row: replace `po_prior_art_suspect_20260808T1600Z` note with a
  `po_prior_art_refuted_20260812` pointer to this findings doc so the next triage/manual-dispatch-sweep
  pass stops re-flagging it as possible prior art.

- **Code reference:** none — pure investigation, no branch created (no code was written or tested;
  creating/switching branches on a shared `main` with concurrent live peer sessions risks hijacking
  their working tree per `feedback_subagent_branch_checkout_hijacks_shared_working_dir`, and this spike
  had nothing to branch for).
