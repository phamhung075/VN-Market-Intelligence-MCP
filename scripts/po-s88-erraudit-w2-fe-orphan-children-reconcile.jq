# po-s88-erraudit-w2-fe-orphan-children-reconcile.jq
#
# CLOSED-EPIC ORPHAN RECONCILE — single-pass status-correction relocation (NO new tasks).
#
# Context (2026-06-16): PM atomized FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH into 5 tracking child
# rows (T1..T5) appended to .task_board.ready[]. The umbrella reached done[] with
# status=done_verified after QA cycle-278 APPROVED it (f9766b7a: "tsc 0 errors;
# 1637/1639 vitest; safeFetch error-path RAW-verified (4 loaders + Cluster C); Board qa->done"),
# but the 5 child rows were NEVER relocated when the umbrella closed — they strand in ready[]
# carrying STALE per-child statuses (T1-T3 DONE, T4 IN_PROGRESS, T5 READY). This:
#   (a) falsely inflates ready[] to 13,
#   (b) shows a FALSE IN_PROGRESS coding lane (T4) that no longer exists (75a89a3b shipped +
#       30a691c2 "T4 complete -> qa hop" + f9766b7a APPROVED), and
#   (c) is the signal-row-status-lags-ground-truth / false-ready[N] drift class (po-s54).
#
# Ground-truth (git): every child's work is committed and the parent is QA-approved done_verified:
#   T1 c1f56334 (fetchUtils.ts create) | T2 35f5c6bb (Cluster C) | T3 a9f00230 (Cluster B)
#   T4 75a89a3b (Cluster A 28 loaders) | T5 validation gate MET inside the umbrella QA approval
#   (f9766b7a: pnpm check tsc 0 errors + 1637/1639 vitest).
#
# This script RELOCATES all 5 W2-FE-T* child rows ready[] -> done_verified[], stamping each with
# provenance pointing at the parent umbrella + its commit, and (for T1-T4) the child's own feat
# commit; T5's gate is the umbrella's QA-verified pnpm-check. Pure relocation — total entry count
# across the 5 board arrays is unchanged.
#
# Idempotent: a child already present in done_verified[] is NOT re-moved (guarded by id membership);
# re-run relocates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s88-erraudit-w2-fe-orphan-children-reconcile.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH; PUSH HELD)

# ---- child-id set + per-child commit provenance ----
def child_commits:
  {
    "FIX-ERRAUDIT-W2-FE-T1-FETCHUTILS-CREATE": "c1f56334",
    "FIX-ERRAUDIT-W2-FE-T2-CLIENT-CLUSTER-C":  "35f5c6bb",
    "FIX-ERRAUDIT-W2-FE-T3-PROXY-CLUSTER-B":   "a9f00230",
    "FIX-ERRAUDIT-W2-FE-T4-LOADERS-CLUSTER-A": "75a89a3b",
    "FIX-ERRAUDIT-W2-FE-T5-VALIDATION-REBUILD":"(umbrella QA gate f9766b7a: pnpm check tsc 0 errors)"
  };

def is_orphan_child($id):
  ($id // "") | test("^FIX-ERRAUDIT-W2-FE-T[1-5]-");

# Already-relocated ids (idempotency guard)
. as $root
| ($root.task_board.done_verified // []) as $dv
| ($dv | map(.id) ) as $dv_ids

# Collect the orphan children currently in ready[]
| ($root.task_board.ready // []) as $ready
| ($ready | map(select(is_orphan_child(.id) and (.id as $i | ($dv_ids | index($i)) | not)))) as $to_move
| (child_commits) as $cc

# Stamp each moved child with done_verified provenance
| ($to_move | map(
    . + {
      status: "done_verified",
      done_verified: true,
      reconciled_at: $now,
      reconciled_by: "po-s88",
      resolution: "closed-epic-orphan: parent FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH done_verified (QA cycle-278 APPROVED f9766b7a). Child relocated ready[]->done_verified[] (was stale " + (.status // "?") + ").",
      child_commit: ($cc[.id] // "n/a"),
      parent_umbrella: "FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH",
      parent_qa_commit: "f9766b7a"
    }
  )) as $moved

# Rewrite board: drop moved ids from ready[], append to done_verified[]
| .task_board.ready = ($ready | map(select((.id as $i | ($to_move | map(.id) | index($i))) | not)))
| .task_board.done_verified = ($dv + $moved)

# Metadata bump
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s88-erraudit-w2-fe-orphan-children-reconcile"
