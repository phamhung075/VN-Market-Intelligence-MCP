---
task_id: FIX-BCTC-SSC-503-RETRY
date: 2026-06-16T17:05Z
by: fixer
commit: b238e33b
---

# Decision — Add unit tests for _is_transient_error

## what-considered
- QA (cycle: changes_requested) flagged missing test coverage for the new `_is_transient_error(exc)` pure classifier function introduced in vps-scripts/discover-bctc-urls-browser.py (~L99-129).
- Production logic is already APPROVED (G1/G2/G4 PASS on hnx/upcom/ssc paths).
- Test harness must follow the established pytest-style pattern in vps-scripts/test_discover_bctc_title_classifier.py (27 existing tests, all passing).
- Minimum coverage: 8 test cases (both exception classes: urllib.error.HTTPError + urllib.error.URLError; transient + terminal boundaries).
- Chosen: append all 8 cases to the existing test file (vps-scripts/test_discover_bctc_title_classifier.py) using the SAME import pattern (importlib.util.spec_from_file_location for hyphenated script filename).

## why-change
- No change from QA's plan. Exact minimum targeted change per flag: test only, no production code touch.
- Integration with existing harness: reduces friction, reuses proven import/runner logic, single test invocation (python3 vps-scripts/test_discover_bctc_title_classifier.py now runs all 35).

## test coverage
- HTTP 5xx transient: 503 (Service Unavailable), 500 (Internal Server Error) — both return True
- HTTP 4xx terminal: 404 (Not Found), 403 (Forbidden) — both return False
- URLError transient (exception reasons): ConnectionResetError, TimeoutError — both return True
- URLError transient (string reason): "timed out" — returns True
- Non-HTTP exception: ValueError — returns False (terminal, fail-loud)

## verification
- python3 -m py_compile vps-scripts/test_discover_bctc_title_classifier.py -> exit 0 (syntax OK)
- python3 vps-scripts/test_discover_bctc_title_classifier.py -> 35/35 passed (27 existing + 8 new)
- git diff --stat -> only test file changed (vps-scripts/test_discover_bctc_title_classifier.py +88 lines)
- git diff vps-scripts/discover-bctc-urls-browser.py -> (empty, no production change)
- git commit on index-only paths (test file only) per mutex protocol

## follow-on
- None. Test coverage is complete; production code unchanged. Ready for QA re-run on same branch.
