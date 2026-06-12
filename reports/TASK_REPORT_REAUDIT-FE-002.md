## Task Report REAUDIT-FE-002
date: 2026-06-12
outcome: APPROVED

changed:
- apps/frontend/app/routes/dashboard.foreign-flow.tsx
- apps/frontend/app/__tests__/reaudit-fe-002-foreign-flow-stale-fields.test.ts (NEW)

tests: 15 pass / 0 fail (reaudit-fe-002 suite) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: EXIT 0

## Live Probe Evidence
- GET /api/foreign-flow?limit=5 → stale_fields=["currentHoldingRatio","maxHoldingRatio","marketCapBn"]
- SSR HTML /dashboard/foreign-flow: 2 column headers render "Không có dữ liệu" badge
  - "Tỷ lệ sở hữu" (currentHoldingRatio): badge rendered
  - "Vốn hóa" (marketCapBn): badge rendered
  - maxHoldingRatio: no table column in page design — badge omission correct behavior
- Frontend image: sha256:e47f66ad6d1e (healthy)

verdict: APPROVED

## QA Review Record
- commit: 11308f1c
- badge styling: ml-1.5 inline-block rounded bg-slate-700 px-1.5 py-0.5 text-[10px] confirmed
- isFieldStale() + staleColumnLabel() helpers cover all 3 fields including maxHoldingRatio (used via helper, no rendered column)
