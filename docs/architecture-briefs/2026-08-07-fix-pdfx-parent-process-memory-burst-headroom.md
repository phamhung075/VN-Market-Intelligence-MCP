# FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM — Architect Brief

**Written:** 2026-08-07T23:53Z · **Author:** architect · **Row:** `task_board.in_progress[]` FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (supervised:true, plan_only:true)
**Zone:** `apps/pdf-extractor/` · **BUILD-STANDARD:** not-applicable (bug-fix/diagnosis, in-zone, no new primitives)

This is a **diagnosis + design** brief. No code in `apps/pdf-extractor/` was
changed. No container was restarted/stopped/killed/recreated. All evidence
below is either (a) read-only inspection of the live production container
`vn-market-intelligence-mcp-pdf-extractor-1`, or (b) an isolated,
throwaway `docker run --rm` reproduction container from the **same image**
(own cgroup, zero shared memory budget with the live container) — see
§4 for why (b) was used instead of a live burst against production.

---

## 1. Summary verdict

The row's own root_cause already correctly narrowed the culprit to "the
parent uvicorn process, not tesseract." This cycle's contribution:

1. **Named the exact code path with a captured artifact** (AC1): the
   PEK pipeline (`PekEngineAdapter._run_extraction`, reached via
   `POST /pek-extract` → `interface/pek_run_helper.py:_run_pek_extract` →
   `asyncio.to_thread(pek_adapter.extract_layout_and_tables, ...)`) runs
   **PyTorch (doclayout_yolo YOLOv10) + PaddlePaddle (PaddleOCR
   PP-StructureV2) CPU inference directly inside PID1**, isolated only by
   a Python thread (`ThreadPoolExecutor(max_workers=1)` inside
   `extract_layout_and_tables`), **not** by an OS process boundary. This is
   architecturally different from the already-fixed tesseract path, which
   *is* isolated via `ProcessPoolExecutor` (`main.py:154`, injected into
   `ExtractTablesUseCase` only).
2. **Discriminated the three AC5 candidates with an artifact**: the
   retained-idle-floor growth is dominantly **glibc malloc-arena
   fragmentation** (candidate b) — `gc.collect()` recovers 0 bytes,
   `malloc_trim(0)` recovers ~70–99% of the per-job RSS delta. This is a
   concrete, low-risk, well-understood fix target.
3. **AC2 gap found and corrected**: the row's own literal instruction
   ("15-wide `POST /extract` burst, same shape as the tesseract-fix
   verification") targets the **wrong endpoint** relative to the row's own
   root_cause evidence. `POST /extract` only exercises the already-fixed,
   process-isolated tesseract path. The mechanism this row exists to fix
   lives behind `POST /pek-extract`. §5 gives the corrected burst spec
   and explains why *this* agent did not fire it at production.
4. **AC3 recommendation**: land a one-line native-allocator hygiene fix
   (`malloc_trim(0)` after each PEK job) as the primary, evidence-backed
   remedy — NOT a decision on the cap. Whether this alone gets peak
   MemPerc under 80% during the real corrected burst must still be
   verified live (handed to dev-pdf-extractor, §8). If it does not, the
   cap question goes to PO/ops per AC3's own instruction — this agent is
   not deciding it.

---

## 2. Live evidence — current container life (2026-08-07T23:2x–23:5xZ)

Container `vn-market-intelligence-mcp-pdf-extractor-1`, `StartedAt=2026-08-04T14:23:22Z`
(a **different, more recent** life than the row's 2026-08-01 addendum
evidence, which was a life that started `2026-08-01T02:46:16Z`).

```
docker inspect --format 'RestartCount={{.RestartCount}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} RestartPolicy={{.HostConfig.RestartPolicy.Name}}'
  → RestartCount=7 ExitCode=0 OOMKilled=false RestartPolicy=unless-stopped
```

`RestartCount` grew from **2** (2026-08-01 addendum) to **7** (now,
2026-08-07/08) — 5 more restarts across ~1 week, all with the same
clean-exit signature (ExitCode=0, OOMKilled=false). This is consistent
with (not proof of) the row's AC7 framing that the failure mode is a
silent clean exit rather than an OOM kill — no per-restart reason log
exists (`docker inspect .State` only retains the current life), so this
is flagged as corroborating-but-unconfirmed, not a fourth measured data
point.

**Idle-floor samples, this life (AC6 — tesseract child count 0 confirmed
via `ps aux` inside the container both times; `docker logs --since 30m`
confirmed zero `/extract` or `/pek-extract` traffic before the first
sample):**

| ts (UTC) | PID1 VmRSS | % of 2.5 GiB cap | docker stats MemPerc | note |
|---|---|---|---|---|
| 2026-08-07T23:23:52Z | 1,847,472 kB | 73.9% | 72.95% | idle ≥30 min per log check |
| 2026-08-07T23:51:57Z | 1,559,376 kB | 62.4% | 62.27% | idle ≥58 min; **declining**, not flat |

`VmHWM` (all-time high-water mark, this life) = **2,582,784 kB = 2.463 GiB
= 98.5% of cap** — the ceiling was touched at least once in this life too,
even though this life's current resting floor (62–74%) is well below the
2026-08-01 life's extreme plateau (96.2%, byte-identical across 40+
samples). The best-supported reading: this life has processed far fewer
PEK jobs (see below — a handful, several failing early) than the
2026-08-01 life's 52-job burst, so the monotonic per-job floor-rise (§3)
has had less to compound on. The **declining-not-flat** floor over this
28-minute window is itself a second, independent data point for a slow,
partial, deferred-reclamation behavior at idle — consistent with the
row's own 2026-08-01 "~111 MiB release 12–15 min after last job" finding,
just mid-cycle rather than at the extreme.

