# rag-service Memory Sizing Remediation — FU-RAG-DEPLOY-MEMORY

**Task ID:** FU-RAG-DEPLOY-MEMORY
**Agent:** architect
**Date:** 2026-08-06
**Trigger:** first CONFIRMED OOMKill on this container (`docker events`: `container oom` 08:17:28.68Z →
`die` exitCode=137 08:17:30.29Z → auto-restart 08:17:30.93Z, RestartCount 1→2). All 5 prior A-30 fires
(c47/c49/c50/c51/c52) were `OOMKilled=false` oscillation/sustained-flat — correctly dispositioned as
observation. This event is qualitatively different: it materialised. Escalated again 08:15:30Z (c53,
765.9/768 MiB = 99.73%, CRITICAL).

**Measurement gate:** already discharged 2026-07-29T11:48Z (`po_GATE_DISCHARGED_anon_dominant`) — anon
≈95% of RSS (~726 MiB anon / ~767 MiB total at the 10:12Z restart), so the process genuinely needs that
memory resident; it is not reclaimable file-backed cache. Nothing left to measure. This brief is the
remediation, not another measurement pass.

---

## 1. Live host/VM headroom check (RAW, not assumed)

Both readings taken live at design time, 2026-08-06:

- **Docker Desktop VM** (the actual resource pool every container limit is carved out of):
  `MemoryMiB: 8192` (7.75 GiB reported by `docker info`), `SwapMiB: 2048`. `docker run --rm alpine free -h`
  inside the VM: `total 7.8G / used 3.4G / available 4.1G`, swap `2.0G total / 1.5G used`.
- **Sum of all 12 services' `deploy.resources.limits.memory`** in `docker-compose.yml`: 3g+2.5g+768m+
  512m+1.5g+512m+512m+512m+1g+512m+512m+512m ≈ **12.25 GiB** of *ceiling* against a 7.75 GiB VM — already
  a ~1.58× over-commit today (normal for Docker: ceilings are worst-case, not concurrent reservations).
  Actual live `docker stats` sum across all 13 containers right now: **≈2.74 GiB** real RSS.
- **Host macOS** `sysctl vm.swapusage`: `total 8192M / used 7043M (86%) / free 1148M` — the host itself
  is under real, independent memory pressure (this is the same class of condition that caused the
  2026-05-24/25 kernel panics, `project_host_memory_panic`). This is a **host-level** signal, separate
  from the Docker VM's own internal accounting above.

**Implication for this design:** raising rag-service's container *ceiling* does **not** by itself change
the Docker VM's fixed 8192 MiB allocation from the host, and does not increase host memory pressure
unless rag-service's *actual* usage grows into the new headroom. Given real usage is ~2.74 GiB against a
7.75 GiB VM (4.1 GiB available), there is genuine slack for a modest, justified raise. The 86% host swap
figure is flagged as an existing, independent host-level risk (worth a standing ops watch) but is not
created or worsened by this change.

## 2. Sizing decision — raise the cap (Option (a), immediate)

