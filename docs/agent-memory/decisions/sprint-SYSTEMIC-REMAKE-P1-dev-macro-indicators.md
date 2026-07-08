# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-macro-indicators

**Sprint goal:** Systemic remake P1 — root-cause fixes (idle-loops→verif→detector) per 07-04 systemic review.
**Agent:** dev-macro-indicators
**Started:** 2026-07-08T00:00:00Z

---

### STEP dev-macro-indicators-S1 · dev-macro-indicators · 2026-07-08T07:00:00Z
**task-id:** FACTORY-MACRO-delete-dead-ts-tree
**what-done:** Independently re-ran the mandated pre-delete grep (`_deprecated` and `infrastructure/scrapers`, whole apps/macro-indicators tree minus node_modules) BEFORE touching any file. Found `src/_deprecated/` has zero external live importers (3 Go files only reference it in doc comments, e.g. "Go rewrite of ... src/_deprecated/domain/services.ts", not imports). But `src/infrastructure/scrapers/` DOES have 9 live importers OUTSIDE both named subtrees: `__tests__/unit/scrapers/*.test.ts` (8 files) + `__tests__/integration/scrapers/external-macro-live.test.ts`, all with resolvable relative imports (`../../../src/infrastructure/scrapers/<adapter>.js`) into files that genuinely exist there.
**what-considered:**
- Delete only src/_deprecated/ (clean) and leave infrastructure/scrapers/ + toolchain files in place — rejected, task specifies wholesale deletion as one unit; partial deletion leaves a half-broken TS tree and doesn't meet the task's own DoD.
- Unilaterally also delete the 9 __tests__ files (they're already broken anyway — 3 sibling __tests__ files import `../../src/application/*` and `../../src/domain/*` paths that don't exist at all, proving __tests__/ is itself stale) — rejected, out of the task's explicit file list and scope-creep on a P1 FACTORY task without a scope decision.
- Follow the task's own explicit STOP clause: "If you find one, STOP and report it rather than deleting" — chosen.
**why-decision:** The task text anticipated exactly this scenario and gave an unambiguous instruction; CI (`.github/workflows/ci.yml`) and the Dockerfile confirm none of `__tests__/**/*.test.ts` ever executes (Go-lint only, zero bun step), so these are dead code too, but that is a scope judgment for po/architect, not mine to make unilaterally mid-deletion.
**why-change:** Zero files deleted (plan called for wholesale deletion) — blocked pending a scope decision on whether `__tests__/unit/scrapers/**` + `__tests__/integration/scrapers/external-macro-live.test.ts` are folded into this same deletion or handled as a follow-up. Board row moved to `review[]` status=BLOCKED, next_agent=po, not REVIEW/DONE.

### STEP dev-macro-indicators-S2 · dev-macro-indicators · 2026-07-08T09:35:00Z
**task-id:** FACTORY-MACRO-delete-dead-ts-tree
**what-done:** Re-ran whole-repo grep myself (not trusting po's report alone) — confirmed zero live code importer of `_deprecated/`, `infrastructure/scrapers/`, or `__tests__/` outside the deletion set (2 hits are stale doc-comments, not imports, pre-dating this task). Deleted src/_deprecated/, src/infrastructure/scrapers/, whole __tests__/ tree, package.json, tsconfig.json, bun.lock (git rm), node_modules/ (untracked, rm -rf). Rewrote testing.md Go-only from real `go test -v` output (33 files/8 pkgs/288 tests). Updated 3 pkg/primitive provenance comments + discover-adb-xhr.py (po's optional trivial residue) off the deleted paths.
**what-considered:**
- Trust po's whole-repo grep as sufficient and skip re-verification — rejected, router's own mandate + standing lesson (never trust a peer's report alone) required an independent re-run before touching anything.
- Also rewrite infrastructure.md (references 3 now-deleted scraper files as if live) in this same task — rejected, it was already 100% describing dead pre-Go-migration TS code before my deletion (its `src/infrastructure/repositories.ts` ref never even existed on disk), so it's pre-existing unrelated staleness; po's DoD named testing.md only — flagging as follow-up, not touching (avoid scope creep).
- Fix the 4th stale doc-comment in macro_investment_clock.go (`src/domain/services.ts`, no `_deprecated`) alongside the 3 po counted — rejected, that path was already broken pre-task (typo/pre-rename artifact, distinct from po's exact "3" count) and not part of po's spec.
**why-decision:** DoD is machine-checkable and all verified green: go build/vet/golangci-lint (0 issues)/go test (33/33) clean, Fence-A/B/C hold via real `go list` import graph (not just the grep heuristic, which false-positives on English prose), G12 sandbox primitive 18/18 + module 2/2 PASS, env-credential audit clean, Docker Go image builds clean (verify-only), pnpm -r workspace list clean post package.json removal.
**why-change:** No change from po's re-dispatched spec — full FOLD-IN deletion executed as specified, commit 39be5019a.
