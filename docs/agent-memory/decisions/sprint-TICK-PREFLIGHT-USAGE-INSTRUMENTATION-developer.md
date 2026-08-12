# Decision Journal — Sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION · developer

**Sprint goal:** Replace the engineering-estimate silent-tick cost with a measured number — WU-0 ships the shared jq-only usage-telemetry lib all 3 cron scripts will later wire into.
**Agent:** developer
**Started:** 2026-08-12T13:41:48Z

---

### STEP developer-S1 · developer · 2026-08-12T13:55:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Implemented `scripts/agents-flow/lib/tick-telemetry.sh` (tt_epoch_ms, _tt_log_path, log_tick_usage, tt_capture_and_log, _tt_rotate) + `tick-telemetry.test.sh` (53/53) + `.gitignore` entries + `dev-standards.md` CANONICAL block, exactly per architect's Q1-Q6 ratification (trailer-choke-point design, one-file-per-script, jq-only).
**what-considered:**
- only path: architect's design was fully ratified and unambiguous; implemented as specified.
**why-decision:** N/A (mechanical implementation of an already-ratified blueprint) — see S2/S3 for the 2 deviations flagged.
**why-change:** no change from architect's blueprint EXCEPT 2 documented bug-fixes to its literal pseudocode — see STEP S2/S3.

---

### STEP developer-S2 · developer · 2026-08-12T13:56:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Fixed a leading-zero-octal defect in the architect blueprint's `tt_epoch_ms` EPOCHREALTIME pseudocode (`$(( sec * 1000 + ${micro:0:3} ))`, no base prefix).
**what-considered:**
- Copy pseudocode verbatim (task instruction said "implement exactly that" for the elapsed-time mechanism).
- Fix the leading-zero-octal defect via `10#` base-10 prefix on both operands — same mechanism, same degrade, only the arithmetic parsing corrected.
**why-decision:** EPOCHREALTIME's fractional part is always 6 zero-padded digits; bash treats any leading-"0" literal as octal, so ~1-in-10 ticks (fractional <0.1s) either silently mis-compute elapsed_ms (e.g. "052" read as 42, not 52) or crash outright on an 8/9 digit (e.g. "008" → "value too great for base"). Empirically reproduced both failure modes live (see tick-telemetry.sh header comment). This is the exact silent-corruption/crash class the task's own constraints warn against reintroducing — "implement exactly that" governs the MECHANISM (EPOCHREALTIME + date+%s degrade, no python3), not a literal arithmetic bug in the pseudocode. Flagged in code comments + CANONICAL block, not silently substituted.
**why-change:** deviation from literal blueprint pseudocode, documented per task's "flag rather than silently deviate" instruction. Regression-guarded by test.sh T6b/T6c (leading-zero-crash + leading-zero-silent-wrong-value cases).

---

### STEP developer-S3 · developer · 2026-08-12T13:57:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Fixed an off-by-one in `_tt_log_path`'s belt-and-suspenders fallback (architect pseudocode used `dirname(BASH_SOURCE)/../..`, 2 levels — resolves to `<repo_root>/scripts`, not `<repo_root>`, since the lib lives 3 levels below repo root: `scripts/agents-flow/lib/`).
**what-considered:**
- Copy pseudocode verbatim (2 "../").
- Use `git rev-parse --show-toplevel` instead (matches `hg_resolve_project_root`'s actual mechanism).
- Fix the path arithmetic to 3 "../" (correct depth, no new subprocess).
**why-decision:** A `git` subprocess call would cost a new fork on every invocation lacking `PREFLIGHT_ROOT`/`REPO_ROOT` — NFR-2 forbids new subprocess cost. Kept the pure-path-arithmetic design (matches the architect's actual stated intent: "belt-and-suspenders... computed from the lib's own file location"), only corrected the depth from 2 to 3 "../" so it resolves to the true repo root instead of silently writing telemetry under `scripts/docs/data/telemetry/`. This fallback branch is unreachable on all 3 real callers today (all already export `PREFLIGHT_ROOT`/`REPO_ROOT`) so the bug would have shipped invisibly until some future caller omitted both.
**why-change:** deviation from literal blueprint pseudocode, documented per task's "flag rather than silently deviate" instruction.

---

### STEP developer-S4 · developer · 2026-08-12T13:58:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Established the REAL AC-10 pre-sprint baseline for all 3 existing suites (intake brief's 20/37/32 counts were unverified) — actual live counts: cowork-tick-preflight.test.sh 40/40, dev-team-tick-preflight.test.sh 124/124, auditor-tier1-probe.test.sh 181/181, all green, zero regressions (this task touched none of their production files).
**what-considered:**
- only path: run all 3 suites unmodified, record real counts, per AC-10's explicit mandate.
**why-decision:** matches PO/BA/architect's repeated flag that the intake brief's quoted counts were guesses, not measurements — QA needs the true baseline to compare against post-WU-1/2/3.
**why-change:** no change from plan.

---
