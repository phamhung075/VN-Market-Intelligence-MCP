## Task Report 1959-watchdog-10

changed: [apps/rag-service/Dockerfile:36-37 (2 lines — comment + mkdir)]
tests: N/A (Python service, mechanical cleanup, no tests required per scope)
tsc: N/A (Python service)
ddd: N/A
security: N/A
verdict: APPROVED

---

### Scope

Mechanical dead-code cleanup: drop `/app/data/models` token from `RUN mkdir-p` in rag-service Dockerfile.
No behavioral change. No test coverage required.

### AC Verification

| AC | Check | Result |
|----|-------|--------|
| AC-10-1 | Diff = exactly 1 file (`apps/rag-service/Dockerfile`), 2 lines changed (comment + mkdir), `/app/data/models` token removed only | PASS |
| AC-10-1 | No other files modified in commit `5466c84b` within the Dockerfile | PASS (Dockerfile only in the 5 files: handoff + signal + notebook are expected housekeeping) |
| Volume policy (w-9) | No `/app/data/<subpath>` mkdir remains except `/app/data/lancedb` (intentional runtime path for LanceDB segments) | PASS |
| Volume policy (w-9) | No `COPY ... /app/data/` present | PASS |
| EMBEDDING_CACHE_DIR | `ENV EMBEDDING_CACHE_DIR=/opt/model-cache` at line 63 (final override) — `docker compose config` output confirms `EMBEDDING_CACHE_DIR: /opt/model-cache` | PASS |
| docker compose config | Parses cleanly — no errors, `EMBEDDING_CACHE_DIR=/opt/model-cache` confirmed in rendered config | PASS |
| Model pre-bake INTACT | `RUN HF_HOME=/opt/model-cache SENTENCE_TRANSFORMERS_HOME=/opt/model-cache python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer(..., cache_folder='/opt/model-cache')"` at lines 54-59 — fully present, not touched | PASS |
| Commit `5466c84b` | 1 file in Dockerfile diff, ≤3 lines changed | PASS (exactly 2 lines: -comment +comment, -mkdir +mkdir) |

### Notes

- Line 41 (`ENV EMBEDDING_CACHE_DIR=/app/data/models`) is an intermediate ENV declaration that is superseded by the final `ENV EMBEDDING_CACHE_DIR=/opt/model-cache` at line 63. This intermediate stale ENV pre-dates this task (established in watchdog-3 refactor). It is harmless — Docker processes ENV sequentially and the final declaration wins at runtime; `docker compose config` output confirms `/opt/model-cache` is the effective value. Not in scope of this XS cleanup task.
- AC-10-2 through AC-10-5 are pending ops rebuild + smoke. Gate applies: ops must rebuild and smoke before these ACs can be verified.

### NEXT

GATE ALL DEPLOY: QA APPROVE issued here. Ops must:
1. Run `scripts/preflight-disk.sh` — confirm ≥15GB free (watchdog-1 safeguard).
2. `docker compose up -d --build rag-service` from repo root.
3. 60-second smoke: `docker compose ps rag-service` → Up (healthy); `curl -fsS http://localhost:8001/health` → 200; `curl -fsS -X POST http://localhost:8001/search -H 'content-type: application/json' -d '{"query":"vingroup","top_k":1}'` → 200 with results.
4. AC-10-2..5 verified by ops smoke. Image size delta expected ≈0MB (one fewer mkdir).
