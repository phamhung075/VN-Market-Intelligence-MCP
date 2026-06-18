# po-s103-guard1-defeat-fix-schedule-clobber-sau-d4-triage.jq
#
# Single-pass multi-mutation tick triage (atomic, idempotent):
#   M1  id-guarded MINT of FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE -> ready[]
#       (the fix to the done ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP whose Safety Guard 1
#        keyed on perpetual working-tree dirtiness -> the worktree push almost never
#        fired; both flow files already corrected this pass; qa must TEST it FIRES
#        under the real condition: ahead>20 AND main tree dirty).
#   M2  id-guarded MINT of FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER -> ready[]
#       (cowork-schedule.json last_fired stamps clobbered by a read-modify-write race
#        on a stale base; fix = fresh-read-before-write + atomic temp->rename +
#        single-slot targeted jq set, never echo a whole stale snapshot).
#   M3  FLIP signal_queue row cowork-team-...-schedule-json-stale-base-clobber
#       NEW -> READ (READ not RESOLVED: fix minted, not yet shipped).
#   M4  FLIP signal_queue row sau-d4-202606180300 NEW -> RESOLVED, STALE
#       (recurring D4 false-positive: esc-datacov:FPT ESC-3 escalation TTL lock
#        legitimately has no task_board row; dismissed STALE >=5 times prior; no mint).
#   M5  PRESERVE cloud additive archive row tnb-20260617T201300 into
#       signal_queue.archive[] if absent (avoid clobbering cloud's add on commit).
#
# Idempotent: every mint id-guarded across ALL board arrays; flips status-guarded;
#             archive preservation membership-guarded.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s103-...jq docs/data/orch/orch-state.json
# Harness: atomic temp -> [ -s ] -> jq empty -> conservation -> rename;
#          commit orch-state by EXPLICIT PATH.

# ---- helpers ----
def all_ids:
  [ .task_board | (.ready,.backlog,.in_progress,.review,.done,.done_verified)[]?
    | if type=="object" then .id? else . end ] | map(select(. != null));

def has_id($id): (all_ids | index($id)) != null;

# ---- M1 task object ----
def m1_task($now): {
  id: "FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE",
  title: "Auto-push backstop Safety Guard 1 keys on perpetual working-tree dirtiness -> never fires",
  type: "FIX",
  status: "READY",
  priority: "P2",
  zone: "cross-service/",
  next_agent: "qa",
  blocking: false,
  root_cause: "Step PUSH-BACKSTOP Safety Guard 1 (po/flow/main.md) + dev-team/flow/post-cycle.md Step 4.8 skipped the worktree push whenever `git diff --name-only` matched orch-state.json OR docs/agent-memory/notebooks/. Those files are PERPETUALLY dirty from cowork churn (the exact premise the worktree-isolated push exists to overcome), so Guard 1 blocked ~every tick. The push climbed 23->28-ahead (> threshold 20) with local HEAD off origin = backstop did not fire. The worktree push (git worktree add /tmp HEAD) operates on COMMITTED HEAD, fully isolated from the dirty main tree -> a dirty main tree CANNOT race it; Guard 1's premise is invalid for a worktree push.",
  fix_spec: "DONE THIS PASS (flow files): replaced Guard 1 file-dirtiness skip with a real-push-blocker check (.git/rebase-merge||.git/rebase-apply, .git/MERGE_HEAD, .git/index.lock). Kept Guard 2 (commit-mutex task_list_held kind=commit-mutex) as the real concurrency guard. fleet-worktree-push.sh RAW-verified to have NO internal dirty-tree skip (only ahead-count + behind-set chore-classify + tsc gate). This FIX task tracks the qa verification of that change.",
  verification_gate: "qa MUST test the push FIRES when ahead>20 AND the main working tree is dirty (orch-state + a notebook modified) -- the EXACT real condition, NOT a clean-tree test that would false-pass like the original guard. Also assert: push still SKIPS on a genuine push-blocker (simulate .git/index.lock present) and on commit-mutex held. Verify both flow files (po/flow/main.md Step PUSH-BACKSTOP + dev-team/flow/post-cycle.md Step 4.8) carry the corrected Guard 1.",
  files: ["docs/agents/po/flow/main.md","docs/agents/dev-team/flow/post-cycle.md","scripts/fleet-worktree-push.sh"],
  origin: "2026-06-18 router RAW-diagnosed: ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP (done) self-defeating Guard 1; manual worktree push fired this pass (13f2e03b->1c78bfa8, 28-ahead cleared).",
  created_at: $now,
  groomed_by: "po-s103",
  promoted_at: $now
};

