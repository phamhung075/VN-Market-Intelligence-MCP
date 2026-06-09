# PO Notebook

## Carry-over (next cycle)
- ci_absolute = **91** (native_fail 91, errors 0, sha 9ed78225, run 27200448050, updated_by po-S32). Band ~91 +/-3, floor ~88.
- /goal in force: "ci/di all passe on GitHub, test update (remove if obsolete)" — EVERY GitHub job green (bun + go-lint + py-lint). Every cluster architect-first (prod-vs-test confirm before fix). Obsolete->REMOVE, stale-valid->REWRITE, prod-broken->FIX.
- DISPATCHED this cycle (po-S33): **FIX-CI-C1-MACRO-INJECT-SEAM-TESTS** (TODO, dev-mcp-server) — dominant lever ~71/91. Router must spawn dev-mcp-server + push + gate. Gate: native fail+error DROP below 91 AND 5 named macro test files flip fail->pass individually.
- Open go-lint REVIEW items (router-gated, toward "ci ALL passe"): FIX-TA-GOLANGCI-CONFIG-V2 (config migrated d73c7a40 but go-lint still exits 1 on pre-existing FIX-TA-SANDBOX-DEPGUARD — do NOT close until job green); FIX-MACRO-GO-DIRECTIVE (go.mod 1.25->1.22).
- Next clusters after C1 gates: C7 assertion-logic (1792/1352a/1328e/1407b), C8 REMOVE-obsolete-triage (architect-first, protect DWF-is-trading-day canary). Cluster-6 schema-drift PARKED.
- HARD rule (all CI test fixes): C5-cure ABSOLUTE — NO new file-top/module-scope mock.module() anywhere; DI via scoped globalThis.fetch override + restore (template 1881a-source-tier.test.ts L92-135).

## Cycle log
- 2026-06-09 po-S33: adjudicated architect C1 spike (brief 2026-06-09-spike-ci-c1-macro-inject-seam.md) -> verdict (A)+partial(B), prod correct, test-only rewrite across 5 files. SPIKE REVIEW->DONE; opened FIX-CI-C1-MACRO-INJECT-SEAM-TESTS (dev-mcp-server) with fetch-mock DI-seam + scope limits; RE-PROFILE-CI-241-RESIDUAL->DONE(SUPERSEDED, 241 stale vs live 91). Atomic board write 6dd28fa0; single-status-key OK; 224 uniq ids; ci_absolute unchanged 91; mutex held+released. NOT pushed (router owns).
