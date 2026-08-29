# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation 32)

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-29T01:05Z (continuation — qa-31.md breached byte cap 39179/36000, rolled per decision-journal § Cap Check)

---

### STEP qa-S259 · qa · 2026-08-29T01:05:00Z
**task-id:** FIX-COWORK-FANOUT-LOAD1MIN-COMMA-LOCALE-PARSE
**what-done:** Direct-commit verify (verify-committed) of commit cce2be6db (comma-safe LOAD_1MIN probe for spawn-fanout.md Step 5.1): re-ran the probe test suite (20/20 PASS), ran the probe live (dot-decimal "6.64", matches LC_ALL=C ground truth first-token 6.64), confirmed incident "2,19"->"2.19" never 219 in test fixtures, confirmed commit scope exactly the 3 claimed files, Step 5.2/5.3 + dispatch-claim Step 2.4 byte-unchanged (single hunk @L196 only; dispatch-claim not in commit).
**what-considered:**
- Prose-only trust of the row's review_note: rejected (flow Step 1 — refuse prose-only trust, re-ran everything).
- Test-only/non-zone checks (bun test/tsc/mock-guard): structurally N/A — bash+doc zone, no apps/ files (zone precedent from cycles-874..879); the .test.sh suite IS the zone's real verification and passed 20/20.
- LC_ALL=C pinning concern: probe deliberately does not pin, token-normalize comma->dot only — correct per po-triage remedy note (pinning + comma-split = concat garbage).
**why-decision:** No ISSUE set; commit real and on main ancestry, scope exact, all 6 independently re-verified checks green, incident case fixture-covered, DJ-GATE-1 fix-side present (developer-S140). Behavioral-predicate AC out of scope (zone docs/agents/cowork-team/ not apps/, P2 not P0/P1); not OOM-class. -> vc-approved.
**why-change:** no change from plan.

### STEP qa-S260 · qa · 2026-08-29T00:48:00Z
**task-id:** FIX-BCTC-DATA-GAP-FAMILY
**what-done:** Direct-commit verify (verify-committed) of commits 34c3a66ac + 89d0ec24f + 3c7c29fd2 (U1-U6 + memory + board flip, all on main ancestry): re-ran 4 new test files (38 pass / 0 fail), key regression batteries (enricher 87/88, queue 72/73, discovery 52/52, parser/serve 31/31, 240-bctc-full 25/25), `bun tsc --noEmit` 0 errors, size-lint PASS (1458 files), mock-guard PASS on 9 touched production files, commit scope exact (16 files, no creep), U7 no-trigger verified, DJ-GATE-1 fix-side present (developer-S138).
**what-considered:**
- Code-vs-test contract read of the 2 red tests (FIX-BCTC-ENRICHER-STUCK-BACKLOG:205, BCTC-1943-queue-reset-and-retry:440): both assert the OLD Arm-2 bound `attempts < 6` (attempts>=6 NOT selected); U1's AC explicitly reverses that (attempts=6 re-eligible past grace) and the new queue-liveness tests assert the new contract — so the CODE matches the brief; the 2 legacy tests are stale and were green at parent fbad14ced (worktree-verified 25/25) -> commit-introduced red on main, developer missed updating them (updated 240-bctc-full legacy assertions but not these).
- Routing deviation: row `.owner`="po" but chain contract says dispatcher re-spawns the DEVELOPER (never a fixer role); PO cannot apply a code commit — route next_agent=developer (precedent FIX-ORCHAPPLY-MKTEMP: "routing to developer, not .owner verbatim").
**why-decision:** 2 failing legacy tests = ISSUE set -> vc-changes; the rest of the verification surface is green, so the fix is narrow (update 2 stale assertions to the new Arm-2 contract, same class as the developer's own 240-bctc-full update).
**why-change:** no change from plan (vc-changes is the flow's mandated exit for any failing check).
