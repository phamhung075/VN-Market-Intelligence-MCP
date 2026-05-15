## Task Report 1899a-bloomberg-test-split

changed: [apps/news-fetch/__tests__/1899a-bloomberg-dom.test.ts:189L, apps/news-fetch/__tests__/1899a-bloomberg-json-fallback.test.ts:182L, apps/news-fetch/__tests__/1899a-bloomberg-perimeterx-lifecycle.test.ts:186L, apps/news-fetch/__tests__/1899a-bloomberg-normalize-date.test.ts:51L] — source apps/news-fetch/__tests__/1899a-bloomberg.test.ts deleted
tests: 29 pass / 0 fail | tsc: 0 errors | ddd: SKIP (test-only zone) | security: SKIP (test-only zone)
verdict: APPROVED

### AC Checklist

- AC-1 PASS: source 1899a-bloomberg.test.ts deleted (confirmed no such file)
- AC-2 PASS: 4 files ≤200L — dom:189 / json-fallback:182 / perimeterx-lifecycle:186 / normalize-date:51
- AC-3 PASS: total expect() = 41 (12+8+7+14)
- AC-4 PASS: bun test glob — 29 pass / 0 fail / 41 expect() calls
- AC-5 PASS: news-fetch full suite — 172 pass / 0 fail (matches developer baseline; mcp-server OOM pre-existing, unrelated)
- AC-6 PASS: bun tsc --noEmit — 0 errors
