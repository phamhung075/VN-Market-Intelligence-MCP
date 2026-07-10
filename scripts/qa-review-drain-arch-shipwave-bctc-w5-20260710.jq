# Review-drain sweep (router-dispatched maintenance, no board row, 2026-07-10T03:07Z tick).
# 3 stale task_board.review[] rows PO flagged as far outside the healthy REVIEW-age
# cluster and missing entered_review_at:
#
#  1. ARCH-SHIP-WAVE-REAUDIT (DEFERRED ~29d) -> CLOSED done_verified. Traced the full
#     downstream chain: pm already decomposed this brief into 8 tasks (commit 7cf1d9bf,
#     2026-06-11) which were ALL implemented + QA-APPROVED by 2026-06-12T12:22Z
#     (commit 487ca5091, journal sprint-SHIP-WAVE-REAUDIT-qa.md S1-S10) and archived
#     DONE in docs/data/orch/archive/2026-06.json. PO's park (b1de4ff92, 06-13T08:48Z)
#     postdated that completion by >20h and was never re-checked across 2 subsequent
#     relabels (06-15, 06-27) — stale premise, not a live blocker. DJ-GATE-1 confirmed
#     pre-existing (architect-S1/S2 in the same journal file).
#  2. TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST + 3.
#     W5-FU-CTG-REFINE-96e36139 (sibling rows, same CTG report_id) -> LEFT BLOCKED.
#     RAW-probed live named-volume market.db (docker exec sidecar): total_assets=0.0,
#     validation_status=low_confidence, 0 balance_sheet-tagged bctc_table_rows for
#     report_id=96e36139. The 451 live rows were extracted_at 2026-07-03T05:16:10Z,
#     BEFORE the FIX-BCTC-BANK-BS-COLUMN-ORDER fix commit d69b13f41
#     (2026-07-03T08:03:47Z) — served data predates the fix; operational reingest has
#     never re-run against the now-live fixed code (container rebuilt
#     2026-07-09T12:51Z, postdates the fix). NOT safe to sign off. next_agent
#     unchanged (ops) on both.
#
# All 3: entered_review_at backfilled from best-inferred real lane-entry timestamps
# (commit/dispatch/adoption events), not created_at fallback. Dry-run diffed against
# a scratch candidate before applying (rest-of-document byte-identical, only the
# targeted fields/lane changed; 123->123 pre-existing coherence warnings unchanged).
# .head untouched (was already idle — this sweep sits outside the dev-team pipeline
# chain, no board row of its own).
# DJ: sprint-SHIP-WAVE-REAUDIT-qa.md §qa-S11; sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-qa.md §qa-S3/S4.
#
# Usage: jq --arg now "$NOW" -f scripts/qa-review-drain-arch-shipwave-bctc-w5-20260710.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.review[] | select(.id=="ARCH-SHIP-WAVE-REAUDIT")) as $arch
| .task_board.done_verified += [
    ($arch
      + {
          status: "DONE_VERIFIED",
          entered_review_at: "2026-06-11T19:34:15Z",
          qa_verdict: "APPROVED",
          reviewed_at: $now,
          reviewed_by: "qa",
          qa_signoff_note: "[qa review-drain sweep \($now)] CLOSED DONE_VERIFIED — the DEFERRED/park status was STALE. Full-chain re-audit confirms the umbrella's entire purpose (design brief -> pm decomposes -> dev implements -> qa approves) was completed a month ago and simply never flipped in orch-state: architect brief committed 425349144 (2026-06-11T19:34:15Z, DJ-GATE-1 journal docs/agent-memory/decisions/sprint-SHIP-WAVE-REAUDIT-architect.md task-id:ARCH-SHIP-WAVE-REAUDIT confirmed present); pm decomposed into 8 atomic tasks same day (commit 7cf1d9bf 2026-06-11T19:38:19Z UTC) = BA-SHIP-WAVE-REAUDIT + REAUDIT-001..005 + REAUDIT-FE-001..003; all 8 implemented and QA-APPROVED by 2026-06-12T12:22:00Z (docs/agent-memory/decisions/sprint-SHIP-WAVE-REAUDIT-qa.md steps S1-S10, commit 487ca5091 7-task QA wave APPROVED); all 9 rows now sit archived status=DONE in docs/data/orch/archive/2026-06.json. PO parked this umbrella row (commit b1de4ff92, 2026-06-13T08:48:55Z UTC) >20h AFTER the downstream chain had already fully shipped+QA-approved, and re-park/relabel cycles on 06-15 and 06-27 repeated the same stale premise without re-checking. Both UNPARK CONDITIONS named in park_reason are independently ALSO satisfied: (a) ARCH-CRON-SCHEDULER-RELIABILITY is done_verified (archive promotion_note: apps/mcp-server/ zone collision CLEARED); (b) BA-VN-MACRO-TOOLING WAVE-1 mcp-server task VMT-6-CREDIT-FLOW-EXTEND status=DONE. No remaining work exists for this row — safe DONE_VERIFIED."
        }
    )
  ]