# ---- M2 task object ----
def m2_task($now): {
  id: "FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER",
  title: "cowork-schedule.json last_fired stamps clobbered by stale-base read-modify-write race",
  type: "FIX",
  status: "READY",
  priority: "P2",
  zone: "apps/mcp-server/",
  next_agent: "ba",
  blocking: false,
  root_cause: "A writer (most likely the cloud cowork-leader dispatcher, owner_agent=cowork-dispatcher) holds a STALE in-memory/checkout snapshot of cowork-schedule.json (06-15 baseline -- file uncommitted since e96176d8 2026-06-15), updates only ITS slot (chef-intraday) and writes the WHOLE file back -> every other slot last_fired reverts to the stale base. Evidence 2026-06-18T04:07Z: chef-intraday=03:23:15Z (fresh, =file mtime) BUT news-scout-offhours=market-watcher-offhours=2026-06-15T08:08:57Z, chef-morning=2026-06-15T05:25:52Z, bctc-analyst-slot-4=2026-06-15T00:06:43Z -- reverted to 3-day-old values despite fresh stamps existing earlier today (00:07Z matcher snapped_last_fired=2026-06-18T00:00:00Z). Effect: matcher sees slots as massively overdue -> spurious re-offer/re-fire risk (doublefire class); cadence ledger corrupted. NOT a gather gap (gathering still happens; only the stamp ledger is clobbered). Relates [[feedback_worktree_stale_base]] + guaranteed-slot doublefire class.",
  fix_spec: "cowork-schedule.json writer MUST FRESH-READ immediately before write + atomic temp->rename + write ONLY the single mutated slot (jq targeted set / per-slot CAS), never echo back a whole stale snapshot. Same pattern as orch-state consolidate (atomic temp->rename + caller fresh-read, project_orch_state_cutover). Applies to BOTH the cloud cowork-leader dispatcher writer AND any local cowork-team last-fired writer (docs/agents/cowork-team/flow/last-fired.md, match-slots.md).",
  generic_mandate: "Fix the WRITE discipline at the schedule-writer layer (fresh-read + single-slot CAS), not a one-off re-stamp -- a re-stamp without the write-discipline fix re-clobbers next tick.",
  verification_gate: "After fix: two concurrent simulated writers each mutating a DIFFERENT slot must BOTH persist (no slot reverts to a stale base); cowork-schedule.json slots show monotonic last_fired (no 3-day reversion) across a multi-writer window; matcher no longer reports spurious massive-overdue.",
  files: ["docs/data/cowork-schedule.json","docs/agents/cowork-team/flow/last-fired.md","docs/agents/cowork-team/flow/match-slots.md","apps/mcp-server/"],
  signal_ref: "cowork-team-20260618T0408Z-schedule-json-stale-base-clobber",
  origin: "2026-06-18 cowork-team signal, MEDIUM, RAW-verified mixed-state at 04:07Z.",
  created_at: $now,
  groomed_by: "po-s103",
  promoted_at: $now
};

# ---- cloud archive row to preserve (M5) ----
def cloud_archive_row: {
  id: "tnb-20260617T201300",
  ts: "2026-06-17T20:13:00Z",
  from: "tran-ngoc-bau",
  to: "po",
  type: "audit-handoff",
  summary: "c98 NEEDS_ATTENTION STABLE -- morning 5/6+7/9 GOOD, EOD 5.5/6+7.5/9 GOOD, G3/G4/G6 FAIL day3, AC-GOLD-L6 applied, evening PENDING",
  severity: "HIGH",
  status: "NEW",
  payload_ref: "docs/handoffs/tnb-audit-latest.md"
};

# ---- apply ----
. as $root
| ($now) as $now

# M1
| .task_board.ready =
    ( if (has_id("FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE")) then .task_board.ready
      else (.task_board.ready + [ m1_task($now) ]) end )

# M2 (re-evaluate has_id against updated state)
| .task_board.ready =
    ( if ([ .task_board | (.ready,.backlog,.in_progress,.review,.done,.done_verified)[]?
            | if type=="object" then .id? else . end ] | index("FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER")) != null
      then .task_board.ready
      else (.task_board.ready + [ m2_task($now) ]) end )

# M3 schedule-clobber signal NEW -> READ
| .signal_queue.rows =
    ( .signal_queue.rows | map(
        if (.id=="cowork-team-20260618T0408Z-schedule-json-stale-base-clobber" and .status=="NEW")
        then . + { status:"READ", disposition:"FIX minted FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER -> ready[] (dev-mcp-server zone, ba next). READ not RESOLVED until the writer-discipline fix ships.", read_at:$now, resolved_by:"po-s103" }
        else . end ) )

# M4 sau-d4 NEW -> RESOLVED STALE
| .signal_queue.rows =
    ( .signal_queue.rows | map(
        if (.id=="sau-d4-202606180300" and .status=="NEW")
        then . + { status:"RESOLVED", resolved_at:$now, resolved_by:"po-s103", resolution:"STALE -- RECURRING D4 false-positive. Held-lock esc-datacov:FPT:Q1-2026:ESC-3 has no orch-state task_board row because it is an ESC-3 data-coverage escalation TTL lock (esc-datacov: 30d, route ops) that INTENTIONALLY has no task row (escalation locks are not tasks); the system-auditor D4 check does not whitelist the esc-datacov:* key class -> false orphaned flag. Lock TTL-expired + GC'd (task_list_held=0 in prior RAW probe). Dismissed STALE before: po-s76 x2, 5a807e65, 44853141, po-s95. Durable owner = system-auditor D4 blind-spot (tracked: FU-AUDITOR-D4-SIGNAL-ID). No new board task (not worth the WIP budget on nothing-new)." }
        else . end ) )

# M5 preserve cloud archive row if absent
| .signal_queue.archive =
    ( if ((.signal_queue.archive // []) | map(.id) | index("tnb-20260617T201300")) != null
      then .signal_queue.archive
      else ((.signal_queue.archive // []) + [ cloud_archive_row ]) end )

# metadata
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s103"
