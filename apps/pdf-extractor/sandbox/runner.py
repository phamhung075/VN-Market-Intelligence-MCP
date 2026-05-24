"""
PDF Extractor — Sandbox Scenario Runner (P1-A1, extended P1-C).

Runs a single scenario JSON file against a pure-function primitive OR a module,
and emits a trace JSON to stdout.

CLI:
    python sandbox/runner.py --tier=primitive --scenario=<path-to-scenario.json>
    python sandbox/runner.py --tier=module    --scenario=<path-to-scenario.json>
    python sandbox/runner.py --help

PYTHONPATH requirement:
    Caller MUST set PYTHONPATH=apps/pdf-extractor before invoking this script.
    Without it, `from domain.primitives.<name>` will raise ModuleNotFoundError.

    Example:
        PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \\
            --tier=primitive \\
            --scenario=apps/pdf-extractor/scenarios/primitives/echo_identity/happy.json

        PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \\
            --tier=module \\
            --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json

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
        - domain.modules.<module_name>        (module composition, no infra)
    FORBIDDEN imports (checked by G4 import-linter in Phase 2):
        - infrastructure.*
        - application.*
        - interface.*
        - pdfplumber
        - pytesseract
        - aiohttp

Primitive scenario JSON schema (input):
    {
        "primitive": "<function_name>",   // matches module under domain/primitives/
        "inputs":    { ... },             // keyword args passed to the primitive function
        "expected":  <value>              // expected return value (exact equality check)
    }

Module scenario JSON schema (input):
    {
        "module":   "<module_name>",      // matches module under domain/modules/
        "inputs":   { ... },              // kwargs passed to module.process_report()
        "expected": { "confidence": <f> } // expected composite result (subset match)
    }

Trace JSON schema (output to stdout):
    {
        "primitive": "<function_name>" | null,
        "module":    "<module_name>" | null,
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
# Primitive runner
# ---------------------------------------------------------------------------


def run_primitive_scenario(scenario_path: str) -> dict[str, Any]:
    """
    Load a primitive scenario JSON, execute the primitive, return a trace dict.

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
            "module": None,
            "inputs": inputs,
            "expected": expected,
            "actual": actual,
            "pass": passed,
            "error": None,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "primitive": primitive_name,
            "module": None,
            "inputs": inputs,
            "expected": expected,
            "actual": None,
            "pass": False,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Module runner
# ---------------------------------------------------------------------------