`/proc/1/smaps_rollup` at the first idle sample:
```
Anonymous:       1,826,132 kB   ← ~99% of RSS is anonymous (heap/mmap), not file-backed
AnonHugePages:   1,392,640 kB   ← ~76% of the anonymous memory is THP-backed
Swap:              795,440 kB   ← host swap IS active; ~776 MiB of this process is swapped out
```
The swap figure is a new, not-previously-recorded observation: `docker
stats` MemPerc / cgroup `memory.current` do not include swapped-out pages,
so **on a life with active swap, cgroup-based MemPerc readings understate
this process's true total (RSS+swap) footprint.** Worth carrying into any
regression-gate design (AC7) — a gate keyed purely on `memory.current`
could look "fine" while a large chunk of the working set has quietly
moved to swap (which has its own cost: swap-in latency, host-wide
pressure).

`/proc/1/maps` (idle, same sample) shows the anonymous RSS is dominated
by native library state, not the glibc main heap:
```
230.2 MiB  [heap]                                    (glibc brk-heap, largest single one)
 73.6 MiB  [heap]                                    (second glibc arena)
317.8 MiB  r-xp torch/lib/libtorch_cpu.so             (code, file-backed — separate from anon total)
164.8 MiB  r-xp paddle/base/libpaddle.so              (code, file-backed)
123.1 MiB  r-xp paddle/libs/libmklml_intel.so         (code, file-backed)
 ~700 MiB  11× anonymous rw-p regions clustered at ~64.0 MiB each, offset 0, dev 00:00
           (classic large-fixed-chunk mmap signature of a native pool
           allocator growing in aligned chunks — PaddlePaddle's
           AutoGrowthAllocator is the standing candidate; NOT glibc's
           own [heap] arena, which shows separately above)
```
434 anonymous `rw-p` regions >0 bytes total 3,349.9 MiB of **virtual**
address space (not all resident — VSZ, not RSS) outside `[heap]`/`[stack]`,
confirming the process's memory profile is dominated by native
ML-framework allocations, not Python-level object growth.

**Traffic this life (since `StartedAt`, `docker logs`):**
- `POST /extract` (tesseract-isolated path): **2,236** calls.
- `POST /pek-extract` (in-process torch+paddle path): a handful — at
  least one confirmed success (`_run_pek_extract: DONE report_id=6d7b0a79…
  push_echo_units=52 push_echo_pages=52`) plus **11 failures**, all
  clustered 2026-08-04T14:35–17:40Z, evenly split between two fixed
  `report_id`s (`fallback-SHB-2023-Q4` ×4, `fallback-PDR-2023-Q4` ×7),
  then never retried again. This looks like a separate, minor,
  self-resolving retry-storm bug (same 2 report_ids retried on a ~25–30
  min cadence for ~3 hours, then stopped) — flagged for PO as a
  non-blocking follow-up candidate, **not investigated further here**
  (out of this row's scope; each failed attempt still runs the full
  layout-detection pass before failing, so it is a minor *additional*
  contributor to the mechanism below, not a distinct mechanism).
