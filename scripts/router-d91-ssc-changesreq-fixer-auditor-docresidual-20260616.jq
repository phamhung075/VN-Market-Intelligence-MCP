# Router 2026-06-16 — dev-team tick: process BOTH qa returns (SSC + AUDITOR-EMIT).
#
# (1) FIX-BCTC-SSC-503-RETRY: qa (agent a7f50720) VERDICT=CHANGES_REQUESTED. Router RAW-verified the verdict
#     FIRST-HAND (not relayed): G1/G2/G4 PASS (classification correct+bounded, _ssc_parse_rows untouched/no-fake-data,
#     py_compile OK, _ssc_make_opener L683 real). G3 FAIL is LEGIT: vps-scripts/ HAS an established pytest harness
#     (test_discover_bctc_title_classifier.py, 27/27 pass — router confirmed file present) so the _is_transient_error
#     unit tests MUST be persisted (developer ran 23 sim tests but did not commit them). -> review -> in_progress,
#     next_agent=fixer. Minimal change: add _is_transient_error cases (5xx->True, 4xx->False, URLError ConnReset/
#     Timeout/'timed out'->True, unknown->False) to vps-scripts/test_discover_bctc_title_classifier.py (or sibling).
#
# (2) FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK: qa (agent aafcaabe) VERDICT=PASS, flipped review->done status=done_verified
#     (signal_id 6342 written+readback live; all 5 post_agent_signal CALLS migrated to signal_feedback). Router
#     RAW-verified FIRST-HAND + caught a residual the qa's flow-only grep MISSED: stale old-type references remain in
#     system-auditor DOCS. Classification (router grep, all of docs/agents/system-auditor/):
#       - init.md:24 — UNAMBIGUOUSLY STALE: "Emit typed signals — system_health_report, microservice_degraded,
#         data_stale, db_integrity_breach — via post_agent_signal" — post_agent_signal now REJECTS these (enum only
#         has signal_feedback). Must update to the signal_feedback contract.
#       - audit-dimensions.md:18/28/38 "**Signal type:** `<old>`" — AMBIGUOUS: post_agent_signal signal_type (stale)
#         vs the dimension's dedup-key category (intentional). Needs PO/architect scoping.
#       - flow/ hits (dedup_key/title/detail/signal_queue-row "type") — CORRECT, intentionally retained (free-form
#         strings, NOT the post_agent_signal enum), per migration commit 220b48c5. Leave.
#     The FUNCTIONAL gate is genuinely met + LIVE-PROVEN, so done_verified STANDS (no revert/churn on a proven fix).
#     The doc-coherence residual is fail-loud debt -> annotate the done card + route a NEW finding row to PO inbox
#     (signal_queue) so the next PO triage scopes a single coherent doc cleanup (NOT a unilateral router doc call).
#
# HEAD: UNCHANGED — the CI-RED lead (FIX-CI-RED-STANDING-1837A-1352A, dev-mcp-server a6cc7e5d) is still in-flight and
# remains the active head for crash-resume. SSC fixer is a parallel sibling (its in_progress row carries next_agent).
#
# GUARDS: SSC uniquely in review[]; AUDITOR uniquely in done[]. CONSERVATION: 6-lane board total UNCHANGED
# (SSC review->in_progress is an intra-board move; signal_queue grows by 1, tracked separately).
# Usage: jq --arg now "$NOW" -f scripts/router-d91-ssc-changesreq-fixer-auditor-docresidual-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-BCTC-SSC-503-RETRY" as $ssc
| "FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK" as $aud
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([.task_board.review[]?|select(.id==$ssc)]|length) as $sr
| ([.task_board.done[]?|select(.id==$aud)]|length) as $ad
| if $sr != 1 then error("SSC not uniquely in review[] — refuse: " + ($sr|tostring)) else . end
| if $ad != 1 then error("AUDITOR not uniquely in done[] — refuse: " + ($ad|tostring)) else . end
# (1) SSC review -> in_progress (fixer)
| ([.task_board.review[]?|select(.id==$ssc)][0]) as $ssctask
| ($ssctask + {
    status:"IN_PROGRESS",
    next_agent:"fixer",
    qa_verdict:"CHANGES_REQUESTED",
    qa_reviewed_by:"qa (agent a7f50720; router RAW-verified the verdict first-hand)",
    changes_required:"Persist _is_transient_error unit tests to vps-scripts/test_discover_bctc_title_classifier.py (or sibling test_discover_bctc_retry.py): HTTPError 5xx->True, HTTPError 4xx->False, URLError(ConnectionResetError)->True, URLError(TimeoutError)->True, URLError('timed out')->True, unknown exception->False. Commit the 23 sim cases. Pure classifier, no I/O — trivially unit-testable. Production logic already PASS (G1/G2/G4) — tests-only round, NO code change to discover-bctc-urls-browser.py.",
    changes_req_ts:$now
  }) as $sscp
| .task_board.review = [ .task_board.review[] | select(.id!=$ssc) ]
| .task_board.in_progress = (.task_board.in_progress + [ $sscp ])
# (2) AUDITOR done card — annotate post-verify residual (no lane move)
| .task_board.done = [ .task_board.done[]
    | if .id==$aud then . + {
        router_postverify:"FUNCTIONAL done_verified STANDS (router RAW first-hand: enum has signal_feedback, old types rejected, signal_id 6342 written+readback to named-volume DB, all 5 post_agent_signal CALLS in flow/ migrated, board conserved, no clobber). RESIDUAL caught (qa flow-only grep missed): system-auditor DOCS still cite old types — init.md:24 UNAMBIGUOUSLY stale (ties old types to 'via post_agent_signal' which now rejects them); audit-dimensions.md:18/28/38 'Signal type:' AMBIGUOUS (signal_type vs dedup-namespace); flow/ dedup_key/title/signal_queue-row 'type' CORRECTLY retained. Doc-coherence cleanup routed to PO (signal_queue) for scoping — fail-loud debt, NOT a functional regression.",
        router_postverify_ts:$now
      } else . end ]
# (2b) route doc-coherence finding to PO inbox (signal_queue append)
| .signal_queue.rows = ((.signal_queue.rows // []) + [ {
    id:("router-docresidual-" + ($now|gsub("[:\\-]";"")|gsub("\\.";"") )),
    ts:$now,
    from:"dev-team",
    to:"po",
    type:"tech_debt",
    summary:"AUDITOR-EMIT doc-coherence residual: system-auditor docs still cite OLD post_agent_signal types after the signal_feedback migration (220b48c5). init.md:24 UNAMBIGUOUSLY stale (old types 'via post_agent_signal' which now rejects them). audit-dimensions.md:18/28/38 'Signal type: <old>' AMBIGUOUS (signal_type vs dedup-namespace category) — needs scoping. flow/ dedup_key/title/signal_queue-row 'type' are intentional (free-form, not enum) — leave. Scope ONE coherent doc cleanup (route to agent-father/fixer for system-auditor flow docs). Low priority — fail-loud debt, functional emit path already done_verified + live-proven (signal_id 6342).",
    severity:"LOW",
    status:"NEW",
    payload_ref:null
  } ])
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane board total changed") else . end
