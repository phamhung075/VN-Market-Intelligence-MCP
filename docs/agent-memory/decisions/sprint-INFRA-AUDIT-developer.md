# Decision Journal — Sprint INFRA-AUDIT · developer

**Sprint goal:** mock-guard.sh HARD-FAILs every dev-team post-cycle tick on 2 legitimate Go test-double stubs (Go `*_test.go` filename convention not excluded, only a `tests/` directory) plus a vendored-cache false-positive source (~30 CAUTION lines/run).
**Agent:** developer
**Started:** 2026-07-29T00:25Z

---

### STEP developer-S1 · developer · 2026-07-29T00:26Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** Zone check: `scripts/audits/mock-guard.sh` → `scripts/` maps to specialist `developer` (system-map.json) — handled directly. RAW-reproduced the row's own symptom first (`bash scripts/audits/mock-guard.sh --full`): confirmed exit 1, exactly 2 HARD-FAIL lines, both `apps/macro-indicators/pkg/{application,interface/http}/*_test.go` (stubBOPURLBuilder), plus ~30 CAUTION lines all under `apps/mcp-server/~/.bun/install/cache`.
**what-considered:**
- only path: reproduce before touching anything (standing PRE-CLAIM verification rule).
**why-decision:** confirms the row's premise is live, not stale.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-29T00:30Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** Traced WHICH pattern actually matches the 2 HARD-FAIL lines: `HARD_COMMENT_QUALIFIER` (`//\s*(mock|...|stub|...)`) fires because the stub URL literal itself contains `https://stub...` — the `//` inside the URL is read as a same-line comment marker, and "stub" immediately follows it. Root cause is genuinely the missing `_test.go` filename exclusion (row's own diagnosis), not a separate regex bug to fix — the URL-comment quirk is incidental context, not requiring a redesign of `HARD_COMMENT_QUALIFIER` itself (out of scope; flagged as a finding, not fixed, since a legit production URL containing "//stub"-shaped text could theoretically false-positive the same way — noted for the twin architect signal, not this row).
**what-considered:**
- fix the regex heuristic to stop matching `//` inside string literals (more "correct" but a much bigger, riskier change touching a shared HARD pattern used by both --files and --full)
- add the `_test.go` filename exclusion per AC1 (matches the row's exact prescribed remedy, minimal diff, mirrors the existing `.test.`/`.spec.` TS/JS convention already on the same EXCLUDE_PATHS line)
**why-decision:** row's own root_cause + AC1 explicitly ask for the filename-suffix exclusion; the regex-heuristic redesign is unrequested scope and touches shared detection logic used everywhere.
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-29T00:40Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** AC2 vendored-cache exclusion — chose "honour .gitignore by construction" (row's stated preference) over a hand-maintained path literal. Redesigned `--full` mode's file discovery to use `git ls-files --cached --others --exclude-standard -- 'apps/*.ts' 'apps/*.tsx' 'apps/*.py' 'apps/*.go'` instead of `grep -rn apps/`, with a graceful fallback to the old recursive-grep behaviour if `git ls-files` returns nothing (never silently scan zero files). Verified `apps/mcp-server/~/.bun/install/cache` is genuinely gitignored (`.gitignore:5 ~/`) and 0 files tracked there before implementing.
**what-considered:**
- add `apps/*/~/` as a new EXCLUDE_PATHS literal (matches AC2's stated minimum, simplest diff)
- switch file discovery to `git ls-files --exclude-standard` (matches AC2's stated PREFERENCE — "so any future vendored cache is excluded by construction", zero maintenance for the next vendored tree)
**why-decision:** row explicitly prefers the construction-based approach; also structurally reduces reliance on the growing-list-of-literals pattern AC4 warns against for the whole file, not just the Go suffix.
**why-change:** no change from plan (row offered both, explicitly preferred git ls-files).

### STEP developer-S4 · developer · 2026-07-29T00:55Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** TDD: wrote `scripts/audits/mock-guard.test.sh` (new — script had zero prior test coverage) BEFORE landing the fix conceptually verified interactively; formally proved RED via `git stash push -- scripts/audits/mock-guard.sh` (reverts fix only, keeps the new test file) → 3/7 FAIL (AC1, AC4, live-repo-no-longer-hard-fails) against the pre-fix script, exactly the 3 assertions the fix targets. `git stash pop` restored the fix → 7/7 PASS. AC3 negative controls (non-test `.go` file with the same stub-URL content, non-test `.ts` file with an explicit `mockData` identifier) both still HARD-FAIL post-fix — detector not blinded. AC2 fixture planted a `MOCK_DATA_...` sentinel inside the REAL gitignored `apps/mcp-server/~/.bun/install/cache` dir, ran `--full`, confirmed invisible, cleaned up via trap. AC4 verified structurally: exactly one `_test\.go` alternative added to `EXCLUDE_PATHS`, zero new per-directory path literals (e.g. no `macro-indicators` literal). `shellcheck` clean (also fixed a PRE-EXISTING dead `SCAN_CMD_PREFIX` variable, present and unused both before and after this change — small adjacent cleanup on lines already being edited, not new scope).
**what-considered:**
- only path: TDD mandate + the row's own AC list maps almost 1:1 to test assertions.
**why-decision:** row deliberately structured ACs as machine-checkable predicates; wrote the test suite to match them directly.
**why-change:** no change from plan.

### STEP developer-S5 · developer · 2026-07-29T01:05Z
**task-id:** FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO
**what-done:** Honest note on AC3's "exits 0 on a clean tree" clause vs the real live repo: the live `apps/` tree currently has ~11 pre-existing, unrelated, legitimate `// TODO(...)` CAUTION markers (exit 2, non-blocking per `docs/agents/dev-team/flow/post-cycle.md` L32 — logged to WORK only, no signal-queue write, no escalation) — so the REAL `--full` run now exits 2, not 0. Treated AC3's "clean tree" as a controlled TEST FIXTURE assertion (proven, `AC3-clean-fixture-exits-0` in the new test suite) rather than a claim that the live repo's unrelated TODOs must also disappear (they are out of this row's scope; the row's own symptom/impact sections are entirely about the exit=1 HARD-FAIL, never mention CAUTION/exit=2). The specific recurring defect this row targets (exit=1 HARD-FAIL on the 2 stub-URL lines, "recurs every dev-team post-cycle tick") IS resolved and RAW-verified (live `--full` run now exits 2, was 1).
**what-considered:**
- silently claim full literal AC3 compliance (exit 0 on the live repo) — rejected: would be a false report, the live repo genuinely still has legitimate non-blocking CAUTION items unrelated to this fix.
**why-decision:** honest-report obligation; the distinction between exit=1 (this row's actual target, blocking-adjacent) and exit=2 (pre-existing, explicitly non-blocking per the consuming flow doc) is load-bearing and must not be blurred.
**why-change:** none — finding, not a plan change.

### STEP developer-S6 · developer · 2026-07-29T12:00Z
**task-id:** FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY
**what-done:** Chose headroom computation approach: derive MiB-free from `mem_cap*(100-pct)/100` (values `_check_mem_creep` already pulls) instead of a second `docker stats --format MemUsage` call, and chose `MEM_FLOOR_MIB=40` = 2x the ~20MiB measured rag-service `compact()` burst (`FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP` root_cause), per PO's calibration note explicitly rejecting a cap-derived number.
**what-considered:**
- extra `docker stats {{.MemUsage}}` call, parse "745.8MiB / 768MiB" string (more direct but needs unit parsing MiB/GiB/KiB, extra docker exec per container)
- derive from already-fetched pct+cap via awk (zero extra docker calls, exact same number PO's own live math used)
- MEM_FLOOR_MIB=32 (PO's un-settled round-number default) vs 40 (2x measured burst, floor fires with a full burst of margin still in hand)
**why-decision:** pct+cap derivation is cheaper and already numerically matches PO's own 22.2MiB live figure; 40 gives "warn BEFORE the killing allocation" margin per the calibration note's explicit requirement, 32 would only warn once headroom == exactly one burst.
**why-change:** no change from plan; floor VALUE was the one open parameter the row deliberately left for me to justify.

### STEP developer-S7 · developer · 2026-07-29T12:15Z
**task-id:** FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY
**what-done:** Found + fixed a real bug my own new code introduced: `awk '%.1f'` prints comma-decimal ("22,2") under this box's `fr_FR.UTF-8` locale — same class already documented in `scripts/audits/verify-a30-mcp-memory-reclamation.sh`'s "LOCALE PIN" comment. Pinned `LC_ALL=C LC_NUMERIC=C` on both new awk calls, scoped to the single command (not a global `export`, since this script is SOURCED by the test harness). Also discovered T36/T40 were silently resolving `tracked_by` against the REAL live orch-state.json (no test seam existed yet) before I added `ORCH_STATE_PATH` — both passed only because those exact 3 ids happen non-terminal today; added a dedicated fixture to make them hermetic.
**what-considered:**
- global `export LC_ALL=C` at script top (matches some sibling audit scripts) — rejected, would mutate the SOURCING test process's locale for its own assertions too
- command-scoped `LC_ALL=C LC_NUMERIC=C awk ...` (no export, no global mutation)
**why-decision:** minimum blast radius; sibling scripts that DO export globally are always standalone-invoked, never sourced by a test harness — this one is.
**why-change:** neither was in the original plan — both caught by actually running the new code against the live repo/real locale before calling it done, not by inspection alone.
