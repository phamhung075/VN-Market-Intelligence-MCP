# Task: FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own status_note (no handoff file — direct-commit path), attaches RC-VERIF
# verification.raw_probe.
#
# CORRECTION: the row's stored `.commit_sha` (b164e37781f015680df8fe85d7a7419378b49fa7)
# is WRONG for this task — it is an unrelated agent-father notebook-merge commit
# (touches STEP-COWORK-*-agent-father.md/notebooks/agent-father.md/a context-bloat
# signal json; NONE of the claimed po/flow files). On main ancestry but fails
# check-3 (files[] must appear in the commit's own diff). The prior dev-team
# review_note's cross-check ("commit cb6ba9567 ... sha above post-merge ...
# confirmed") is therefore also unverifiable as stated against that hash.
#
# REAL commit found via `git log --all --grep=<task-id>` (exactly 1 hit, no
# ambiguity): c1c97e3402671d5d95cae16fef36ffe835279d69 — confirmed on main
# ancestry, `git show --stat` touches exactly the 3 claimed po/flow/*.md files
# + a new scripts/audits/*.sh regression script, matches the row's own AC.
# (cb6ba956719c85fca15c6544e8f0c3533eb34d61 is a byte-identical-message
# parallel-worktree duplicate, NOT on main ancestry — dead-end, correctly
# superseded by c1c97e340 landing.)
#
# .head.active_task_id is a DIFFERENT row this batch (QA-Drain), left untouched
# per CANONICAL:SSOT-STATUSFLIP-LANEMOVE rule (b) — only synced if it IS this id.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-fix-po-triage-signals-cired-template-status-todo-rejected-by-validator-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR";
def real_commit: "c1c97e3402671d5d95cae16fef36ffe835279d69";
($ARGS.named.now) as $now |
def qa_note:
  "\n\n[QA] Review Record (direct-commit verify, qa, " + $now + "): APPROVED, DONE_VERIFIED — " +
  "with a commit_sha CORRECTION. Row's stored `.commit_sha` (b164e37781f015680df8fe85d7a7419378b49fa7) " +
  "is WRONG for this task: `git show --stat` on that hash is an unrelated agent-father notebook-merge " +
  "commit ('merge S15/S16 journal + notebook — TE-T12 + ci_red-template-drift'), touches only STEP-" +
  "COWORK-*-agent-father.md/notebooks/agent-father.md/a context-bloat signal json — NONE of this row's " +
  "claimed po/flow files. It IS on main ancestry (passes check-2) but FAILS check-3 (no files[] entry " +
  "appears in its own diff). The prior dev-team review_note's cross-check ('commit cb6ba9567 cherry-" +
  "picked, sha above post-merge, confirmed... diff matches claim exactly') is therefore also unverifiable " +
  "as stated against that hash — flagging for visibility, not re-litigating since the underlying work " +
  "IS genuinely landed (see below). REAL commit found via `git log --all --grep=<task-id>` (exactly 1 " +
  "hit, zero ambiguity): c1c97e3402671d5d95cae16fef36ffe835279d69 — confirmed `git merge-base --is-" +
  "ancestor` main, `git show --stat` touches exactly docs/agents/po/flow/{triage-signals,channel-audit," +
  "sprint-kickoff}.md + new scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh, " +
  "matches the row's own AC exactly (5x TODO->BACKLOG across 3 files + new regression script). Sibling " +
  "cb6ba956719c85fca15c6544e8f0c3533eb34d61 (byte-identical author/date/message, different tree — " +
  "parallel-worktree artifact per b164e377's own commit message) is NOT on main ancestry — dead-end " +
  "duplicate, correctly superseded by c1c97e340's landing. Live content re-verified on main HEAD " +
  "directly (not trusting either commit's diff alone): zero `status: \"TODO\"` tokens remain anywhere " +
  "across all 15 docs/agents/po/flow/*.md files; every `.task_board.backlog[]` mint append across that " +
  "directory now writes `status: \"BACKLOG\"`; orchStateSchema.ts LANE_ALLOWED_STATUSES.backlog " +
  "independently confirmed unchanged = {BACKLOG, BLOCKED} (out-of-scope guard honored, validator not " +
  "touched). Re-ran the fix's own regression harness fresh (not trusted from review_note prose): " +
  "scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh — 42/42 PASS, real live " +
  "orch-state.json confirmed untouched by the fixture-harness run. No production TS/JS source touched " +
  "by this fix (pure prose templates + one new bash audit script) — bun test/tsc/mock-guard/DDD/" +
  "security scans correctly N/A, not skipped without basis; the purpose-built regression script IS the " +
  "targeted verification for this template-vs-schema-validator artifact class (no existing bun test " +
  "suite covers markdown mint-template prose). Corrected `.commit_sha` on this write to the real commit.";
(.task_board.qa[] | select(.id == id)) as $row |
(if $row == null then error(id + " not found in task_board.qa[] — refuse")
 elif ($row.status != "QA") then error(id + " status != QA (got " + ($row.status // "null") + ") — refuse")
 else $row end) as $row |
($row
  + {
      status: "DONE_VERIFIED",
      commit_sha: real_commit,
      updated_at: $now,
      updated_by: "qa",
      completed_at: $now,
      completed_by: "qa",
      qa_verified_at: $now,
      qa_verified_by: "qa",
      status_note: ($row.status_note + qa_note),
      verification: {
        raw_probe: {
          tool: "grep + bash scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh",
          args: "grep -n 'status: \"TODO\"' docs/agents/po/flow/*.md (expect empty, 15 files); bash scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh (fixture-harness replay of every fixed mint template against the real orch-apply.sh)",
          live_value_observed: "0 TODO-status matches across all 15 po/flow/*.md files; verify script 42/42 PASS; LANE_ALLOWED_STATUSES.backlog={BACKLOG,BLOCKED} unchanged in orchStateSchema.ts",
          observed_at: $now,
          evidence_commit: real_commit
        }
      }
    }
  | del(.next_agent)
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated] |
(if (.head.active_task_id // null) == id then
   .head = {status: "idle", updated_at: $now, updated_by: "qa", active_task_id: null, next_agent: "router"}
 else . end)
