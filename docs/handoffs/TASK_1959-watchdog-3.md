# TASK 1959-watchdog-3 — Pre-bake sentence-transformers model in RAG Dockerfile

**Sprint:** 1959 (Watchdog Hardening Batch)
**Owner:** dev-rag-service
**Zone:** `apps/rag-service/`
**Priority/Size:** MEDIUM / S
**Estimate:** 1 h
**Depends:** 1958-disk-relief (DONE 2026-05-20T20:31:26Z, 32 GB free available)
**Spawned by:** PO c223 2026-05-20T20:40Z (signal `docs/signals/po-1958-mid-checkpoint.json`)

## Origin

Recommended by 1958-rca (signal `docs/signals/ops-1958-rca.json`) as `1958-watchdog-3`. Carried forward to Sprint 1959 with renumber. The 1958 RAG cold-start hang was caused in part by the FastAPI lifespan handler blocking on first-run download of the sentence-transformers embedding model (~400 MB) while LanceDB (29 GB) was also doing cold-load I/O. Pre-baking the model into the Docker image eliminates the first-run network call and amortizes the disk write to build time.

Disk pre-condition: SAFE NOW. `ops-1958-disk-relief.json` confirms 32 GB free (vs 15 GB minimum for this task's image growth).

## Work

1. Open `apps/rag-service/Dockerfile`.
2. After base dependencies are installed (`pip install` line for sentence-transformers / torch), add a RUN step that downloads + caches the embedding model into the image layer:
   ```dockerfile
   RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
   ```
   (Replace `'all-MiniLM-L6-v2'` with the actual model name used by `apps/rag-service/` if different — check `apps/rag-service/src/` for the SentenceTransformer constructor call to confirm.)
3. Build the image locally: `docker compose build rag-service`.
4. Verify layer adds ~400 MB: `docker images vn-market-intelligence-mcp-rag-service` — note size delta vs previous build (`docker history` can confirm the RUN step's size contribution).
5. Deploy: `docker compose up -d rag-service`.
6. Cold-start verification:
   - `docker compose restart rag-service`
   - Time to `healthy`: should now be reliably < 30 s (was > 30 s pre-fix).
   - Verify no HuggingFace network call during startup: `docker logs rag-service` should show model loaded from local cache, not downloaded.
7. Run RAG smoke (mirror what watchdog-2 did): `/health` 200, `/search` returns data, gateway 200.
8. Emit signal `docs/signals/dev-rag-service-1959-watchdog-3.json` with image size delta, cold-start time, smoke results.

## Acceptance Criteria

- **AC-1:** `apps/rag-service/Dockerfile` includes `RUN` step downloading the embedding model (visible in `git diff`).
- **AC-2:** Rebuilt image is ~400 MB larger than previous (acceptable — 32 GB headroom).
- **AC-3:** Cold-start API responds healthy in < 30 s (was > 30 s due to model download).
- **AC-4:** `docker logs rag-service` shows model loaded from local cache (no HuggingFace HTTP fetch).
- **AC-5:** Smoke PASS: `/health` 200, `/search` 200 with results, gateway 200.
- **AC-6:** Signal emitted; LITE commit subject: `feat(rag-service/1959-watchdog-3): pre-bake sentence-transformers model in image`.

## Boundary

- Do NOT touch the RAG lifespan handler code (`asyncio.to_thread` work is watchdog-6, deep-held).
- Do NOT change the model — same `all-MiniLM-L6-v2` (or whatever is currently used). This is an image-bake, not a model swap.
- Do NOT bump LanceDB or other dependencies — single-purpose change.
- Free disk check before rebuild: `df -BG / | tail -1 | awk '{print $4}'` must show ≥ 15 GB free. If not, abort and signal PO.

## Related

- Origin: `docs/signals/ops-1958-rca.json` § recommendations.watchdog-3
- Disk-relief precondition: `docs/signals/ops-1958-disk-relief.json` (32 GB free)
- Predecessor (start_period bump): `docs/signals/dev-mcp-server-1958-watchdog-2.json`
- Sprint goal: `docs/SPRINT_GOAL.md` (Sprint 1959)
- Mid-checkpoint signal: `docs/signals/po-1958-mid-checkpoint.json`

## [Developer] Implementation Record

- **Service:** rag-service
- **Zone:** apps/rag-service/
- **Files modified:**
  - `apps/rag-service/Dockerfile` — added RUN model-bake step to `/opt/model-cache`, added `ENV HF_HUB_OFFLINE=1`, `ENV TRANSFORMERS_OFFLINE=1`, updated `ENV EMBEDDING_CACHE_DIR=/opt/model-cache`; removed obsolete NOTE comment
  - `docker-compose.yml:104` — updated `EMBEDDING_CACHE_DIR` from `/app/data/models` to `/opt/model-cache` (1-line change in rag-service stanza only; required so docker-compose env override matches Dockerfile ENV)
- **Tests written:** none (infrastructure-only Dockerfile change; no new Python code)
- **Git commits:** pending LITE commit feat(rag-service/1959-watchdog-3)
- **Type check:** N/A (no Python source changes)
- **Service tests:** 41 pass / 0 fail (pre-existing suite, no regressions)
- **Docs updated:** docs/agent-memory/notebooks/dev-rag-service.md — session notes + zone health
- **Graphify:** skipped (no docs/architecture/microservice/rag-service/ content changed)
- **Measurements:**
  - Image size before: 2.51 GB | after: 3.43 GB (+920 MB — acceptable, 32 GB headroom)
  - Cold-start deploy: 16s healthy (target <30s) — PASS
  - Cold-start restart: 11-16s healthy — PASS
  - HuggingFace network calls at startup: 0 — PASS
  - Smoke: /health 200, /search 200 with results, gateway /health 200 — PASS
- **Key technical decision:** Model baked to `/opt/model-cache` (not `/app/data/models`) to avoid Docker named-volume shadowing. Volume `market_data` mounts at `/app/data` — image-layer files there are shadowed by existing volume content on non-fresh deployments. `/opt/model-cache` is always available from the image layer on every start.
- **Signal:** docs/signals/dev-rag-service-1959-watchdog-3.json
