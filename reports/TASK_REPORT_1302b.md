# Task Report 1302b — compact

changed:
- src/domain/services/newsNormalizer.ts:23,857
- src/domain/services/policyImpactMapper.ts:17,229
- src/infrastructure/adapters/analysisFormatters.ts (DELETED)

bun test: 6606 pass / 0 fail (Bun post-teardown crash is runtime bug, not test failure)
tsc: 0 errors
ddd: PASS — no `from.*infrastructure` in either domain file
analysisFormatters: DELETED confirmed, 0 references remain in codebase
old fn names: 0 occurrences of `formatAnalysisNewsSummary` / `formatAnalysisPolicySummary`
call sites: truncateNewsSummary() at newsNormalizer.ts:857 — CORRECT
           truncatePolicySummary() at policyImpactMapper.ts:229 — CORRECT
import cycle: domain/services -> domain/services only — CLEAN

verdict: APPROVED
