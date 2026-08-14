# Task: INVESTIGATE-EMPTY-DATA-TABLES
# QA Direct-Commit Verify (dev-team Review-Lane QA-Drain, qa[] row, branch:null).
# Moves the row qa[] -> done_verified[] in the SAME orch-apply.sh write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), appends [QA] Review Record to the row's
# own review_note field (no handoff file -- direct-commit path), attaches
# verification.raw_probe.
#
# Commit d4569c5b8 (docs-only: SPIKE doc + notebook + decision journal, zero
# production code) confirmed on main ancestry, git show --stat matches all 3
# changed files exactly.
#
# .head not touched -- review-lane QA-drain is head-decoupled
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE(b)); dispatcher (dev-team) owns .head
# for this batch.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-verify-investigate-empty-data-tables-doneverified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def id: "INVESTIGATE-EMPTY-DATA-TABLES";
def code_commit: "d4569c5b8";
($ARGS.named.now) as $now |
def qa_note:
  " | [QA] Review Record (direct-commit verify): APPROVED, DONE_VERIFIED. Verified commit " +
  code_commit + " (docs-only: SPIKE doc + notebook + decision journal, ZERO production code " +
  "-- consistent with the SPIKE's own investigation-only AC) on main ancestry -- git show " +
  "--stat matches all 3 changed files exactly (SPIKE-INVESTIGATE-EMPTY-DATA-TABLES.md, " +
  "notebooks/dev-mcp-server.md, decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server-2.md). " +
  "Independently re-ran/re-derived every substantive claim, not trusted from review_note prose: " +
  "(1) live sqlite3 -readonly row counts on data/live/market.db (the actual bind-mounted prod DB " +
  "per docker-compose.yml) confirm all 5 tables = 0 today. (2) brokerSanctionsJob.ts:99-105 " +
  "defaultFetchSanctions() confirmed verbatim TODO stub returning []. (3) " +
  "brokerSanctionsJob.ts:45 QUARTER_MONTHS=[3,6,9,12] confirmed exact. (4) muasamcong.ts:35-40 " +
  "getMuasamcongUrl() confirmed to return the proxy env var (or MUASAMCONG_ORIGIN fallback) " +
  "verbatim, no ?path= composition. (5) davPharmacyJob.ts:18,35 confirmed to import/call only " +
  "shouldSkipRecoveryReplay, never shouldRunCatchup, though startupHelpers.ts:102 exports a " +
  "distinct shouldRunCatchup used by 3 other scheduler files -- corroborates the no-catchup-guard " +
  "claim. (6) sscInsider.ts parseInsiderHtml() confirmed a plain <tr>/<td> regex extractor. bun " +
  "tsc --noEmit (apps/mcp-server) 0 errors; mock-guard.sh N/A (zero non-doc files in commit); " +
  "process.env/secrets grep clean on all 3 changed files; DDD scan N/A (no src/ files touched). " +
  "ONE FRESHNESS CAVEAT (non-blocking): review_note's phrase 'davPharmacyCheckJob cron_job_runs " +
  "= exactly 1 success ever (2026-04-30)' is now stale vs a live re-query -- cron_job_runs shows " +
  "a 2nd success at 2026-07-31T23:00:01Z (=Aug-1 ICT monthly fire), landing after the SPIKE " +
  "commit's own timestamp (07-31T18:05:56+02:00) but before this QA pass. Does not invalidate " +
  "the diagnosis -- June-1 and July-1 were STILL both missed despite the intervening April-30 " +
  "and this later July-31 run, corroborating rather than contradicting the unswept " +
  "startup-catchup-guard-gap root cause. The committed SPIKE doc itself is accurate as written " +
  "at its own point-in-time; staleness is confined to the qa[] row's later review_note " +
  "restatement, not the artifact. DJ: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-23.md STEP qa-S7.";
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
          tool: "git merge-base --is-ancestor + git show --stat + sqlite3 -readonly + grep + bun tsc --noEmit",
          args: "commit d4569c5b8 on main ancestry; live row counts on data/live/market.db for credit_data/insider_transactions/public_contracts/pharma_events/broker_sanctions; source greps on brokerSanctionsJob.ts, muasamcong.ts, davPharmacyJob.ts, startupHelpers.ts, sscInsider.ts; cron_job_runs history queries for davPharmacyCheckJob/insiderCheckJob/brokerSanctionsSweep/publicContractsJob; bun tsc --noEmit (apps/mcp-server)",
          live_value_observed: "all 5 tables=0 rows live; defaultFetchSanctions() stub confirmed verbatim; QUARTER_MONTHS=[3,6,9,12] confirmed; getMuasamcongUrl() verbatim passthrough confirmed (no ?path=); davPharmacyJob.ts uses shouldSkipRecoveryReplay not shouldRunCatchup confirmed (both exist as distinct exports); parseInsiderHtml() plain regex confirmed; bun tsc --noEmit 0 errors; cron_job_runs shows davPharmacyCheckJob 2 successes (04-30, 07-31) with 06-01/07-01 both still missing -- freshness caveat on review_note wording, non-blocking, diagnosis corroborated not contradicted",
          observed_at: $now,
          evidence_commit: code_commit
        }
      }
    }
) as $updated |
.task_board.qa |= map(select(.id != id)) |
.task_board.done_verified += [$updated]
