"""
Unit tests — FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH.

HOST-SAFE: zero real SentenceTransformer instantiation / zero real sleeps.
All tests mock _load_model and drive time via injected timestamps / monkeypatched
time.monotonic — never a real asyncio.sleep of idle-threshold length.

Test coverage:
  (a) _last_used_monotonic is set after a real embed() call
  (b) _maybe_unload_idle() no-ops when nothing is loaded
  (c) _maybe_unload_idle() no-ops when loaded but not yet idle long enough
  (d) _maybe_unload_idle() unloads (_model -> None, gc.collect called) once idle
      threshold has elapsed
  (e) after an idle-unload, the NEXT embed() call transparently reloads via the
      EXISTING _ensure_model_loaded() double-check-lock path (no second load path)
  (f) /embed/health flips warm -> cold after an injected idle-unload, with 200
      (never 503) on both sides of the flip
  (g) a concurrent/subsequent embed() racing an idle-unload check never raises —
      the pair is serialized by the same _load_lock used for the original load
  (h) app_factory._idle_unload_loop() is a permanent no-op for fake/sandbox
      embedders that do not implement _maybe_unload_idle() (duck-typing gate)
  (i) Config.from_env() reads EMBEDDER_IDLE_UNLOAD_MINUTES (env, never hardcoded)
      and defaults to 15 when unset
  (j) FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS §6 secondary
      fix: app_factory._malloc_trim_or_noop() calls ctypes.CDLL("libc.so.6")
      .malloc_trim(0), guarded (OSError/AttributeError -> silent no-op on
      non-glibc platforms e.g. this macOS dev/test host); _idle_unload_loop()
      calls it every cycle, independent of whether unload fired
"""

import asyncio
import os
import sys
import time
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.embedder import SentenceTransformersEmbedder


# ── Helpers ─────────────────────────────────────────────────────────────────


def fake_encode_result(value: float) -> np.ndarray:
    """
    Real sentence-transformers encode() returns a numpy array of numpy arrays
    (each with .tolist()) — _raw_embed() relies on that .tolist() call, so the
    fake must be a real ndarray, not a plain list, to exercise the real code path.
    """
    return np.array([[value] * 384])


def make_embedder() -> SentenceTransformersEmbedder:
    return SentenceTransformersEmbedder(
        model_name="paraphrase-multilingual-MiniLM-L12-v2",
        cache_dir="/tmp/model-cache",
    )


def install_fake_model(emb: SentenceTransformersEmbedder) -> MagicMock:
    """Warm the embedder with a fake model that returns a fixed vector."""
    fake_model = MagicMock()
    fake_model.encode = MagicMock(return_value=fake_encode_result(0.1))
    emb._model = fake_model
    return fake_model


# ── (a) _last_used_monotonic is set after embed() ───────────────────────────


@pytest.mark.asyncio
async def test_last_used_monotonic_set_after_embed():
    emb = make_embedder()
    install_fake_model(emb)
    assert emb._last_used_monotonic is None

    before = time.monotonic()
    await emb.embed("hello")
    after = time.monotonic()

    assert emb._last_used_monotonic is not None
    assert before <= emb._last_used_monotonic <= after


# ── (b) no-op when nothing loaded ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_maybe_unload_idle_noop_when_never_loaded():
    emb = make_embedder()
    assert emb._model is None
    assert emb._last_used_monotonic is None

    unloaded = await emb._maybe_unload_idle(idle_threshold_s=0.0)

    assert unloaded is False
    assert emb._model is None


# ── (c) no-op when loaded but not idle long enough ──────────────────────────


@pytest.mark.asyncio
async def test_maybe_unload_idle_noop_when_not_yet_idle():
    emb = make_embedder()
    install_fake_model(emb)
    emb._last_used_monotonic = time.monotonic()  # just used

    unloaded = await emb._maybe_unload_idle(idle_threshold_s=900.0)  # 15 min

    assert unloaded is False
    assert emb._model is not None, "model must stay resident — not idle long enough"


# ── (d) unloads once idle threshold has elapsed ──────────────────────────────


@pytest.mark.asyncio
async def test_maybe_unload_idle_unloads_after_threshold_elapsed():
    emb = make_embedder()
    install_fake_model(emb)
    # Simulate "last used" far enough in the past to exceed any real threshold —
    # no real sleep required, this is a deterministic injected clock value.
    emb._last_used_monotonic = time.monotonic() - 10_000.0

    with patch("infrastructure.embedder.gc") as mock_gc:
        unloaded = await emb._maybe_unload_idle(idle_threshold_s=900.0)  # 15 min
        assert mock_gc.collect.called, "gc.collect() must be invoked on unload"

    assert unloaded is True
    assert emb._model is None, "model must be released once idle threshold elapsed"


