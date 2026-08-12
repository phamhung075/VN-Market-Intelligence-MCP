# FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS — Architect Brief (premise-correction cycle)

**Written:** 2026-08-12T03:30Z · **Author:** architect
**Row:** `task_board.backlog[]` FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS
**Zone:** `apps/rag-service/` · **BUILD-STANDARD:** not-applicable (bug-fix/diagnosis, in-zone, no new primitives)
**Trigger:** PO triage 2026-08-12T03:03:00Z — priority P2→P0, premise PARTIALLY REFUTED (see row's own
`status_note`). This is a diagnosis + design brief, same charter as the sibling precedent
`docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md`. No code was
changed. No container was restarted/stopped/recreated. All new evidence below is either (a) read-only
inspection of the live `vn-market-intelligence-mcp-rag-service-1` container, or (b) isolated, throwaway
`docker run --rm` reproductions from the SAME image (own cgroup, zero shared budget with the live
container, using a **snapshot copy** of the real LanceDB corpus, never a live bind-mount — see §3).

---

## 1. Summary verdict

PO's corrected premise is right, and the isolated repro below **names the second growth source with a
measured, reproducible artifact**: it is **not** per-request embedder tensor/cache accumulation
(candidate 1 — tested, ruled out as dominant). It **is** LanceDB's `vector_search()` read path
(candidate 2 — tested, confirmed dominant, ~80-100x the embedder's per-call footprint), and the
architectural root cause is concrete and fixable: **`rag_entries` has no vector index** — every
`/search` and `/index`-triggered read runs LanceDB's brute-force full-column-scan kNN path
(`table.vector_search(...)`, `infrastructure/repositories.py:482`), which reads/caches the **entire**
384-dim vector column (and touches table/fragment metadata) on every call, with no eviction. Candidate 3
(FTS build) is ruled out as a *continuous* contributor by code-level evidence (§4) — it remains a
separate, already-tracked, one-time/bounded concern owned by `RAG-FTS-BUILD-MEMORY-BOUND`, not this row.

The observed live signature (94.25%→98.73% over 50 min post-restart, zero dips, restart-resistant) is
best explained as a **query-driven working-set warm-up that plateaus within a few dozen distinct
requests** — mechanically fast (seconds, per the isolated repro), but stretched over tens of minutes in
production because real request volume is low (~1 request/4 min measured live, §5). Critically, this
"plateau" is **not safely bounded over calendar time**: the thing being cached (the vector column) grows
with the corpus (~100 rows/h, independently documented), so the ceiling itself drifts upward for as long
as the corpus keeps growing and no index exists — operationally indistinguishable from an unbounded leak
even though a fixed-corpus snapshot shows a genuine plateau, not literal infinite growth.

**Original allocator-retention mechanism (bounded, one-time, post-unload) is NOT wrong — it's just a
minor, secondary contributor now.** `malloc_trim(0)` recovered only ~8-15% of the LanceDB-path growth in
the isolated repro (§3), far below the ~70-99% it recovered for the PDFX per-job native-allocator case.
The dominant fix lever here is architectural (build a vector index), not allocator hygiene.

---

## 2. Container memory-limit reconciliation (PO's ask)

Confirmed live and in `docker-compose.yml`:
```
docker inspect vn-market-intelligence-mcp-rag-service-1 --format 'MemLimit={{.HostConfig.Memory}}'
  → MemLimit=1073741824   (= exactly 1 GiB)
docker-compose.yml rag-service.deploy.resources:
  limits.memory: 1g   reservations.memory: 512m   cpus: '1.0'
```
This is correct and current — raised from `768m`→`1g` / `256m`→`512m` reservation by commit `2f835ec63`
(2026-08-06), executing `docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md` +
PO ruling `triage-20260806T1245Z-po`. **`RAG-FTS-BUILD-MEMORY-BOUND`'s own text (`note`, `acceptance_criteria`,
and its 2026-07-15 `qa_result`) still says `768m`** — that row's own 2026-08-06 sibling brief already
flagged this ("its AC1 target … should be re-evaluated once the cap is 1g, not 768m — flag for whoever
picks that row up next, not actioned here"), so this is a **known, already-flagged staleness**, not a new
finding. Not actioned here either (out of this row's scope; that row is PO/time-gated, not this row's to
edit) — restating for the record per this cycle's explicit instruction to reconcile it. Two in-repo text
artifacts still say `768m` and should be corrected by whoever next touches either file (bundle, don't
block on it): `apps/rag-service/infrastructure/repositories.py:67` (module-header comment) and
`docs/architecture/microservice/rag-service/infrastructure.md:82` (**this file has been corrected in
this cycle**, see §7 — architecture SSOT is this agent's write authority; the code comment is left for
dev-rag-service, same "flag not fix a stale comment" pattern as the PDFX precedent's `main.py` ~80MB note).

---

## 3. Isolated reproduction — the two candidates PO named first, tested with real code + real data

Both probes: reusable scripts landed this cycle (dev-standards Script Persistence), same throwaway-
container methodology as `scripts/audits/pdfx-pek-mem-arena-probe.py` (own cgroup, real production image,
real model weights baked into `/opt/model-cache`, zero live-container interaction):
- `scripts/audits/rag-embedder-mem-arena-probe.py` — candidate 1
- `scripts/audits/rag-lancedb-search-mem-arena-probe.py` — candidate 2 (needs a corpus copy, see script
  docstring for why a *copy*, not a live bind-mount, is required — avoids racing the live container's
  concurrent writes)

### 3a. Candidate 1 — per-request embedder tensor/cache accumulation

```
docker run --rm -v "$(pwd)/scripts/audits:/probe:ro" --entrypoint python3 \
  vn-market-intelligence-mcp-rag-service:latest /probe/rag-embedder-mem-arena-probe.py 80
```
80 real `_raw_embed()` calls (the exact call both `embed()`/`embed_batch()` route through), varied
VN-financial-news-shaped batches (size 1-4, non-identical content per call):

| stage | VmRSS (kB) | note |
|---|---|---|
| model load (one-time) | 9,120 → 1,117,976 | +1,108,856 kB — **NOT directly comparable to the live container's own resting floor**: this throwaway container has no `--cpus` limit, so PyTorch's CPU thread pool sizes itself against however many cores the Docker Desktop VM exposes, not the production `cpus: '1.0'` cgroup quota — flagged as a confound for the absolute number, not for the *delta* conclusion below, which is what this candidate question turns on |
| call 0 → call 79 (loop) | 1,139,664 → 1,145,148 | **+5,484 kB (+5.4 MiB) over 80 calls** |
| call 20 → call 79 (steady-state) | 1,145,124 → 1,145,148 | **+24 kB over 59 calls — essentially flat** |
| after `gc.collect()` | +0 recovered | |
| after `malloc_trim(0)` | −54,884 kB recovered | **larger than the entire loop's own growth** — this recovery is attributable to the one-time model-load step's own arena fragmentation, not to the repeated-call loop |

**Verdict: candidate 1 ruled out as the dominant driver.** Growth asymptotes within ~10-20 calls to
essentially zero marginal cost per call — consistent with one-time tokenizer/thread-pool warm-up, not an
unbounded per-request leak. At real production request volumes (§5: ~1 req/4 min), this mechanism cannot
explain a 46-215 MiB climb over 15-50 minutes.

### 3b. Candidate 2 — LanceDB reader handles / mmaps held open per query

Corpus snapshot: `cp -R data/live/lancedb <scratch>/lancedb-copy/` (569 MiB, live `row_count=26730`
confirmed via `/embed/health` at probe time — down from the ~56k figure `RAG-FTS-BUILD-MEMORY-BOUND` was
scoped against; a data-reset event happened at some point between those two measurements, not
investigated here, not this row's concern).
```
docker run --rm \
  -v "<scratch>/lancedb-copy/lancedb:/app/data/lancedb:ro" \
  -v "$(pwd)/scripts/audits:/probe:ro" -e LANCEDB_PATH=/app/data/lancedb \
  --entrypoint python3 vn-market-intelligence-mcp-rag-service:latest \
  /probe/rag-lancedb-search-mem-arena-probe.py 600
```
600 real `LanceDBVectorStore.search()` calls (the exact code `POST /search` calls) against distinct
random 384-dim query vectors, over the **same, already-open table handle** — the real production
singleton pattern (`_get_table()` opens once, reused forever):

| stage | VmRSS (kB) | note |
|---|---|---|
| `connect_async()` + `open_table()` + `count_rows()` | 19,112 → 149,008 | **+129.9 MiB just from opening the table handle** — directly matches candidate 2's literal framing ("reader handles … held open") |
| call 0 | 209,764 | +60.8 MiB for the FIRST query alone |
| call 0 → call 20 | 209,764 → 563,816 | **+354 MiB across 20 calls** — steep ramp |
| call 20 → call 599 | 563,816 → 557,688 (oscillating 543k-664k across two independent runs) | **plateau/oscillation band, NOT continued monotonic climb** — confirms a bounded-per-corpus-snapshot working set, not literal infinite growth within one process life |
| total call0→call599 | 209,764 → 557,688 | **+347,924 kB (+339.8 MiB)** (a second independent run to N=200 measured +443.9 MiB — run-to-run variance in exactly where the plateau band sits, same qualitative shape both times) |
| after `gc.collect()` | ~0 recovered (one run even +16 kB, i.e. noise) | |
| after `malloc_trim(0)` | −27,384 kB (N=600 run) / −75,212 kB (N=200 run) recovered | **only ~8-15% of the loop's own growth** — most of this floor is a live, referenced working set, not glibc-arena slack |

**Verdict: candidate 2 confirmed as the dominant driver**, ~65-80x candidate 1's per-call footprint
(+339-444 MiB / N calls vs. +5.4 MiB / 80 calls). **Root architectural cause**: `rag_entries` has no
vector index (`grep create_index apps/rag-service/infrastructure/repositories.py` → only the two FTS
`create_index("title"/"summary", config=FTS())` calls exist; zero calls against the `vector` column).
Every `vector_search()` is therefore LanceDB's brute-force exact-kNN scan path, which must read the
**entire** vector column (26,730 rows × 384 × 4 bytes ≈ 41 MB raw, but the resident working set measured
is ~13-16x that — consistent with additional per-query Arrow/Lance buffer materialization, fragment
metadata, and/or an internal read-cache layer that is not investigated at the Rust-source level in this
cycle) on **every single call**, with no apparent bound or eviction below the size of what's been
touched. This is the same shape candidate 2 was named for: reader-side state that accumulates across
queries against a handle that is (by design, per the existing singleton pattern) never closed.

### 3c. Candidate 3 — FTS index build path (RAG-FTS-BUILD-MEMORY-BOUND overlap check)

Ruled out as a *continuous/repeating* contributor by code-level evidence, not a live repro (would require
triggering a real FTS build against production-shaped scale — heavier, riskier, and unnecessary given
the following is dispositive):
- `apps/mcp-server/src/scheduler/schedulerJobTable.ts:669-684`: the nightly `ragFtsRebuildCronJob`
  (20:15 UTC) registration is **entirely omitted** unless `CRON_RAG_FTS_REBUILD_ENABLED` is `'true'`
  (`cronConfig.ts:282`, default-OFF). Grepped `docker-compose.yml` + `.env` — **not set anywhere in this
  deployment**. This cron has never fired in this environment.
- The only other trigger, `_build_fts_index()`'s lazy-on-first-`hybrid_search()` build
  (`repositories.py:515-517`, `_fts_index_built` per-process flag), fires **at most once per container
  life** and is already memory-bounded by the shipped `LANCE_FTS_NUM_SHARDS=1`/`LANCE_FTS_PARTITION_SIZE=32`
  env pins (`RAG-FTS-BUILD-MEMORY-BOUND`'s own fix, live in `repositories.py:101-102`).
- A single bounded one-time step cannot produce a 6-sample, zero-dip, monotonic-climb signature sustained
  across 50 minutes. **No overlap with this row beyond sharing `repositories.py`** — confirmed clean per
  the row's own `status_note` framing; nothing here reopens or duplicates `RAG-FTS-BUILD-MEMORY-BOUND`.

---

## 4. Live-traffic corroboration (read-only, non-invasive)

```
docker logs vn-market-intelligence-mcp-rag-service-1 --since 30m | grep -Ec '"(POST|GET) /(search|index|embed)'
  → 7   (over 30 min ≈ 1 request every ~4.3 min)
docker inspect ... --format 'StartedAt={{.State.StartedAt}}'
  → 2026-08-12T01:34:41Z (current life, RestartCount=0 — container was recreated since PO's
    2026-08-12T03:03Z 00:15:13Z-restart measurement; a separate, later life)
docker stats --no-stream (2026-08-12T03:20Z, ~1h45m into this life)
  → 936.2 MiB / 1 GiB = 91.43%
```
Low real request volume (~1/4min) reconciles the isolated repro's fast (seconds-scale, ~20-60 call)
plateau with the field-observed tens-of-minutes climb: the mechanism is request-*count*-driven, not
time-driven, and at this traffic density, tens of distinct requests naturally spread across 15-50+
minutes of wall clock. This container's own current life (91.43% at ~1h45m, zero restarts) is a live,
in-progress instance of the same shape PO measured — consistent, not a new incident, not actioned further
here (read-only observation only, per this role's charter).

---

## 5. What this means for the row's AC (PO's new requirement)

PO's corrected AC: **heap-growth-rate measurement over ≥2h of live traffic from a cold start**, log-line
discriminated (not meter-only, per `FIX-RECLAMATION-AC-VERIFIED-IN-COLDSTART-WINDOW-BEFORE-WORKLOAD-LOADS`'s
already-ratified lesson — that row is cross-service governance, cited not reopened here).

**Design for dev-rag-service to execute, given this cycle's findings:**
1. **Pre-flight:** confirm no other memory-hungry action is scheduled against this container for the
   observation window (same discipline as the PDFX precedent's burst pre-flight).
2. **Sample every 60-120s for ≥2h post-restart**, recording BOTH the meter (`docker stats --no-stream`)
   AND the discriminating log lines: model-load (`"Embedding model ready."`), unload
   (`"Embedding model unloaded after..."`), and FTS build (`"FTS indexes ... built successfully"`) —
   any FTS-build line inside the window is a confound to flag, not silently absorb into the growth-rate
   number (§3c).
3. **Expected shape, if this brief's diagnosis is correct:** steep climb in the first ~15-30 min (query
   count, not wall-clock, is the real driver — traffic-dependent), then a **plateau/oscillation band**
   for the remainder of the 2h window, NOT continued unbounded linear climb. A genuine plateau
   **confirms** this brief's mechanism and shifts the fix toward §6's vector-index remedy. Continued
   *linear, non-decelerating* growth for the full 2h would **falsify** the "bounded-per-snapshot working
   set" part of this diagnosis and warrant a deeper live-profiling pass (`tracemalloc`/`memray` against a
   throwaway container replaying captured production request shapes) — flagged as the fallback, not
   expected to be needed.
4. **Report the plateau ceiling as a % of the 1 GiB cap**, not just the growth rate — the actionable
   question is whether that ceiling (plus the ~700-750 MiB warm-model floor, when both are hot
   simultaneously, per `docs/architecture-briefs/2026-08-06-rag-service-memory-sizing-remediation.md`'s
   own anon-dominant measurement) fits inside the cap with safe margin, not merely whether the process
   looks "flat" late in the window.

---

## 6. AC3-equivalent — recommended fix (design only — NOT landed by this row)

**Primary recommendation, evidence-backed by §3b:** build a vector index on `rag_entries.vector`
(`lancedb.index.IvfPq` — confirmed importable in the pinned lancedb 0.36.0, same
`table.create_index(field, config=...)` call shape the FTS fix already uses two lines above):

```python
# infrastructure/repositories.py — sketch, NOT applied by this row
from lancedb.index import IvfPq

async def _build_vector_index(self) -> None:
    table = await self._get_table()
    await table.create_index("vector", config=IvfPq(distance_type="l2"), replace=True)
```
This directly targets the confirmed root cause (brute-force full-column scan on every query) rather than
the allocator-hygiene lever (§3b showed `malloc_trim(0)` recovers only ~8-15% here — real but minor).
Considerations dev-rag-service must resolve before landing, none of them decided here (this is design,
not implementation):
- **Freshness/staleness**: LanceDB ANN indexes do not auto-include rows added after the index was built
  (same class of concern the FTS index already has — `_fts_index_built` per-process lazy-build flag, and
  the `/admin/rebuild-fts` admin endpoint for explicit refresh). A vector index needs the SAME shape:
  build lazily/eagerly, refresh on a cadence, decide whether it should ride the SAME admin endpoint (a
  combined `/admin/rebuild-indexes`?) or a separate one. **Do not silently reuse
  `RAG-FTS-BUILD-MEMORY-BOUND`'s nightly cron wiring without re-reading that row** — it is currently
  disabled (§3c) precisely because rag-service capacity work was still in flight; re-enabling it is a
  cross-row decision, not implied by this brief.
- **Build-time memory cost**: IVF_PQ training (k-means clustering over the vector column) has its own
  peak-memory shape, analogous to (but likely much cheaper than) the FTS builder's — should be measured
  before landing, same discipline as `RAG-FTS-BUILD-MEMORY-BOUND`'s own investigation.
- **Recall trade-off**: IVF_PQ is approximate, not exact — `num_partitions`/`num_sub_vectors` tuning
  affects both recall and index size; needs a search-quality regression check (existing
  `__tests__/unit/test_dfr_p3_hybrid_search.py` / `test_search_usecase.py` coverage is the right place to
  extend, not replace).
- **Secondary, complementary (cheap, low-risk, still worth landing regardless of the index decision):**
  a `malloc_trim(0)` sweep on the SAME `_idle_unload_loop()` cadence (`app_factory.py:66-71`) — currently
  that loop only *conditionally* unloads the embedder; a periodic trim call (independent of whether
  unload fires) would claim back the ~8-15% this cycle measured as glibc-arena-recoverable, same
  mechanism as `FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM`, cheap insurance layered under the primary
  fix, not a substitute for it.

**What this fix does NOT address:** the corpus keeps growing (~100 rows/h, independently documented) —
an IVF_PQ index bounds the *per-query* read cost close to constant (that's the whole point of an ANN
index vs. brute force), but the index's own on-disk/resident size still grows slowly with corpus size.
This is expected, bounded, and standard — flagged so dev-rag-service does not read "fixed" as "will never
need re-sizing again."

---

## 7. Architecture SSOT update (this cycle, this agent's write authority)

`docs/architecture/microservice/rag-service/infrastructure.md` updated this cycle:
- §LanceDBVectorStore `search()`: added a note that `vector_search()` currently runs brute-force
  (no vector index exists) and the resident-memory implication measured in §3b above.
- §RAG-FTS-BUILD-MEMORY-BOUND section: corrected the stale `768m` reference to `1g` (matches §2) and
  cross-referenced this brief.
- §SentenceTransformersEmbedder: no change needed — this cycle's candidate-1 test corroborates the
  existing description; no new mechanism found there.

---

## 8. Files this blueprint touches (for dev-rag-service)

| file | change |
|---|---|
| `apps/rag-service/infrastructure/repositories.py` | add vector-index build (§6, design only here); correct the stale `768m` module-header comment (line 67) alongside the fix; consider the periodic-trim addition in `app_factory.py`'s idle-unload loop |
| `apps/rag-service/app_factory.py` | optional: add unconditional `malloc_trim(0)` call inside `_idle_unload_loop()`'s poll cycle, independent of the unload decision (§6 secondary recommendation) |
| `apps/rag-service/__tests__/unit/test_dfr_p3_hybrid_search.py` / `test_search_usecase.py` | extend with a vector-index-build regression + a recall/quality spot-check once IVF_PQ params are chosen |
| `apps/rag-service/__tests__/unit/` (new or extended) | unit test for any new `malloc_trim` wiring, mock `ctypes.CDLL`, same pattern as the PDFX precedent's test recommendation — do not assert real RSS numbers in CI |
| `scripts/audits/rag-embedder-mem-arena-probe.py` | **already created this cycle** — reusable, rerun after any future embedder change to confirm candidate 1 stays ruled out |
| `scripts/audits/rag-lancedb-search-mem-arena-probe.py` | **already created this cycle** — reusable, rerun after the vector-index fix lands; expected result: the steep 0→20-call ramp (§3b) should collapse to a much smaller, flatter curve |
| `docs/architecture/microservice/rag-service/infrastructure.md` | **already updated this cycle** (§7) |

DDD layer: `_build_vector_index()` belongs in `infrastructure/repositories.py` (infrastructure layer,
`VectorStorePort` implementation) — same layer as the existing `_build_fts_index()`, no new
interface/port needed (mirrors that method's own placement exactly). The optional periodic-trim addition
belongs in `app_factory.py` (composition-root/process-hygiene, same layer classification the PDFX
precedent gave its own `malloc_trim` call).

**Reuse patterns:** extend the existing `create_index()` call shape (already used twice, for
`title`/`summary` FTS) — do not invent a new index-management abstraction. Extend the existing
`_idle_unload_loop()` background task (already the one process-hygiene loop in this service) rather than
adding a second loop for the trim sweep.

**Scan clean:** true — brownfield index covered `infrastructure/`, `interface/`, `application/`,
`app_factory.py`, `docker-compose.yml`, `Dockerfile`, plus live `docker inspect`/`docker stats`/`docker
logs` against the running container and two isolated `docker run --rm` reproductions.

---

## 9. Test strategy

- **Unit** (dev-rag-service): vector-index build called exactly once per lazy-build flag (mirrors
  `_fts_index_built`'s existing test pattern in `test_dfr_p3_hybrid_search.py`); optional `malloc_trim`
  wiring test (mock `ctypes.CDLL`, no real memory pressure needed).
- **Integration**: `search()`/`hybrid_search()` no-regression against a real (or realistic-fixture)
  corpus once an index exists — recall spot-check, not just "returns 200".
- **Live verification (§5, ops-supervised, THIS is the row's actual AC now):** ≥2h cold-start
  growth-rate + plateau-ceiling measurement, log-line-discriminated, reported honestly whether it
  plateaus or keeps climbing.
- **Regression (reuse):** rerun both isolated probe scripts (§3) after the fix lands — candidate 2's
  curve should flatten dramatically; candidate 1 should be unchanged (nothing here touches the embedder).

---

## 10. Risk flags

- **Corpus keeps growing independent of this fix** (~100 rows/h) — an index bounds per-query cost, it
  does not freeze the corpus; re-verify the plateau ceiling periodically as the corpus grows well past
  today's 26,730 rows, not just once.
- **IVF_PQ is approximate** — a naive rebuild without a recall check could silently degrade search
  quality while "fixing" memory; do not ship without the regression check in §9.
- **RAG-FTS-BUILD-MEMORY-BOUND's cron stays disabled** (§3c) — do not couple this fix's own index-refresh
  cadence to re-enabling that cron without a fresh look at that row; they are independently gated for a
  reason (rag-service capacity work still settling).
- **`768m`→`1g` staleness lives in two more places** (§2) — `RAG-FTS-BUILD-MEMORY-BOUND`'s own row text
  and `repositories.py:67`'s comment — neither corrected here (one is PO/time-gated row-text, the other
  is bundled into §6/§8 for dev-rag-service); do not let a future reader use either as current fact.
- **Row-count discrepancy noted, not investigated**: `26,730` rows measured this cycle vs. the
  `~56,254`-row figure `RAG-FTS-BUILD-MEMORY-BOUND` was scoped against (2026-07-15). A data-reset
  happened somewhere in between (VM crash / restore, consistent with this repo's known history of such
  events) — flagged for PO/QA visibility, not this row's mechanism, not actioned further here.

---

## RETURN

DONE: Diagnosis + design complete for the corrected premise. Candidate 1 (per-request embedder
tensor/cache accumulation) tested via isolated repro and RULED OUT as dominant (+5.4 MiB/80 calls,
asymptotes fast). Candidate 2 (LanceDB reader/mmap accumulation per query) tested via isolated repro and
CONFIRMED DOMINANT (+340-444 MiB across the ramp, ~65-80x candidate 1), root cause named with a captured
artifact: `rag_entries` has no vector index, so every `vector_search()` runs a brute-force full-column
scan. Candidate 3 (FTS build path) RULED OUT as a continuous contributor via code-level evidence (nightly
cron disabled by config default; lazy per-life build already memory-bounded by the existing
`RAG-FTS-BUILD-MEMORY-BOUND` fix) — confirmed no overlap, that row is untouched. Container memory limit
reconciled: live + compose both confirm 1 GiB (not 768m); staleness flagged in two remaining text
locations, not this row's to fix. Live-traffic AC (§5) designed for dev-rag-service to execute. Primary
fix recommendation: LanceDB `IvfPq` vector index (§6, design only, not landed). Architecture SSOT
(`docs/architecture/microservice/rag-service/infrastructure.md`) updated this cycle.
ZONE: apps/rag-service/
NEXT: dev-rag-service — implement §6 (vector index + optional periodic-trim hygiene) + §8's file list,
execute §5's ≥2h live cold-start growth-rate/plateau measurement (ops-supervised), and §9's test
strategy before DONE. If the live measurement shows continued non-decelerating growth for the full 2h
(falsifying this brief's plateau diagnosis), escalate to a deeper live-profiling pass rather than forcing
the vector-index fix to "explain" a result it doesn't predict.
HANDOFF: docs/architecture-briefs/2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md
PIPELINE: continue
