# Decision Journal — Sprint FACTORY-MACRO-split-or-justify-over-cap · dev-macro-indicators

**Sprint goal:** FACTORY-MAINTAINABILITY-2026-06 — split-vs-justify triage for macro-indicators over-cap Go files.
**Agent:** dev-macro-indicators
**Started:** 2026-07-24T10:51:13Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-07-24T13:08:00Z
**task-id:** FACTORY-MACRO-split-or-justify-over-cap
**what-done:** Split adapters_vmt_sjc_fx.go (SJCGoldFXAdapter DB adapter stays, SBV policy-rates HTML parse/fetch/TLS+DB-fallback moved to new parsers_vmt_sbv_policy_rates.go); moved cmd/server/main.go's 9 composition-root adapter shim types to new sibling cmd/server/adapters.go (still `package main`); added honest size-justification headers to usecases.go + 5 VMT parser files + both split files where still over 120L.
**what-considered:**
- (a) split sjc_fx by concern (DB adapter vs HTML parser) — chosen, matches task spec exactly, both halves are independently cohesive.
- (b) further split the 551L OMO parser / 502L trade parser into per-field-parser files — rejected: every helper serves exactly one caller with no independent reuse, would scatter one parse pipeline for zero benefit (task explicitly said do NOT over-split cohesive files).
- (c) leave shim types in main.go vs move to adapters.go — moved, per task spec; had to also patch .golangci.yml's Fence-C depguard file-allowlist (filename-scoped to main.go) to admit adapters.go, since the lint rule enforces file-level not package-level.
**why-decision:** Task spec named exact split boundaries (a)/(c) and named cohesive-justify targets (b); followed as specified rather than re-deriving a split plan.
**why-change:** No change from plan, except the .golangci.yml fence-c update was NOT in the original task spec — discovered as a blocking lint failure after the main.go/adapters.go split and fixed in the same commit (same architectural intent, file-list needed updating).

### STEP dev-macro-indicators-S2 · dev-macro-indicators · 2026-07-24T13:09:00Z
**task-id:** FACTORY-MACRO-split-or-justify-over-cap
**what-done:** Verified behavior-unchanged via comment-stripped + sorted diff between original committed files and the post-split file pair (both sjc_fx/parsers_vmt_sbv_policy_rates.go and main.go/adapters.go) — caught and fixed a real regression where a Unicode non-breaking-space (U+00A0) byte inside two string literals (extractFirstNumber, ParseVNRate) had been silently normalized to an ASCII space during the file-copy, restored via a targeted byte-level Python patch.
**what-considered:**
- git-stash A/B end-to-end run — rejected as unnecessary given the change is pure code motion within the same package (no wiring/behavior difference reachable via stash A/B on this repo's test surface); the byte-level diff is a stronger, more targeted check for exactly this risk class.
- comment-stripped sorted-line diff (chosen) — catches any dropped/altered/duplicated code line regardless of file boundary, and did in fact catch the NBSP bug.
**why-decision:** The sorted-diff method is deterministic and caught a real 2-line encoding regression that visual review alone missed (NBSP vs ASCII space render identically).
**why-change:** DoD said "git-stash A/B or equivalent" — used the equivalent (byte-diff verification), which is stronger for this specific move-only refactor and is what surfaced the one real bug.
