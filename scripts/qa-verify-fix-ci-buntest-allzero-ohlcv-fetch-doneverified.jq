# Task: FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own status_note (no handoff file — direct-commit path), attaches RC-VERIF
# verification.raw_probe.
#
# Row carried no `.commit`/`.files[]` beyond the single files[] entry and no
# explicit commit hash — derived via `git log -- <file>`, commit a9291bbbc,
# confirmed on main ancestry, `git show --stat` matches the row's sole
# files[] entry exactly (test-only change).
#
# .head.active_task_id IS this row (QA-Drain batch dispatch) — synced to idle
# in the SAME write per CANONICAL:SSOT-STATUSFLIP-LANEMOVE rule (b).
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-fix-ci-buntest-allzero-ohlcv-fetch-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH";
def real_commit: "a9291bbbc";
($ARGS.named.now) as $now |
def qa_note:
  "\n\n[QA] Review Record (direct-commit verify, qa, " + $now + "): APPROVED, DONE_VERIFIED. " +
  "Row carried no explicit `.commit` field — derived via `git log -- apps/mcp-server/src/__tests__/" +
  "ALLZERO-OHLCV-FETCH.test.ts`, commit a9291bbbc, confirmed `git merge-base --is-ancestor a9291bbbc " +
  "main`, `git show --stat` matches the row's sole files[] entry exactly (test-only, 25+/13-). Diff " +
  "read at source, not dev prose: root cause genuinely wall-clock date drift — AC-1..AC-3 hardcoded " +
  "absolute fixture dates (2026-06-1x/2026-05-30) vs get_price_history's live date('now','-N days') " +
  "SQL filter; fix adds dateStr(daysAgo) deriving fixtures from Date.now(). Claimed \"same idiom as " +
  "178-price-history.test.ts\" independently grep-confirmed byte-identical (dateStr helper present " +
  "verbatim in that file). Own re-run, both invocations: bare `bun test src/__tests__/ALLZERO-OHLCV-" +
  "FETCH.test.ts` 5/5 pass; exact CI isolation invocation (STOCK_PRICE_DB_PATH=<unique>, matching " +
  "scripts/ci-per-file-isolation.sh) 5/5 pass. `bun tsc --noEmit` clean (0 output, exit 0). No " +
  "production file touched (Smart-Skip: test-only change) — mock-guard/DDD/security scans correctly " +
  "N/A, not skipped without basis. Sibling FAILEDFILE FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-" +
  "NO-BACKFILL.test.ts is a separate board row, correctly left untouched. DJ: sprint-COWORK-" +
  "GUARANTEED-SLOT-CATCHUP-qa-20.md STEP qa-S125.";
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
          tool: "bun test",
          args: "src/__tests__/ALLZERO-OHLCV-FETCH.test.ts (bare + STOCK_PRICE_DB_PATH=<unique> CI-isolation invocation) then bun tsc --noEmit (apps/mcp-server)",
          live_value_observed: "5 pass / 0 fail (both invocations); tsc 0 errors",
          observed_at: $now,
          evidence_commit: real_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated] |
(if (.head.active_task_id // null) == id then
   .head = {status: "idle", updated_at: $now, updated_by: "qa", active_task_id: null, next_agent: "router"}
 else . end)
