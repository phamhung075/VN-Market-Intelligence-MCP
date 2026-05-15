# Architect — Notebook

**Last updated:** 2026-05-15 11:00 UTC | **Sprint:** SPRINT-S

## This session

TASK-1918b Architect design — news-scout macro snapshot package gap. Path A chosen (direct tool call), Path B (signal bus) rejected. No new code; 4-file surface: agentBootstrap.ts + SKILL_MANIFEST.md + news-scout.md + stage-bootstrap.md.

TASK-BCTC-3b Architect design — hsx.vn BCTC discovery redesigned for main server (TypeScript) after prior "Envoy route-block" conclusion overturned by main-server recon 2026-05-15.

Key findings and design decisions:
- Prior probe used wrong URL (`/n/api/v1/news/securities/VNM/1` — missing locale segment, string ticker instead of numeric ID). Correct endpoint: `GET /m/api/v1/1/mediafiles/5/{numericId}` returns HTTP 200 with BCTC PDFs directly from France. No VPS needed.
- New implementation: TypeScript fetcher `hsxBctcFetcher.ts` in `infrastructure/fetchers/`. Not Python. Not VPS. Not a scheduler job.
- Integration: new Strategy 0 in `bctcDiscovery.ts`. Current Strategy 0 (VPS Playwright) demotes to Strategy 1. Domain service contract unchanged for consumers.
- `DiscoverOptions._fetchHsx` injectable port added (different arity from `HttpFetchFn` — three params: ticker, year, timeoutMs). `HosePdfDiscoveryResult.source` union gains `"hsx"`.
- `bctcQueueEnricherJob.ts` wires the new fetcher; no logic changes.
- No DB schema changes. No new scheduler job. No VPS script changes.
- Handoff: `docs/handoffs/TASK_BCTC-3b.md` fully rewritten with Architect section. TASK-BCTC-3c updated: pure integration verification (seed queue, run enricher, confirm `staticfile.hsx.vn` URLs land + accessible). No MCP server code changes expected for 3c.

Risk to monitor: static token `HJ2HNS3SKICV4FNE` in hsx.vn JS bundle. If rotated → all hsx.vn calls return 403. Monitor `source: "hsx"` success rate in enricher logs. Token is public, not a secret — do NOT put in `.env`.

## Patterns noticed

- Reuters fallback split (`1899a-reuters-fallback-{dom,lifecycle,detect}.test.ts`) is the confirmed working precedent for the Bun test split pattern.
- Preamble line-count bloat is the recurring risk in Bun test splits: 113L preamble means any group <90L of tests will land under 200L; groups of 90-100L need trimming.
- hsx.vn Envoy route-block pattern: `x-envoy-upstream-service-time: 2ms` + empty body = edge rejection (no backend contact). Contrast with working endpoints: `x-envoy-upstream-service-time: 6ms` + `cache-control: max-age=60`. This is a reliable signal for "permanently blocked by Envoy route table" vs "backend reachable."
- When a geo-restriction hypothesis fails (VPS same 404 as France), always check if the block is at routing layer vs IP filter layer. Envoy route tables are routing-layer blocks — unbypassable from any external IP.

## Carry-over (next session)

- SPIKE_BCTC-3: FULLY CLOSED. Re-Assessment appended to `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md`. TASK-BCTC-3b/3c closed. TASK-BCTC-1 (ops) filed in `docs/TASKS.md`.
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in `/etc/systemd/system/vn-bctc-fetch.service`. 30 min. AC: VNM Q1/2026 Playwright discovery succeeds without pthread_create error. Owner: ops.
- 1899a-bloomberg-test-split: handoff at `docs/handoffs/TASK_1899a-bloomberg-test-split.md`. Ready for dev-news-fetch.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob). Open Q: confirm 60% threshold denominator with user.
- Headlock F2b + F1 (Docker .git/ exclusion): user-queue carry item.
