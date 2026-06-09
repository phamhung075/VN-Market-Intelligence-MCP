# PO Notebook

## c · 2026-06-09T09:50Z (TUESDAY) — CI-RED-RECONCILE: SPIKE-C5 REVIEW->DONE (architect brief landed) + C5 REWORK->TODO re-dispatch to dev (DI-seam spec) + C6 LEFT REVIEW + KEEP 135 (po-S30)

**Trigger:** Architect SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY brief committed+pushed (docs/architecture-briefs/2026-06-09-spike-ci-c5-contam-safe-restrategy.md). Ruling = DI-seam pattern (b). PO closes the SPIKE, re-dispatches the now-unblocked C5 fix to dev, leaves C6 to the router's gate. DJ-GATE-1.

**Architect ruling (folded into C5 task note for dev):** ROOT CAUSE = 083-tool-analysis.test.ts (lines 15-26) + 123-integration-mcp.test.ts (lines 35-40) install file-top mock.module() stubs for sbv.js/yahooFinance.js (+ DEAD retriever.js mock in 123) that poison Bun process-scoped ESM cache for ALL downstream files. Victims 028/025/1423a/1487 already use the CORRECT DI seam (httpClient param) and fail ONLY from upstream poisoning. FIX = REMOVE those file-top mock.module() calls from 083+123; pass _testCommodityFetcher/_testSbvFetcher/_testRagRetriever via callTool args for the run_impact_chain tests; ddd-1b + all 4 victim files get NO CHANGE; ONE conditional prod seam in analysis.ts run_impact_chain handler (3 optional _test* Zod args, _testHoseClient pattern) IF absent. HARD: NO new file-top/module-scope mock.module() anywhere.

**KEY CALL — band ±3, per-victim flip required:** the suite has ~±3 run-to-run nondeterminism (contamination is order-sensitive), so 135 is a band ~135±3 (real floor ~132). Projected post-fix ~113 (22 victims cleared) = 19 below the noise floor. Gate = native fail+error DROP below 135 AND each named victim (028/025/1423a/1487) flips fail->pass INDIVIDUALLY in the CI log — both checks, not the global absolute alone.

**Board edits (1 atomic jq pass `scripts/po-s30-c5-redispatch.jq`, commit-mutex held):**
- SPIKE-CI-C5-CONTAM-SAFE-RESTRATEGY: REVIEW->DONE (+done_by po-S30 +resolution DONE).
- FIX-CI-C5-UNMOCKED-HTTP-FETCHES: REWORK->TODO, owner architect->dev-mcp-server, blocked_by/depends cleared (SPIKE now DONE), note rewritten with DI-seam spec + brief path + no-mock.module() constraint + per-victim CI-log flip gate; baseline_pass UNCHANGED=135.
- FIX-CI-C6-SSOT-WATCHLIST-SECTOR-DRIFT: UNTOUCHED = REVIEW (router gating its own CI run; separate PO action closes it).
- ci_absolute UNCHANGED = 135 / sha 3663bd12 / updated_by po-S28 (NO rebaseline).

**SSOT discipline:** sprint .tasks 34 unchanged (2 in-place flips, NO add/remove). Single status key (=1) on all rows (paths(scalars) check max=min=1). Temp validated [ -s ] && jq -e . && size>600000 (759436) BEFORE mv. commit-mutex (task_kind:commit-mutex owner:po ttl 120s) held + released. _schema=v3 _ssot=true. WIP in_progress=0 (<=2). NOT pushed.

**LESSON:** When the architect re-spec lands, the recurring-bug-escalation (architect-first after 2nd failed vector) is SATISFIED — re-route the now-mechanical fix back to dev. The banned vector (file-top mock.module()) goes into the task note as a HARD constraint so dev cannot re-introduce it. Gate must verify per-victim flips, not just the global count, because the ±3 jitter can mask/credit a single file.

## Carry-over
- ROUTER OWNS: push (po.md + journal sprint-CI-RED-RECONCILE-po.md + orch-state.json + scripts/po-s30 helper, commit SHA in return) + dispatch FIX-CI-C5-UNMOCKED-HTTP-FETCHES (TODO, dev-mcp-server) per the DI-seam ruling.
- C5 dev work: REMOVE file-top mock.module() from 083 (15-26) + 123 (35-40, incl dead retriever.js); pass _test* fetchers via callTool args; add 3 optional _test* Zod args to analysis.ts run_impact_chain handler IF absent; ddd-1b + 028/025/1423a/1487 NO CHANGE; NO new mock.module().
- Next CI gate (router): native fail+error must DROP below the standing **135** absolute (sha 3663bd12; band ±3, aim ~113) AND each victim 028/025/1423a/1487 flips fail->pass individually. C6 closes via the router's separate gate. Continue until 0 (/goal ci/di all passe, remove if obsolete). Cluster-6 schema-drift PARKED.
