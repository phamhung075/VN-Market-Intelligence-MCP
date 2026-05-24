"""
PDF Extractor — Sandbox Scenario Runner (P1-A1).

Runs a single scenario JSON file against a pure-function primitive and emits
a trace JSON to stdout.

CLI:
    python sandbox/runner.py --tier=primitive --scenario=<path-to-scenario.json>
    python sandbox/runner.py --help

PYTHONPATH requirement:
    Caller MUST set PYTHONPATH=apps/pdf-extractor before invoking this script.
    Without it, `from domain.primitives.<name>` will raise ModuleNotFoundError.

    Example:
        PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \\
            --tier=primitive \\
            --scenario=apps/pdf-extractor/scenarios/primitives/echo_identity/happy.json

Security clause (G7 / AC-5):
    This process MUST have zero credentials in its environment.
    It is a pure-function harness — no database connections, no remote
    host addresses, no OCR keys, no auth material of any kind.
    Run the env audit described in TASK_P1-A1.md §AC-5 before dispatching.
    The output MUST be empty.

Import contract (AC-4):
    Runner imports ONLY from:
        - Python stdlib (argparse, importlib, json, sys)
        - domain.primitives.<primitive_name>  (pure functions, no infra)
    FORBIDDEN imports (checked by G4 import-linter in Phase 2):
        - infrastructure.*
        - application.*
        - interface.*
        - pdfplumber
        - pytesseract
        - aiohttp

Scenario JSON schema (input):
    {
        "primitive": "<function_name>",   // must match module name under domain/primitives/
        "inputs":    { ... },             // keyword args passed to the primitive function
        "expected":  <value>              // expected return value (exact equality check)
    }

Trace JSON schema (output to stdout):
    {
        "primitive": "<function_name>",
        "inputs":    { ... },
        "expected":  <value>,
        "actual":    <value> | null,
        "pass":      true | false,
        "error":     null | "<error message>"
    }

Exit codes:
    0  — scenario passed (actual == expected)
    1  — scenario failed (actual != expected, or import/execution error)
"""

import argparse
import importlib
import json
import sys
from typing import Any


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------


def run_scenario(scenario_path: str) -> dict[str, Any]:
    """
    Load a scenario JSON, execute the primitive, return a trace dict.

    Never raises — all errors are captured in the trace dict with pass=False.
    """
    primitive_name: str | None = None
    inputs: dict[str, Any] = {}
    expected: Any = None

    try:
        with open(scenario_path, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)

        primitive_name = data["primitive"]
        inputs = data.get("inputs", {})
        expected = data.get("expected")

        # Dynamic import from domain/primitives/<primitive_name>/
        # Convention: the callable has the same name as the module.
        module = importlib.import_module(f"domain.primitives.{primitive_name}")
        fn = getattr(module, primitive_name)

        actual = fn(**inputs)
        passed = actual == expected

        return {
            "primitive": primitive_name,
            "inputs": inputs,
            "expected": expected,
            "actual": actual,
            "pass": passed,
            "error": None,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "primitive": primitive_name,
            "inputs": inputs,
            "expected": expected,
            "actual": None,
            "pass": False,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sandbox/runner.py",
        description=(
            "PDF Extractor sandbox scenario runner — JSON-in, trace-JSON-out.\n"
            "Executes a pure-function primitive against a scenario JSON fixture.\n"
            "\n"
            "PYTHONPATH must be set to apps/pdf-extractor before invocation.\n"
            "Zero credentials: sandbox is a pure-function harness only."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--tier",
        required=True,
        choices=["primitive", "module", "service"],
        help="Scenario tier: primitive | module | service",
    )
    parser.add_argument(
        "--scenario",
        required=True,
        metavar="PATH",
        help="Path to the scenario JSON file to execute.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    trace = run_scenario(args.scenario)

    # Emit trace JSON to stdout — one JSON object per invocation.
    print(json.dumps(trace, indent=2, default=str))

    # Exit code: 0 = PASS, 1 = FAIL (honest RED)
    sys.exit(0 if trace["pass"] else 1)


if __name__ == "__main__":
    main()