| Field | Current | New | Rationale |
|---|---|---|---|
| `deploy.resources.limits.memory` | `768m` | **`1024m` (1g)** | Measured need ≈726–750 MiB anon resident (single embed) + ~20 MiB historical peak compaction burst + operating slack. 768m leaves 2–20 MiB — proven insufficient (99.73% CRITICAL, then OOM). 1g leaves ~270–300 MiB headroom, comfortably covering the burst with margin for corpus growth (currently 785 MiB on-disk LanceDB, growing ~103 rows/h) without reopening the *original* 2026-06-10 problem (that cut was `1.5g→768m`, made in the SAME commit as the `/embed/health` probe addition — not because 1.5g was too large for this service, but as a post-panic belt-tightening; the *startup* OOM risk that motivated the panic-era caution was independently and permanently closed by GFD-13's lazy-load, 2026-06-10, unrelated to the cap number). |
| `deploy.resources.reservations.memory` | `256m` | **`512m`** | Restores the reservation this container carried under 2dc1d8c4e (`768m/512m`) before a later, undocumented cut to `256m`; a 512m reservation better reflects genuine steady-state need and reduces host scheduler contention risk. |

**File:** `docker-compose.yml` lines 165-172 (rag-service `deploy:` block). Single-line-pair edit, no
other service touched.

**Deploy:** single-service rebuild only — `docker compose build rag-service && docker compose up -d
--no-deps rag-service` (never `down`/`stop`/`--force-recreate`, per
`feedback_preserve_multi_container_microservice_architecture`). PO's 2026-08-01 permanent directive
(`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`) already retires any user-gate language on this
row (`po_usergate_language_RETIRED_20260805T1630`) — ops/developer may deploy without a user ask.

**This alone is NOT the structural fix** — it buys headroom against *today's* footprint. The corpus
keeps growing (LanceDB dataset already exceeds the OLD cap on disk, `po_dataset_exceeds_cap_20260729`)
and the embedder singleton has no release path, so the same ~95%-pinned shape will recur at a higher
absolute number unless Option (b) below also lands.

## 3. Structural fix — Option (b): idle-unload path for the embedder singleton

**Root architectural gap** (stated 3× on this row's own history, never actioned): `apps/rag-service/
infrastructure/embedder.py:37` (`self._model = None` at init) / `:51` (`_load_model`) implements a
lazy-load-once singleton (GFD-13, 2026-06-10) with **no corresponding unload**. Once ANY request calls
`embed()`/`embed_batch()`, the ~600–750 MiB model is resident for the container's entire remaining
lifetime — the service is pinned near its cap indefinitely after the very first request, regardless of
how bursty or sparse traffic actually is. This is why the container sits at 95-99% "at rest": there is
no rest state once warmed.

**Design — idle-unload, symmetric to the existing lazy-load:**

- New field `self._last_used_monotonic: float | None = None`, set at the top of `_raw_embed()` (covers
  both `embed()` and `embed_batch()`, the only two callers) via `time.monotonic()`.
- New method `_maybe_unload_idle(self, idle_threshold_s: float) -> bool`: under the SAME
  `self._load_lock` used for load, if `self._model is not None` and
  `time.monotonic() - self._last_used_monotonic > idle_threshold_s`, set `self._model = None` and call
  `gc.collect()`. Returns whether it unloaded (for logging).
- Trigger: a single lightweight `asyncio.create_task` background loop started in `build_lifespan()`
  (the SAME function that currently no-ops `initialize()`), sleeping in a bounded interval (e.g. 60s)
  and calling `_maybe_unload_idle()`; cancelled cleanly on shutdown (`finally: task.cancel()` inside the
  lifespan context manager — standard FastAPI lifespan shutdown pattern, no new dependency).
- **Config, not a hardcode:** `EMBEDDER_IDLE_UNLOAD_MINUTES` env var (default e.g. `15`), read the same
  way `EMBEDDING_CACHE_DIR`/`LOG_LEVEL` already are in this service — do not literal-constant it.
- `/embed/health` is UNCHANGED and stays passive per GFD-7 (`state: "cold"|"warm"` already reports
  model-loaded state truthfully; unload just makes `"cold"` a state the service can *return to*, not
  only start in).
- **Cost:** first request after an idle window pays the ~1-3s warm reload (already the documented
  cold-start cost, GFD-13 §3) instead of ~0ms. Acceptable for a backend RAG service with no
  hard-real-time SLA; this is the same latency/memory trade every serverless-style lazy-load already
  accepts on cold start, just applied repeatedly instead of once.
- **This is the actual fix to the growing-corpus problem** flagged on this row
  (`po_dataset_exceeds_cap_20260729T1140`): shrinking the FIXED baseline (not the corpus — LanceDB's
  on-disk footprint was already shown NOT to be the resident-memory driver, anon-dominant per the
  discharged gate) is the only lever besides "raise the cap forever," and raising the cap forever loses
  the argument again once traffic makes the model stay loaded permanently at a higher ceiling.

**Files to modify:**
- `apps/rag-service/infrastructure/embedder.py` — `_maybe_unload_idle()`, `_last_used_monotonic` tracking
  in `_raw_embed()`.
- `apps/rag-service/interface/app_factory.py` — `build_lifespan()` background task wiring
  (start/cancel).
- `apps/rag-service/main.py` — pass `EMBEDDER_IDLE_UNLOAD_MINUTES` through if config plumbing needs it
  (check existing `cfg` object shape — likely a one-line addition alongside `EMBEDDING_CACHE_DIR`).
- Test strategy: unit test on `SentenceTransformersEmbedder` directly (inject a fake clock / monkeypatch
  `time.monotonic`) — assert `_model` becomes `None` after `idle_threshold_s` elapses post-embed, assert
  a subsequent `embed()` call transparently reloads (existing `_ensure_model_loaded()` double-check-lock
  path already handles re-entry, no new locking logic needed). Integration: `/embed/health` before/after
  an injected idle-unload shows `state` flip `warm→cold` without a 503.

## 4. DDD / zone

Zone: `apps/rag-service/` (infrastructure layer — `embedder.py` is the `EmbedderPort` implementation,
`app_factory.py` is composition-root wiring) + root `docker-compose.yml` (deploy config, not app code —
cross-cutting, owned alongside the service). No domain/application layer changes. No new interface.
**BUILD-STANDARD:** not-applicable (existing service, in-zone config + infra tuning — bug-fix/maintenance
class, not a new feature or new service).

## 5. Sequencing

1. **Now (P1):** docker-compose.yml cap raise (768m→1g, 256m→512m) + single-service rebuild. Closes the
   live crash risk today. No code change, no test suite impact.
2. **Fast-follow (same sprint or next):** embedder idle-unload. Structural; removes the "pinned at ~95%
   forever after first request" shape entirely, buys headroom back for corpus growth independent of any
   future cap number.

Both are additive and independent — (1) does not block or get invalidated by (2).

## 6. Cross-references

- `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` — AC6 explicitly disclaims closing the memory residual,
  assigns it here. This brief is that assignment's answer.
- `RAG-FTS-BUILD-MEMORY-BOUND` — time-gated (~56k rows, ~2026-08-16); its AC1 target (FTS rebuild under
  cap) should be re-evaluated once the cap is 1g, not 768m — flag for whoever picks that row up next,
  not actioned here.
- `FIX-RAG-COMPACTION-DISK-AMPLIFICATION` (P2) — disk-footprint concern, explicitly NOT a memory remedy
  (corpus is not resident per the discharged anon-dominant gate) — unaffected by this brief, left as-is.
- `verify-a30-mcp-memory-reclamation.sh` discriminator defect (`feedback_a30_discriminator_crash_cliff_
  misscored_as_reclamation_dip`) — named for cross-reference only; this row does not own that fix, and
  it does not change the sizing decision above (the OOM here was confirmed via raw `docker events`, not
  via that script's dip-counter).
