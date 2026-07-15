## Task Report ALPHA-S2-RAG-FTS-REBUILD-CRON

**Type:** Single-atomic-FIX behavioral gate (SPRINT-S relay hop 4/4) | **Impl commit:** 35cc8cd56 (11 files, already on origin/main, AHEAD=0) | **Brief:** docs/architecture-briefs/2026-07-15-alpha-s2-rag-fts-rebuild-cron.md

### Verdict: BLOCKED — not a code defect, a rag-service capacity gap

The mcp-server code delivered in `35cc8cd56` is structurally and functionally correct (see below) and requires NO fixer round. The block is that the LIVE behavioral round-trip mandated by the test_plan could not be completed because `POST /admin/rebuild-fts` — the exact endpoint this cron calls — reproducibly OOM-crashes the running rag-service container at its current corpus size, before ever producing a rebuilt index. Board row `ALPHA-S2-RAG-FTS-REBUILD-CRON` left in `task_board.in_progress[]` — no lane move, no DONE flip, no lock touched.

### Structural / static verification (all PASS — RAW, independently run)

**Code matches design exactly:**
- `ragRebuildFts()` (`infrastructure/rag/ragHttpClient.ts`) — `POST /admin/rebuild-fts`, `AbortSignal.timeout(90_000)`, throw-on-`!ok`, matches `ragSearch`/`ragIndex` fetch convention.
- `runRagFtsRebuildCron()` (`scheduler/rag/ragFtsRebuildCronJob.ts`) — single-branch HARD-fail contract (no SOFT branch, correctly simpler than sibling OMO cron): success → `logger.info` only; reject → `logger.error` + `notifyBug()` unconditionally.
- Registered in `cronConfig.ts` (`ragFtsRebuildCron: Bun.env.CRON_RAG_FTS_REBUILD ?? '15 20 * * *'`), `schedulerJobTable.ts` (`buildJobTable()` entry, `runner` invokes `runRagFtsRebuildCron()`), and 3 docs (`cron-registry.json` `.jobs[]` + `schedulerFileCount` 68→69, `system-map.json` `mcp-server.crons[]`, `cron-jobs.md` new section) — all confirmed present verbatim.
- No barrel/`index.ts` touch for the scheduler job — confirmed this deliberately mirrors the OMO sibling (`ae45fd0e7`), not a gap.

**Tests — RAW, independently run:**
```
bun test src/__tests__/ALPHA-S2-RAG-FTS-REBUILD-CRON.test.ts
4 pass / 0 fail / 16 expect() calls [239ms]

bun test src/__tests__/1190-pipeline-watchdog.test.ts
16 pass / 0 fail / 30 expect() calls [318ms]

bun test src/__tests__/FACTORY-SCHEDULER-job-table-registry.test.ts
15 pass / 0 fail / 276 expect() calls [244ms]
```
Combined own RAW total: **35 pass / 0 fail / 322 expect() calls** across the 3 targeted files (new test file has 4 paths, not 3 — the extra path is a 90s-timeout-specific HARD-fail case, additive coverage not scope creep).

`bun tsc --noEmit` (apps/mcp-server, standalone): **exit 0**, zero errors.
`bash scripts/audits/mock-guard.sh --files <5 modified production files>`: **PASS**.
DDD: `ragFtsRebuildCronJob.ts` imports `../../infrastructure/{rag,notifiers,logger}` directly — established scheduler-layer composition-root convention (same as sibling `sbvOmoLiquidityCronJob.ts`), not a domain violation (this file is not in `domain/`). `process.env`/secret greps: zero matches.

### Live deployment state (RAW-confirmed, not inferred)

The running `mcp-server` container (`StartedAt: 2026-07-14T20:14:37Z`) predates commit `35cc8cd56` (authored `2026-07-15T04:10:55Z`). Confirmed directly via `docker exec`:
```
grep -n "ragFtsRebuildCronJob\|sbvOmoLiquidityCronJob" /app/src/scheduler/schedulerJobTable.ts   → no match (exit 1), either job
```
Direct query of the live `cron_job_runs` table (`bun:sqlite`, read-only) across all 91 distinct `job_name` values present: **neither `ragFtsRebuildCronJob` nor sibling `sbvOmoLiquidityCronJob` has ever fired** — this cron is deploy-pending. mcp-server container rebuilds are ops-gated (not performed here).

