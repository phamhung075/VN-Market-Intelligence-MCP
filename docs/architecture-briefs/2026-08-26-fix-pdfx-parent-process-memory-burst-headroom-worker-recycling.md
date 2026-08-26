# FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM — Worker-Recycling Amendment

**Written:** 2026-08-26T01:5xZ · **Author:** architect · **Row:** `task_board.ready[]` FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM
**Zone:** `apps/pdf-extractor/` · **BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives)
**Amends:** `docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md` (stands, unmodified — that brief covers the PID1/PEK mechanism; this one covers a second, distinct mechanism in the `ocr_executor` CHILD process, per PO adjudication `po_adjudication_20260826T0116Z` on this row). Per that ruling's explicit instruction, this is a small, focused amendment, not a second full brief.

Design-only. No code changed. No container touched, restarted, or benchmarked — `date -u` at write time was `2026-08-26T01:49:10Z`, inside the 02:00–08:59Z weekday market-hours guard's approach window; live verification is handed to dev-pdf-extractor for a >=09:00Z weekday run.

---

## 1. Scope — what this amends and what it does not

The 2026-08-07 brief diagnosed and fixed (via `malloc_trim(0)`, commit `c3fd44766`) the **PID1** mechanism: `PekEngineAdapter`'s own PaddleOCR/torch models, loaded and called in-process via `asyncio.to_thread`. That fix is landed and is not reopened here.

This amendment is about a **second, architecturally distinct** mechanism the PO settled at source 2026-08-26T01:16Z: the **`ocr_executor` child process** (`apps/pdf-extractor/main.py:154`, `ProcessPoolExecutor(max_workers=1)`, no `max_tasks_per_child`) caches its own module-global `PaddleOCR(lang="vi")` instance (`infrastructure/ocr_worker.py:107,209,222`) and is never recycled for the container's entire life. Both shipped `malloc_trim(0)` mitigations (`interface/pek_run_helper.py:133`, `interface/routes_extract.py:112`) run only in PID1's request `finally:` blocks — the executor child has zero mitigation of any kind.

The mechanism this row protects is `ocr_worker.py:454-495`'s bounded low-char rescue (tesseract first, `PaddleOCR(vi)` fallback only when a page yields `< LOW_TESSERACT_PAGE_CHARS` chars, keep whichever is longer) — the **surviving, sanctioned** path per the PO's 2026-08-26T01:16Z closure of the sibling confidence-discriminator row. It must not be redesigned here.

## 2. Evidence — what is measured, and an evidence-provenance gap flagged plainly

Two independent measurements corroborate "repeated PaddleOCR CPU inference in one long-lived process retains native-allocator memory across calls, `gc.collect()` recovers ~0, `malloc_trim(0)` recovers ~70–99%":

1. 2026-08-07 brief §3/§7 (`scripts/audits/pdfx-pek-mem-arena-probe.py`, isolated repro): `_load_pek_models()`'s combined torch+PaddleOCR pipeline, +236–485 MiB per job, 0 bytes via `gc.collect()`, ~99.7% via `malloc_trim(0)`.
2. `docs/agent-memory/decisions/dev-pdf-extractor-ac0-findings-20260825T1830Z.md` + `...-ocr-widen-20260825T2210Z.md` §1 (`ocr_bench_inner.py` sweep, `DBC_2025_Q4.pdf`, 18pp): memory **rises monotonically with fire count** — N=0 fires 42.99% of the 2.5 GiB cap, N=1 → 56.42% (+13.4pp for one fire alone), N=3 → 90.11%, N=6 → **100.00% = `memory.max` exactly** (847–914 `memory.events.max` hard-limit hits across two independent runs), N=14 → same ceiling, more events (1250). `PaddleOCR(...)` construction is priced into the N=0 baseline in both arms, so the rise is retention across calls, not one-time residency.

