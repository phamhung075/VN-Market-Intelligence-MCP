# DRIFT-3-A1 — Add ARG GIT_SHA + LABEL to all 10 non-pdf-extractor Dockerfiles

**Task ID:** DRIFT-3-A1
**Phase:** Phase A (parallel-safe)
**Brief:** `docs/architecture-briefs/2026-05-26-ci-cd-image-sha-drift-guard.md`
**Owner:** dev-cross-service (dev-api-gateway, dev-mcp-server, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-rag-service, dev-news-fetch, dev-frontend)
**Zone:** `cross-service/` (routing: assign per-zone specialist for their service's Dockerfile)

---

## Scope

Add `ARG GIT_SHA=unknown` and `LABEL vn.market.git_sha="${GIT_SHA}"` as the final 2 lines of the runtime stage in each of these 10 Dockerfiles:

1. `apps/mcp-server/Dockerfile` → dev-mcp-server
2. `apps/api-gateway/Dockerfile` → dev-api-gateway  
3. `apps/stock-price/Dockerfile` → dev-stock-price
4. `apps/technical-analysis/Dockerfile` → dev-technical-analysis
5. `apps/macro-indicators/Dockerfile` → dev-macro-indicators
6. `apps/kinh-dich-service/Dockerfile` → dev-kinh-dich
7. `apps/alert-engine/Dockerfile` → dev-alert-engine
8. `apps/rag-service/Dockerfile` → dev-rag-service
9. `apps/news-fetch/Dockerfile` → dev-frontend
10. `apps/frontend/Dockerfile` → dev-frontend

**NOTE:** `apps/pdf-extractor/Dockerfile` is Phase B (DEFERRED) — do NOT touch it.

**Key rule (mitigates R-HIGH risk):** Place `ARG GIT_SHA` and `LABEL` as the **last two lines** of the final runtime stage, **after all `COPY --from=builder` instructions**. This ensures the label step is never served from a stale Docker layer cache.

---

## Acceptance Criteria

- AC-1: All 10 Dockerfiles contain `ARG GIT_SHA=unknown` and `LABEL vn.market.git_sha="${GIT_SHA}"` as the final 2 lines of their runtime stage
- AC-2: `grep -l "vn.market.git_sha" apps/*/Dockerfile | wc -l` returns `10` (and pdf-extractor is absent from the grep results)
- AC-3: Verify each file does NOT have the label lines applied to the builder stage (only the runtime stage)
- AC-4: No rebuild required to author this task — changes are inert until the ops rebuild cycle

---

## Files to Modify

| Service | Dockerfile Path | Dev Owner | Rebuild |
|---------|-----------------|-----------|---------|
| mcp-server | apps/mcp-server/Dockerfile | dev-mcp-server | DEFERRED |
| api-gateway | apps/api-gateway/Dockerfile | dev-api-gateway | DEFERRED |
| stock-price | apps/stock-price/Dockerfile | dev-stock-price | DEFERRED |
| technical-analysis | apps/technical-analysis/Dockerfile | dev-technical-analysis | DEFERRED |
| macro-indicators | apps/macro-indicators/Dockerfile | dev-macro-indicators | DEFERRED |
| kinh-dich-service | apps/kinh-dich-service/Dockerfile | dev-kinh-dich | DEFERRED |
| alert-engine | apps/alert-engine/Dockerfile | dev-alert-engine | DEFERRED |
| rag-service | apps/rag-service/Dockerfile | dev-rag-service | DEFERRED |
| news-fetch | apps/news-fetch/Dockerfile | dev-frontend | DEFERRED |
| frontend | apps/frontend/Dockerfile | dev-frontend | DEFERRED |

---

## Dispatch

This task can be parallelized per zone — each dev-* owner edits their own service's Dockerfile in parallel. Changes are non-blocking (source-only, no rebuild).

---

## Binding Day-0 Notes

- Explicit-file staging only: `git add apps/<service>/Dockerfile` per file
- No `--force`, `--no-verify`, `--no-gpg-sign`
- NO `git push` (main terminal owns the final commit)
- Stay on main branch
- Do NOT touch `apps/pdf-extractor/`, any `LF-*` task, any `pilot-status-*.json`, or `docs/pipeline-state.json` BCTC fields
