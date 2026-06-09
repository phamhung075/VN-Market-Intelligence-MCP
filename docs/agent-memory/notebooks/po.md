# PO Notebook

## c · 2026-06-09T06:56Z — CI-RED-RECONCILE: C3+C1 gate -48 -> close BOTH + rebaseline 241->193 + open C2 attack (po-S25)

**Trigger:** CI-C3-C1-GATE-1d83a5ff (signal docs/signals/ci-c3-c1-gate-result-1d83a5ff-20260609T0645Z.json). Router pre-measured + raw-verified the native bun summary, retained both test-only fixes, bundled push f95c79be->1d83a5ff = ONE CI run 27188621595 / bun job 80263220946. PO owns board; router owns push+gate. DJ-GATE-1.

**Gate (router-verified, accepted — native-to-native ONLY):** prior 241 (run 27185729719, sha 91afe344, 0 err) -> NEW **193** (11582 pass / 42 skip / 193 fail / **0 err** / Ran 11817, sha 1d83a5ff, run 27188621595, job 80263220946). NET **-48 (-20%)**, no regression. CI conclusion stays `failure` (193!=0, expected RED-until-0); verification gate MET. **241 SUPERSEDED by 193.** Raw `(fail)` grep ~387 = 2x dupe; native summary is the only authoritative absolute.

**KEY CALL — DONE-AS-SCOPED, not re-open:** net -48 << projected -114 because the architect's C1(71)/C3(43) were SUPERSET cluster counts. The dev tasks were scoped to the NAMED files (C1=089/1423d/1423f/1570c/1903a; C3=1945b) and those ARE now CI-clean. Residual belongs to MORE files sharing the pattern but OUTSIDE the original 5-file/1-file scope -> NEW tasks, NOT a charge-back to closed ids.

**Board edits (1 atomic jq pass `scripts/po-s25-c3-c1-gate.jq`, commit-mutex held):**
- FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES (active_sprints[24].tasks): REVIEW->DONE (+closed/done/done_by/actual_result). Single status key.
- FIX-CI-C1-MACRO-INJECT-SEAM-TESTS (task_board.in_progress): REVIEW->DONE (+closed/done/done_by/actual_result). Single status key.
- +FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE (TODO, dev-mcp-server, high, ~21): require()->ESM import for getMarketMessageDigest+batchReviewMarketMessages (impl in marketMessageStore.ts:239/349); TEST-ONLY; cleanest next win. Carries 193 baseline. DISPATCH-READY.
- +FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS (BACKLOG, ~37) + +FIX-CI-C3-RESIDUAL-DB-DESTROYERS (BACKLOG, ~23): BOTH marked needs-architect-filescope-before-dev (avoid blind seam sweep = 9454baad +219 revert anti-pattern).
- +SPIKE-CI-C4-KINH-DICH-DIACRITICS (BACKLOG spike, architect, ~14): prod-vs-test diacritics ruling first — only residual touching PROD strings; NOT routed to dev blind.
- +VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE (top-level backlog, cowork-team): non-CI, LIVE prod risk (raw JSON to MARKET since 98df0f43); independent of /goal ci/cd pass.
- Sprint-level: active_sprints[24].ci_absolute=193 stamped (+._updated_by=po-S25). Cluster-6 schema-drift stays PARKED.

**SSOT discipline:** CI sprint .tasks 25->29 (+4); top-level backlog 80->81 (+1); single status key (=1) on every flipped/created row (paths(scalars) check, no dup-key bug). Temp validated [ -s ] && jq -e . && size>600000 (734255) BEFORE mv. commit-mutex (task_kind:commit-mutex owner:po) held. _schema=v3 _ssot=true preserved. NOT pushed.

**LESSON:** When CI deltas undershoot the projection, the honest move is to accept SUPERSET-cluster diagnosis and track the under-scope FORWARD as new tasks — never charge new files back to a closed task id (breaks DoD audit) and never re-open a task whose named files are clean. Queue exactly one dispatchable ROI win; gate under-scoped + prod-string residuals behind architect confirmation.

## Carry-over
- ROUTER OWNS: push (po.md + journal + orch-state.json + archived signal, commit SHA in return, ahead of origin) + dispatch FIX-CI-C2-GETMARKETMESSAGEDIGEST-REQUIRE to dev-mcp-server NOW (TODO, cleanest next win). BEFORE either residual: route to ARCHITECT for short file-scope confirm. Route SPIKE-CI-C4 to ARCHITECT (prod-vs-test diacritics, 60m) — NOT dev blind.
- Next CI gate (router): native fail+error must DROP vs the NEW **193** absolute (sha 1d83a5ff). Native-to-native only (marker over-counts ~2x). Continue ROI-ranked until 0 (/goal ci/cd pass).
- VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE = independent of CI goal (live prod MARKET-channel risk). Cluster-6 schema-drift PARKED (no 7th touch).
