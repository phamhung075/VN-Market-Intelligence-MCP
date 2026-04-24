### Task 1298c: IMF signal integration GREEN tests (10:00–10:20)
- **Files changed**: `src/__tests__/1298c-imf-signal-integration.test.ts` (NEW, 309 lines)
- **Finding**: `synthesizeChain` requires >= 2 links (returns null if < 2). All conviction tests need a 2-link chain.
- **Finding**: `IMF_CONFIDENCE_MIN = 0.55` — confidence 0.40 guard test confirms no conviction delta.
- **Status**: Ready for QA

### Task 1298a: IMF domain model + classifier + schema RED tests (task complete)
- **Files changed**: `src/__tests__/1298a-imf-domain.test.ts` (NEW, 207 lines)
- **Finding**: Handoff spec used `../../domain/` import path but correct is `../domain/` — test files in `src/__tests__/` are one level below `src/`, not two. All future test imports must use `../domain/`, `../application/`, `../scheduler/`, `../interface/`.
- **Finding**: `BULLISH_THRESHOLD` in imfDataClassifier.ts is 0.10 (not 0.3). Tests assert `sentiment > 0.3` on the score value, which holds because yoyChange=0.12 → sentimentDelta capped at 1.0. Classification and threshold are independent assertions.
- **Status**: Ready for QA

### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA

### [QA] Task 1303h Review (2026-04-24)
- **Verdict**: APPROVED
- **Pattern compliance**: DDD clean — extractorGuards.ts domain-only imports; confirmed per `docs/agent-memory/patterns/DDD-violations.md`
- **Test results**: 11/11 pass (1303h suite); 6591 pass / 16 fail (full suite, all 16 pre-existing)
- **tsc**: 0 errors
- **Issues checked**: TC-1 DDD failure pre-existing (newsNormalizer.ts:23), not introduced by 1303h
- **Deviation noted**: Dev used bun:test not vitest (correct for this project); integration tests use tỷ unit (not triệu) to bypass magnitude inference — this is the correct real-world scenario

### [QA] Task 1304-fix Review (2026-04-24)
- **Verdict**: APPROVED
- **Pattern compliance**: DDD violation FIXED — newsNormalizer.ts:23 swapped `infrastructure/adapters/analysisFormatters.js` for `./textUtils.js` (domain peer); confirmed per `docs/agent-memory/patterns/DDD-violations.md`
- **Test results**: 4/4 pass (1321 DDD suite); 5229 pass / 11 fail (shards 2-4, all 11 pre-existing)
- **tsc**: 0 errors
- **Issues checked**: DDD-violations.md updated — Task 1304 prevention applied and verified

### Task 1303i: Cascade Rule Gaps — Taiwan Geo/BCTC-Overdue/Trade-Map (00:00–00:30)
- **Files changed**: `cascadeEngine.ts`, `tradeRelationships.ts`, `bctcOverdueCheckJob.ts`, `src/__tests__/1303i-cascade-gaps.test.ts`
- **Finding**: Handoff WatchlistEntry shape wrong (said code+domain, actual is actionCode+domain+exchange). CausalChain uses `entries` not `domainEntries`, uses `sentiment` not `direction`. Fixed in both job and tests.
- **Finding**: Taiwan escalation test must use `find()` for bearish entry specifically — generic FDI rule also fires tech_up for same text, so first `find()` returns bullish. Solution: search for bearish tech entry explicitly.
- **Status**: Ready for QA
### Task 1298b: IMF infra tests GREEN (02:30–02:50)
- **Files changed**: `src/__tests__/1298b-imf-infra.test.ts` (created), `docs/data/cron-registry.json` (added imf_indicator_poller entry)
- **Finding**: Handoff referenced `src/scheduler/cron-registry.ts` but that file does not exist. Cron config lives in `src/scheduler/jobs.ts` CRONS map (CRONS.imfIndicatorPoller = "0 */6 * * *"). AC-5 tests adapted to read `jobs.ts` via readFileSync + assert JSON cron-registry.json entry.
- **Finding**: cron-registry.json was missing imf_indicator_poller entry entirely — added it with id, schedule, timeoutMs:30000, enabled:true.
- **Status**: Ready for QA — 11/11 tests GREEN, tsc clean, 14 pre-existing failures unchanged

### Task 1310a: fix push-foreign-flow UNIQUE constraint (HH:MM–HH:MM)
- **Files changed**: src/infrastructure/db/vnstockStore.ts (+13 lines), src/__tests__/1310a-foreign-flow-dedup.test.ts (new, 263 lines)
- **Finding**: `ON CONFLICT(code,date) DO UPDATE` handles cross-call dups fine but NOT intra-batch dups within same transaction. Dedup before transaction is the correct pattern for all batch upserts.
- **Pattern**: Any batch upsert using `ON CONFLICT` MUST deduplicate input by constraint key before the transaction. See `vnstockStore.upsertForeignFlow` for reference impl.
- **Status**: Ready for QA

### Task 1309a: Cascade rule gaps — 4 sectors (04:00–04:10)
- **Files changed**: `cascadeEngine.ts` (3 edits), `src/__tests__/1309a-cascade-gaps.test.ts` (new, 15 tests)
- **Finding**: `COMMODITY_TRIGGER_DOMAINS` only covered `gold_mining` + `oil_gas`. Agriculture commodity articles (coffee/rice) broadcast to unrelated real_estate via market-wide path. Fix: add `"agriculture"` to the set.
- **Finding**: Gap 2 (govt market support) already covered by "stabilization fund" keyword but EN phrase "government stock market support" missing — added.
- **Finding**: Gap 1 (Hormuz) + Gap 4 (Taiwan) already fully implemented (1246+1303i). Tests confirm no regression.
- **Status**: Ready for QA

### Task 1308a: Insider selling + global bearish macro patterns (09:00–09:30)
- **Files changed**: sentimentClassifier.ts, pollNews.ts, src/__tests__/1308a-sentiment-patterns.test.ts
- **Finding**: Covered-range dedup in classifySentiment() is per-polarity — bearish claim does NOT suppress bullish sub-phrase matches. Compound bearish phrases must set weight = (sum of all overlapping bullish weights) + 1 to guarantee net-bearish. "hạ dự báo tăng trưởng"(w6) needed to beat tăng trưởng(2)+dự báo tăng(3)=5.
- **Pattern**: → docs/agent-memory/patterns/ (sentiment-compound-weight-clash.md — consider creating)
- **Status**: Ready for QA
