# Decision Journal — Sprint FACTORY-NEWS-fix-source-logging · developer

**Sprint goal:** FACTORY-NEWS-fix-source-logging — fix spurious cross-source console.warn tags in news-fetch ingestHeadlines
**Agent:** developer (generic, zone-routed to dev-news-fetch — no dedicated specialist)
**Started:** 2026-07-24T14:54:02Z

---

### STEP developer-S1 · developer · 2026-07-24T14:54:02Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** Read `ingestHeadlines` in `apps/news-fetch/src/module/news_ingest/index.ts`; confirmed `_source` param unused and both `[reuters/headlines]`+`[bloomberg/headlines]` warn lines fire unconditionally in all 3 fallback branches (6 warns total, not 4 pairs as task text estimated — verified by grep).
**what-considered:**
- Compute tag once via ternary vs switch/map — NewsSource enum has exactly 2 members (REUTERS, BLOOMBERG), confirmed in domain/models.ts; ternary is sufficient and matches spec.
**why-decision:** Ternary is simplest correct form for a 2-member enum; switch/map would be over-engineering for this domain shape.
**why-change:** no change from plan

### STEP developer-S2 · developer · 2026-07-24T14:54:02Z
**task-id:** FACTORY-NEWS-fix-source-logging
**what-done:** RED test added (source-correct log tag assertions in index.test.ts) confirmed failing against old code; applied fix (rename `_source`->`source`, value-import NewsSource since now used at runtime, single `console.warn` per branch with `${tag}`); full bun test now 235 pass/0 fail, tsc clean, eslint clean, sandbox 16/16 GREEN.
**what-considered:**
- Pre-existing regression test `__tests__/fix-reuters-url-bloomberg-timeout.test.ts` did literal source-text `toContain('[reuters/headlines] RSS primary failed')` checks — these broke because the tag is no longer a hardcoded literal prefix concatenated with the message (that hardcoding was the bug). Updated those 3 assertions to check the source-agnostic message body (unchanged text), preserving the original regression intent without re-asserting the bug's premise.
**why-decision:** Message-body substring is the actual invariant worth protecting (a warning fires on each failure path); the reuters-only tag prefix was never a valid invariant — it was the defect.
**why-change:** Scope expanded by 1 file (test-only, same apps/news-fetch zone) beyond the single target file named in the task, required to keep `bun test` green without re-encoding the bug into a test assertion.
