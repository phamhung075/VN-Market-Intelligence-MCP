"""
Python sandbox runner — scenario JSON -> trace JSON.
Zero ML/DB framework imports. stdlib only.
Invoke: python -m sandbox --service=rag-service --tier=primitive --scenario=<path>
        python -m sandbox --service=rag-service --tier=module   --scenario=<path>
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import inspect
import json
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
# Schema validation
# ---------------------------------------------------------------------------
_REQUIRED_SCENARIO_KEYS = {"primitive", "input", "expected_output"}


def _validate_schema(scenario: dict[str, Any]) -> None:
    missing = _REQUIRED_SCENARIO_KEYS - scenario.keys()
    if missing:
        raise ValueError(f"Scenario missing required keys: {missing}")
    if not isinstance(scenario["input"], dict):
        raise TypeError("scenario.input must be a dict")
    if not isinstance(scenario["expected_output"], dict):
        raise TypeError("scenario.expected_output must be a dict")


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
# Core runner
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
# Scenario file resolution
# ---------------------------------------------------------------------------
def _collect_scenario_files(scenario_arg: str, service: str, tier: str) -> list[str]:
    """
    Resolve --scenario argument to a list of JSON file paths.
    'all' -> discovers all scenarios/*.json under the service's primitives.
    Otherwise treat as an explicit file path.
    """
    if scenario_arg == "all":
        service_root = _resolve_service_root(service)
        base = os.path.join(service_root, "domain", tier if tier == "module" else "primitive")
        paths: list[str] = []
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
        choices=["primitive", "module"],
        help="Execution tier: primitive or module",
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

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