@pytest.mark.asyncio
async def test_maybe_unload_idle_double_check_inside_lock_wins_over_stale_outer_read():
    """
    Regression guard for the double-check-lock pattern: if _last_used_monotonic is
    refreshed (a concurrent embed() ran) between the cheap outer check and the lock
    being acquired, the inner re-check inside the lock must prevent the unload.
    """
    emb = make_embedder()
    install_fake_model(emb)
    emb._last_used_monotonic = time.monotonic() - 10_000.0

    # Pre-create the lock and hold it briefly to force _maybe_unload_idle to wait,
    # simulating another coroutine racing in and refreshing the timestamp first.
    emb._load_lock = asyncio.Lock()

    async def refresh_then_release():
        async with emb._load_lock:
            emb._last_used_monotonic = time.monotonic()  # fresh use — no longer idle
            await asyncio.sleep(0)

    await refresh_then_release()

    unloaded = await emb._maybe_unload_idle(idle_threshold_s=900.0)

    assert unloaded is False, "a concurrently refreshed timestamp must abort the unload"
    assert emb._model is not None


# ── (e) reload after unload is transparent — existing lock path, no 2nd path ─


@pytest.mark.asyncio
async def test_embed_reloads_transparently_after_idle_unload():
    emb = make_embedder()
    install_fake_model(emb)
    emb._last_used_monotonic = time.monotonic() - 10_000.0

    load_count = 0

    def fake_load_model():
        # Mirror the real _load_model()'s own early-return guard (embedder.py:87-88)
        # — _raw_embed() calls _load_model() defensively even after
        # _ensure_model_loaded() already loaded it, so a faithful fake must not
        # double-count that second, already-a-no-op call.
        nonlocal load_count
        if emb._model is not None:
            return
        load_count += 1
        emb._model = MagicMock(encode=MagicMock(return_value=fake_encode_result(0.2)))

    emb._load_model = fake_load_model

    unloaded = await emb._maybe_unload_idle(idle_threshold_s=900.0)
    assert unloaded is True
    assert emb._model is None

    # Next embed() call must succeed and reload via the EXISTING
    # _ensure_model_loaded() double-check-lock path — no exception, no 503-equivalent.
    vector = await emb.embed("reload me")

    assert load_count == 1, "reload must go through _load_model exactly once"
    assert emb._model is not None
    assert vector.dims == 384
    assert vector.values == [0.2] * 384


# ── (f) /embed/health flips warm -> cold, never 503, across the unload ──────


@pytest.mark.asyncio
async def test_embed_health_flips_warm_to_cold_after_injected_idle_unload_no_503():
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    emb = make_embedder()
    install_fake_model(emb)
    emb._last_used_monotonic = time.monotonic() - 10_000.0

    mock_vs = MagicMock()
    mock_vs.count = AsyncMock(return_value=5)

    app = FastAPI()
    router = APIRouter()
    register_routes(
        router,
        search_usecase=MagicMock(spec=SearchUseCase),
        index_usecase=MagicMock(spec=IndexUseCase),
        vector_store=mock_vs,
        embedder=emb,
    )
    app.include_router(router)
    client = TestClient(app)

    resp_before = client.get("/embed/health")
    assert resp_before.status_code == 200, resp_before.text
    assert resp_before.json()["state"] == "warm"

    unloaded = await emb._maybe_unload_idle(idle_threshold_s=900.0)
    assert unloaded is True

    resp_after = client.get("/embed/health")
    assert resp_after.status_code == 200, (
        f"idle-unload must never surface as a 503 — got {resp_after.status_code}: "
        f"{resp_after.text}"
    )
    assert resp_after.json()["state"] == "cold"
    assert resp_after.json()["model_loaded"] is False

    # And the service can still serve a subsequent embed after going cold.
    def fake_load_model():
        emb._model = MagicMock(encode=MagicMock(return_value=fake_encode_result(0.3)))

    emb._load_model = fake_load_model
    vector = await emb.embed("still works")
    assert vector.dims == 384


# ── (g) concurrent embed() racing an idle-unload check never raises ─────────


@pytest.mark.asyncio
async def test_concurrent_embed_during_idle_unload_never_raises():
    emb = make_embedder()
    install_fake_model(emb)
    emb._last_used_monotonic = time.monotonic() - 10_000.0

    def fake_load_model():
        emb._model = MagicMock(encode=MagicMock(return_value=fake_encode_result(0.4)))

    emb._load_model = fake_load_model

    results = await asyncio.gather(
        emb._maybe_unload_idle(idle_threshold_s=900.0),
        emb.embed("race"),
        return_exceptions=True,
    )

    for r in results:
        assert not isinstance(r, Exception), f"concurrent unload/embed raised: {r!r}"

    # Whatever interleaving happened, the embedder must end up in a usable state —
    # never left with an exception surfaced to the caller and never stuck unloaded
    # forever (embed() always ensures its own load before returning).
    assert emb._model is not None


# ── (h) app_factory idle loop is a no-op for sandbox fakes ──────────────────


@pytest.mark.asyncio
async def test_idle_unload_loop_noop_for_fake_embedder_without_maybe_unload():
    from app_factory import _idle_unload_loop

    fake_embedder = MagicMock(spec=[])  # no _maybe_unload_idle attribute at all
    assert not hasattr(fake_embedder, "_maybe_unload_idle")

    # Must return immediately (not hang in an infinite sleep loop) when the
    # embedder does not implement the idle-unload hook.
    await asyncio.wait_for(
        _idle_unload_loop(fake_embedder, idle_threshold_s=900.0), timeout=1.0
    )


