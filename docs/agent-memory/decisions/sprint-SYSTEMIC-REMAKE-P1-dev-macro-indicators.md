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
