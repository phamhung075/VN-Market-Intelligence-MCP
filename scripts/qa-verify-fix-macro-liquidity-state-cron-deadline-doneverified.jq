# Task: FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own status_note (no handoff file — direct-commit path), attaches RC-VERIF
# verification.raw_probe, and corrects the row's stale commit_sha field.
#
# Row's own commit_sha (eb6524da9) is NOT on main ancestry — it is an orphaned/
# rewritten hash sharing the identical commit MESSAGE as e10e2a500 (which IS on
# main, dispatcher-supplied ref, verified via `git merge-base --is-ancestor`).
# Corrected here rather than trusted as-is.
#
# .head already idle / active_task_id null (not pointing at this row) — left
# untouched, no reset needed.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-fix-macro-liquidity-state-cron-deadline-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE";
def real_commit: "e10e2a500";
($ARGS.named.now) as $now |
def qa_note:
  "\n\n[QA] Review Record (direct-commit verify, qa, " + $now + "): APPROVED, DONE_VERIFIED. " +
  "Row's own commit_sha (eb6524da9) was STALE — not on main ancestry (orphaned/rewritten hash, " +
  "identical commit message to e10e2a500). Corrected to e10e2a500 (dispatcher-supplied), confirmed " +
  "`git merge-base --is-ancestor e10e2a500 main`, `git show --stat` matches all 8 claimed files " +
  "exactly (2 application, 3 infrastructure, 3 architecture docs). Re-ran REAL verification, not " +
  "trusted from prose: `go test ./pkg/application/... ./pkg/infrastructure/...` targeted, then full " +
  "`go test ./...` across all 12 packages — 0 fail, incl. TestFetchDeadline_LiquidityState_" +
  "BothHanging_SharedBudget at 8.00s (proves ONE shared FetchBudgetSec window, not stacked 8s+8s=16s " +
  "which would still miss the 15s cron deadline). `go build ./...` clean, `go vet ./...` clean, " +
  "`golangci-lint run` (Fence-A/B/C depguard) 0 issues. `mock-guard.sh --files` PASS on the 3 touched " +
  "production .go files. DDD dependency-direction verified: pkg/domain imports zero infrastructure " +
  "(clean); pkg/infrastructure importing pkg/domain for the shared FetchBudgetSec const is the correct " +
  "direction. Security greps (process.env/password/secret/token) clean on touched files. BCTC eval " +
  "gate N/A (macro-indicators liquidity-state endpoint, no BCTC report in scope). Root-cause fix " +
  "matches PO's explicit fix direction (bounded the handler's own upstream fetch to a shared budget, " +
  "did NOT raise deadlineMs). DJ-GATE-1 pre-satisfied: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-" +
  "indicators.md §dev-macro-indicators-S4. Residual out-of-zone defect (sbvOmoLiquidityCronJob.ts:70 " +
  "error-string conflation, apps/mcp-server/) correctly NOT touched here per dev's own zone_restricted " +
  "note — flagged by dev for a follow-up FIX row, not this row's concern.";
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
      next_agent: "pm",
      status_note: ($row.status_note + qa_note),
      verification: {
        raw_probe: {
          tool: "go test",
          args: "./pkg/application/... ./pkg/infrastructure/... then full ./... (apps/macro-indicators)",
          live_value_observed: "all 12 packages ok, 0 fail; TestFetchDeadline_LiquidityState_BothHanging_SharedBudget PASS at 8.00s (shared-budget, not stacked 16s); go build/vet clean; golangci-lint 0 issues; mock-guard PASS",
          observed_at: $now,
          evidence_commit: real_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated]