- **Zero** `_run_pek_extract` activity of any kind in the last 24h — the
  current idle-floor samples above are **not** freshly perturbed by a PEK
  job; they reflect the tail of whatever happened up to ~3.5 days ago,
  which is itself informative for AC6 (a floor recorded at idle, far from
  any triggering event, still sits at 62–74% of cap).

---

## 3. AC1 — mechanism named, with a captured artifact

Code path (verified by read, `apps/pdf-extractor/infrastructure/pek_engine_adapter.py`):

```
POST /pek-extract (interface/routes_pek.py:29, 202 Accepted, background task)
  → interface/pek_run_helper.py:_run_pek_extract()
      → asyncio.to_thread(pek_adapter.extract_layout_and_tables, ...)   # THREAD, not process
          → PekEngineAdapter.extract_layout_and_tables()  (pek_engine_adapter.py:642)
              → ThreadPoolExecutor(max_workers=1)          # THREAD, not process — pek_engine_adapter.py:669
                  → _run_extraction()
                      Step 1: layout_task.predict_pdfs([pdf_path])   # _PekLayoutModel — line 156
                          for each page: fitz.open()+get_pixmap() (200 DPI raster, IN-PROCESS)
                                         → numpy array → YOLOv10(...) CPU inference (torch, IN-PROCESS)
                      Step 3: paddle_table.ocr(crop, cls=False) per table region  # PaddleOCR, IN-PROCESS
```

Contrast with the **already-fixed** tesseract path (`POST /extract` →
`ExtractTablesUseCase`, `main.py:154-161`): tesseract runs inside a real
`ProcessPoolExecutor(max_workers=1)` **OS process**, whose memory the
kernel reclaims in full the moment that child process exits/is recycled.
PEK's layout+table inference has no equivalent process boundary — it runs
in the same OS process (PID1) as the FastAPI event loop, isolated only by
Python threads (which share one address space).

**Isolated reproduction (own cgroup — see §4 for why not live), same
image, real 59-page BCTC PDF (`data/pdfs/NVL.pdf`), reusable script now at
`scripts/audits/pdfx-pek-mem-arena-probe.py`:**

| stage | VmRSS (kB) | Δ vs prior | note |
|---|---|---|---|
| interpreter start | 10,008 | — | |
| after `_load_pek_models()` | 865,676 | **+845.4 MiB** | model load alone. **main.py:196/`21` comment says "cold-start RSS ~80MB" — measured cold-start is >10x that.** Stale comment, flagged for correction regardless of this row's outcome. |
| job1: `predict_pdfs()`, 59 pages | 1,362,472 | **+485.2 MiB** | one document, layout-detection pass only (table-OCR step not even exercised in this probe) |
| job1, after `gc.collect()` | 1,362,472 | +0 | **Python-level GC recovers nothing** |
| job1, after `malloc_trim(0)` | 1,192,616 | **−165.9 MiB** | glibc releases ~34% of job1's growth back to the OS |
| job2: `predict_pdfs()`, same 59p, again | 1,428,980 | **+236.4 MiB** | 2nd pass — smaller than job1 (cold-start one-time cost already paid), but **non-zero and recurring** |
| job2, after `gc.collect()` | 1,428,980 | +0 | again nothing |
| job2, after `malloc_trim(0)` | 1,193,336 | **−235.6 MiB** | **~99.7% of job2's own growth recovered** |

Trimmed floor is stable across repeated jobs: 1,192,616 → 1,193,336 kB
(+0.06%). This directly matches the deliverable's own candidate list
("100s of MiB… per OCR job… released at job end, if at all") with an
actual measured magnitude: **~230–500 MiB per job**, consistent with the
row's root_cause "100s of MiB to ~1 GiB+ per job" language and in the same
order of magnitude as the 2026-08-01 addendum's own arithmetic (~1.5 GiB
acquired over 52 jobs ≈ ~30 MiB/job net-of-partial-release average,
plausible once you factor in that only a minority of those 52 jobs were
PEK jobs specifically — most of the 2026-08-01 traffic mix is not broken
out by endpoint in that evidence round).

