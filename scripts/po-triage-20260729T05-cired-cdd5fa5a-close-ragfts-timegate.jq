# po-triage-20260729T05-cired-cdd5fa5a-close-ragfts-timegate.jq
#
# PO triage 2026-07-29T05:07Z tick — TWO dispositions on PO-owned review[] rows.
# Both rows carry next_agent="po": they were waiting on a PO decision, not on QA
# throughput. Carried unresolved in the PO notebook for 2 consecutive ticks while
# the lane was (wrongly) blamed — this pass closes that self-inflicted stall.
#
# (1) CI-RED-cdd5fa5a-FIX  review[] -> done_verified[]
#     verification_gate = ci_green_on_subsequent_push. RAW-verified by PO this tick
#     (feedback_router_verify_raw_not_badges — checked the API, not the row's badge):
#       gh run list --branch main --workflow CI --limit 6 --json headSha,conclusion
#         -> databaseId 30409436038 head_sha 82e200c5713331d175491a621a361c36b0b660da
#            conclusion=success status=completed (createdAt 2026-07-28T23:53:48Z)
#         -> databaseId 30409525475 head_sha 084f7652ee... conclusion=success (a 2nd green)
#         -> the original RED cdd5fa5ad... run 30406497654 conclusion=failure (superseded)
#       git merge-base --is-ancestor d19d6cdc5 82e200c57... -> TRUE (fix IS in green ancestry)
#       head_sha 82e200c57 != cdd5fa5ad -> the "different SHA" leg of the gate holds.
#     FINGERPRINT RECORDED ON CLOSE (mandatory — feedback_ci_red_close_must_record_
#     fingerprint_else_redrain; omitting it makes the ci-health-probe re-drain this
#     signal and re-mint a duplicate row):
#       29f66987964049714b7ebf9afa0c779a4b3c6414a600e968cab432c4df832d06
#     source_signal_dedup_key: ci_red:cdd5fa5ad344406298fdf70b59afd71050c30289:bun test
#
# (2) RAG-FTS-BUILD-MEMORY-BOUND  stays review[] — lane UNCHANGED, stamp only.
#     Legitimately TIME-GATED on rag corpus reaching representative (~56254-row) scale;
#     AC-1 is un-testable below it and forcing a rebuild against a small corpus produces
#     exactly the false-green this row already survived once. Adds a measured GROWTH RATE
#     + projected ready-date so the row stops being re-derived from scratch every tick
#     (it has been hand-re-checked on at least 3 separate ticks for no decision change).
#
# Idempotent: (1) guarded by done_verified membership — re-run moves 0 rows.
#             (2) stamp is a key-set assignment — re-run is a no-op rewrite.
# Conservation: pure relocation, task_total unchanged (review -1, done_verified +1).
#
# Usage (NEVER raw mv/cp/> — CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260729T05-cired-cdd5fa5a-close-ragfts-timegate.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def idof: (.id // .task_id);

($now) as $now
| "CI-RED-cdd5fa5a-FIX" as $cired
| "RAG-FTS-BUILD-MEMORY-BOUND" as $ragfts

# --- guard: never re-promote an id already sitting in done_verified -------------
| ([.task_board.done_verified[]? | idof]) as $already
| (if ($already | index($cired)) then [] else [$cired] end) as $to_move

# --- (1) pull + stamp the CI-RED row out of review[] ----------------------------
| ([ .task_board.review[]?
     | select((idof) as $i | $to_move | index($i))
     | del(.next_agent)          # row is closed — drop the po routing hint (schema: no null)
     | . + {
         status: "DONE_VERIFIED",
         done_verified: true,
         verified_at: $now,
         verified_by: "po (triage 2026-07-29T05:07Z)",
         verified_gate: "ci_green_on_subsequent_push",
         verified_gate_evidence: "RAW-verified by PO via gh API, not from the row badge: CI run 30409436038 head_sha=82e200c5713331d175491a621a361c36b0b660da conclusion=success status=completed (2026-07-28T23:53:48Z), plus a second green 30409525475 on 084f7652ee. git merge-base --is-ancestor d19d6cdc5 82e200c57 = true, so the fix IS in the green run's ancestry. head_sha differs from the original failing cdd5fa5ad344406298fdf70b59afd71050c30289 (run 30406497654, conclusion=failure). Both legs of the gate hold. qa had already independently verified the code plane (test-only + CI-script-only diff, 31/31 pass on BOTH the real-macOS no-free-binary leg and the stub-free-on-PATH leg reproducing ubuntu-latest, tsc clean, mock-guard PASS) and deliberately withheld the DONE_VERIFIED flip, routing next_agent=po for this close-out.",
         ci_red_fingerprint_recorded: "29f66987964049714b7ebf9afa0c779a4b3c6414a600e968cab432c4df832d06",
         closing_note: "CLOSED by PO 2026-07-29T05:07Z triage. Fingerprint 29f66987964049714b7ebf9afa0c779a4b3c6414a600e968cab432c4df832d06 recorded on close per feedback_ci_red_close_must_record_fingerprint_else_redrain — without it the ci-health-probe re-drains dedup_key ci_red:cdd5fa5ad344406298fdf70b59afd71050c30289:bun test and mints a duplicate row. PO-OWNED STALL, recorded against PO not against the qa lane: this row sat REVIEW/next_agent=po for ~5h across 2 PO ticks with its gate already satisfied and zero remaining work, while the PO notebook carried it as 'still unresolved' and attributed the review[] backlog to QA-Drain starvation. QA-Drain was not the blocker here — PO was. AC-3 (ci-per-file-isolation.sh log destruction before rm -rf, which made this class undiagnosable from CI alone) shipped in the same change set."
       } ]) as $moved

# --- apply (1): remove from review[], append to done_verified[] ------------------
| .task_board.review        |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.done_verified += $moved

# --- (2) time-gate stamp on the RAG row (stays in review[], lane untouched) ------
| .task_board.review |= map(
    if (idof) == $ragfts then
      . + {
        po_timegate_projection_20260729: "PO RAW re-check 2026-07-29T05:20Z: rag-service GET :5002/embed/health index_size=11243 rows (was 10183 @ 2026-07-28T19:00Z, 297 @ 2026-07-15T17:28Z). MEASURED GROWTH ~103 rows/h over the last 10.3h. AC-1's representative failure scale is ~56254 rows, so ~45000 rows remain => ~438h => the corpus is ~18 DAYS from testable, i.e. on/after ~2026-08-16 at the current rate. DISPOSITION UNCHANGED: legitimately TIME-GATED, blocked_on=rag-corpus-repopulation-to-representative-scale, done_verified stays WITHHELD, do NOT force a rebuild against an 11k-row corpus (a green there is the exact false-green this row already produced once at 116 rows). STOP RE-DERIVING THIS EVERY TICK: next meaningful re-check is ~2026-08-12, not next tick — 3 separate PO ticks have now hand-re-measured this for zero decision change. If the growth rate collapses to ~0 before then, that IS a new defect (re-embed pipeline stalled) and needs its own row; only that would justify an early look.",
        po_timegate_next_recheck_after: "2026-08-12"
      }
    else . end
  )

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po (triage 2026-07-29T05:07Z — CI-RED close + RAG time-gate projection)"
# NOTE: do NOT set a root-level .updated_at — the orch-state Zod schema rejects it as an
# unrecognized root key (validator exit 2, live file untouched). The older
# scripts/po-s103-ci-red-cluster-done-verified-promote.jq still carries that line and would
# now fail closed if re-run; root timestamping is handled by scripts/orch-stamp-updated-at.mjs
# inside orch-apply.sh, not by callers.
