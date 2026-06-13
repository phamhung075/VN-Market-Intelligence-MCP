# po-S50 — Groom INFRA-TEST-TZ-FIX to claimable READY (dispatcher tick 2026-06-13T11:38Z)
# /goal lens: recheck/harden RECENT-SHIP code for real defects. Target = the
# alert-engine TZ-dependent unit-test flake carved out of GO-FLEET-DEPLOY sign-off
# (last-ship code that "does not give best result" — non-deterministic on host TZ).
# FREE ZONE (apps/alert-engine/, mcp-server FROZEN until 16:00Z gate untouched).
#
# Idempotent: re-running yields the same object (no list growth, no dup AC).
# Scoped: mutates ONLY backlog[id==INFRA-TEST-TZ-FIX] + task_board _updated_* meta.
# Invariant guard: mcp-server backlog count unchanged (this id is apps/alert-engine/).

.task_board._updated_at = $now
| .task_board._updated_by = "po-S50"
| .task_board.backlog = (
    .task_board.backlog | map(
      if .id == "INFRA-TEST-TZ-FIX" then
          .status = "READY"
        | .owner = "dev-alert-engine"
        | .zone = "apps/alert-engine/"
        | .blocked_by = []
        | .test_only = true
        | .no_rebuild = true
        | .priority = "medium"
        | .size = "S"
        | .ready_at = $now
        | .ready_by = "po-S50"
        | .acceptance_criteria = [
            "Identify the TZ/wall-clock-dependent assertion(s) in apps/alert-engine/pkg/infrastructure/sqlite_test.go — primary suspect is the today-vs-yesterday boundary built on time.Now().UTC() with a fixed hour offset (e.g. -25h at L178-179) plus any same-day/older-than-N-days bucket assertions that can straddle a day/zone boundary depending on the host TZ and the clock position within the day.",
            "Make the assertion deterministic via the GENERIC fix: inject a fixed clock or anchor all date math to an explicit, test-controlled reference instant (UTC) so the produced 'today'/'yesterday'/'old' fixtures cannot drift across a day boundary — no host-TZ dependency, no real wall-clock read in the assertion path. FORBIDDEN: skipping the test, widening the offset to mask the boundary, or hardcoding a calendar date that re-rots (must be relative-to-injected-now, generic across any run date/host TZ).",
            "go test ./... in apps/alert-engine passes the infrastructure package GREEN when run under at least two distinct host TZs (e.g. TZ=UTC and TZ=Pacific/Kiritimati or TZ=America/New_York) — prove determinism by running the package under both, not just the box default.",
            "No production code path changed (test-only): git diff touches only *_test.go under apps/alert-engine/; container health unaffected and NO rebuild required (no_rebuild). alert-engine container stays Up+healthy, get_alerts still live.",
            "QA verifies by reading the RAW go test output for the infrastructure package (PASS line) under the two TZs — not a badge or a self-reported green."
          ]
        | .acceptance_criteria_count = 5
        | .gate = "go test ./... in apps/alert-engine passes the infrastructure (TZ-dependent) package green on any host TZ — proven under >=2 distinct TZs; container health unaffected; test-only diff (no prod code, no rebuild)."
        | .ready_note = "[po-S50 groom 2026-06-13T11:39Z] Promoted to READY for dispatcher. Picked over alternatives per /goal recheck-last-ship lens: this hardens GO-FLEET-DEPLOY last-ship code (a non-deterministic TZ test that does not give best result) in a now-FREE zone, is a clean test_only+no_rebuild generic fix with a crisp 2-TZ determinism gate, and does NOT touch the FROZEN apps/mcp-server/ zone (16:00Z EVIDENCE-ACCUM gate). Grounded: apps/alert-engine/pkg/infrastructure/sqlite_test.go L138/178-179/337-341 use time.Now().UTC() with fixed offsets that can straddle a day boundary."
      else . end
    )
  )
