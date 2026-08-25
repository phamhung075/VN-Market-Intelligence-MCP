"""
infrastructure/ocr_gateway.py — FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT

THE OCR gateway: one process-global concurrency bound, subprocess lifetime
bound to a wall-clock deadline, bookkeeping published alongside OS ground
truth. Full root cause + design rationale (NOT duplicated here — this
docstring is a pointer, not the source of truth):
    docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md
    (§5 = the design this module implements; §CORRECTION 2026-08-24 = the
    inflight-mismatch-grace follow-up below).

This module is the single authority. DDD layer: infrastructure (owns
pytesseract, subprocess, /proc). No imports from application/ or interface/
(Fence-A, matching generic_md_table/extractor.py:61). Env-driven config
(PDFX_OCR_MAX_CONCURRENCY and friends) lives in
infrastructure/ocr_gateway_config.py — imported below into THIS module's
namespace on purpose: every function that reads a constant stays in this
file, so `monkeypatch.setattr(ocr_gateway, "PDFX_OCR_QUEUE_WAIT_S", 0.2)`
(__tests__/test_ocr_concurrency_invariant.py) keeps working unchanged.

API (brief §5):
    _OCR_SLOTS / _OCR_POOL   module-global BoundedSemaphore(N) + private
                 ThreadPoolExecutor(N) — OCR never touches the shared asyncio
                 default executor, so it cannot head-of-line-block clients
                 that legitimately use asyncio.to_thread() for fast I/O.
    run_image()  async entry point — extraction_engine.py's hot /extract
                 path (the only caller already on the event loop thread).
    run_image_sync()  sync entry point — the other five historical call
                 sites, all already inside an offloaded thread
                 (asyncio.to_thread / ProcessPoolExecutor / PekEngineAdapter's
                 own ThreadPoolExecutor(1)).
    slot() / slot_async()  contextmanagers for callers that run OCR OUT OF
                 PROCESS (ExtractTablesUseCase's ProcessPoolExecutor path).
                 Acquired in the PARENT before dispatch, so the cross-process
                 bound composes with this in-process one instead of living in
                 two places where they provably cannot (brief §5.4).
    OcrCapacityExceededError / OcrDeadlineExceededError (domain/errors.py,
                 imported here — infra->domain is a valid DDD direction).
    inflight() / reap_orphans()  observability + shutdown reaper (brief §5.2).

Scope note (full accounting — see the brief's "Scope note" + task close-out
report): four of six historical pytesseract call sites are rewired through
this gateway (extraction_engine.py, ocr_backends.py, ocr_adapter.py,
generic_md_table/unit_ocr.py). Two are deliberately NOT rewired — documented
exceptions, not silent omissions:
    ocr_worker.py runs INSIDE a ProcessPoolExecutor CHILD process and cannot
        see this module's in-memory semaphore — the bound is composed at the
        PARENT via slot_async() in extract_tables_usecase.py instead.
    generic_md_table/extractor.py's `_process_page` takes pytesseract/Output
        as explicit params, a direct test seam for ~40 tests — rewiring it
        is a separate follow-up (recommend PO mint it), not done here.

Follow-up (2026-08-24, FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH):
inflight()'s ERROR-level mismatch alarm now gates on
PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S (rationale: ocr_gateway_config.py, next
to that constant) instead of firing on every momentary setup/teardown skew;
full root-cause + live evidence in the brief's §CORRECTION, not repeated
here. reap_orphans()/_reap_oldest_tesseract_child_best_effort() and the
acquire/release bracketing in run_image()/run_image_sync() are unchanged.
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
from infrastructure.ocr_gateway_config import (
    OUTPUT_DATAFRAME,
    OUTPUT_DICT,
    PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S,
    PDFX_OCR_MAX_CONCURRENCY,
    PDFX_OCR_PAGE_TIMEOUT_S,
    PDFX_OCR_QUEUE_WAIT_S,
    _BACKSTOP_GRACE_S,
)
from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

logger = logging.getLogger(__name__)

# NOTE: the five names imported above are deliberately kept as plain
# top-level bindings in THIS module's namespace (not read via
# `ocr_gateway_config.NAME`) — every function below that consumes one of
# them (run_image, run_image_sync, inflight, _acquire_slot_blocking, ...)
# resolves the bare name via ocr_gateway.py's own globals, which is exactly
# what `monkeypatch.setattr(ocr_gateway, "PDFX_OCR_PAGE_TIMEOUT_S", 0)` in
# __tests__/test_ocr_concurrency_invariant.py patches. See
# infrastructure/ocr_gateway_config.py's own docstring for the full rule.

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

    if mode == "osd":
        # FIX-PDFX-OCR-ORIENTATION: page-orientation probe (tesseract --psm 0
        # against the `osd` traineddata). Routed through the gateway like every
        # other tesseract invocation so it is covered by the same concurrency
        # bound, wall-clock deadline and orphan reaping — an OSD probe forks a
        # tesseract child exactly like image_to_string does.
        # Callers pass lang="osd"; `image_to_osd` has no meaningful
        # DATAFRAME shape, so DICT is the only supported output_type.
        return pytesseract.image_to_osd(
            image,
            lang=lang,
            config=config,
            timeout=deadline_s,
            output_type=pytesseract.Output.DICT,
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
    away. `semaphore != os_children` is logged at ERROR once it has persisted
    past PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S — see the grace-window rationale
    on that constant's definition above (FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-
    DIVERGES-OS-TRUTH). A mismatch still inside grace is expected (the
    normal setup/teardown skew around each tesseract subprocess call) and is
    logged at DEBUG instead — bookkeeping is still published unchanged either
    way, only the alarm level is gated on persistence.
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
        #
        # mismatch_age_s is None exactly when held==0 (no tracked call at
        # all) — an OS child with zero bookkeeping to explain it is the
        # dangerous direction, so it gets ZERO grace (treated as already
        # past grace below, no legitimate call to attribute the delay to).
        mismatch_age_s = (
            time.monotonic() - oldest_started if oldest_started is not None else None
        )
        if mismatch_age_s is None or mismatch_age_s >= PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S:
            logger.error(
                "ocr_gateway.inflight: semaphore=%d != os_children=%d — bookkeeping "
                "disagrees with OS ground truth for >=%.1fs (grace=%.1fs) — this is a bug",
                held,
                os_children,
                mismatch_age_s if mismatch_age_s is not None else 0.0,
                PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S,
            )
        else:
            logger.debug(
                "ocr_gateway.inflight: semaphore=%d != os_children=%d within "
                "%.2fs/%.1fs setup/teardown grace — expected transient, not logged as a bug",
                held,
                os_children,
                mismatch_age_s,
                PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S,
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

    mode: "string" (pytesseract.image_to_string), "data" (image_to_data;
    output_type is then REQUIRED — one of OUTPUT_DICT / OUTPUT_DATAFRAME), or
    "osd" (image_to_osd; always DICT — the orientation probe, see
    infrastructure/ocr_orientation.py).
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
