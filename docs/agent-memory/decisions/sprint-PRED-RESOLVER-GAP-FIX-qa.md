# Decision Journal — PRED-RESOLVER-GAP-FIX

**task-id:** PRED-RESOLVER-GAP-FIX
**date:** 2026-06-21
**agent:** qa

## Entry 1 — Code-Level QA Review (cycle-310)

**verdict:** APPROVED-CODE-LEVEL (REBUILD_REQUIRED — live gate deferred)

**what-considered:**
- tsc: exit 0 (no type errors)
- PRED-RESOLVER-GAP-FIX.test.ts isolated: 28 pass / 0 fail (48 expect calls)
- 1124 + 1125 + 1154 isolated: 41 pass / 0 fail (93 expect calls)
- Full CI suite: 13354 pass / 53 skip / 53 fail
- 53 failures: 49 distinct files, ALL last-touched before d804a013 (2026-06-21T11:41:59+0200); zero overlap with 9 changed files or blast radius
- DDD: scheduler→infra + scheduler→domain (PERMITTED); interface→infra + interface→domain (PERMITTED); alertThresholds.ts has zero imports (pure domain constants); predictionClaimStore.ts infra-only (bun:sqlite type-only); no domain→infra violation
- Security: no process.env, no secrets, no hardcoded tokens in any of the 9 changed files; all SQL uses parameterized bindings (? bound params — no string interpolation)
- mock-guard: exit 0 PASS
- Schema migration: plain ADD COLUMN INTEGER NOT NULL DEFAULT 0 — correct per [[feedback_sqlite_add_column_unique_silent_noop]] (no UNIQUE suffix)
- Test realness: tests use real in-memory SQLite (makeDb() with real DDL); runPredictionResolution called against real :memory: DB; weekend-landing case replicates live ids 6/7 (Saturday resolution_date resolved via prior Friday bar); FPT null-creation excluded case replicates live id 1

**why-change:** all checks green; no architectural concern (single-zone resolver+producer contract fix, no new MCP tool, no cross-service HTTP); REBUILD_REQUIRED noted as deferred condition

**deferred-gate:** SAME-DB LIVE re-verify after ops rebuilds container — query named-volume /app/data/market.db and confirm ids 1,6,7,8,9 each carry non-NULL resolution_outcome OR is_excluded=1; AND a NEW neutral claim with weekend resolution_date resolves to a verdict. Cannot be run now — is_excluded ALTER migration + new query only land after container rebuild.
