# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-11T17:32:03Z

---

### STEP qa-S48 · qa · 2026-08-11T17:32:03Z
**task-id:** FACTORY-INFRA-agentSignal-sql-binding
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `a881b2489` (SQLi hardening, agentSignalStore.ts READ paths). Confirmed `main` ancestry; `git show --stat` matches all 4 claimed files. Read the actual diff, not trusted from review_note prose.
**what-considered:**
- All 5 sites genuinely converted to bound `?` placeholders in the diff: getSignals hoursBack (was raw template-literal arithmetic), signalType (was manual `'-escape), mark-as-read UPDATE...IN(ids) (was raw-joined ids, now generated placeholder-count + `.run(...ids)`), getSignalEffectiveness days (was raw template literal) + fromAgent/signalType (was manual escape). No structural table/column interpolation existed either way.
- Spot-checked the specific `days`-field differential claim: new test's `maliciousDays = "1'); DROP TABLE...;--" as unknown as number` cast bypasses TS at the type level (real risk vector — `days` is `number` only at compile time, GetEffectivenessOptions has no runtime Zod inside the store fn); MCP tool boundary itself (`agentSignalTools.ts` `get_signal_effectiveness`) DOES already z.coerce.number().int().positive() `days` — so the pre-fix exploit path required bypassing that layer (direct fn call / future unvalidated caller), not a live MCP-reachable CVE today. Claim is accurate as stated (says "genuinely exploitable pre-fix site" at the function level via A/B probe, not "MCP-reachable in production") — not overstated.
- Re-ran REAL verification myself, not trusted: new test file 9/9 pass (live); tsc clean (live); mock-guard PASS on agentSignalStore.ts (live); full 32-file agentSignalStore-dependent regression (broader than review's claimed 26) 335/335 pass, 0 fail (live) — no regressions.
**why-decision:** APPROVED, DONE_VERIFIED. Security fix is real, complete, and correctly scoped; the one prose imprecision (26 vs 32 dependent files) is a counting-method difference, not a false claim — the pass-rate claim (0 fail) held on the wider set too.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S49 · qa · 2026-08-11T17:33:39Z
**task-id:** FACTORY-APP-pollNews-layering-fix
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `a2a386d24` (Fence-B DDD layering fix — globalSourceTracker singleton moved interface→infrastructure). Confirmed `main` ancestry; `git show --stat` matches all 12 claimed touch points (eslint.config.mjs, new sourceHealthRegistry.ts, 3 rewired consumers, 6 tests, getMoneyRadarComposite.ts).
**what-considered:**
- Byte-compared the singleton block old-file→new-file myself: seed list, `recordDisabled` calls, `globalThis` stash key, `_resetGlobalSourceTracker` logic all identical — genuine pure relocation, not lossy.
- Confirmed Fence-B actually resolved at the exact documented site: grep `from.*interface` in pollNews.ts/getMoneyRadarComposite.ts returns only a comment, zero live import; the `eslint-disable-next-line boundaries/dependencies -- FENCE-LEGACY` line is gone; `eslint.config.mjs` comment updated to reflect resolution.
- Repo-wide grep for `globalSourceTracker`/`sourceHealthTools` usage: zero dangling imports to the old interface-layer path remain (only doc/comment references).
- Re-ran REAL verification myself, not trusted from prose: `tsc --noEmit` clean (0 errors, live); `eslint` on all 6 touched production files clean (0 errors/warnings, live); targeted 7-file pollNews/source-health suite 42/42 pass 0 fail (live); `mock-guard.sh` PASS on all 6 files; security grep (process.env/password/secret/token) on every added diff line clean.
**why-decision:** APPROVED — Fence-B violation genuinely resolved at its documented site, singleton semantics byte-preserved, all independent checks green, no functional/security regression.
**why-change:** none — verified exactly what the row scoped.