**Flagged, not glossed over:** measurement (2) was taken against `AutoFallbackOcrBackend` (`infrastructure/ocr_backends.py`, `OCR_TEXT_BACKEND=auto`, confidence-gated) — a **sibling, now-RETIRED** mechanism that runs in **PID1** and reuses the PEK pipeline's own `paddle_table` instance (`ocr_bench_inner.py` calls `PekEngineAdapter.extract_layout_and_tables()` directly; confirmed by reading the script, not assumed). It is **not** a direct measurement of `ocr_worker.py`'s own `_paddle_ocr_worker_instance` running inside the `ocr_executor` CHILD process — a different instance, different call site (`_rasterize_and_ocr_page_worker` rasterizes a whole page at `RASTERIZE_DPI=200` vs. AutoFallbackOcrBackend's per-table-cell crops), never directly benchmarked. The PO's own 2026-08-26T01:16Z closure note explicitly carries this number over as the basis for opening this row ("auto-mode saturates the 2.5 GiB cap at 6 fires... that is now tracked on FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM"), and this brief treats it the same way: **strong, same-library, same-mechanism-class corroboration for the qualitative shape of the problem (unbounded, monotonic, un-trimmed growth per `.ocr()` call) — not a substitute for measuring `ocr_worker.py`'s own curve.** AC-3 below closes this gap post-implementation; nothing in this brief's design decision depends on the exact numbers being identical between the two call sites, only on the qualitative mechanism (established twice, independently, on two different PaddleOCR call sites in this codebase).

## 3. The granularity mismatch — why recycling alone is necessary but not provably sufficient

Read at source (`application/extract_tables_usecase.py:531-567`): the **tesseract production path** (`POST /extract`) submits exactly **two** tasks per document to `ocr_executor`:

1. `locate_balance_sheet_pages_worker` — pdfplumber only, never touches PaddleOCR.
2. `ocr_pages_worker` — tesseract on N located pages, **looping internally** and calling `_rasterize_and_ocr_page_worker` (the PaddleOCR rescue) in-line for each page that falls below `LOW_TESSERACT_PAGE_CHARS`, all inside **one** `run_in_executor` call.

`ProcessPoolExecutor`'s `max_tasks_per_child` recycles the child **between** submitted tasks — it cannot interrupt one. A document whose `ocr_pages_worker` task fires the rescue on several pages (DBC's own 18-page document already fires 6 of its own regions at the shipped default) accumulates that growth **within one uninterruptible task**, regardless of how `max_tasks_per_child` is tuned. Recycling bounds **cross-document/cross-task** retention (the row's literally-stated root cause: "never recycled for the container's entire life"); it structurally cannot bound **within-one-document** retention. This is why the PO's ruling kept the per-document call budget as a mandatory safety belt rather than an optional extra (§5).

## 4. Decision — (ii) tune `max_tasks_per_child` on the existing shared executor, N=1

Chosen over (i) a dedicated second `ProcessPoolExecutor` reserved for the Paddle rescue call only.

**Why not (i):** a dedicated executor requires splitting `ocr_pages_worker`'s contract in two (a tesseract-only phase returning per-page char counts, and a rescue phase the PARENT coroutine dispatches page-by-page to the second executor) — `ProcessPoolExecutor` instances are not passable into an already-running worker process, so achieving finer-than-task granularity means moving the fan-out decision into `extract_tables_usecase.py`'s async code, touching its call contract and both existing test files (`__tests__/test_ocr_concurrency_invariant.py`, `__tests__/unit/test_low_text_density_ocr_rasterize.py`), and running a second permanently-resident child process (doubling `lifespan.py`'s shutdown bookkeeping). That is a real re-architecture, not the "small bounded design call" the PO ruling asked for, and it is not required to close the row's stated root cause (an immortal, unrecycled process — not a granularity defect, though granularity is a real residual risk, see §6).

**Why (ii), and why N=1 specifically (not a larger N):**
- `max_tasks_per_child` was added to `ProcessPoolExecutor` in Python 3.11; the container runs 3.12.3 (PO-verified live). Available with zero dependency change.
- `main.py:154` changes from `ProcessPoolExecutor(max_workers=1)` to `ProcessPoolExecutor(max_workers=1, max_tasks_per_child=1)` — one line. `ocr_worker.py`'s existing `if _paddle_ocr_worker_instance is None: ... load ...` pattern (line 209) already does the right thing on a fresh process (module state resets on every new fork) — **zero change needed to `ocr_worker.py` for this half of the fix.**
- N=1 recycles after **every** task, including the cheap, PaddleOCR-free `locate_balance_sheet_pages_worker` calls. That costs a bare process respawn (fork, no model involved) — negligible relative to OCR job durations of many seconds.
- The reload cost (real, and the row explicitly asks it be quantified — see §6) is paid **only** on an `ocr_pages_worker` task that actually fires the rescue in a process that does not already hold the model. With rescue fires measured at a ~0.4% region base rate on ordinary documents (`...-ocr-widen-20260825T2210Z.md` §2, 189 fresh regions across 6 stratified documents, 1 genuine broken exemplar), most recycles cost nothing beyond the respawn.
- Any N>1 reopens exactly the defect being closed, merely bounded to a smaller, **untested** window: two or more consecutive rescue-firing documents inside that window can still compound close to the cap (§2's own curve: +13–17pp per fire from a fresh baseline), and no measurement exists of `ocr_worker.py`'s own curve to justify a specific N>1 as safe. N=1 is the only value that does not require curve-fitting to be provably correct against the row's own "never recycled" framing — it trades a bounded, real, but likely-infrequent reload cost for a guarantee rather than a probabilistic bet.

## 5. Safety belt — required, not optional (per PO ruling, restated concretely here)

Recycling cannot reach inside one `ocr_pages_worker` task (§3). A document whose own rescue-fire count alone approaches the measured saturation point (DBC: 6 fires pins the analogous PID1 mechanism to `memory.max` exactly, from measurement (2) in §2) must not be allowed to exhaust the container regardless of recycling.

**Design:** a per-document (i.e., per-`ocr_pages_worker`-call) rescue-fire budget, env-driven (matches this codebase's existing convention — `LOW_TESSERACT_PAGE_CHARS`, `RASTERIZE_DPI` are already env vars in the same file): `BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT`, default **4** (provisional — see AC-2, this default must be confirmed or revised against `ocr_worker.py`'s own measured curve, not assumed identical to the PID1 curve in §2). Once the budget is exhausted within one `ocr_pages_worker` call, remaining low-char pages keep their tesseract result as-is (already the fallback behavior on a `_rasterize_and_ocr_page_worker` exception, per the existing `try/except` at `ocr_worker.py:467-493`) and a single `logger.warning` line records the budget exhaustion with the report's page list, so a page silently reverting to a weak tesseract read is visible in logs, not just in an aggregate metric.

**Also recommended, cheap, additive, zero risk to the rescue logic itself:** wire `malloc_trim(0)` into the child's own rescue call site — `ocr_worker.py`, immediately after each `_rasterize_and_ocr_page_worker` invocation inside `ocr_pages_worker`'s loop (same `ctypes.CDLL("libc.so.6")` shape already used at `interface/pek_run_helper.py:_malloc_trim_or_noop` and `interface/routes_extract.py`). This is the one piece of this design that directly attacks the **intra-document** compounding §3 identifies: trimming after every fire, not just recycling between documents, keeps a single pathological document's own accumulation near the per-fire delta instead of the running sum of all its fires. Guard identically (`OSError`/`AttributeError` → no-op on non-glibc hosts). This does not replace the budget in §5 — it reduces how often the budget is actually needed, on the same evidence basis as the already-landed PID1 fix (§2, measurement (1)).

## 6. Cost — model reload latency, honestly unmeasured, with a measurement plan

The row asks this be quantified or given a measurement path. It is **not measured** for `ocr_worker.py`'s own `PaddleOCR(use_angle_cls=False, lang="vi", use_gpu=False, show_log=False)` construction (OCR-recognition only — no layout/table-structure sub-models, so plausibly cheaper than the combined torch+PaddleOCR `_load_pek_models()` load the 2026-08-07 brief measured, but this is a plausibility argument, not a number). Measurement path for dev-pdf-extractor, post->=09:00Z weekday:

```python
# one-shot, isolated container (same recipe as scripts/audits/pdfx-pek-mem-arena-probe.py
# — own cgroup, never the live container), times ONLY infrastructure.ocr_worker's own
# lazy-load branch:
import time
from infrastructure.ocr_worker import _rasterize_and_ocr_page_worker
t0 = time.time()
_rasterize_and_ocr_page_worker(pdf_path, page_num)   # first call: pays the cold load
print("cold", time.time() - t0)
t0 = time.time()
_rasterize_and_ocr_page_worker(pdf_path, page_num)   # second call, same process: warm
print("warm", time.time() - t0)
```
Report both numbers plainly, whatever they are (AC-2). If the cold-load cost turns out large enough to matter against `PDFX_OCR_PAGE_TIMEOUT_S=600`/`PEK_SEMAPHORE_WAIT_SECONDS=1800` (both already generous), that is still not a reason to raise N above 1 without re-deriving §4's guarantee argument — it is a reason to consider it as an input to the §5 budget default instead.

## 7. Acceptance criteria (for dev-pdf-extractor)

- **AC-1 (primary fix):** `apps/pdf-extractor/main.py:154` — `ocr_executor = ProcessPoolExecutor(max_workers=1, max_tasks_per_child=1)`. Unit test (mock-based, no real Paddle/tesseract needed, per this file's own convention in `test_ocr_concurrency_invariant.py`): assert the executor is constructed with both kwargs.
- **AC-2 (cost quantified):** run §6's cold/warm measurement, report both numbers as-measured (>=09:00Z weekday). No pass/fail bar on the number itself — this AC is "measured and reported," not "under some threshold."
- **AC-3 (evidence-gap closed):** run the §2 fire-count sweep methodology (`scripts/audits/pdfx-pek-mem-arena-probe.py`'s pattern, adapted to call `ocr_pages_worker`/`_rasterize_and_ocr_page_worker` directly, i.e. the actual mechanism this row is about) against a real scanned/low-density document, at N=0,1,3,6 fires, reading `memory.peak`/`memory.events` from `/sys/fs/cgroup/` (never `ru_maxrss` — copy-on-write double-counts this service's per-cell tesseract forks, per this row's standing instruction). Confirm or revise the §5 budget default (4) against the actual curve.
- **AC-4 (safety belt lands):** `BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT` env var implemented in `ocr_worker.py`'s `ocr_pages_worker`, default 4 (pending AC-3), with the exhaustion warning log. Unit test: mock `_rasterize_and_ocr_page_worker` to always "fire," assert it stops being called after the budget and remaining pages keep their tesseract text.
- **AC-5 (malloc_trim in the child):** `malloc_trim(0)` call added after each rescue fire inside `ocr_pages_worker`, same guarded `ctypes.CDLL("libc.so.6")` shape as the two existing PID1 call sites. Unit test: mock `ctypes.CDLL`, assert called once per fire (not per page — only pages that actually invoke the rescue).
- **AC-6 (regression floor):** one real scanned BCTC PDF processed end-to-end through `POST /extract` post-fix; confirm non-zero rows land in the DB (count query, not echo — `feedback_integrity_helper_readonly_wal_blinded`).
- **AC-7 (no OOM-flag gate):** any automated check keys on `memory.peak`/`memory.events.oom_kill`/`RestartCount`, never `docker inspect .State.OOMKilled` (this row's own prior AC-7 mandate, restated — the known failure mode is a clean exit, not a kill flag).
- **AC-8 (market-hours gate, hard):** none of AC-2/AC-3/AC-6 may run 02:00–08:59Z on a weekday. Design/implementation/unit tests (AC-1, AC-4, AC-5) are unaffected and may proceed immediately.
- **AC-9 (deploy dependency, not this row's job):** none of AC-2/AC-3/AC-6 can be honestly measured until the single-service `pdf-extractor` rebuild tracked on `UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT` (next_agent=ops) actually lands the code this row produces. Do not treat a pre-rebuild container's readings as evidence for this row.

## 8. Files this amendment touches (handoff)

| file | change |
|---|---|
| `apps/pdf-extractor/main.py` | `max_tasks_per_child=1` added to `ocr_executor` construction (§4, AC-1) |
| `apps/pdf-extractor/infrastructure/ocr_worker.py` | `BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT` budget + `malloc_trim(0)` after each fire, inside `ocr_pages_worker`'s loop (§5, AC-4/AC-5) — the module-global cache itself (lines 107/209/222) is UNCHANGED, its "if None: load" pattern is already correct for a recycled process |
| `apps/pdf-extractor/__tests__/test_ocr_concurrency_invariant.py` or a new sibling unit file | AC-1/AC-4/AC-5 unit tests (mocked, no real models) |
| `scripts/audits/pdfx-pek-mem-arena-probe.py` (pattern reused, new script or extended) | AC-3 sweep against `ocr_worker.py`'s own call site |

DDD layer: unchanged from the existing file split — `main.py` is the composition root (executor construction only), `ocr_worker.py` stays infrastructure (picklable, module-level worker functions). No new port/interface needed; this is process-hygiene + a bounded-cost guard on an existing infrastructure function, not new business logic.

**Reuse patterns:** `malloc_trim(0)` reuses the exact `ctypes.CDLL("libc.so.6")` shape already shipped twice (`pek_run_helper.py`, `routes_extract.py`) — do not invent a third shape. The rescue-fire budget follows this file's own existing env-var convention (`LOW_TEXT_DENSITY_THRESHOLD`, `LOW_TESSERACT_PAGE_CHARS`, `RASTERIZE_DPI`), all `os.environ.get(...)`-sourced module constants at the top of `ocr_worker.py`.

**Scan clean:** true — read `main.py` (composition root + executor construction), `infrastructure/ocr_worker.py` (full file), `application/extract_tables_usecase.py:490-590` (executor dispatch call sites), `interface/pek_run_helper.py` and `interface/routes_extract.py` (existing malloc_trim sites), `infrastructure/lifespan.py` (executor shutdown), `infrastructure/ocr_backends.py` (confirmed distinct from `ocr_worker.py` — the evidence-provenance gap in §2), `scripts/audits/ocr_bench_inner.py` and the two decision-journal files cited in §2 (confirmed what was actually measured), `docker-compose.yml` (2.5g cap confirmed at source, not relayed).

---

## RETURN

DONE: Design decision made and justified — (ii) `max_tasks_per_child=1` on the existing shared `ocr_executor`, chosen over a dedicated second executor. Safety belt specified concretely (per-document rescue-fire budget + `malloc_trim(0)` in the child, addressing the intra-task compounding recycling structurally cannot reach). Latency-cost quantification path given (not a number — honestly unmeasured, market-hours gated). Evidence-provenance gap flagged: the cited "6 fires pins the cap" figure was measured on a sibling PID1/PEK code path (`AutoFallbackOcrBackend`, now retired), not directly on this row's own `ocr_worker.py` mechanism — AC-3 closes this.
ZONE: apps/pdf-extractor/
NEXT: dev-pdf-extractor — implement §7 AC-1/AC-4/AC-5 (all unit-testable without live measurement), then AC-2/AC-3/AC-6 live (ops-supervised rebuild first, per AC-9, then >=09:00Z weekday per AC-8).
HANDOFF: docs/architecture-briefs/2026-08-26-fix-pdfx-parent-process-memory-burst-headroom-worker-recycling.md
PIPELINE: continue
