## Task Report 1920f
date: 2026-05-16
outcome: CHANGES_REQUESTED
type: FIX (new infra store + interface wire)
round: 1
commit reviewed: bdd63efb

changed: [
  apps/mcp-server/src/infrastructure/db/signalQualityAuditStore.ts (NEW, L1-80),
  apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts (L304-353 added),
  apps/mcp-server/src/__tests__/1920f-signal-quality-audit.test.ts (NEW, L1-282)
]
tests: 15 pass / 0 fail (targeted) | 9421 pass / 36 fail (full suite, 36 pre-existing) | tsc: 2 errors | ddd: PASS | security: PASS
verdict: CHANGES_REQUESTED

### AC Verification
- AC-1 PASS: price_confirmation → signal_type='price' row inserted
- AC-2 PASS: urgent_news → signal_type='news' row inserted
- AC-3 PASS: 7 non-qualifying types skip audit (guard verified by Set.has() unit check)
- AC-4 PASS: INSERT OR IGNORE dedup — COUNT=1, original confidence preserved
- AC-5 PASS: Dropped table → no throw (try/catch in insertSignalQualityAudit)
- AC-6 PASS: runMonthlySignalQualityJob resolves with seeded rows, sendFn called once

### Issues (CHANGES_REQUESTED)

#### Blocking

1. `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts:331`
   `auditContext: SignalAuditContext` object literal assigns `fallback_tier: number | undefined`,
   `vps_breaker_state: string | undefined`, `coverage_gap: string | undefined`, `price: number | undefined`
   to interface optional fields. With `exactOptionalPropertyTypes: true`, explicit `undefined` is not
   assignable to `T?` fields — key must be absent.
   TS2375. Fix: use conditional spread `...(val !== undefined ? { key: val } : {})`.

2. `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts:348`
   `validationResult` passed as `ValidationResult` has `fallback_source: string | undefined`.
   `ValidationResult.fallback_source?: string` requires key absence when value is undefined.
   TS2379. Fix: same conditional spread pattern for `fallback_source` in `validationResult` object.
