## Task Report FIX-FUNDAMENTALS-REFRESH-CRON-DEAD + FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT
changed: [apps/mcp-server/src/infrastructure/fetchers/vnstockBridge.ts:372-1143 (10 script templates patched), apps/mcp-server/src/__tests__/fix-fundamentals-refresh-cron-dead.test.ts:1-128 (12 new tests)]
tests: 12 pass / 0 fail (targeted) | full suite exit 0 (28 pre-existing unrelated failures, none from this commit) | tsc: 0 errors | ddd: PASS | security: PASS
live-write: VCB 2026-06-13 23:19:47, ACB 2026-06-13 23:19:08 in named-volume DB (keinos/sqlite3 verified) — gap since 2026-04-15 closed
verdict: APPROVED