| .task_board.review |= (
    map(
      if .id == "ARCH-SHIP-WAVE-REAUDIT" then empty
      elif .id == "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST" then
        . + {
          entered_review_at: "2026-07-01T22:24:13Z",
          status_note: "[qa review-drain sweep \($now)] RAW-probed LIVE named-volume market.db (docker exec sidecar on vn-market-intelligence-mcp-mcp-server-1, container recreated 2026-07-09T12:51:07Z): financial_reports id=e497f7d1-8717-49cc-bfa9-88804464d143 (action_code=CTG, period 2026-Q1) total_assets=0.0, validation_status='low_confidence' (soft label) — AC-10 and AC-6 both still UNMET on live data. bctc_table_rows for report_id=96e36139-5dac-414d-8e4d-20a4725890d1: 451 rows, ZERO tagged statement_section='balance_sheet' (only cash_flow/income_statement/notes) — classifier defect persists. DECISIVE: those 451 rows were extracted_at 2026-07-03T05:16:10 UTC, which is BEFORE the FIX-BCTC-BANK-BS-COLUMN-ORDER fix commit d69b13f41 landed (2026-07-03T08:03:47Z UTC) — the currently-served rows predate the fix entirely; the operational re-ingest (finalize_bctc_refine / reingest-bctc-report.ts --report-id 96e36139-5dac-414d-8e4d-20a4725890d1) has NEVER been re-run with the fixed code. The mcp-server container rebuild on 2026-07-09T12:51:07Z postdates the fix commit, so deploy step (1) now appears live — narrows the remaining blocker to STEP 2 only: ops re-run the reingest script against the now-fixed live code, then RAW-probe total_assets != 0. CAVEAT: sibling task TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD (qa journal docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SUMMARY-MAPPING-qa.md, 2026-07-10T01:24Z) independently found the balance_sheet section may be genuinely absent from this report's source extraction (a root-cause gap, not just a stale reingest) — if a fresh reingest still yields 0 balance_sheet rows, escalate to dev-mcp-server/architect rather than re-attempting ops reingest again. NOT safe to sign off — left BLOCKED, next_agent unchanged (ops)."
        }
      elif .id == "W5-FU-CTG-REFINE-96e36139" then
        . + {
          entered_review_at: "2026-07-02T00:20:47Z",
          status_note: "[qa review-drain sweep \($now)] Same root cause + same blocker as sibling TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST (this task's declared 'unblocks' target) — full RAW-probe evidence recorded on that row's status_note (live financial_reports total_assets=0.0; bctc_table_rows 0 balance_sheet-tagged rows for report_id=96e36139; extracted_at 2026-07-03T05:16:10Z predates FIX-BCTC-BANK-BS-COLUMN-ORDER fix commit d69b13f41 2026-07-03T08:03:47Z). STEP1 (refine transcription, 56/56 DONE per this row's own review_note) is complete; the STEP2 reingest that already ran was PRE-FIX (produced today's stale 451 rows) and must be RE-RUN now that the classifier fix is live (mcp-server container rebuilt 2026-07-09T12:51:07Z, postdates the fix). NOT safe to sign off — left BLOCKED, next_agent unchanged (ops)."
        }
      else .
      end
    )
  )
| .task_board._updated_at = $now
| .task_board._updated_by = "qa"
