"""
Python sandbox runner — scenario JSON -> trace JSON.
Zero ML/DB framework imports for primitive/module tiers (stdlib only).
Service tier: FastAPI TestClient + injected fake adapters (zero model/LanceDB).

Invoke:
  python -m sandbox --service=rag-service --tier=primitive --scenario=<path>
  python -m sandbox --service=rag-service --tier=module   --scenario=<path>
  python -m sandbox --service=rag-service --tier=service  --scenario=<path>
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import inspect
import json
import math
import os
import re
import sys
import time
from types import ModuleType
from typing import Any, Optional

# ---------------------------------------------------------------------------
# G7 (Phase 2 P2-G7): Env-audit — HARD FAIL on forbidden credential vars.
# If any forbidden key is present, runner exits NON-ZERO and aborts.
# HF_HUB_OFFLINE is NOT forbidden — it is a safety flag (R-5), not a credential.
# AC-2: regex declared as module-level constant (not hardcoded inline).
# P3-A (Phase 3): service tier is covered by the SAME gate (AC-6 of P3-A spec).
# ---------------------------------------------------------------------------
_FORBIDDEN_ENV_REGEX = re.compile(
    r"^(DB_PATH|DB_[A-Z][A-Z0-9_]*|LANCEDB_[A-Z0-9_]*|HF_TOKEN"
    r"|HUGGINGFACE_[A-Z0-9_]*|OPENAI_API_KEY|EMBEDDING_MODEL|DATABASE_URL"
    r"|API_KEY|API_KEY_[A-Z0-9_]*|SECRET|SECRET_[A-Z0-9_]*"
    r"|TOKEN|TOKEN_[A-Z0-9_]*|PASSWORD|PASSWORD_[A-Z0-9_]*)$"
)

# AC-3: HF_HUB_OFFLINE is explicitly allowed — do NOT flag it.
_ENV_ALLOWLIST = {"HF_HUB_OFFLINE"}


def _audit_env() -> list[str]:
    """Return list of forbidden env keys that are currently set.

    Matches against _FORBIDDEN_ENV_REGEX. Keys in _ENV_ALLOWLIST are
    never flagged even if they match the pattern (HF_HUB_OFFLINE=1 is
    a safety flag per R-5, not a credential).
    """
    found: list[str] = []
    for key in os.environ:
        if key in _ENV_ALLOWLIST:
            continue
        if _FORBIDDEN_ENV_REGEX.match(key):
            found.append(key)
    return found


# ---------------------------------------------------------------------------
# Schema validation (primitive/module tier)
# ---------------------------------------------------------------------------
_REQUIRED_SCENARIO_KEYS = {"primitive", "input", "expected_output"}
_REQUIRED_SERVICE_KEYS = {"tier", "scenario", "endpoint", "method", "request_body",
                          "expected_status", "expected_response_subset"}


def _validate_schema(scenario: dict[str, Any]) -> None:
    missing = _REQUIRED_SCENARIO_KEYS - scenario.keys()
    if missing:
        raise ValueError(f"Scenario missing required keys: {missing}")
    if not isinstance(scenario["input"], dict):
        raise TypeError("scenario.input must be a dict")
    if not isinstance(scenario["expected_output"], dict):
        raise TypeError("scenario.expected_output must be a dict")


def _validate_service_schema(scenario: dict[str, Any]) -> None:
    missing = _REQUIRED_SERVICE_KEYS - scenario.keys()
    if missing:
        raise ValueError(f"Service scenario missing required keys: {missing}")
    if scenario.get("tier") != "service":
        raise ValueError(f"Expected tier='service', got {scenario.get('tier')!r}")


# ---------------------------------------------------------------------------
# Primitive loader
# ---------------------------------------------------------------------------
def _resolve_service_root(service: str) -> str:
    """
    Return the absolute path to the service root.
    AC-6: parameterized by --service so pdf-extractor can reuse this runner.
    """
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # e.g. apps/rag-service/ — go up two more levels to apps/, then join service name
    apps_dir = os.path.dirname(here)
    return os.path.join(apps_dir, service)


def _load_primitive(service: str, tier: str, primitive_name: str) -> ModuleType:
    """
    Inject sys.path and import the primitive module via importlib.
    AC-7: importlib only — no pip packages needed.
    Module path: domain/primitive/<name>/<name>.py -> domain.primitive.<name>.<name>
    For tier=module: domain/module/<name>/module.py -> domain.module.<name>.module
    """
    service_root = _resolve_service_root(service)
    if service_root not in sys.path:
        sys.path.insert(0, service_root)

    if tier == "primitive":
        module_path = f"domain.primitive.{primitive_name}.{primitive_name}"
    elif tier == "module":
        module_path = f"domain.module.{primitive_name}.module"
    else:
        raise ValueError(f"Unknown tier: {tier!r}. Expected 'primitive' or 'module'.")

    try:
        return importlib.import_module(module_path)
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            f"Could not import {module_path!r} from {service_root!r}. "
            f"Ensure the primitive exists. Original error: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Diff computation
# ---------------------------------------------------------------------------
def _compute_diff(actual: dict[str, Any], expected: dict[str, Any]) -> list[dict[str, Any]]:
    """Return key-level diffs between actual and expected output."""
    diffs: list[dict[str, Any]] = []
    all_keys = set(actual) | set(expected)
    for key in sorted(all_keys):
        a_val = actual.get(key, "<MISSING>")
        e_val = expected.get(key, "<MISSING>")
        if a_val != e_val:
            # Float near-equality check (tolerance 1e-4)
            if isinstance(a_val, float) and isinstance(e_val, float):
                if abs(a_val - e_val) < 1e-4:
                    continue
            diffs.append({"key": key, "actual": a_val, "expected": e_val})
    return diffs


# ---------------------------------------------------------------------------
# Core runner (primitive / module tier)
# ---------------------------------------------------------------------------
def _run_scenario(scenario: dict[str, Any], service: str, tier: str) -> dict[str, Any]:
    """
    Execute a single scenario. Returns trace dict.
    AC-3: trace = {passed, primitive, actual, expected, diff, elapsed_ms}
    """
    primitive_name: str = scenario["primitive"]
    inputs: dict[str, Any] = scenario["input"]
    expected: dict[str, Any] = scenario["expected_output"]

    mod = _load_primitive(service, tier, primitive_name)

    # Locate the callable — look for a function named after the tier convention:
    # primitives expose a single function; modules expose a class or async fn.
    # Primitives: callable named 'main', 'score', 'gate', 'select', 'pack', or same as primitive_name.
    # AC-Determinism: runner passes inputs as kwargs — primitive must be pure.
    fn: Optional[Any] = None
    for candidate in ["main", primitive_name, "score", "gate", "select", "pack", "retrieve"]:
        fn = getattr(mod, candidate, None)
        if callable(fn):
            break
    if fn is None:
        raise AttributeError(
            f"No callable entry point found in {primitive_name!r}. "
            "Primitive must export: main(), score(), gate(), select(), pack(), or retrieve()."
        )

    t0 = time.monotonic()
    actual: dict[str, Any] = {}
    error_info: Optional[str] = None
    try:
        # Support both sync and async entry points (module-tier functions may be async)
        if inspect.iscoroutinefunction(fn):
            result = asyncio.run(fn(**inputs))
        else:
            result = fn(**inputs)
        # Normalise result: if not dict wrap it
        if isinstance(result, dict):
            actual = result
        elif isinstance(result, list):
            actual = {"result": result}
        else:
            # Single return value — wrap using first expected key as name
            if len(expected) == 1:
                key = next(iter(expected))
                actual = {key: result}
            else:
                actual = {"result": result}
    except Exception as exc:  # noqa: BLE001
        error_info = type(exc).__name__
        actual = {"error": error_info}

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    # Check expected_output for error assertion
    if "error" in expected:
        passed = error_info == expected["error"]
    else:
        diff = _compute_diff(actual, expected)
        passed = len(diff) == 0

    diff_out: list[dict[str, Any]]
    if "error" not in expected:
        diff_out = _compute_diff(actual, expected)
    elif passed:
        diff_out = []
    else:
        diff_out = [{"key": "error", "actual": error_info, "expected": expected["error"]}]

    return {
        "passed": passed,
        "primitive": primitive_name,
        "actual": actual,
        "expected": expected,
        "diff": diff_out,
        "elapsed_ms": elapsed_ms,
    }


# ---------------------------------------------------------------------------
# Service-tier fake adapters (P3-A)
# ZERO sentence-transformers model load. ZERO LanceDB. ZERO credentials.
# FakeEmbedder returns deterministic fixed vectors keyed by a lookup dict.
# FakeVectorStore is in-memory, deterministic insertion order for search.
# ---------------------------------------------------------------------------

def _make_fixed_vector(seed_int: int, dims: int = 384) -> list[float]:
    """Generate a deterministic unit vector from an integer seed (stdlib only)."""
    import random
    rng = random.Random(seed_int)
    values = [rng.gauss(0.0, 1.0) for _ in range(dims)]
    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / norm for v in values]


# Pre-computed fixed vector seeds for scenario use (deterministic, no model).
# The key is a string label used in seed_data[].vector_key and query vectors.
_VECTOR_SEEDS: dict[str, int] = {
    "vnm_query": 42,
    "vcb_query": 43,
    "generic": 99,
}
_VECTOR_DIMS = 384


def _build_fake_adapters(service: str) -> tuple[Any, Any]:
    """
    Build FakeEmbedder and FakeVectorStore for service-tier testing.

    Returns (fake_embedder, fake_vector_store).
    Both are fully in-memory, deterministic, and require no external deps beyond stdlib.
    The implementations satisfy EmbedderPort and VectorStorePort protocols.
    """
    service_root = _resolve_service_root(service)
    if service_root not in sys.path:
        sys.path.insert(0, service_root)

    # Import domain types (no infra imports — domain is stdlib-compatible)
    from domain.models import EmbeddingVector, SearchResult, AnalysisEntry  # noqa: F401
    from domain.repositories import EmbedderPort, VectorStorePort

    class FakeEmbedder(EmbedderPort):
        """
        Deterministic embedder: returns a fixed 384-dim unit vector per text.
        Uses a stable hash of the text prefix — byte-identical across runs.
        ZERO model load, ZERO network, ZERO credentials.
        """

        async def embed(self, text: str) -> EmbeddingVector:
            seed = sum(ord(c) for c in text[:20])
            values = _make_fixed_vector(seed, _VECTOR_DIMS)
            return EmbeddingVector(dims=_VECTOR_DIMS, values=values)

        async def embed_batch(self, texts: list[str]) -> list[EmbeddingVector]:
            return [await self.embed(t) for t in texts]

    class FakeVectorStore(VectorStorePort):
        """
        In-memory vector store: preserves insertion order, deterministic search.
        Computes L2 distance between query and stored vectors.
        ZERO LanceDB access. ZERO filesystem ops.
        """

        def __init__(self) -> None:
            self._entries: list[tuple[AnalysisEntry, list[float]]] = []

        async def insert(self, entry: AnalysisEntry, vector: EmbeddingVector) -> None:
            self._entries.append((entry, vector.values))

        async def search(
            self,
            query_vector: EmbeddingVector,
            limit: int,
            level_filter: Optional[str] = None,
            action_code_filter: Optional[str] = None,
            ticker_filter: Optional[str] = None,
            sector_filter: Optional[str] = None,
            source_domain_filter: Optional[str] = None,
            depth_tier_filter: Optional[str] = None,
            doc_type_filter: Optional[str] = None,
        ) -> list[SearchResult]:
            results = []
            for entry, vec in self._entries:
                if level_filter and entry.level != level_filter:
                    continue
                if action_code_filter and entry.action_code != action_code_filter:
                    continue
                dist = math.sqrt(
                    sum((a - b) ** 2 for a, b in zip(query_vector.values, vec))
                )
                results.append(
                    SearchResult(
                        id=entry.id,
                        level=entry.level,
                        title=entry.title,
                        summary=entry.summary,
                        tags=entry.tags,
                        action_code=entry.action_code or "",
                        created_at=entry.created_at.isoformat(),
                        distance=dist,
                        recency_score=0.0,
                    )
                )
            results.sort(key=lambda r: r.distance)
            return results[:limit]

        async def hybrid_search(
            self,
            query_vector: EmbeddingVector,
            query_text: str,
            limit: int,
            level_filter: Optional[str] = None,
            action_code_filter: Optional[str] = None,
            ticker_filter: Optional[str] = None,
            sector_filter: Optional[str] = None,
            source_domain_filter: Optional[str] = None,
            depth_tier_filter: Optional[str] = None,
            doc_type_filter: Optional[str] = None,
        ) -> list[SearchResult]:
            """Sandbox stub: delegates to search() (no real BM25 in sandbox — ZERO LanceDB access)."""
            return await self.search(
                query_vector=query_vector,
                limit=limit,
                level_filter=level_filter,
                action_code_filter=action_code_filter,
                ticker_filter=ticker_filter,
                sector_filter=sector_filter,
                source_domain_filter=source_domain_filter,
                depth_tier_filter=depth_tier_filter,
                doc_type_filter=doc_type_filter,
            )

        async def count(self) -> int:
            return len(self._entries)

    return FakeEmbedder(), FakeVectorStore()


def _seed_vector_store(
    fake_vector_store: Any,
    fake_embedder: Any,
    seed_data: list[dict[str, Any]],
    service: str,
) -> None:
    """Pre-load seed_data entries into the fake vector store (sync wrapper)."""
    service_root = _resolve_service_root(service)
    if service_root not in sys.path:
        sys.path.insert(0, service_root)

    from domain.models import AnalysisEntry
    from datetime import datetime, timezone

    # Use a pinned "created_at" so temporal decay is deterministic across runs.
    _PINNED_CREATED_AT = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    async def _do_seed() -> None:
        for doc in seed_data:
            entry = AnalysisEntry(
                id=doc["id"],
                level=doc.get("level", "global"),
                title=doc.get("title", doc["id"]),
                summary=doc.get("summary", ""),
                tags=doc.get("tags", []),
                created_at=_PINNED_CREATED_AT,
                action_code=doc.get("action_code"),
            )
            text = doc.get("content", doc["id"])
            vector = await fake_embedder.embed(text)
            await fake_vector_store.insert(entry, vector)

    asyncio.run(_do_seed())


def _run_service_scenario(scenario: dict[str, Any], service: str) -> dict[str, Any]:
    """
    Execute a service-tier scenario via FastAPI TestClient + injected fake adapters.

    P3-A: boots create_app(embedder=fake_embedder, vector_store=fake_vector_store).
    Zero LanceDB, zero sentence-transformers model, zero credentials.
    Validates HTTP status code + response subset against expected.

    Returns trace dict: {passed, scenario, actual, expected, diff, elapsed_ms}.
    """
    service_root = _resolve_service_root(service)
    if service_root not in sys.path:
        sys.path.insert(0, service_root)

    _validate_service_schema(scenario)

    scenario_name: str = scenario["scenario"]
    endpoint: str = scenario["endpoint"]
    method: str = scenario["method"].upper()
    request_body: dict[str, Any] = scenario["request_body"]
    expected_status: int = scenario["expected_status"]
    expected_subset: dict[str, Any] = scenario["expected_response_subset"]
    seed_data: list[dict[str, Any]] = scenario.get("seed_data", [])

    # Build deterministic fake adapters (zero model/DB)
    fake_embedder, fake_vector_store = _build_fake_adapters(service)

    # Pre-seed the store with scenario docs
    if seed_data:
        _seed_vector_store(fake_vector_store, fake_embedder, seed_data, service)

    # Import and boot the composition root with injected fakes
    from main import create_app
    from fastapi.testclient import TestClient

    app = create_app(embedder=fake_embedder, vector_store=fake_vector_store)

    t0 = time.monotonic()
    actual_status: int = -1
    actual_body: dict[str, Any] = {}
    error_info: Optional[str] = None

    try:
        # TestClient is a synchronous WSGI-over-anyio wrapper — safe in subprocess
        with TestClient(app, raise_server_exceptions=False) as client:
            if method == "POST":
                resp = client.post(endpoint, json=request_body)
            elif method == "GET":
                resp = client.get(endpoint, params=request_body)
            else:
                resp = client.request(method, endpoint, json=request_body)

            actual_status = resp.status_code
            try:
                actual_body = resp.json()
            except Exception:
                actual_body = {"_raw": resp.text}

    except Exception as exc:  # noqa: BLE001
        error_info = f"{type(exc).__name__}: {exc}"
        actual_body = {"error": error_info}

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    # --- Validation ---
    diffs: list[dict[str, Any]] = []

    # 1. Status code must match
    if actual_status != expected_status:
        diffs.append({
            "key": "status_code",
            "actual": actual_status,
            "expected": expected_status,
        })

    # 2. Response subset must be present in actual body (for success scenarios)
    if expected_status < 400:
        # Check top-level subset keys
        for key, expected_val in expected_subset.items():
            if key == "results_min_count":
                # Special: actual["results"] list must have at least N items
                actual_count = len(actual_body.get("results", []))
                if actual_count < expected_val:
                    diffs.append({
                        "key": "results_min_count",
                        "actual": actual_count,
                        "expected": f">={expected_val}",
                    })
            elif key == "first_result_id":
                results_list = actual_body.get("results", [])
                first_id = results_list[0].get("id") if results_list else None
                if first_id != expected_val:
                    diffs.append({
                        "key": "first_result_id",
                        "actual": first_id,
                        "expected": expected_val,
                    })
            else:
                actual_val = actual_body.get(key, "<MISSING>")
                if actual_val != expected_val:
                    diffs.append({"key": key, "actual": actual_val, "expected": expected_val})

    passed = len(diffs) == 0 and error_info is None

    # Build honest actual_response_subset for display (handles special keys)
    actual_subset_display: dict[str, Any] = {}
    if expected_status < 400:
        for key in expected_subset:
            if key == "results_min_count":
                actual_subset_display[key] = len(actual_body.get("results", []))
            elif key == "first_result_id":
                results_list = actual_body.get("results", [])
                actual_subset_display[key] = results_list[0].get("id") if results_list else None
            else:
                actual_subset_display[key] = actual_body.get(key, "<MISSING>")

    return {
        "passed": passed,
        "scenario": scenario_name,
        "endpoint": endpoint,
        "actual_status": actual_status,
        "expected_status": expected_status,
        "actual_response_subset": actual_subset_display,
        "expected_response_subset": expected_subset,
        "diff": diffs,
        "error": error_info,
        "elapsed_ms": elapsed_ms,
    }


# ---------------------------------------------------------------------------
# Scenario file resolution
# ---------------------------------------------------------------------------
def _collect_scenario_files(scenario_arg: str, service: str, tier: str) -> list[str]:
    """
    Resolve --scenario argument to a list of JSON file paths.
    'all' -> discovers all scenarios/*.json under the service's tier directory.
    Otherwise treat as an explicit file path.

    Tier paths:
      primitive -> domain/primitive/*/scenarios/*.json
      module    -> domain/module/*/scenarios/*.json (walks domain/module/)
      service   -> service/scenarios/*.json
    """
    if scenario_arg == "all":
        service_root = _resolve_service_root(service)
        if tier == "service":
            base = os.path.join(service_root, "service", "scenarios")
            paths: list[str] = []
            if os.path.isdir(base):
                for f in sorted(os.listdir(base)):
                    if f.endswith(".json") and not f.startswith("_") and not f.startswith("known_bad_"):
                        paths.append(os.path.join(base, f))
            return paths
        else:
            base = os.path.join(service_root, "domain", tier if tier == "module" else "primitive")
            paths = []
            for root, _dirs, files in os.walk(base):
                for f in files:
                    # Skip scaffold/draft files (prefixed with _) — they are not regression targets
                    if f.endswith(".json") and "scenarios" in root and not f.startswith("_") and not f.startswith("known_bad_"):
                        paths.append(os.path.join(root, f))
            return sorted(paths)
    else:
        return [scenario_arg]


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sandbox runner: scenario JSON -> trace JSON. ZERO model/DB access."
    )
    parser.add_argument("--service", required=True, help="Service name (e.g. rag-service)")
    parser.add_argument(
        "--tier",
        required=True,
        choices=["primitive", "module", "service"],
        help="Execution tier: primitive, module, or service",
    )
    parser.add_argument(
        "--scenario",
        required=True,
        help="Path to scenario JSON file, or 'all' to run all discovered scenarios",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Write trace JSON to this file path instead of stdout",
    )
    args = parser.parse_args()

    # G7 hard-fail gate: forbidden credential env vars → exit NON-ZERO immediately.
    # Applies to ALL tiers including service (P3-A AC-6).
    # Scenarios are NEVER run when forbidden keys are present.
    forbidden_found = _audit_env()
    if forbidden_found:
        print(
            f"[SANDBOX ERROR] Forbidden credential env vars detected: {forbidden_found}. "
            "Sandbox refuses to run scenarios with credentials in the process environment. "
            "Unset the listed vars before re-running. "
            "(HF_HUB_OFFLINE=1 is allowed — it is a safety flag, not a credential.)",
            file=sys.stderr,
        )
        return 1

    scenario_files = _collect_scenario_files(args.scenario, args.service, args.tier)
    if not scenario_files:
        print(
            f"[SANDBOX ERROR] No scenario files found for "
            f"service={args.service!r} tier={args.tier!r} scenario={args.scenario!r}",
            file=sys.stderr,
        )
        return 1

    results: list[dict[str, Any]] = []
    all_passed = True

    for fpath in scenario_files:
        trace: dict[str, Any]
        try:
            with open(fpath, encoding="utf-8") as fh:
                scenario = json.load(fh)

            if args.tier == "service":
                trace = _run_service_scenario(scenario, args.service)
            else:
                _validate_schema(scenario)
                trace = _run_scenario(scenario, args.service, args.tier)

        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            trace = {
                "passed": False,
                "primitive": fpath,
                "actual": {},
                "expected": {},
                "diff": [{"key": "schema_error", "actual": str(exc), "expected": "valid scenario JSON"}],
                "elapsed_ms": 0,
            }
        except ModuleNotFoundError as exc:
            trace = {
                "passed": False,
                "primitive": fpath,
                "actual": {},
                "expected": {},
                "diff": [{"key": "import_error", "actual": str(exc), "expected": "primitive module loadable"}],
                "elapsed_ms": 0,
            }

        results.append(trace)
        if not trace["passed"]:
            all_passed = False

    # Output
    output_payload: Any = results if len(results) > 1 else results[0]
    output_str = json.dumps(output_payload, indent=2)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(output_str)
        print(f"[SANDBOX] Trace written to {args.output}", file=sys.stderr)
    else:
        print(output_str)

    # Print summary to stderr
    total = len(results)
    passed_count = sum(1 for r in results if r.get("passed"))
    failed_count = total - passed_count
    tier_label = args.tier.upper()
    print(
        f"[SANDBOX] {tier_label} tier: {passed_count}/{total} PASS, {failed_count} FAIL",
        file=sys.stderr,
    )

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
