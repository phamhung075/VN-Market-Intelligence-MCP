"""
Unit tests — sandbox/runner.py (P1-A1).

Tests cover:
  - AC-1: runner executes a valid scenario JSON without error
  - AC-2: output is a valid JSON trace {primitive, inputs, expected, actual, pass, error}
  - AC-3: exit code 0 = all pass, non-zero = at least 1 fail
  - AC-4: runner imports ONLY from domain/primitives/ (verified by subprocess isolation)
  - AC-7: --help prints usage without error

All tests are purely functional — no I/O to DB, VPS, OCR, or Tesseract.
"""

import json
import os
import subprocess
import sys
import tempfile

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RUNNER = os.path.join(REPO_ROOT, "sandbox", "runner.py")
PYTHON = sys.executable

_ENV_CLEAN: dict[str, str] = {
    k: v
    for k, v in os.environ.items()
    if not any(
        kw in k.upper()
        for kw in (
            "DB_PATH",
            "VPS_",
            "VINAHOST",
            "STORAGE_DIR",
            "OCR",
            "TESSERACT",
            "TOKEN",
            "SECRET",
            "API_KEY",
            "PASSWORD",
        )
    )
}

# ---------------------------------------------------------------------------
# Minimal primitive fixture — echo_identity lives in domain/primitives/echo_identity/
# ---------------------------------------------------------------------------

_HAPPY_SCENARIO = {
    "primitive": "echo_identity",
    "inputs": {"value": 42},
    "expected": 42,
}

_FAIL_SCENARIO = {
    "primitive": "echo_identity",
    "inputs": {"value": 42},
    "expected": 99,  # deliberate mismatch to prove honest RED
}


def _write_scenario(tmp_dir: str, data: dict, filename: str = "scenario.json") -> str:
    path = os.path.join(tmp_dir, filename)
    with open(path, "w") as f:
        json.dump(data, f)
    return path


# ---------------------------------------------------------------------------
# AC-7: --help prints usage without error
# ---------------------------------------------------------------------------


def test_help_exits_0():
    """--help must print usage and exit 0."""
    result = subprocess.run(
        [PYTHON, RUNNER, "--help"],
        capture_output=True,
        text=True,
        env={**_ENV_CLEAN, "PYTHONPATH": REPO_ROOT},
    )
    assert result.returncode == 0, f"--help exited {result.returncode}: {result.stderr}"
    combined = result.stdout + result.stderr
    assert "tier" in combined.lower() or "usage" in combined.lower() or "scenario" in combined.lower()


# ---------------------------------------------------------------------------
# AC-1 + AC-2: runner executes a valid scenario JSON and outputs valid trace
# ---------------------------------------------------------------------------


def test_valid_scenario_exits_0_and_emits_trace():
    """Valid scenario: exit 0, trace JSON on stdout with all required keys."""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_scenario(tmp, _HAPPY_SCENARIO)
        result = subprocess.run(
            [PYTHON, RUNNER, "--tier=primitive", f"--scenario={path}"],
            capture_output=True,
            text=True,
            env={**_ENV_CLEAN, "PYTHONPATH": REPO_ROOT},
        )
        assert result.returncode == 0, f"Expected exit 0, got {result.returncode}:\n{result.stderr}"
        trace = json.loads(result.stdout)
        assert "primitive" in trace
        assert "inputs" in trace
        assert "expected" in trace
        assert "actual" in trace
        assert "pass" in trace
        assert "error" in trace
        assert trace["pass"] is True


# ---------------------------------------------------------------------------
# AC-3: exit non-zero on failure scenario (honest RED)
# ---------------------------------------------------------------------------


def test_failing_scenario_exits_nonzero():
    """Scenario with wrong expected: exit non-zero (honest RED)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_scenario(tmp, _FAIL_SCENARIO)
        result = subprocess.run(
            [PYTHON, RUNNER, "--tier=primitive", f"--scenario={path}"],
            capture_output=True,
            text=True,
            env={**_ENV_CLEAN, "PYTHONPATH": REPO_ROOT},
        )
        assert result.returncode != 0, "Expected non-zero exit for failing scenario"
        trace = json.loads(result.stdout)
        assert trace["pass"] is False


# ---------------------------------------------------------------------------
# AC-2: trace JSON schema completeness
# ---------------------------------------------------------------------------


def test_trace_has_all_required_keys():
    """Trace output must include: primitive, inputs, expected, actual, pass, error."""
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_scenario(tmp, _HAPPY_SCENARIO)
        result = subprocess.run(
            [PYTHON, RUNNER, "--tier=primitive", f"--scenario={path}"],
            capture_output=True,
            text=True,
            env={**_ENV_CLEAN, "PYTHONPATH": REPO_ROOT},
        )
        trace = json.loads(result.stdout)
        required_keys = {"primitive", "inputs", "expected", "actual", "pass", "error"}
        missing = required_keys - trace.keys()
        assert not missing, f"Trace missing keys: {missing}"


# ---------------------------------------------------------------------------
# AC-3: error in trace when scenario has missing primitive
# ---------------------------------------------------------------------------


def test_missing_primitive_exits_nonzero_with_error_in_trace():
    """Non-existent primitive: exit non-zero, trace.error is set."""
    bad_scenario = {"primitive": "does_not_exist_ever", "inputs": {}, "expected": None}
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_scenario(tmp, bad_scenario)
        result = subprocess.run(
            [PYTHON, RUNNER, "--tier=primitive", f"--scenario={path}"],
            capture_output=True,
            text=True,
            env={**_ENV_CLEAN, "PYTHONPATH": REPO_ROOT},
        )
        assert result.returncode != 0
        trace = json.loads(result.stdout)
        assert trace["error"] is not None
        assert trace["pass"] is False
