# Decision Journal — KINHDICH-HOVER-ENRICH-FE QA Gate

task-id: KINHDICH-HOVER-ENRICH-FE
date: 2026-06-14
agent: qa
cycle: 270
verdict: APPROVED

## What was considered

### Primary proof (load-bearing — wrong-surface guard)
- Fetched served bundle `/assets/QueName-C7QiQvgn.js` from `:3001` — **64 hoverSummary fields present**, both target substrings confirmed:
  - Quẻ 1: `"Giai đoạn năng lượng mạnh nhất..."` FOUND
  - Quẻ 47: `"Đang ở giai đoạn kiệt sức và bị bóp nghẹt..."` FOUND
- Fallback operator `hoverSummary??i.coreMeaning` confirmed in minified render logic at line 75 equivalent
- Image d349d070 built 2026-06-14T18:17:17Z UTC — 5 min AFTER commit 067e484d (18:12:14Z UTC). Image includes the commit.

### Why kinh-dich-reference bundle has 0 hoverSummary
- `dashboard.kinh-dich-reference-DnsN-x37.js` does NOT use QueName component — it uses `QUE_DETAIL` from `que-descriptions-detail.generated.ts` and renders `{que.coreMeaning}` directly at line 150
- `que-descriptions-detail.generated.ts` does NOT have a `hoverSummary` field (it has `stateInterpretation`, `favorable`, `warning`, `phases`)
- This is by design: kinh-dich-reference is a FULL detail page, not a hover tooltip surface
- The tooltip hover surface is QueName.tsx, used by:
  - `/dashboard/kinh-dich-signals` → loads `QueName-C7QiQvgn.js` ✓
  - `/dashboard/analysis` → loads `QueName-C7QiQvgn.js` ✓
- Prior chain went green on kinh-dich-reference (wrong surface). This QA correctly targeted the QueName bundle.

### Secondary checks
- 64/64 quẻ have hoverSummary (172–224 chars, avg 194) — all richer than old coreMeaning
- Quẻ 29 (Khảm) 187 chars: plain Vietnamese, no Hán-Việt jargon — readable
- Quẻ 47 (Khốn) 203 chars: plain Vietnamese, concrete advice — readable
- Max 224 chars fits ~4-5 lines at text-xs/max-w-xs (mobile-safe)
- Fallback intact: `hoverSummary??i.coreMeaning` — any quẻ without hoverSummary falls back

### why-change
No change from plan. All checks green on correct surface (QueName bundle served to browser).