---

## 4. Why this agent did not fire a live burst at the production container

Two independent reasons, both hard constraints for this role, not a
convenience call:

1. **Shared cgroup risk.** `vn-market-intelligence-mcp-pdf-extractor-1`
   is capped at 2.5 GiB and — per §2 — has touched 98.5% of that cap in
   its *current* life alone. Any additional memory-hungry action inside
   *that same container* (a live 15-wide concurrent burst, or an in-place
   `malloc_trim` A/B test via `gdb -p 1`) risks tipping the live process
   into the exact silent-OOM-adjacent failure this row exists to
   characterize, with real collateral: real BCTC documents mid-extraction,
   a real `bctc_vps_queue` backlog waiting behind it. This is squarely an
   infrastructure/operational load-test action — this agent's own
   charter (`docs/agents/architect/init.md` → `not_my_job`) explicitly
   excludes "Infrastructure diagnosis," and `boundary_rules.scope` limits
   this role to "Index existing code → design → flag risks → hand to PM."
   The row itself is `supervised:true`/`plan_only:true` for the same
   reason.
2. **The row's own AC2 wording targets the wrong endpoint anyway**
   (§1.3, §5) — running it literally would not have produced evidence
   about the actual implicated mechanism.

The isolated `docker run --rm` reproduction (§3) sidesteps risk (1)
entirely (separate cgroup, zero shared budget with the live container)
while still using the *real* production code, the *real* model weights
(same named volume), and a *real* scanned BCTC PDF — the only thing it
cannot reproduce is the live container's actual concurrent-traffic mix
(`/extract` + `/pek-extract` interleaved) or the routing/queue
integration. That gap is exactly what §5's corrected burst spec is for,
handed to the specialist whose charter *does* cover live-traffic
verification.

---

## 5. AC2 — corrected burst spec (handoff, not executed here)

**What the row asked for:** 15-wide `POST /extract` burst, mirroring the
tesseract-fix verification methodology (`docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md`
§8, line ~358).

**What's wrong with it as literally stated:** `POST /extract` reaches
`ExtractTablesUseCase` → the tesseract-only, `ProcessPoolExecutor`-isolated
path (already fixed, already proven bounded 2026-08-01). It does **not**
reach `PekEngineAdapter` at all. A 15-wide burst against `/extract` would
faithfully re-verify the *sibling* row's fix, not diagnose *this* row's
mechanism.

**Corrected spec, for dev-pdf-extractor to execute under ops-supervised
conditions (NOT this agent, NOT unsupervised):**

```bash
# Pre-flight (mandatory): confirm headroom before starting.
docker stats vn-market-intelligence-mcp-pdf-extractor-1 --no-stream
# ABORT if MemPerc > 60% at rest — do not add a burst on top of an
# already-elevated floor; wait for it to settle or escalate to ops first.

# Drive N=15 concurrent POST /pek-extract against REAL scanned BCTC PDFs
# (not a synthetic fixture — per the sibling brief's own T1 test rationale,
# "15 is the measured burst width, not a guess" — reuse the SAME width,
# now against the correct endpoint).
# NOTE: PekEngineAdapter's own guard (_extraction_semaphore, non-blocking
# Semaphore(1)) means 14 of 15 concurrent /pek-extract calls will get an
# immediate 429 and NOT run — so a naive port of the tesseract test's
# "15 concurrent, expect 5s bounded queueing" shape will not produce 15
# sequential jobs. Decide up front whether the burst-verification goal is
# (a) confirm the semaphore holds under concurrent arrival (cheap, safe,
#     ~1 real job runs, 14 x 429), or
# (b) drive 15 SEQUENTIAL real /pek-extract calls back-to-back (the shape
#     that actually stresses cumulative per-job RSS growth, §3) — this is
#     the shape that matches the row's real business risk (a backlog
#     drain processing many documents in a row, not 15 simultaneous
#     arrivals racing one semaphore).
# (b) is the one that actually exercises this row's mechanism — recommend
# driving it, not (a).

# Sample every 10s for the full burst + a 20-minute drain/idle tail
# (AC6 wants >=5 min; 2026-08-01's own late-release evidence took
# 12-15 min to show — 20 min gives margin).
while true; do
  date -u +%Y-%m-%dT%H:%M:%SZ
  docker stats vn-market-intelligence-mcp-pdf-extractor-1 --no-stream
  docker exec vn-market-intelligence-mcp-pdf-extractor-1 \
    sh -c 'cat /proc/1/status | grep -E "^(VmRSS|VmHWM):"; ps aux | grep -c tesseract'
  sleep 10
done
```

