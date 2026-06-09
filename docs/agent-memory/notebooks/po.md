# PO Notebook

## Carry-over (next cycle)
- ci_absolute = **79** (native_fail 79, errors 0, pass 11682, skip 42, tests 11803, sha 802a4d1b, run 27203749620, job 80314056985, updated_by po-S36; SUPERSEDES 91/9ed78225). Band ~79 +/-3, floor ~76. delta_vs_prior keeps the +12-vs-projection ESM-jitter caveat (named per-victim flip authoritative). long_tail.absolute synced -> 79.
- /goal in force: "ci/di all passe on GitHub, test update (remove if obsolete)". Go + Python lint surface = GREEN+STABLE x3 runs (closed po-S35). **SOLE remaining red = bun test = 79.** /goal reduces ENTIRELY to driving bun test 79 -> 0.
- **NEXT LEVER (router-owned, architect-first per /goal REMOVE-obsolete clause):** **FIX-CI-C1134-RESIDUAL-TRIAGE** (Task 1134, 12, TODO architect, baseline now 79) -> then **FIX-CI-C1129-RESIDUAL-TRIAGE** (Task 1129, 10) -> then C7 (1407b/1328e/1792/1352a) -> C8 REMOVE-triage. Architect triages prod-vs-test (REWRITE vs REMOVE) BEFORE any dev fix. Cluster-6 schema-drift PARKED.
- **Closed po-S36:** FIX-CI-C1124-EVIDENCE-TESTS-REWRITE REVIEW->DONE (REWRITE-GATED, gate CI-C1124-GATE-802a4d1b). Named Task 1124 cluster 24 fail->0 (jitter-robust per-victim tally, gate-watched run 27203749620). REBASELINE 91->79.
- TRUE residual ranking (now off the 79 run): 1134 = 12, 1407b = 12 (C7), 1328e = 10 (C7), 1129 = 10, 235/1173 = 6 each, tail of 4s/2s. After 1134+1129 gate, expect ~57; next = C7 assertion-logic + C8 REMOVE-triage.
- HARD rule (all CI test fixes): C5-cure ABSOLUTE — NO new file-top/module-scope mock.module() anywhere; the ONLY allowed mock.module is the pre-existing LanceDB guard in 1881a-source-tier.test.ts. Named per-victim exact-prefix flip (not native absolute) is the authoritative gate — absolute jitters +/-12 vs projection when import/test SET changes.

## Cycle log
- 2026-06-09 po-S36: CI-C1124-GATE-802a4d1b PASSED -> FIX-CI-C1124-EVIDENCE-TESTS-REWRITE REVIEW->DONE (REWRITE-GATED; named Task 1124 24->0 on run 27203749620). REBASELINE ci_absolute 91->79 (sha 802a4d1b, job 80314056985) + long_tail.absolute->79. ONE atomic jq pass (scripts/po-s36-c1124-done-rebaseline.jq); single-status-key OK; 228 uniq ids UNCHANGED (status flip only); ci_absolute 91 SUPERSEDED; mutex held+released. Committed (NOT pushed — router owns push).
- 2026-06-09 po-S35: accepted architect REWRITE verdict (brief f0900f74) -> FIX-CI-C1124-RESIDUAL-TRIAGE REVIEW->DONE + opened FIX-CI-C1124-EVIDENCE-TESTS-REWRITE. Closed 2 Go-lint REVIEW->DONE on 3-run CI-green (signal 39ee3464). 227->228 uniq ids; ci_absolute UNCHANGED 91.
- 2026-06-09 po-S34: adjudicated ci-c1-already-shipped-9ed78225. C1 = ALREADY-SHIPPED duplicate (1d83a5ff ancestor) -> DONE; NO rebaseline. Opened 3 residual clusters 1124(24,DOM)/1134(12)/1129(10). 224->227 uniq ids.
