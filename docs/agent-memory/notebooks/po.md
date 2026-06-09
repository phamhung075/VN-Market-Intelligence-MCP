# PO Notebook

## Carry-over (next cycle)
- ci_absolute = **91** (native_fail 91, errors 0, sha 9ed78225, run 27200448050, updated_by po-S32). Band ~91 +/-3, floor ~88. NOT rebaselined po-S34 (C1 was already inside 91).
- /goal in force: "ci/di all passe on GitHub, test update (remove if obsolete)" — EVERY GitHub job green (bun + go-lint + py-lint). Every cluster architect-first (prod-vs-test confirm before fix). Obsolete->REMOVE, stale-valid->REWRITE, prod-broken->FIX.
- **CORRECTED po-S34:** po-S33 "~71/91 C1 dominant lever" premise was STALE/WRONG. C1 macro-seam fix ALREADY shipped (commit 1d83a5ff, ancestor of 9ed78225); all six victim prefixes 0-fail in the 91-run; re-dispatched dev added ZERO commits. FIX-CI-C1-MACRO-INJECT-SEAM-TESTS closed DONE(ALREADY-SHIPPED, duplicate task).
- TRUE residual ranking (raw 91-run tally): **Task 1124 = 24 (NEW DOMINANT)**, 1134 = 12, 1407b = 12 (C7), 1328e = 10 (C7), 1129 = 10, 235/1173 = 6 each, tail of 4s/2s.
- OPENED po-S34 (all TODO, owner architect, baseline_pass 91): **FIX-CI-C1124-RESIDUAL-TRIAGE** (24, DOMINANT, architect-first), **FIX-CI-C1134-RESIDUAL-TRIAGE** (12, stub), **FIX-CI-C1129-RESIDUAL-TRIAGE** (10, stub). Router must spawn **architect** on 1124 first.
- Open go-lint REVIEW items (router-gated, toward "ci ALL passe"): FIX-TA-GOLANGCI-CONFIG-V2 (config migrated d73c7a40 but go-lint still exits 1 on pre-existing FIX-TA-SANDBOX-DEPGUARD — do NOT close until job green); FIX-MACRO-GO-DIRECTIVE (go.mod 1.25->1.22).
- C7 assertion-logic (1792/1352a/1328e/1407b) + C8 REMOVE-obsolete-triage already tracked (BACKLOG) — do NOT duplicate. Cluster-6 schema-drift PARKED.
- HARD rule (all CI test fixes): C5-cure ABSOLUTE — NO new file-top/module-scope mock.module() anywhere; DI via scoped globalThis.fetch override + restore (template 1881a-source-tier.test.ts L92-135).

## Cycle log
- 2026-06-09 po-S34: adjudicated router gate ci-c1-already-shipped-9ed78225. C1 = ALREADY-SHIPPED duplicate (1d83a5ff ancestor of sha; six victims 0-fail; zero new commits) -> TODO->DONE; NO rebaseline (91 already includes C1). Corrected stale ~71/91 premise; opened 3 NEW residual clusters 1124(24,DOM)/1134(12)/1129(10) architect-first. ONE atomic jq pass (scripts/po-s34-...jq); single-status-key OK; 224->227 uniq ids; ci_absolute unchanged 91/9ed78225; mutex held+released. Committed (NOT pushed — router owns).
- 2026-06-09 po-S33: adjudicated architect C1 spike -> opened FIX-CI-C1-MACRO-INJECT-SEAM-TESTS (later proven duplicate at po-S34). Board write 6dd28fa0.