def _confidence_match(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    """
    Check that all keys in expected are present in actual with matching values.

    Floats are compared with a tolerance of 1e-9 to handle floating-point
    representation differences between JSON parsing and Python computation.
    """
    for key, exp_val in expected.items():
        if key not in actual:
            return False
        act_val = actual[key]
        if isinstance(exp_val, float) and isinstance(act_val, float):
            if abs(act_val - exp_val) > 1e-9:
                return False
        elif act_val != exp_val:
            return False
    return True


def run_module_scenario(scenario_path: str) -> dict[str, Any]:
    """
    Load a module scenario JSON, execute the module, return a trace dict.

    Module scenarios use the financial_reports module with real primitive adapters
    wired at composition time (no infrastructure dependencies — primitives are pure).

    Never raises — all errors captured in trace dict with pass=False.
    """
    module_name: str | None = None
    inputs: dict[str, Any] = {}
    expected: Any = None

    try:
        with open(scenario_path, encoding="utf-8") as f:
            data: dict[str, Any] = json.load(f)

        module_name = data["module"]
        inputs = data.get("inputs", {})
        expected = data.get("expected")

        # Wire module with real primitive adapters (no infrastructure).
        # Both primitives are pure functions — safe in sandbox.
        actual = _run_financial_reports_module(inputs)

        # For module scenarios, expected is a dict — check subset match.
        if isinstance(expected, dict) and isinstance(actual, dict):
            passed = _confidence_match(actual, expected)
        else:
            passed = actual == expected

        return {
            "primitive": None,
            "module": module_name,
            "inputs": inputs,
            "expected": expected,
            "actual": actual,
            "pass": passed,
            "error": None,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "primitive": None,
            "module": module_name,
            "inputs": inputs,
            "expected": expected,
            "actual": None,
            "pass": False,
            "error": str(exc),
        }


def _run_financial_reports_module(inputs: dict[str, Any]) -> dict[str, Any]:
    """
    Wire FinancialReportsModule with real primitive adapters and call process_report().

    Adapters wrap all 9 pure primitive functions behind the Protocol ports.
    BT-1 adds 3 new adapters: vn_number_normalize, reconcile_figures, select_period_column.
    No infrastructure is imported — all primitives are pure stdlib functions.

    Primitives wired:
        1. decimal_normalizer         → _DecimalNormalizerAdapter
        2. validate_financial_figures → _FinancialValidatorAdapter
        3. confidence_scorer          → _ConfidenceScorerAdapter
        4. low_confidence_gate        → _LowConfidenceGateAdapter
        5. ratio_computer             → _RatioComputerAdapter
        6. field_extractor            → _FieldExtractorAdapter
        7. vn_number_normalize        → _VnNumberNormalizerAdapter  (BT-1)
        8. reconcile_figures          → _ReconcileFiguresAdapter     (BT-1)
        9. select_period_column       → _SelectPeriodColumnAdapter   (BT-1)
    """
    from domain.modules.financial_reports import FinancialReportsModule
    from domain.primitives.decimal_normalizer import normalize_decimal
    from domain.primitives.validate_financial_figures import validate_financial_figures
    from domain.primitives.confidence_scorer import score_confidence
    from domain.primitives.low_confidence_gate import gate_confidence
    from domain.primitives.ratio_computer import compute_ratio
    from domain.primitives.field_extractor import extract_field
    from domain.primitives.vn_number_normalize import vn_number_normalize
    from domain.primitives.reconcile_figures import reconcile_figures
    from domain.primitives.select_period_column import select_period_column

    class _DecimalNormalizerAdapter:
        def normalize(self, raw_string: str, unit_hint: str = "billion_vnd") -> Any:
            return normalize_decimal(raw_string, unit_hint)

    class _FinancialValidatorAdapter:
        def validate(
            self,
            total_assets: Any,
            total_equity: Any,
            total_liabilities: Any,
            operating_margin: Any,
            net_revenue: Any,
        ) -> float:
            return validate_financial_figures(
                total_assets=total_assets,
                total_equity=total_equity,
                total_liabilities=total_liabilities,
                operating_margin=operating_margin,
                net_revenue=net_revenue,
            )

    class _ConfidenceScorerAdapter:
        def score(self, ocr_confidence: float, table_count: int) -> dict:
            return score_confidence(ocr_confidence, table_count)

    class _LowConfidenceGateAdapter:
        def gate(self, confidence: float) -> str:
            return gate_confidence(confidence)

    class _RatioComputerAdapter:
        def compute(self, numerator: float, denominator: float, ratio_type: str) -> Any:
            return compute_ratio(numerator, denominator, ratio_type)

    class _FieldExtractorAdapter:
        def extract(self, text: str, field_name: str) -> Any:
            return extract_field(text, field_name)

    class _VnNumberNormalizerAdapter:
        def normalize_vn(self, raw: str) -> Any:
            return vn_number_normalize(raw)

    class _ReconcileFiguresAdapter:
        def reconcile(self, a: Any, b: Any, tol: float = 1.0) -> str:
            return reconcile_figures(a, b, tol)

    class _SelectPeriodColumnAdapter:
        def select(self, cells: list, hint: Any = None, headers: Any = None) -> tuple:
            return select_period_column(cells, hint, headers)

    module = FinancialReportsModule(
        normalizer=_DecimalNormalizerAdapter(),
        validator=_FinancialValidatorAdapter(),
        confidence_scorer=_ConfidenceScorerAdapter(),
        low_confidence_gate=_LowConfidenceGateAdapter(),
        ratio_computer=_RatioComputerAdapter(),
        field_extractor=_FieldExtractorAdapter(),
        vn_normalizer=_VnNumberNormalizerAdapter(),
        reconciler=_ReconcileFiguresAdapter(),
        period_selector=_SelectPeriodColumnAdapter(),
    )

    return module.process_report(**inputs)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------


def run_scenario(scenario_path: str, tier: str) -> dict[str, Any]:
    """Dispatch to primitive or module runner based on tier."""
    if tier == "primitive":
        return run_primitive_scenario(scenario_path)
    elif tier == "module":
        return run_module_scenario(scenario_path)
    else:
        return {
            "primitive": None,
            "module": None,
            "inputs": {},
            "expected": None,
            "actual": None,
            "pass": False,
            "error": f"Unsupported tier: {tier}",
        }


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sandbox/runner.py",
        description=(
            "PDF Extractor sandbox scenario runner — JSON-in, trace-JSON-out.\n"
            "Executes a pure-function primitive or module against a scenario JSON fixture.\n"
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

    trace = run_scenario(args.scenario, args.tier)

    # Emit trace JSON to stdout — one JSON object per invocation.
    print(json.dumps(trace, indent=2, default=str))

    # Exit code: 0 = PASS, 1 = FAIL (honest RED)
    sys.exit(0 if trace["pass"] else 1)


if __name__ == "__main__":
    main()