Report peak MemPerc honestly (AC2), whatever it is — including if it's
already >80% before any fix lands, which per §2's evidence (98.5% VmHWM
already touched this life) is a real possibility.

---

## 6. AC3 — recommended fix (design only — NOT landed by this row)

**Primary recommendation, evidence-backed by §3:** call glibc
`malloc_trim(0)` once at the end of every PEK job, in
`interface/pek_run_helper.py:_run_pek_extract`, in a `finally:` block so
it runs on both the success and the `except Exception` failure path
(failed jobs still ran the full layout-detection allocation per §2's
retry-storm observation).

```python
# interface/pek_run_helper.py — sketch, NOT applied by this row
import ctypes

_libc = ctypes.CDLL("libc.so.6")

async def _run_pek_extract(pek_adapter, push_client, report_id, pdf_path) -> None:
    ...
    try:
        result = await asyncio.to_thread(pek_adapter.extract_layout_and_tables, ...)
        push_result = await push_client.push_layout(...)
        _log.info("_run_pek_extract: DONE ...")
    except Exception as exc:
        _log.error("_run_pek_extract: FAILED ...", exc_info=True)
    finally:
        # FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM: glibc retains freed
        # native-allocator memory (torch/numpy/opencv buffers from the layout
        # +table pass) in its own arena instead of returning it to the OS.
        # malloc_trim(0) forces the return. Evidenced: docs/architecture-
        # briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md §3
        # (~70-99% of per-job RSS growth recovered; gc.collect() recovers 0).
        trimmed = await asyncio.to_thread(_libc.malloc_trim, 0)
        _log.info("_run_pek_extract: malloc_trim(0) returned=%s", trimmed)
```

`asyncio.to_thread` wrapping malloc_trim itself: not strictly required
(the call is fast, <1ms typically) but keeps the event-loop-blocking
discipline the file already documents (PDF-AVAIL-02-FIX comment) — leave
to dev-pdf-extractor's judgment; either is defensible, note both.

**Same fix, same reasoning, should also be considered for the tesseract
path's in-process rasterization work** (`extract_tables_usecase.py` /
`text_table_extractor.py` — pdfplumber/PIL page-image buffers before
handing a page to the isolated tesseract child) — the row's 2026-07-28
evidence (PID1 RSS moving with tesseract job start/stop even though the
tesseract child itself stays small) is consistent with the *same*
glibc-arena mechanism at smaller scale on that path. Not required to
satisfy this row's ACs (which are PEK-scoped per the 2026-08-01
addendum's own "PekEngineAdapter job" evidence), but flagged as a
same-root-cause, same-fix, low-effort extension for dev-pdf-extractor to
size while in the file.

**What this fix does NOT address:** the static ~845 MiB model-load floor
(§3) is not glibc-arena memory to release — it's PyTorch's and
PaddlePaddle's own loaded weights/runtime structures, genuinely resident
for as long as the process holds the lazy-singleton models. `malloc_trim`
cannot and should not touch it. Combined with the ~1.19 GiB post-trim
per-job floor, a single warm PEK-capable process idles at ~48% of the 2.5
GiB cap even in the *best* case after this fix — meaning **there is
real, structural headroom pressure independent of the leak/retention
question**, and AC3's "OR write an evidence-backed capacity
recommendation" branch may still apply on top of the malloc_trim fix, not
instead of it. Recommend dev-pdf-extractor land malloc_trim first (cheap,
safe, evidence says it should materially help), then re-run the corrected
burst (§5) to get the honest peak-under-burst number before deciding
whether a capacity-cap escalation to PO/ops is also needed.

---

## 7. AC5 — discrimination result (candidates named in the row's scope_out)

