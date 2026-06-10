"""
Unit tests — GFD-13: lazy-load embedding model.

HOST-SAFE: zero real SentenceTransformer instantiation.
All tests mock _load_model or the sentence_transformers import.

Test coverage:
  (a) startup does NOT load the model — _model is None after __init__
  (b) cold /embed/health returns 200 model_loaded:false
  (c) lazy load is invoked exactly once under concurrent first-calls
  (d) /embed/health NEVER calls _ensure_model_loaded()
  (e) _load_error set → 503 from /embed/health
  (f) embedder=None → 503 from /embed/health
"""

import asyncio
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from infrastructure.embedder import SentenceTransformersEmbedder


# ── Helpers ─────────────────────────────────────────────────────────────────


def make_embedder() -> SentenceTransformersEmbedder:
    return SentenceTransformersEmbedder(
        model_name="paraphrase-multilingual-MiniLM-L12-v2",
        cache_dir="/tmp/model-cache",
    )


# ── (a) Startup does NOT load the model ─────────────────────────────────────


def test_init_model_is_none():
    """After __init__, _model must be None (no eager load)."""
    emb = make_embedder()
    assert emb._model is None, "_model should be None after __init__ (lazy-load)"


def test_init_load_lock_is_none():
    """After __init__, _load_lock is None (created lazily in async context)."""
    emb = make_embedder()
    assert emb._load_lock is None


def test_init_load_error_is_none():
    """After __init__, _load_error is None."""
    emb = make_embedder()
    assert emb._load_error is None


@pytest.mark.asyncio
async def test_initialize_is_noop():
    """initialize() must NOT load the model — it is a no-op."""
    emb = make_embedder()
    await emb.initialize()
    assert emb._model is None, "initialize() must not set _model (lazy-load no-op)"


# ── (b) Cold /embed/health → 200 model_loaded:false ─────────────────────────


@pytest.mark.asyncio
async def test_embed_health_cold_returns_200_model_loaded_false():
    """
    Cold state: embedder._model is None.
    /embed/health must return HTTP 200 with model_loaded:false, state:cold.
    NEVER 503 for cold state.
    """
    import json as _json
    from fastapi import APIRouter
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    emb = make_embedder()
    # Cold: model not loaded
    assert emb._model is None

    mock_vector_store = MagicMock()
    mock_vector_store.count = AsyncMock(return_value=42)

    # Minimal mocked usecases (not called in this test)
    mock_search = MagicMock(spec=SearchUseCase)
    mock_index = MagicMock(spec=IndexUseCase)

    app = FastAPI()
    router = APIRouter()
    register_routes(
        router,
        search_usecase=mock_search,
        index_usecase=mock_index,
        vector_store=mock_vector_store,
        embedder=emb,
    )
    app.include_router(router)

    client = TestClient(app)
    resp = client.get("/embed/health")

    assert resp.status_code == 200, f"Expected 200 cold, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is False
    assert body["state"] == "cold"
    assert body["index_size"] == 42
    assert "model_name" in body


@pytest.mark.asyncio
async def test_embed_health_cold_never_calls_ensure_model_loaded():
    """
    /embed/health MUST NOT trigger a load — purely passive.
    We verify by checking _ensure_model_loaded is never awaited.
    """
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    emb = make_embedder()

    # Patch _ensure_model_loaded to detect if called
    ensure_called = []

    async def _spy_ensure():
        ensure_called.append(True)

    emb._ensure_model_loaded = _spy_ensure

    mock_vs = MagicMock()
    mock_vs.count = AsyncMock(return_value=0)

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
    resp = client.get("/embed/health")

    assert resp.status_code == 200
    assert ensure_called == [], "_ensure_model_loaded must NOT be called from /embed/health"


# ── (c) Concurrent first-calls invoke lazy load exactly once ─────────────────


