"""
Unit tests for B-05-FU-SSC-503-RETRY — honest fast-fail on SSC step1.

Verifies the FIX-BCTC-SSC-503-RETRY (2026-06-16) 60s retry/backoff loop in
discover_from_ssc_curl() step1 has been REMOVED and replaced with a single
attempt bounded strictly under the mcp-server caller's discovery budget
(DISCOVERY_TIMEOUT_MS = 5_000 in
apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts, and
the matching default `timeout` in
apps/mcp-server/src/domain/services/bctcDiscovery.ts). That fix's 60s sleep
(reachable on any transient 503/timeout) blocked this call up to ~100s in the
worst case (20s first-attempt urllib default + 60s sleep + 20s second
attempt) -- 20x the caller's 5s budget -- causing the caller's fetch to abort
and ~328 bctc_vps_queue rows to pile up in 'deferred_infra' over a 17-day
freeze. This reverts that retry: ANY error (transient or terminal) now
returns None immediately, no sleep, no retry.

Run:
    python3 vps-scripts/test_discover_bctc_ssc_fastfail.py
"""

import os
import sys
import time
import types
import urllib.error

import importlib.util

_SCRIPT = os.path.join(os.path.dirname(__file__), "discover-bctc-urls-browser.py")
_spec = importlib.util.spec_from_file_location("discover_bctc_ssc_fastfail", _SCRIPT)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

discover_from_ssc_curl = _mod.discover_from_ssc_curl

# Caller budget this fix must stay strictly under (see module docstring / code
# comment at the top of discover_from_ssc_curl() step1 in the production file).
_MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS = 5.0


def _patch_ssc_get(monkey_exc, call_log):
    """Return a fake _ssc_get(opener, url, timeout=...) that raises monkey_exc
    immediately (no real network, no sleep) and records the timeout it was
    called with."""

    def _fake_ssc_get(opener, url, extra_headers=None, timeout=20):
        call_log.append(timeout)
        raise monkey_exc

    return _fake_ssc_get


def _run_fastfail_case(exc):
    call_log = []
    original_ssc_get = _mod._ssc_get
    original_make_opener = _mod._ssc_make_opener
    _mod._ssc_get = _patch_ssc_get(exc, call_log)
    # Keep opener creation cheap/real (no network) -- _ssc_make_opener does no I/O.
    try:
        start = time.monotonic()
        result = discover_from_ssc_curl("VCB", 2026, "Q1")
        elapsed = time.monotonic() - start
    finally:
        _mod._ssc_get = original_ssc_get
        _mod._ssc_make_opener = original_make_opener
    return result, elapsed, call_log


# ---------------------------------------------------------------------------
# AC-1: simulated 503 -> returns None, single call, well under 5s (no 60s sleep)
# ---------------------------------------------------------------------------

def test_fastfail_503_returns_none_under_budget():
    exc = urllib.error.HTTPError(
        url="https://congbothongtin.ssc.gov.vn/faces/NewsSearch",
        code=503,
        msg="Service Unavailable",
        hdrs=None,
        fp=None,
    )
    result, elapsed, call_log = _run_fastfail_case(exc)
    assert result is None
    assert elapsed < _MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS, (
        f"step1 took {elapsed:.2f}s -- must stay under the mcp-server's "
        f"{_MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS}s discovery budget"
    )
    assert elapsed < 1.0, "no sleep/backoff should occur at all (was 60s pre-fix)"
    assert len(call_log) == 1, "must be a SINGLE attempt -- no retry"


def test_fastfail_503_single_attempt_no_retry():
    exc = urllib.error.HTTPError(
        url="https://congbothongtin.ssc.gov.vn/faces/NewsSearch",
        code=503,
        msg="Service Unavailable",
        hdrs=None,
        fp=None,
    )
    _, _, call_log = _run_fastfail_case(exc)
    assert call_log == [call_log[0]] and len(call_log) == 1


# ---------------------------------------------------------------------------
# AC-2: simulated timeout (URLError/TimeoutError) -> same fast-fail behaviour
# ---------------------------------------------------------------------------

def test_fastfail_timeout_returns_none_under_budget():
    exc = urllib.error.URLError(TimeoutError("timed out"))
    result, elapsed, call_log = _run_fastfail_case(exc)
    assert result is None
    assert elapsed < _MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS
    assert elapsed < 1.0
    assert len(call_log) == 1


# ---------------------------------------------------------------------------
# AC-3: terminal error (404) also fast-fails identically (no special-casing)
# ---------------------------------------------------------------------------

def test_fastfail_terminal_404_returns_none_under_budget():
    exc = urllib.error.HTTPError(
        url="https://congbothongtin.ssc.gov.vn/faces/NewsSearch",
        code=404,
        msg="Not Found",
        hdrs=None,
        fp=None,
    )
    result, elapsed, call_log = _run_fastfail_case(exc)
    assert result is None
    assert elapsed < _MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS
    assert len(call_log) == 1


# ---------------------------------------------------------------------------
# AC-4: the request-level cap passed to _ssc_get is itself strictly under the
# mcp-server's 5s caller budget (defends against a future regression where the
# per-attempt timeout alone could still blow the budget without any retry).
# ---------------------------------------------------------------------------

def test_step1_timeout_param_strictly_under_caller_budget():
    exc = urllib.error.HTTPError(
        url="https://congbothongtin.ssc.gov.vn/faces/NewsSearch",
        code=503,
        msg="Service Unavailable",
        hdrs=None,
        fp=None,
    )
    _, _, call_log = _run_fastfail_case(exc)
    assert len(call_log) == 1
    timeout_used = call_log[0]
    assert timeout_used < _MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS, (
        f"step1 timeout={timeout_used}s must be strictly under the caller's "
        f"{_MCP_SERVER_DISCOVERY_TIMEOUT_SECONDS}s budget"
    )


# ---------------------------------------------------------------------------
# AC-5: the 60s retry constant / retry loop is gone (structural regression
# guard -- fails loud if a future edit reintroduces the FIX-BCTC-SSC-503-RETRY
# pattern by name).
# ---------------------------------------------------------------------------

def test_retry_wait_constant_removed():
    assert not hasattr(_mod, "_SSC_STEP1_RETRY_WAIT"), (
        "the 60s retry-wait constant must not exist -- it is the exact "
        "freeze cause this fix reverts (B-05-FU-SSC-503-RETRY)"
    )


def test_time_module_no_longer_imported():
    # `time` was imported solely for the removed time.sleep(60) backoff.
    assert "time" not in sys.modules or not hasattr(_mod, "time"), (
        "discover-bctc-urls-browser.py should no longer need `import time` "
        "now that the sleep-based retry loop is removed"
    )


# ---------------------------------------------------------------------------
# Runner (mirrors test_discover_bctc_title_classifier.py's harness pattern)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_fastfail_503_returns_none_under_budget,
        test_fastfail_503_single_attempt_no_retry,
        test_fastfail_timeout_returns_none_under_budget,
        test_fastfail_terminal_404_returns_none_under_budget,
        test_step1_timeout_param_strictly_under_caller_budget,
        test_retry_wait_constant_removed,
        test_time_module_no_longer_imported,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed}/{passed + failed} passed")
    sys.exit(1 if failed else 0)