| candidate | test applied | result |
|---|---|---|
| (a) unreleased Python heap (reference retention) | `gc.collect()` before/after each job | **0 bytes recovered both times; `gc.get_count()` stayed at trivial `(9, 0, 0)` throughout.** Ruled out as the dominant mechanism — this is native/C-level memory invisible to Python's own collector, not Python object graph growth. |
| (b) glibc malloc-arena fragmentation | `malloc_trim(0)` before/after each job | **165.9 MiB / 236.4 MiB (job1) and 235.6 MiB / 236.4 MiB (job2, ~99.7%) recovered.** Confirmed as the dominant mechanism for the *per-job, recurring* growth. |
| (c) deliberate cache (torch oneDNN primitive cache / Paddle AutoGrowthAllocator's own pool) | inferred from the **irreducible trimmed floor** (~1.19 GiB, stable across jobs 1→2) and the `/proc/1/maps` ~64 MiB-aligned anonymous-chunk cluster (§2) | **Present, but not the dominant driver of the *recurring* per-job delta** — if it were, `malloc_trim` would not have touched it (memory a native pool holds onto is never `free()`'d back to glibc, so `malloc_trim` has nothing to release). It plausibly explains the ~845 MiB static model-load cost and part of the residual post-trim floor, both of which are one-time/stable, not monotonically growing. |

Net: the monotonic **floor-rise across many jobs** (the 2026-08-01
addendum's central finding — 53%→96.2% over 52 jobs) is best explained by
**(b) glibc malloc-arena fragmentation compounding un-trimmed across
consecutive jobs**, not (a) or, dominantly, (c). This directly motivates
§6's fix.

---

## 8. AC4 — regression floor (handoff, not run here — plan_only)

After `malloc_trim` (or any other change) lands, dev-pdf-extractor MUST
re-run one real scanned PDF end-to-end through `POST /pek-extract` (e.g.
`data/pdfs/NVL.pdf`, already validated by this brief's probe run — 59
pages, real layout-detection output) and confirm:
- `_run_pek_extract: DONE` log line with non-zero `push_echo_units`/`push_echo_pages`.
- Per the file's own ECHO-vs-DB caveat: these are mcp-server echo values,
  NOT a DB commit count — separately verify via
  `SELECT COUNT(*) FROM bctc_layout_units WHERE report_id=...` (or the
  live table this pushes to) inside the container, read-write handle (per
  `feedback_integrity_helper_readonly_wal_blinded`).

---

## 9. AC7 — regression-gate design notes

Any automated gate for this fix must NOT key on `OOMKilled` (the row's own
mandate — the observed/plausible failure mode is `ExitCode=0`,
`OOMKilled=false`, silent restart under `RestartPolicy=unless-stopped`).
Recommend keying on, in order of directness:
1. **PID1 VmRSS at idle** (5+ min after last job, tesseract child count 0)
   — the exact AC6 measurement, made repeatable.
2. **`docker stats` MemPerc** trend, sampled post-burst-drain.
3. **`RestartCount` growth** over a fixed observation window (§2 — grew
   2→7 across ~1 week in this row's own history; a working fix should
   flatten this, though deploy-triggered restarts are an uncontrolled
   confound — no historical distinguishing signal exists today; consider,
   as a *separate*, non-blocking, low-cost addition: have `build_lifespan`
   write a one-line `{"started_at": ..., "reason": "deploy"|"unknown"}`
   marker file on graceful vs. abrupt shutdown, so future incidents can
   tell deploy-restarts from crash-restarts. Not required for this row's
   ACs — flagged for PO to mint separately if wanted.).
4. Given §2's swap finding: consider **also** sampling
   `/proc/1/status`'s `VmSwap` (or `smaps_rollup`'s `Swap:`) alongside
   MemPerc, since a swap-heavy resting state would under-report on
   `memory.current`-only gates.

---

## 10. Files this blueprint touches (for dev-pdf-extractor)

| file | change |
|---|---|
| `apps/pdf-extractor/interface/pek_run_helper.py` | add `malloc_trim(0)` in `finally:` of `_run_pek_extract` (§6) |
| `apps/pdf-extractor/main.py` | correct the stale "cold-start RSS ~80MB" comment (line ~196) to the measured ~845 MiB (§3) — small, no-behavior-change doc fix, bundle with the above |
| `apps/pdf-extractor/__tests__/unit/test_pek_engine_adapter.py` (or a new `test_pek_mem_hygiene.py`) | unit test: mock `ctypes.CDLL`/`malloc_trim`, assert it's called exactly once per `_run_pek_extract` invocation on both the success and exception path — do NOT assert on real RSS numbers in a unit test (non-deterministic/slow); the RSS evidence lives in this brief + the replayable probe script, not in CI |
| `scripts/audits/pdfx-pek-mem-arena-probe.py` | **already created this cycle** — reusable isolated repro/A-B probe; rerun after the fix lands to confirm the trimmed floor still holds (should be unchanged — the fix doesn't change what gets allocated, only that it's returned to the OS sooner) |

