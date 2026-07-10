# Board flip: FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD REVIEW -> DONE_VERIFIED
#
# QA round 1. Router already independently RAW-verified: full diff of
# bctcPdfPullJob.ts (new isVnMarketHours import, opts.now?:Date w/ new Date()
# default, guard inserted exactly at the if(shellRow){...} block as
# if(shellRow && isVnMarketHours(now)){log-only skip} else if(shellRow){...
# unchanged...} else {...unchanged shellRow-unavailable branch...}), confirmed
# updatePekTriggered.run(row.id) sits AFTER/OUTSIDE the whole if/else-if/else
# chain byte-unmodified (guard skips only the network call, never the
# pek_triggered state transition D3C depends on), confirmed the shellRow==null
# branch is logically identical to before, own tsc clean, own mock-guard PASS
# (both files), own bctc-pdf-pull-job.test.ts run (26/26 pass, 80 expect()) —
# matches dev-mcp-server's claim exactly, read TC-18/19/20 directly (market
# open -> pekCalled=false + pek_triggered + downloaded=1 in one assertion;
# market closed -> called, unchanged baseline; shellRow-null unaffected by
# the guard even during market hours), independently re-derived the
# isVnMarketHours-reused-not-reinvented claim AND independently confirmed
# dev-mcp-server's self-correction of the router's own dispatch-prompt
# provenance error (vpsProxyWatchdogJob/priceUpdateWatchdogJob/vpsHealthPoller
# each define their own separately-named helper, none import
# freshnessSlaChecker.ts — genuinely reused instead by
# coverageMapFreshnessChecker.ts/pushPricesSignals.ts/slaStatusTools.ts/
# vpsProxyTools.ts/vpsProxyHealthHandler.ts/freshnessSlaMonitorJob.ts — not a
# code defect, just a dispatch-prompt citation error), read isVnMarketHours()'s
# implementation directly (gates on isVnTradingDay() first, then the
# 02:00-08:59 UTC hour-range check — correct reuse as-is), spot-checked the
# "pre-existing unrelated failure" claim on 1352a-async-extraction-race.test.ts
# via git stash on just the 2 diffed files (identical 6 pass/2 fail with the
# diff fully removed), board flip verified clean (review[]/REVIEW/next_agent=
# qa, .head untouched), notebook 49L, DJ-GATE-1 present
# (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md, task-id-stamped).
# Did NOT re-derive any of that — fresh-eyes focus on the ONE dispatcher-named
# judgment point (a possible on-call ambiguity that could have silently
# flipped the fix into a no-op-during-off-hours bug instead of a
# no-op-during-market-hours fix):
#
# (1) Direction-of-guard correctness: independently read the design doc
#     itself (docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md
#     §Risk flags, R-HIGH-2 bullet, line 114) — it explicitly asks "does
#     bctcPdfPullJob check is_vn_market_open client-side before even
#     attempting /pek-extract (avoiding a guaranteed 503 round-trip)" and
#     recommends the client-side pre-check "to avoid noisy 503 log spam every
#     30 min during 02:00-08:59 UTC" — i.e. SKIP when market is OPEN, fire
#     when CLOSED. Cross-checked against the actual implementation
#     (`if (shellRow && isVnMarketHours(now)) { log-only skip }`) and the
#     actual test assertions: TC-18 pins MARKET_HOURS_NOW (2026-07-06T04:00:
#     00Z, inside 02:00-08:59 UTC), asserts `isVnMarketHours(MARKET_HOURS_NOW)
#     ===true` (sanity) then `pekCalled===false` — call skipped when market
#     open, confirmed. TC-19 pins OFF_HOURS_NOW (09:30:00Z, after the 08:59
#     close), asserts `isVnMarketHours(OFF_HOURS_NOW)===false` (sanity) then
#     `pekCalled===true` — call fires when market closed, confirmed. Both
#     legs match the design doc's stated direction exactly. The router's own
#     dispatch prompt's separate VERIFICATION BAR paragraph that stated the
#     two cases in reverse was correctly NOT followed (a probable typo,
#     documented as a judgment call in the decision journal) — the
#     implementation matches the EXACT SCOPE section + the design doc, i.e.
#     the correct interpretation. No no-op-during-off-hours regression risk:
#     confirmed both directions are wired as intended.
#
# Standard gate: own tsc clean, own mock-guard PASS (2 files), DDD clean
# (scheduler/financial-reports/bctcPdfPullJob.ts is an interface-layer file
# that already imports from application/ and infrastructure/ elsewhere in the
# same file — pre-existing pattern; the new domain/services/
# freshnessSlaChecker.ts import follows the SAME scheduler->domain/services
# precedent already used by allzeroOhlcvBackfill.ts, ohlcvSanityCheckJob.ts,
# foreignFlowAlertJob.ts), no secrets/process.env added (grep on added `+`
# lines only — 0 hits; the one process.env-adjacent grep hit on Bun.env.
# VPS_PUSH_API_KEY is pre-existing unrelated context, not an added line), no
# fabricated data (control-flow + fixed test clocks only). No cron/scheduler-
# registration file touched (git status confirms cronConfig.ts/
# schedulerJobTable.ts absent from the changed-file set; git diff --stat on
# scheduler/** shows exactly 1 file changed, bctcPdfPullJob.ts itself).
# Sibling regression: independently ran the 4 closest sibling test files
# (FIX-BCTC-D3A-PEK-TRIGGER-HELPER, bctc-extract-reconcile-job,
# FIX-BCTC-ENRICH-SILENT-0ROWS, FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD): 26/26
# pass, 114 expect(), zero regression — matches dev-mcp-server's claim
# exactly.
#
# DJ-GATE-1: sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md task-id-stamped
# (task-id: FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD), present before this
# review — satisfied.
#
# GUARD: refuse unless FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD is in review[]
# with status REVIEW. .head.active_task_id currently points at the PARENT
# umbrella task (FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION), not this leaf
# sub-task — per standing guard convention (D3B/D3C precedent scripts), this
# is a BOARD-ONLY move: .head is left untouched rather than blindly
# overwritten to a mismatched pointer.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/qa-fix-bctc-r-high-2-market-hours-guard-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD")][0]) as $t
| if $t == null then error("FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD status != REVIEW (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    next_agent: "pm",
    updated_at: $now,
    updated_by: "qa",
    commit: "pending",
    qa_verdict: "APPROVED",
    qa_verified_at: $now,
    qa_verified_by: "qa",
    qa_note: "APPROVED. Router already independently RAW-verified diff/tsc/mock-guard/own-test-run(26/26,80 expect())/TC-18-19-20 read/isVnMarketHours-provenance-correction/isVnMarketHours-impl-read/1352a-git-stash-isolation/board-flip/notebook/DJ-GATE-1 — did not re-derive those, focused on the one dispatcher-named judgment point: direction-of-guard correctness. Independently read the design doc itself (docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md, R-HIGH-2 bullet, line 114) — it explicitly asks for a client-side is_vn_market_open pre-check to avoid a guaranteed 503 round-trip + noisy log spam during 02:00-08:59 UTC, i.e. SKIP-when-OPEN / FIRE-when-CLOSED. Cross-checked against the actual implementation (`if (shellRow && isVnMarketHours(now)) { log-only skip }`) and the actual test assertions: TC-18 pins MARKET_HOURS_NOW (2026-07-06T04:00:00Z, inside 02:00-08:59 UTC), asserts isVnMarketHours(MARKET_HOURS_NOW)===true then pekCalled===false AND queueRow.status==='pek_triggered' AND result.downloaded===1 in one test — call skipped when market open, state machine unaffected, confirmed. TC-19 pins OFF_HOURS_NOW (09:30:00Z, after the 08:59 close), asserts isVnMarketHours(OFF_HOURS_NOW)===false then pekCalled===true — call fires when market closed, unchanged baseline, confirmed. Both legs match the design doc's stated direction exactly; no no-op-during-off-hours regression risk. The router's own dispatch prompt's separate VERIFICATION BAR paragraph stating the two cases in reverse was correctly NOT followed (a probable typo, documented as a judgment call in the decision journal) — implementation matches the EXACT SCOPE section + the design doc, the correct interpretation. Standard gate: own tsc clean, own mock-guard PASS (2 files), DDD clean (scheduler/financial-reports/bctcPdfPullJob.ts is an interface-layer file already importing application/+infrastructure/ elsewhere in the same file; the new domain/services/freshnessSlaChecker.ts import follows the same scheduler->domain/services precedent already used by allzeroOhlcvBackfill.ts/ohlcvSanityCheckJob.ts/foreignFlowAlertJob.ts), no secrets/process.env added (grepped only the diff's `+` lines — 0 hits), no fabricated data, no cron/scheduler-registration file touched (git diff --stat on scheduler/** shows exactly 1 file changed). Sibling regression: independently ran the 4 closest sibling test files myself — 26/26 pass, 114 expect(), zero regression, matches the claim exactly. DJ-GATE-1 satisfied (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md, task-id-stamped)."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "qa"