@pytest.mark.asyncio
async def test_ensure_model_loaded_called_exactly_once_under_concurrency():
    """
    Multiple concurrent calls to _ensure_model_loaded() must result in
    _load_model() being called exactly once (double-check lock pattern).
    """
    emb = make_embedder()
    load_count = 0

    def fake_load_model():
        nonlocal load_count
        load_count += 1
        # Simulate slow load
        import time
        time.sleep(0.01)
        emb._model = MagicMock()  # mark as loaded

    emb._load_model = fake_load_model

    # Launch 10 concurrent callers
    await asyncio.gather(*[emb._ensure_model_loaded() for _ in range(10)])

    assert load_count == 1, f"_load_model() called {load_count} times, expected exactly 1"
    assert emb._model is not None


@pytest.mark.asyncio
async def test_ensure_model_loaded_fast_path_after_first_load():
    """After model is loaded, subsequent calls skip the lock entirely (fast path)."""
    emb = make_embedder()
    fake_model = MagicMock()
    emb._model = fake_model  # pre-loaded

    lock_acquired = []
    original_init_lock = asyncio.Lock

    # Should not even create a lock if model is already set
    called = False

    async def patched_ensure():
        nonlocal called
        called = True
        # Call original
        await SentenceTransformersEmbedder._ensure_model_loaded(emb)

    await patched_ensure()

    # Lock should still be None because fast path returned before lazy-init
    assert emb._load_lock is None, "Lock must not be created when fast path exits early"


# ── (d) _load_error → 503 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_embed_health_load_error_returns_503():
    """If _load_error is set, /embed/health must return 503."""
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    emb = make_embedder()
    emb._load_error = RuntimeError("OOM during load")

    mock_vs = MagicMock()
    mock_vs.count = AsyncMock(return_value=0)

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
    resp = client.get("/embed/health")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "error"
    assert "model load failed" in body["reason"]


# ── (e) embedder=None → 503 ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_embed_health_no_embedder_returns_503():
    """embedder=None (wiring bug) must return 503."""
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    app = FastAPI()
    router = APIRouter()
    register_routes(
        router,
        search_usecase=MagicMock(spec=SearchUseCase),
        index_usecase=MagicMock(spec=IndexUseCase),
        vector_store=None,
        embedder=None,
    )
    app.include_router(router)

    client = TestClient(app)
    resp = client.get("/embed/health")

    assert resp.status_code == 503
    body = resp.json()
    assert body["reason"] == "embedder not wired"


# ── (f) Warm /embed/health → 200 model_loaded:true ──────────────────────────


@pytest.mark.asyncio
async def test_embed_health_warm_returns_200_model_loaded_true():
    """Warm state: embedder._model is set → 200 model_loaded:true, state:warm."""
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from application.usecases import SearchUseCase, IndexUseCase

    emb = make_embedder()
    fake_model = MagicMock()
    fake_model.encode = MagicMock(return_value=None)  # smoke test stub
    emb._model = fake_model  # warm state

    mock_vs = MagicMock()
    mock_vs.count = AsyncMock(return_value=7)

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
    resp = client.get("/embed/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert body["state"] == "warm"
    assert body["index_size"] == 7
    assert "model_name" in body


# ── (g) _ensure_model_loaded propagates error + sets _load_error ─────────────


@pytest.mark.asyncio
async def test_ensure_model_loaded_sets_load_error_on_failure():
    """If _load_model raises, _load_error is set and subsequent calls re-raise."""
    emb = make_embedder()

    def boom():
        raise RuntimeError("disk full")

    emb._load_model = boom

    with pytest.raises(RuntimeError, match="disk full"):
        await emb._ensure_model_loaded()

    assert emb._load_error is not None
    assert "disk full" in str(emb._load_error)

    # Second call must re-raise via _load_error path (not attempt reload)
    with pytest.raises(RuntimeError, match="embedding model failed to load"):
        await emb._ensure_model_loaded()