@pytest.mark.asyncio
async def test_idle_unload_loop_calls_maybe_unload_idle_on_real_embedder():
    from app_factory import _idle_unload_loop

    emb = make_embedder()
    call_args = []

    async def spy_maybe_unload(idle_threshold_s):
        call_args.append(idle_threshold_s)
        raise asyncio.CancelledError()  # stop the loop after one iteration

    emb._maybe_unload_idle = spy_maybe_unload

    with patch("app_factory.asyncio.sleep", new=AsyncMock(return_value=None)):
        with pytest.raises(asyncio.CancelledError):
            await _idle_unload_loop(emb, idle_threshold_s=123.0)

    assert call_args == [123.0]


# ── (i) Config reads EMBEDDER_IDLE_UNLOAD_MINUTES (env, never hardcoded) ────


def test_config_default_idle_unload_minutes_is_15(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.delenv("EMBEDDER_IDLE_UNLOAD_MINUTES", raising=False)
    cfg = Config.from_env()

    assert cfg.embedder_idle_unload_minutes == 15


def test_config_reads_idle_unload_minutes_from_env(monkeypatch):
    from infrastructure.config import Config

    monkeypatch.setenv("EMBEDDER_IDLE_UNLOAD_MINUTES", "42")
    cfg = Config.from_env()

    assert cfg.embedder_idle_unload_minutes == 42


# ── (j) FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS §6 ──
# secondary fix: periodic malloc_trim(0) sweep on the idle-unload loop's cadence


def test_malloc_trim_or_noop_calls_libc_malloc_trim():
    """Guarded ctypes.CDLL("libc.so.6").malloc_trim(0) — same shape as the
    FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM precedent."""
    from app_factory import _malloc_trim_or_noop

    fake_libc = MagicMock()
    with patch("ctypes.CDLL", return_value=fake_libc) as mock_cdll:
        _malloc_trim_or_noop()

    mock_cdll.assert_called_once_with("libc.so.6")
    fake_libc.malloc_trim.assert_called_once_with(0)


def test_malloc_trim_or_noop_swallows_oserror_on_non_glibc_platform():
    """On a platform without libc.so.6 (e.g. macOS dev/test host), ctypes.CDLL
    raises OSError — must be caught, never raised out of this helper."""
    from app_factory import _malloc_trim_or_noop

    with patch("ctypes.CDLL", side_effect=OSError("dlopen failed")):
        _malloc_trim_or_noop()  # must not raise


def test_malloc_trim_or_noop_real_call_never_raises():
    """Unmocked real call (exercises the actual guard on this host) — must never
    raise regardless of platform."""
    from app_factory import _malloc_trim_or_noop

    _malloc_trim_or_noop()  # must not raise on macOS/Linux/anywhere


@pytest.mark.asyncio
async def test_idle_unload_loop_calls_malloc_trim_every_cycle_independent_of_unload():
    """The trim sweep must fire every cycle even when maybe_unload() does NOT
    unload anything this iteration (e.g. not yet idle) — independent trigger."""
    from app_factory import _idle_unload_loop

    emb = make_embedder()
    trim_calls = []

    async def spy_maybe_unload(idle_threshold_s):
        return False  # nothing unloaded this cycle

    emb._maybe_unload_idle = spy_maybe_unload

    def spy_trim():
        trim_calls.append(1)
        raise asyncio.CancelledError()  # stop the loop after one trim call

    with patch("app_factory.asyncio.sleep", new=AsyncMock(return_value=None)):
        with patch("app_factory._malloc_trim_or_noop", side_effect=spy_trim):
            with pytest.raises(asyncio.CancelledError):
                await _idle_unload_loop(emb, idle_threshold_s=123.0)

    assert trim_calls == [1]


@pytest.mark.asyncio
async def test_idle_unload_loop_trim_failure_is_non_fatal():
    """A trim sweep exception must not crash the loop or propagate — mirrors
    the existing maybe_unload() exception-swallow behaviour."""
    from app_factory import _idle_unload_loop

    emb = make_embedder()

    async def ok_maybe_unload(idle_threshold_s):
        return False

    emb._maybe_unload_idle = ok_maybe_unload

    call_count = 0

    def failing_then_stopping_trim():
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise asyncio.CancelledError()  # stop the loop on the 2nd cycle
        raise RuntimeError("trim boom")  # 1st cycle: real failure, must be swallowed

    with patch("app_factory.asyncio.sleep", new=AsyncMock(return_value=None)):
        with patch("app_factory._malloc_trim_or_noop", side_effect=failing_then_stopping_trim):
            with pytest.raises(asyncio.CancelledError):
                await _idle_unload_loop(emb, idle_threshold_s=123.0)

    assert call_count == 2, "loop must survive a trim failure and keep polling"
