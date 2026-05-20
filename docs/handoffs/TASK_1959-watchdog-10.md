# TASK 1959-watchdog-10 — Cleanup rag-service Dockerfile latent shadow remnant

**Sprint:** 1959 (watchdog hardening cycle-3) · **Owner:** dev-rag-service · **Size:** XS (~10 min + rebuild) · **Zone:** `apps/rag-service/` · **Priority:** LOW · **Status:** DISPATCH-NOW

Parent goal: `docs/SPRINT_GOAL.md` (Sprint 1959) · Predecessor: `docs/signals/dev-rag-service-1959-watchdog-3.json` (model moved to /opt/model-cache) · Audit reference: `docs/architecture-briefs/2026-05-21-named-volume-shadow-audit.md` (rag-service flagged with `RUN mkdir -p /app/data/lancedb /app/data/models` — the `/app/data/models` line is now a no-op remnant)

---

## Why

watchdog-3 moved the sentence-transformers model cache to `/opt/model-cache`. The Dockerfile still bakes `RUN mkdir -p /app/data/lancedb /app/data/models`. The `/app/data/models` half is now:
- Unused at runtime (model lives at `/opt/model-cache`).
- Silently shadowed by the `market_data` named volume (empty dir only — no data loss today, but a latent footgun if a future developer adds seed data under it).

The `/app/data/lancedb` half is intentional runtime path (LanceDB writes go to the named volume) and stays.

Cleanup = drop the `/app/data/models` token from the mkdir line. Easier to remove now than document why the remnant is harmless.

---

## Work

1. Edit `apps/rag-service/Dockerfile`:
   - Before: `RUN mkdir -p /app/data/lancedb /app/data/models`
   - After:  `RUN mkdir -p /app/data/lancedb`
2. Rebuild rag-service: `docker compose up -d --build rag-service` (from repo root).
   - Disk check first: `df -h /` — confirm ≥ 15 GB free (currently 32 GB → safe).
3. 60-second smoke:
   - `docker compose ps rag-service` → `Up (healthy)`.
   - `curl -fsS http://localhost:8001/health` → 200.
   - `curl -fsS -X POST http://localhost:8001/search -H 'content-type: application/json' -d '{"query":"vingroup","top_k":1}'` → 200 with results.
4. NO new tests. Existing 41 tests (from watchdog-3) cover the search path.

---

## Acceptance criteria

- AC-10-1: Dockerfile diff = one-line edit (drop `/app/data/models` token only).
- AC-10-2: Rebuild succeeds; image size delta < 5 MB (mkdir of one fewer dir = nearly zero).
- AC-10-3: rag-service healthy post-restart (≤ 60 s start).
- AC-10-4: `/health` 200 + `/search` returns ≥ 1 result for "vingroup".
- AC-10-5: No regression — gateway returns 200 for the same query.

## Signal

On done, emit `docs/signals/dev-rag-service-1959-watchdog-10.json`:
```json
{
  "schema": "dev-signal/v1",
  "agent": "dev-rag-service",
  "task_id": "1959-watchdog-10",
  "title": "Cleanup /app/data/models mkdir remnant",
  "status": "DONE",
  "timestamp": "<ISO UTC>",
  "sprint": 1959,
  "zone": "apps/rag-service/",
  "files_modified": ["apps/rag-service/Dockerfile"],
  "rebuild_required": true,
  "smoke_results": {
    "health": "200 OK",
    "search_query": "vingroup",
    "search_results_count": "<N>",
    "rebuild_seconds": "<N>"
  },
  "ac_pass": ["AC-10-1", "AC-10-2", "AC-10-3", "AC-10-4", "AC-10-5"],
  "next": "po"
}
```

## Disk-safety note

watchdog-3 already added +920 MB to the rag-service image. This cleanup adds 0 MB (just removes one mkdir). Verify ≥ 15 GB free before `docker compose up -d --build` per `scripts/preflight-disk.sh` (watchdog-1, commit `784905da`).
