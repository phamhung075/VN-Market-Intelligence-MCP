"""
infrastructure/ocr_gateway.py — FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT

The ONE OCR gateway: one process-global concurrency bound, subprocess lifetime
bound to a wall-clock deadline, bookkeeping published alongside OS ground
truth. See docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md.

Root cause this closes (verified 2026-07-28, ground truth in the task handoff):
    POST /extract -> domain/services.py -> infrastructure/extraction_engine.py:63
    `await asyncio.to_thread(self._extract_text_ocr_sync, pdf_bytes)` -> :173
    `pytesseract.image_to_string(...)` with NO timeout= and NO concurrency guard.
    The bound observed in production (10) was CPython's *default* asyncio
    executor size (min(32, os.cpu_count()+4)) — an accident, not a guard.
    Worse: a client abort (mcp-server's AbortSignal.timeout(120_000)) does not
    stop server-side OCR (asyncio.to_thread is not cancellable), so every
    abandoned request permanently consumed one of those 10 slots — a ratchet
    that never recovers.

This module is the single authority. DDD layer: infrastructure (owns
pytesseract, subprocess, /proc). No imports from application/ or interface/
(Fence-A, matching generic_md_table/extractor.py:61).

Design (brief §5):
    _OCR_SLOTS   threading.BoundedSemaphore(N) — module-level, process-global.
                 N = PDFX_OCR_MAX_CONCURRENCY (default 1 — the value the code
                 has claimed since PDFX-SINGLE-WORKER-BLOCKING).
    _OCR_POOL    ThreadPoolExecutor(max_workers=N) — gateway-owned. OCR never
                 again touches the shared asyncio default executor, so it
                 cannot head-of-line-block push clients / repositories that
                 legitimately use asyncio.to_thread() for fast I/O.
    run_image()  async — the primary entry point for callers already on the
                 event loop's own coroutine (extraction_engine.py's hot path).
    run_image_sync()  sync entry point for callers nested inside an
                 already-offloaded thread (pek_engine_adapter's own
                 ThreadPoolExecutor(1), ocr_adapter.py, generic_md_table/unit_ocr.py) —
                 none of the six historical call sites actually run ON the
                 event loop thread; a sync entry point avoids nested-loop
                 gymnastics while still funnelling every call through the
                 same semaphore + private pool.
    slot() / slot_async()  contextmanagers for callers that run OCR OUT OF
                 PROCESS (ExtractTablesUseCase -> ProcessPoolExecutor path).
                 Acquired in the PARENT before dispatch, so the cross-process
                 bound composes with this in-process one instead of living in
                 two places where they provably cannot (brief §5.4).
    OcrCapacityExceededError / OcrDeadlineExceededError (domain/errors.py,
                 imported here — infra->domain is a valid DDD direction) —
                 429 (queue-wait elapsed) / bounded-deadline-hit respectively.
    inflight() / reap_orphans()  observability + shutdown reaper (brief §5.2).

Env vars (no rebuild needed to retune — brief §8):
    PDFX_OCR_MAX_CONCURRENCY   default 1
    PDFX_OCR_QUEUE_WAIT_S      default 5   (bounded wait before 429)
    PDFX_OCR_PAGE_TIMEOUT_S    default 600 (10 min outer backstop per call)

Scope note (honesty — see task close-out report for the full accounting):
    All SIX historical pytesseract call sites are documented in the design
    brief §5.3. This fix rewires the ones that are safe to rewire without an
    unbounded blast radius on a P0 memory-pressure row:
        infrastructure/extraction_engine.py   (THE live defect — 100% of load)
        infrastructure/ocr_backends.py        (TesseractVieBackend — /pek-extract)
        infrastructure/ocr_adapter.py         (/extract-tables — 0 live traffic)
        infrastructure/generic_md_table/unit_ocr.py (/extract-layout-first)
    Two are deliberately NOT rewired (both already documented exceptions, not
    silent omissions):
        infrastructure/ocr_worker.py — runs INSIDE a ProcessPoolExecutor CHILD
            process (main.py:154). It cannot see this module's in-memory
            semaphore (separate address space) — the bound is composed at the
            PARENT via slot_async() in extract_tables_usecase.py instead.
        infrastructure/generic_md_table/extractor.py — `_process_page` takes
            `pytesseract`/`Output` as explicit parameters and is used as a
            direct test seam by ~40 tests in
            __tests__/unit/test_generic_md_table_extractor.py. Rewiring it
            safely is a real, separate follow-up (recommend PO mint it) —
            not done here to keep this P0 fix's blast radius bounded.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from contextlib import asynccontextmanager, contextmanager
from typing import Any, AsyncIterator, Dict, Iterator, List, Optional, Union

from domain.errors import OcrCapacityExceededError, OcrDeadlineExceededError
from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Env-driven config — read once at import time; tests may monkeypatch the
# module-level names directly (e.g. ocr_gateway.PDFX_OCR_QUEUE_WAIT_S = 0.2).
# ---------------------------------------------------------------------------


def _read_int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("ocr_gateway: invalid int env %s — using default %s", name, default)
        return default


def _read_float_env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("ocr_gateway: invalid float env %s — using default %s", name, default)
        return default


PDFX_OCR_MAX_CONCURRENCY: int = _read_int_env("PDFX_OCR_MAX_CONCURRENCY", 1)
PDFX_OCR_QUEUE_WAIT_S: float = _read_float_env("PDFX_OCR_QUEUE_WAIT_S", 5.0)
PDFX_OCR_PAGE_TIMEOUT_S: int = _read_int_env("PDFX_OCR_PAGE_TIMEOUT_S", 600)

# Grace added on top of PDFX_OCR_PAGE_TIMEOUT_S for the OUTER backstop wait
# (future.result(timeout=...)). Normally pytesseract's OWN internal
# `timeout=` kwarg fires first (it kills the tesseract subprocess directly —
# see pytesseract.pytesseract.timeout_manager). This backstop only fires if
# something hangs BEFORE that inner wait (e.g. temp-file save, image prep).
_BACKSTOP_GRACE_S: float = 30.0

# Output-type sentinels — callers select these instead of importing
# pytesseract.Output directly, so `import pytesseract` never has to appear
# outside this module for the four rewired call sites.
OUTPUT_DICT: str = "dict"
OUTPUT_DATAFRAME: str = "dataframe"

# ---------------------------------------------------------------------------
# THE single process-global bound (brief §5.1)
# ---------------------------------------------------------------------------

_OCR_SLOTS = threading.BoundedSemaphore(max(1, PDFX_OCR_MAX_CONCURRENCY))
_OCR_POOL = ThreadPoolExecutor(
    max_workers=max(1, PDFX_OCR_MAX_CONCURRENCY),
    thread_name_prefix="ocr-gateway",
)

_inflight_lock = threading.Lock()
_inflight_calls: Dict[str, float] = {}  # call_id -> monotonic start time

# Linux-only /proc root — overridable so tests can point this at a fixture
# directory without needing a real Linux host (brief: "Linux-only via /proc;
# on macOS skipif, asserting the semaphore counter instead").
_PROC_ROOT: str = "/proc"


class OcrCapacityExceeded(OcrCapacityExceededError):
    """Alias kept for the exact name used in the design brief (§5.1 table)."""


class OcrDeadlineExceeded(OcrDeadlineExceededError):
    """Alias kept for the exact name used in the design brief (§5.1 table)."""


# ---------------------------------------------------------------------------
# The single tesseract execution point (Fence — see test_ocr_call_site_fence).
# ---------------------------------------------------------------------------


def _exec_tesseract(
    image: Any,
    mode: str,
    lang: str,
    config: str,
    output_type: Optional[str],
    deadline_s: int,
) -> Union[str, Any]:
    """
    Runs on an `_OCR_POOL` worker thread. THE only place in this service that
    invokes pytesseract directly (besides the two documented exceptions in
    the module docstring). Test seam: T1 monkeypatches this exact module
    attribute (`ocr_gateway._exec_tesseract`) to simulate concurrency without
    a real Tesseract binary — `run_image`/`run_image_sync` look this name up
    fresh from module globals on every call, so the monkeypatch takes effect
    immediately.
    """
    import pytesseract  # the ONLY pytesseract import for the live OCR call

    if mode == "string":
        return pytesseract.image_to_string(image, lang=lang, config=config, timeout=deadline_s)

    if mode == "data":
        if output_type is None:
            raise ValueError("ocr_gateway._exec_tesseract: mode='data' requires output_type")
        real_output_type = (
            pytesseract.Output.DATAFRAME if output_type == OUTPUT_DATAFRAME else pytesseract.Output.DICT
        )
        return pytesseract.image_to_data(
            image, lang=lang, config=config, timeout=deadline_s, output_type=real_output_type
        )

    raise ValueError(f"ocr_gateway._exec_tesseract: unknown mode {mode!r}")


def _is_deadline_error(exc: BaseException) -> bool:
    """pytesseract raises a bare RuntimeError('Tesseract process timeout') — no
    dedicated exception class exists upstream (checked: pytesseract 0.3.13
    pytesseract.pytesseract.timeout_manager). Match on message text."""
    return isinstance(exc, RuntimeError) and "timeout" in str(exc).lower()


# ---------------------------------------------------------------------------
# /proc bookkeeping — dependency-free (no psutil), Linux-only (brief §5.2).
# Returns [] on any non-Linux host (e.g. the macOS dev laptop) instead of
# raising, so callers (inflight(), reap_orphans()) degrade gracefully.
# ---------------------------------------------------------------------------


def _find_tesseract_child_pids(ppid: Optional[int] = None) -> List[int]:
    """
    Scan `_PROC_ROOT`/*/stat for processes whose ppid == `ppid` (default: this
    process) and whose comm == "tesseract". Dependency-free equivalent of
    `psutil.Process().children()` filtered by name.

    ppid==this-process is exactly what a normal, live, in-process-spawned
    tesseract child looks like under exec-form CMD (Dockerfile:117 — uvicorn
    IS container init, so any subprocess spawned by any thread of PID 1 has
    ppid=1). See the design brief §2.1 for why PPID=1 carries zero orphan
    signal on this host.
    """
    target_ppid = ppid if ppid is not None else os.getpid()
    pids: List[int] = []
    try:
        entries = os.listdir(_PROC_ROOT)
    except (FileNotFoundError, NotADirectoryError, PermissionError):
        return pids

    for entry in entries:
        if not entry.isdigit():
            continue
        stat_path = os.path.join(_PROC_ROOT, entry, "stat")
        try:
            with open(stat_path, "r") as f:
                content = f.read()
        except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
            continue

        # Linux /proc/<pid>/stat format: "pid (comm) state ppid ..."
        # comm can itself contain spaces/parens, so split on the LAST ')'.
        rparen = content.rfind(")")
        lparen = content.find("(")
        if rparen == -1 or lparen == -1 or rparen < lparen:
            continue
        comm = content[lparen + 1 : rparen]
        rest = content[rparen + 2 :].split()
        if len(rest) < 2:
            continue
        try:
            entry_ppid = int(rest[1])
        except ValueError:
            continue

        if comm == "tesseract" and entry_ppid == target_ppid:
            try:
                pids.append(int(entry))
            except ValueError:
                continue

    return pids


def _child_age_s(pid: int) -> Optional[float]:
    """Approximate wall-clock age of a child via /proc/<pid> directory ctime
    (created when the process starts). Approximation, not exact — documented."""
    try:
        return max(0.0, time.time() - os.stat(os.path.join(_PROC_ROOT, str(pid))).st_ctime)
    except (FileNotFoundError, OSError):
        return None


def inflight() -> Dict[str, Any]:
    """
    Observability (brief §5.2 / AC-6): publish bookkeeping ALONGSIDE OS ground
    truth so a counter that disagrees with reality is visible, not asserted
    away. `semaphore != os_children` is logged at ERROR — that mismatch is,
    by definition, a bug.
    """
    with _inflight_lock:
        held = len(_inflight_calls)
        oldest_started = min(_inflight_calls.values()) if _inflight_calls else None

    children = _find_tesseract_child_pids()
    os_children = len(children)
    oldest_child_s: Optional[float] = None
    if children:
        ages = [a for a in (_child_age_s(p) for p in children) if a is not None]
        if ages:
            oldest_child_s = max(ages)
    elif oldest_started is not None:
        oldest_child_s = max(0.0, time.monotonic() - oldest_started)

    if held != os_children and os.path.isdir(_PROC_ROOT):
        # Only compare against OS ground truth when /proc is actually
        # available (Linux/container) — on macOS os_children is always 0 by
        # construction and would falsely flag every held call.
        logger.error(
            "ocr_gateway.inflight: semaphore=%d != os_children=%d — bookkeeping "
            "disagrees with OS ground truth (this mismatch is, by definition, a bug)",
            held,
            os_children,
        )

    return {"max": PDFX_OCR_MAX_CONCURRENCY, "semaphore": held, "os_children": os_children,
            "oldest_child_s": oldest_child_s}


def reap_orphans(grace_s: float = 5.0) -> int:
    """
    Called from lifespan shutdown (brief §5.1): SIGTERM every live tesseract
    child of this process, wait up to `grace_s`, then SIGKILL stragglers.
    Returns the number of children that were signalled.
    """
    pids = _find_tesseract_child_pids()
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except PermissionError:
            logger.warning("ocr_gateway.reap_orphans: no permission to SIGTERM pid=%d", pid)

    if pids:
        time.sleep(min(max(grace_s, 0.0), 5.0))

    remaining = _find_tesseract_child_pids()
    for pid in remaining:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except PermissionError:
            logger.warning("ocr_gateway.reap_orphans: no permission to SIGKILL pid=%d", pid)

    if pids:
        logger.info(
            "ocr_gateway.reap_orphans: signalled %d tesseract child(ren) (%d needed SIGKILL)",
            len(pids),
            len(remaining),
        )
    return len(pids)


def _reap_oldest_tesseract_child_best_effort() -> Optional[int]:
    """
    Best-effort immediate reap, called opportunistically when an awaiting
    coroutine is cancelled (client disconnect). At the shipped default
    (PDFX_OCR_MAX_CONCURRENCY=1) there is at most one live tesseract child, so
    this is unambiguous; at N>1 it kills the oldest (heuristic — the most
    likely candidate to have been abandoned). Linux-only; no-op elsewhere.

    NOTE (honesty — see task close-out): this is a BEST-EFFORT opportunistic
    reap, not a guaranteed immediate kill. The guaranteed bound on how long an
    abandoned call can hold a slot is PDFX_OCR_PAGE_TIMEOUT_S (the deadline
    passed to pytesseract itself), enforced regardless of whether this
    opportunistic path fires.
    """
    pids = _find_tesseract_child_pids()
    if not pids:
        return None
    oldest = min(pids)
    try:
        os.kill(oldest, signal.SIGTERM)
        logger.info("ocr_gateway: cancelled call — best-effort SIGTERM to tesseract pid=%d", oldest)
        return oldest
    except ProcessLookupError:
        return None


# ---------------------------------------------------------------------------
# Slot acquisition — shared by the sync/async entry points and by slot()/slot_async()
# ---------------------------------------------------------------------------


def _acquire_slot_blocking(timeout_s: float) -> None:
    acquired = _OCR_SLOTS.acquire(blocking=True, timeout=timeout_s)
    if not acquired:
        raise OcrCapacityExceeded(
            f"OCR at capacity (max={PDFX_OCR_MAX_CONCURRENCY}); "
            f"queue wait of {timeout_s}s elapsed without a free slot",
            retry_after_s=timeout_s,
        )


@contextmanager
def slot(timeout_s: Optional[float] = None) -> Iterator[None]:
    """
    Sync contextmanager for callers running OCR OUT OF PROCESS (brief §5.1) —
    e.g. ExtractTablesUseCase's ProcessPoolExecutor(max_workers=1) path.
    Acquire in the PARENT before dispatch so the cross-process bound composes
    with this in-process one. Blocks the calling thread — never call this
    directly from the asyncio event loop thread; use slot_async() there.
    """
    wait = PDFX_OCR_QUEUE_WAIT_S if timeout_s is None else timeout_s
    _acquire_slot_blocking(wait)
    try:
        yield
    finally:
        _OCR_SLOTS.release()


@asynccontextmanager
async def slot_async(timeout_s: Optional[float] = None) -> AsyncIterator[None]:
    """Async counterpart of slot() — acquires off the event loop thread via
    asyncio.to_thread so the (bounded, <= queue-wait-seconds) wait never
    blocks /health."""
    wait = PDFX_OCR_QUEUE_WAIT_S if timeout_s is None else timeout_s
    acquired = await asyncio.to_thread(_OCR_SLOTS.acquire, True, wait)
    if not acquired:
        raise OcrCapacityExceeded(
            f"OCR at capacity (max={PDFX_OCR_MAX_CONCURRENCY}); "
            f"queue wait of {wait}s elapsed without a free slot",
            retry_after_s=wait,
        )
    try:
        yield
    finally:
        _OCR_SLOTS.release()


# ---------------------------------------------------------------------------
# Primary entry points
# ---------------------------------------------------------------------------


def run_image_sync(
    image: Any,
    mode: str,
    *,
    lang: str = TESSERACT_LANG,
    config: str = TESSERACT_PSM6_CONFIG,
    output_type: Optional[str] = None,
    deadline_s: Optional[int] = None,
    queue_wait_s: Optional[float] = None,
) -> Union[str, Any]:
    """
    Sync entry point — for callers already running on an offloaded thread
    (none of the six historical call sites ran on the event loop thread
    directly; all were already inside asyncio.to_thread / ProcessPoolExecutor /
    PekEngineAdapter's own ThreadPoolExecutor(1)).

    mode: "string" (pytesseract.image_to_string) or "data" (image_to_data;
    output_type is then REQUIRED — one of OUTPUT_DICT / OUTPUT_DATAFRAME).
    """
    deadline = PDFX_OCR_PAGE_TIMEOUT_S if deadline_s is None else deadline_s
    queue_wait = PDFX_OCR_QUEUE_WAIT_S if queue_wait_s is None else queue_wait_s

    _acquire_slot_blocking(queue_wait)
    call_id = uuid.uuid4().hex
    with _inflight_lock:
        _inflight_calls[call_id] = time.monotonic()

    try:
        future = _OCR_POOL.submit(_exec_tesseract, image, mode, lang, config, output_type, deadline)
        try:
            return future.result(timeout=deadline + _BACKSTOP_GRACE_S)
        except FuturesTimeoutError as exc:
            _reap_oldest_tesseract_child_best_effort()
            raise OcrDeadlineExceeded(
                f"OCR call exceeded outer backstop of {deadline + _BACKSTOP_GRACE_S}s "
                f"(inner pytesseract deadline was {deadline}s)"
            ) from exc
        except RuntimeError as exc:
            if _is_deadline_error(exc):
                raise OcrDeadlineExceeded(str(exc)) from exc
            raise
    finally:
        with _inflight_lock:
            _inflight_calls.pop(call_id, None)
        _OCR_SLOTS.release()


async def run_image(
    image: Any,
    mode: str,
    *,
    lang: str = TESSERACT_LANG,
    config: str = TESSERACT_PSM6_CONFIG,
    output_type: Optional[str] = None,
    deadline_s: Optional[int] = None,
    queue_wait_s: Optional[float] = None,
) -> Union[str, Any]:
    """
    Async entry point — the primary way this service reaches tesseract from a
    coroutine (extraction_engine.py's hot /extract path). On CancelledError
    (client disconnect cancels the awaiting task), best-effort-reaps the
    oldest live tesseract child before re-raising; the guaranteed bound on
    slot-hold time either way is `deadline_s` (see module docstring).
    """
    deadline = PDFX_OCR_PAGE_TIMEOUT_S if deadline_s is None else deadline_s
    queue_wait = PDFX_OCR_QUEUE_WAIT_S if queue_wait_s is None else queue_wait_s

    acquired = await asyncio.to_thread(_OCR_SLOTS.acquire, True, queue_wait)
    if not acquired:
        raise OcrCapacityExceeded(
            f"OCR at capacity (max={PDFX_OCR_MAX_CONCURRENCY}); "
            f"queue wait of {queue_wait}s elapsed without a free slot",
            retry_after_s=queue_wait,
        )

    call_id = uuid.uuid4().hex
    with _inflight_lock:
        _inflight_calls[call_id] = time.monotonic()

    loop = asyncio.get_running_loop()
    try:
        fut = loop.run_in_executor(_OCR_POOL, _exec_tesseract, image, mode, lang, config, output_type, deadline)
        try:
            return await fut
        except asyncio.CancelledError:
            _reap_oldest_tesseract_child_best_effort()
            raise
        except RuntimeError as exc:
            if _is_deadline_error(exc):
                raise OcrDeadlineExceeded(str(exc)) from exc
            raise
    finally:
        with _inflight_lock:
            _inflight_calls.pop(call_id, None)
        _OCR_SLOTS.release()
