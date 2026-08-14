# Task: FU-BACKFILL-MULTIPLE-COVER-LETTERS
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own review_note field (no handoff file -- direct-commit path), attaches
# verification.raw_probe.
#
# Commit c515ec142 (fix+test+doc, single commit) confirmed on main ancestry,
# git show --stat matches all 3 claimed files exactly
# (FU-BACKFILL-MULTIPLE-COVER-LETTERS.test.ts, backfillBctcPdfPaths.ts,
# usecases.md). Sibling commit 26bb028bc is the developer's own
# notebook+journal housekeeping, not part of the deliverable -- not cited as
# evidence here.
# .head not touched -- review-lane QA-drain is head-decoupled
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE(b)); dispatcher (dev-team) owns .head
# for this batch.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-fu-backfill-multiple-cover-letters-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "FU-BACKFILL-MULTIPLE-COVER-LETTERS";
def code_commit: "c515ec142";
($ARGS.named.now) as $now |
def qa_note:
  " | [QA] Review Record (direct-commit verify): APPROVED, DONE_VERIFIED. Verified commit " +
  code_commit + " (fix+test+doc, single commit) on main ancestry -- git show --stat matches " +
  "all 3 claimed files exactly (FU-BACKFILL-MULTIPLE-COVER-LETTERS.test.ts, " +
  "backfillBctcPdfPaths.ts, docs/architecture/microservice/mcp-server/usecases.md). " +
  "Independently re-ran (not trusted from review_note prose): new test file 12/12 pass " +
  "(matches AC1/AC2 claim); wider regression batch (new file + FIX-CTG-PDF-MISLINK.test.ts + " +
  "PI3-bctc-inspect-reopen2.test.ts) 56/56 pass, byte-identical to the row's own claimed " +
  "56/56 count. bun tsc --noEmit 0 errors. mock-guard.sh --files backfillBctcPdfPaths.ts exit 0 " +
  "PASS. process.env/secrets grep clean. DDD: file greps a from.*infrastructure hit (logger.js " +
  "import) but is application/usecases/, not domain/ -- dev-standards.md golden rule scopes the " +
  "ban to domain/ only, application importing infrastructure is the documented established " +
  "pattern -- not a violation; zero domain/ files in scope. Read the fix code directly: " +
  "isConsolidatedReportFilename() positive-match gate applied to both NULL-pass and heal-pass, " +
  "replacing the old negative-match !isCoverLetterFilename -- matches the described mechanism " +
  "exactly, not just accepted from prose. usecases.md doc section confirmed present in the " +
  "commit itself. DJ-GATE-1: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-23.md STEP qa-S1 (this " +
  "verify).";
(.task_board.qa[] | select(.id == id)) as $row |
(if $row == null then error(id + " not found in task_board.qa[] -- refuse")
 elif ($row.status != "QA") then error(id + " status != QA (got " + ($row.status // "null") + ") -- refuse")
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
          args: "src/__tests__/FU-BACKFILL-MULTIPLE-COVER-LETTERS.test.ts + FIX-CTG-PDF-MISLINK.test.ts + PI3-bctc-inspect-reopen2.test.ts + bun tsc --noEmit + mock-guard.sh (apps/mcp-server)",
          live_value_observed: "12/12 new tests pass; 56/56 pass across the 3-file regression batch; bun tsc --noEmit 0 errors; mock-guard.sh PASS; process.env/secrets grep 0 hits",
          observed_at: $now,
          evidence_commit: code_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated]