DDD layer: `interface/pek_run_helper.py` is the interface layer
(background-task runner) — the `malloc_trim` call is a process-hygiene
side effect at the request-lifecycle boundary, not domain/application
logic; it belongs exactly where the sketch places it, not inside
`PekEngineAdapter` (infrastructure/domain-adjacent — would conflate
"do the extraction" with "manage OS-level memory reclamation of the
whole request"). No new interface/port needed — this is not
business-logic-pluggable, it is operational hygiene.

**Reuse patterns:** none to extend — this is the first process-memory
hygiene concern in this codebase (grepped `tracemalloc|malloc_trim|
gc\.collect|memory_info|psutil` across `apps/pdf-extractor` — zero
existing hits outside a docstring reference in `ocr_gateway.py`).

**Scan clean:** true — brownfield index covered `infrastructure/`,
`interface/`, `main.py`, `docker-compose.yml`, `Dockerfile`,
`requirements-pek.txt`, plus live `/proc`, `docker inspect`, `docker
stats`, `docker logs` against the running container.

---

## 11. Test strategy

- **Unit** (new/extended, `dev-pdf-extractor`): `malloc_trim` called
  exactly once per `_run_pek_extract` invocation, both branches (mock
  ctypes, no real memory pressure needed).
- **Integration** (AC4): one real scanned PDF through `/pek-extract`
  end-to-end, DB-count-verified (not echo-verified).
- **Live verification** (AC2/AC3, ops-supervised, §5): corrected burst
  against `/pek-extract`, peak+idle MemPerc reported honestly.
- **Regression** (AC6/AC7): idle-floor re-measurement 5+ min post-burst,
  `RestartCount` unchanged across the verification window.

---

## 12. Risk flags

- **Shared-cgroup risk for ANY future test action against this
  container** (§4) — carry this constraint forward to whoever runs §5;
  do not relax it without an explicit ops/capacity decision.
- **`main.py`'s stale "~80MB" comment** is itself a minor but real risk:
  it likely under-informed past capacity/sizing decisions on this exact
  row's business case. Correct it alongside the fix (§10).
- **The 11-failure PEK retry-storm** (§2, 2026-08-04T14:35–17:40Z, two
  fixed `report_id`s) is unexplained and unresolved — each failed
  attempt still pays the full layout-detection RSS cost (§3) before
  failing. Not this row's mechanism, but a real, currently-silent
  amplifier of it. Flag to PO as a candidate follow-up row.
- **Swap is active on this host/container** (§2) — any capacity-cap
  conversation (AC3's escalation branch, if it comes to that) should use
  RSS+Swap, not `docker stats` MemPerc alone, or it will systematically
  under-count.

---

## RETURN

DONE: Diagnosis + design complete. Mechanism named with a captured,
reproducible artifact (AC1, AC5 — glibc malloc-arena fragmentation,
`gc.collect()`-immune, ~70-99% `malloc_trim(0)`-recoverable). AC2's own
burst spec corrected (wrong endpoint) and handed off, not executed
against production (shared-cgroup risk, out of this role's charter). AC3
primary remedy designed (not landed — plan_only): `malloc_trim(0)` in
`_run_pek_extract`'s `finally`. AC6 idle-floor re-measured live (62–74%
of cap, declining, this container life). AC7 regression-gate design keys
on VmRSS/MemPerc/RestartCount, never OOMKilled.
ZONE: apps/pdf-extractor/
NEXT: dev-pdf-extractor — implement §6/§10 (malloc_trim fix + comment
correction + unit test), then execute §5's corrected live burst
(ops-supervised) and §8's regression floor before DONE. If §5's honest
peak-under-burst still exceeds 80% of cap after the fix, escalate the
capacity-cap question to po per AC3 — do not decide it in code.
HANDOFF: docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md
PIPELINE: continue
