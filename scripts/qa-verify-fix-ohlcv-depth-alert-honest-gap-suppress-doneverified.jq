# Task: FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own review_note field (no handoff file — direct-commit path), attaches
# verification.raw_probe (ANCHOR-REALDATA close).
#
# Commits 876f07874 (code+tests) + 2477cfba7 (docs) both confirmed on main
# ancestry, git show --stat matches all claimed files exactly.
# .head currently points at an unrelated row (FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-
# PARSED-AS-DATE) — left untouched (review-lane QA-drain is head-decoupled).
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-fix-ohlcv-depth-alert-honest-gap-suppress-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS";
def code_commit: "876f07874";
def docs_commit: "2477cfba7";
($ARGS.named.now) as $now |
def qa_note:
  " | [QA] Review Record (direct-commit verify): APPROVED, DONE_VERIFIED. Verified commits " +
  code_commit + " (code+tests) + " + docs_commit + " (docs) on main ancestry -- git show --stat " +
  "matches all claimed files exactly (ohlcvBackfillHandler.ts, ohlcvHistoryBackfillJob.ts + new " +
  "ohlcvGapClassifier.ts + 3 test files). Independently re-ran (not trusted from prose): 9 new tests " +
  "(FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS-{handler,scheduler}.test.ts) 9/9 pass; " +
  "1360-ohlcv-backfill-queue.test.ts (TC-6 updated) + ohlcv-backfill-done-subtask-b.test.ts (BT-1..8) " +
  "+ OHLCV-BACKFILL-P0.test.ts all green (18/18); bun tsc --noEmit 0 errors; mock-guard.sh PASS; DDD " +
  "(domain->infra/app import) + secret/process.env greps clean on all 3 touched production files. " +
  "verification_gate re-verified via test assertions, not descriptions: (a) HG-1/HG-2 (handler) + " +
  "scheduler DoD(a) -- honest-gap-only shortfall -> 0 pending rows, no new row inserted (escalate " +
  "branch never entered, so no BUG escalation possible); (b) HG-3 -- empty-body ack closing a 2nd row " +
  "after a healthy count-POST close -> 0 pending rows, no phantom re-queue. HG-4/HG-5 + scheduler " +
  "regression-control tests confirm genuine shortfalls and a stalled VNINDEX still fire (fix does not " +
  "neuter real detection). Read isHonestGapCode diff directly: pure predicate, VNINDEX never routed " +
  "through it at either call site; bars_inserted UPDATE uses COALESCE(?, bars_inserted). DJ-GATE-1: " +
  "sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-21.md STEP qa-S135 (this verify) + " +
  "sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md STEP dev-mcp-server-S25 (implementer).";
(.task_board.qa[] | select(.id == id)) as $row |
(if $row == null then error(id + " not found in task_board.qa[] — refuse")
 elif ($row.status != "QA") then error(id + " status != QA (got " + ($row.status // "null") + ") — refuse")
 else $row end) as $row |
($row
  + {
      status: "DONE_VERIFIED",
      updated_at: $now,
      updated_by: "qa",
      review_note: ($row.review_note + qa_note),
      next_agent: "pm",
      qa_verified_at: $now,
      qa_verified_by: "qa",
      verification: {
        raw_probe: {
          tool: "bun test",
          args: "src/__tests__/FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS-{handler,scheduler}.test.ts + 1360-ohlcv-backfill-queue.test.ts + ohlcv-backfill-done-subtask-b.test.ts + OHLCV-BACKFILL-P0.test.ts + bun tsc --noEmit + mock-guard.sh (apps/mcp-server)",
          live_value_observed: "9/9 new tests pass; 18/18 pass across 1360+BT1-8+P0 targeted suites; bun tsc --noEmit 0 errors; mock-guard.sh PASS; DDD/secret greps 0 hits on 3 touched production files",
          observed_at: $now,
          evidence_commit: code_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated]
