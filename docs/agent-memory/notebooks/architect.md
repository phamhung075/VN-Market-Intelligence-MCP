# Architect — Notebook

**Last updated:** 2026-05-15 04:47 UTC | **Sprint:** SPIKE_BCTC-3

## This session

SPIKE_BCTC-3 — hsx.vn SPA XHR endpoint analysis for HOSE BCTC no-browser discovery.

Key findings:
- hsx.vn React SPA uses `api.hsx.vn` microservices. BCTC documents are served by SERVICE_NEWS (`/n/api/v1`).
- Primary endpoint: `GET https://api.hsx.vn/n/api/v1/news/securities/{TICKER}/1?pageIndex=...&startDate=...&endDate=...`
- Auth: static header `type: HJ2HNS3SKICV4FNE` only. No login, no CSRF, no cookies required.
- PDF URL pattern: `filePath.replace("~", "https://staticfile.hsx.vn")`
- From France: /n/ service returns 404 (Envoy geo-restriction, x-envoy-upstream-service-time=1ms). Working services from France: /l/, /c/, /mk/.
- From VPS (Vietnam): expected 200 — same pattern as other VN geo-restricted sources in this codebase.
- Recommendation: new Python `fetch-hsx-bctc.py` VPS script using `requests`/`urllib`. Zero changes to `bctcDiscovery.ts` or queue enricher.
- Prerequisite: dev must verify from VPS: `curl -H "type: HJ2HNS3SKICV4FNE" "https://api.hsx.vn/n/api/v1/news/securities/VNM/1?pageIndex=1&pageSize=5&startDate=2026-01-01&endDate=2026-05-15"`

## Patterns noticed

- Reuters fallback split (`1899a-reuters-fallback-{dom,lifecycle,detect}.test.ts`) is the confirmed working precedent for the Bun test split pattern. Always cross-reference when splitting test files in `apps/news-fetch/__tests__/`.
- Preamble line-count bloat is the recurring risk in Bun test splits: 113L preamble means any group <90L of tests will land under 200L; groups of 90-100L need trimming.
- hsx.vn API has two routing layers: BigIP F5 (external, geo-restricted for /n/ /s/ /m/) vs direct VN access (reaches backend). Same pattern as SSC, HNX, SBV — always route via Vinahost VPS.

## Carry-over (next session)

- SPIKE_BCTC-3: DONE. Spike output at `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md`. TASK-BCTC-3 ready for dev-vps-crawls. Prerequisite: VPS curl verification first. Endpoint confirmed via JS bundle analysis; needs live VPS probe before coding.
- 1899a-bloomberg-test-split: handoff at `docs/handoffs/TASK_1899a-bloomberg-test-split.md`. Ready for dev-news-fetch. Risk R-1 (Bun mock state leak across files in same process) — developer must verify `normalizeDate` file runs clean in isolation.
- janitor-1912: `docs/handoffs/TASK_janitor-1912.md` — RF-1 + RF-2 independent disk cleanup tasks. Ready for code-janitor.
- 1914 news-scout dedup: `docs/handoffs/TASK_1914.md` — Option A (extend `get_agent_signals` with `from_agent` param). Guard: when `fromAgent` set, read-mark side-effect must NOT fire.
- c40 container restart: inconclusive (pre-log). Re-evaluate if TNB flags again.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob). Open Q: confirm 60% threshold denominator with user.
- Headlock F2b + F1 (Docker .git/ exclusion): user-queue carry item.
