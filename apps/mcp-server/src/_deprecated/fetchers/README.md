# _deprecated/fetchers

Superseded by news-fetch microservice (port 5008). Retained for rollback reference only.

- `reuters.ts` — Legacy Reuters/AP News RSS fetcher. Superseded by HTTP call to `http://news-fetch:5008/reuters/headlines` in analysis.ts (G5b, Phase 1). Do not import from production code.
- `023-rss-reuters.test.ts` — Unit tests for the deprecated fetchReuters() function. Moved here alongside reuters.ts (G5, Phase 1).
- `1828c-rss-consecutive-error.test.ts` — Consecutive-error observability tests for fetchReuters(). Moved here alongside reuters.ts (G5, Phase 1).