### The behavioral round-trip — REPRODUCED BLOCKER (2/2)

Per dispatch instruction, attempted the live round-trip directly against rag-service (port 5002, bypasses the mcp-server deploy-pending gap entirely — this is the same call `ragRebuildFts()` makes):

1. `docker ps` / `curl /health` — rag-service healthy at test start (Up ~8-12 min, fresh boot, corpus `index_size:56254` per `/embed/health`).
2. Attempt 1 — warm-up `POST /search {"hybrid":true,...}` (to establish `_fts_index_built` baseline before indexing a nonce): `docker stats` showed memory climb to **627.7MiB → 733.4MiB → 750.6MiB (97.7% of the 768MiB cgroup limit)** over ~25s, then the container hard-restarted: `RestartCount 258 → 259`, PID count collapsed 24→5, embedding model unloaded (`/embed/health` reverted to `state:"cold"`). curl received `exit 52` (empty reply from server).
3. Attempt 2 — direct `POST /admin/rebuild-fts` in isolation (no preceding search, no embedding-model contention): memory climbed steadily again, oscillating 90-99% of the 768MiB limit, still running at t=250s (well past the design brief's ~30-60s estimate for 14k rows and past the cron's own 90s deadline), then hard-restarted: `RestartCount 259 → 260`.
4. Both restarts: `docker inspect .State` shows `ExitCode:0`/`OOMKilled:false` on the new instance (Docker Desktop/macOS memory-accounting quirk — the `docker stats` memory trace pinned at 97-99.9% of the hard 768MiB cgroup ceiling immediately before each restart is the load-bearing, reproduced evidence, independent of how the exit is labeled).
5. Host has ample headroom (16GB total, rag-service is the only container near its own limit — mcp-server 1.8/3GB, pdf-extractor 1.3/2.5GB) — this is a per-container cgroup ceiling issue specific to `rag-service` (`docker-compose.yml`: `deploy.resources.limits.memory: 768m`), not host-wide pressure.

**Neither attempt produced a completed rebuild.** The nonce insert → pre-rebuild MISS → rebuild → post-rebuild HIT sequence could not be executed because step 3 (rebuild) never completes — it OOM-crashes the container first. Did not attempt a 3rd round (2/2 reproduction is sufficient; further attempts only add live-service disruption for a shared, actively-used container, zero additional evidentiary value).

### Root cause and severity

The design brief's 90s deadline and "~30-60s build time" estimate were sized against a **14k-row** corpus (2026-06-08 baseline, DFR-P3). The corpus has since grown to **~56k rows** (4x) via ongoing `ragIndex()` writes — exactly the organic growth this task exists to keep the BM25 leg fresh against. At this scale, `_build_fts_index()` (unmodified, already-shipped DFR-P3 code) both (a) exceeds the container's 768MiB memory ceiling before completing, and (b) takes well over 90s even where memory hadn't yet crashed it. Deploying this cron as-is would very likely OOM-crash rag-service **every night at 20:15 UTC** — a service-wide RAG/search outage for the duration of each restart cycle — which is a worse regression than the silent, partial BM25-staleness gap this task set out to fix.

### Recommendation

Route to architect/ops (not fixer — no mcp-server code defect exists) to resolve one or more of: raise `rag-service`'s `deploy.resources.limits.memory` ceiling; make `_build_fts_index()` stream/chunk its memory usage instead of loading the full corpus at once; and/or re-tune `ragRebuildFts()`'s deadline upward once the memory issue is resolved (90s is provably insufficient at current corpus scale even in the best case observed). Re-run this same live round-trip once one of these lands, before flipping DONE.

### Did NOT do
Did not flip DONE. Did not touch `orch-state.json`/`task_board`. Did not claim/heartbeat/release any lock (router-owned). Did not rebuild/redeploy mcp-server or rag-service. Did not retry a 3rd OOM-inducing round against the shared live rag-service container.
