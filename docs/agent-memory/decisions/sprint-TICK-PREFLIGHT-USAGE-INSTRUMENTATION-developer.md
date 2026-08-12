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

### STEP developer-S5 · developer · 2026-08-12T15:40:00Z
**task-id:** TICK-WU-1-COWORK-WIRING
**what-done:** Wired `cowork-tick-preflight.sh`'s trailer per the ratified mechanical pattern: added `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` alongside the existing `mcp-call.sh` source, replaced the bare `run_preflight; exit $?` with `tt_capture_and_log "cowork-tick-preflight.sh" run_preflight; exit $?`. Zero touches inside `run_preflight()`/`_emit_verdict()`/any `return` site.
**what-considered:**
- only path: handoff's Design Shape section fully specifies the exact diff; implemented verbatim.
**why-decision:** N/A — mechanical port of an already-ratified WU-0 contract.
**why-change:** no change from plan.

---

### STEP developer-S6 · developer · 2026-08-12T15:41:00Z
**task-id:** TICK-WU-1-COWORK-WIRING
**what-done:** Added 5 new test blocks (18 assertions) to `cowork-tick-preflight.test.sh`: T-LOG (logging-specific, SILENT path, full field-shape check), T-LOG2 (WORK path exit-code preservation), T-LOG3 (rotation in-situ over 8 real invocations at cap=5), T-LOG4 (AC-6 stdout purity + AC-2/AC-3 byte-identity), T-LOG5 (AC-4/AC-5 unwritable-destination fault inject).
**what-considered:**
- T-LOG4's initial draft asserted "stdout is a single line" (copying tick-telemetry.test.sh T10's synthetic-fixture shape).
- Corrected after a live run showed cowork's own `_emit_verdict()` calls `jq -n` WITHOUT `-c`/`--compact-output` — the real verdict has ALWAYS been multi-line pretty JSON, even pre-WU-1 (matches tick-telemetry.sh's own header comment, which I had read but the implication only became concrete on the failing assertion). A "single line" check would have been testing something never true, not a wiring regression.
**why-decision:** Replaced the wrong assertion with a byte-identity diff (`run_preflight()` called directly vs `tt_capture_and_log`-wrapped, under identical stub state) plus a `jq -e .` single-JSON-document parse check (which DOES fail on any leading/trailing non-JSON text, verified empirically) — this is the actually-correct AC-6/AC-2/AC-3 contract regardless of pretty vs compact print.
**why-change:** self-caught test-authoring bug, fixed before commit — not a production-code issue.

---

### STEP developer-S7 · developer · 2026-08-12T15:50:00Z
**task-id:** TICK-WU-2-DEVTEAM-WIRING
**what-done:** Wired `dev-team-tick-preflight.sh`'s trailer identically to WU-1 (source line + `tt_capture_and_log "dev-team-tick-preflight.sh" run_preflight` swap). Added 6 new test blocks (21 assertions) to `dev-team-tick-preflight.test.sh`: T-LOG..T-LOG5 (same 5-block pattern as WU-1, adapted to RUN/SKIP verdicts) plus T-LOG6 (R6 defensive-degrade: overrides `_step55_run_validate` to leak unredirected stdout text mid-`run_preflight()`, proving `log_tick_usage`'s `.verdict // "UNKNOWN"` degrade converts the corrupted capture to a graceful `verdict:"UNKNOWN"` row rather than crashing, without fixing or masking the underlying pre-existing leak — the leaked text is asserted to still reach the caller's own stdout unaffected, confirming this test reproduces the real risk shape rather than a synthetic stand-in).
**what-considered:**
- T-LOG4 reused WU-1's byte-identity fix directly (dev-team's `_emit_verdict()` also omits `-c`) — no rediscovery needed.
- T-LOG6: considered leaking from `_step55_run_cold_evict` instead, but that function is ALREADY fixed (capture-and-redirect-to-stderr, FIX-DEVTEAM-PREFLIGHT-STEP55-COLDEVICT-STDOUT-LEAK-CORRUPTS-VERDICT) — leaking there would prove nothing about R6, which explicitly names `_step55_run_validate`/`_step55_git_commit_evict` as the REMAINING unredirected sites.
**why-decision:** `_step55_run_validate` is the simpler of the two remaining R6 sites to override cleanly (single-purpose stub, already present in the test harness) and sufficiently reproduces the risk shape; a second leak site would be redundant coverage of the identical `log_tick_usage` degrade path.
**why-change:** no change from plan — R6 coverage was explicitly requested in the WU-2 handoff's Test Coverage section (item 5).

---

### STEP developer-S8 · developer · 2026-08-12T15:55:00Z
**task-id:** TICK-WU-1-COWORK-WIRING / TICK-WU-2-DEVTEAM-WIRING
**what-done:** AC-10 baseline verified pre-edit (cowork 40/40, dev-team 124/124 — matches WU-0's own recorded baseline exactly) and R4 confirmed post-edit BEFORE adding any new test (both suites re-ran unmodified, still 40/40 and 124/124 — the pre-existing tests, which source+call functions directly and never reach the trailer, are provably unaffected by the wiring). Final counts after adding the new logging tests: cowork 58/58, dev-team 146/146. `shellcheck -S warning` clean on all 4 touched files (1 `SC2034` unused-var warning self-caught and fixed by turning the captured `OUT_TLOG6` into a genuine R6-leak-reaches-stdout assertion rather than suppressing it).
**what-considered:**
- only path: R4/AC-10 ordering (baseline → edit → regression-check → new tests) was mandated by the handoffs; followed as specified.
**why-decision:** N/A — verification sequencing, not a design choice.
**why-change:** no change from plan.

---

### STEP developer-S4 · developer · 2026-08-12T13:58:00Z
**task-id:** TICK-WU-0-TELEMETRY-LIB
**what-done:** Established the REAL AC-10 pre-sprint baseline for all 3 existing suites (intake brief's 20/37/32 counts were unverified) — actual live counts: cowork-tick-preflight.test.sh 40/40, dev-team-tick-preflight.test.sh 124/124, auditor-tier1-probe.test.sh 181/181, all green, zero regressions (this task touched none of their production files).
**what-considered:**
- only path: run all 3 suites unmodified, record real counts, per AC-10's explicit mandate.
**why-decision:** matches PO/BA/architect's repeated flag that the intake brief's quoted counts were guesses, not measurements — QA needs the true baseline to compare against post-WU-1/2/3.
**why-change:** no change from plan.

---

### STEP developer-S9 · developer · 2026-08-12T14:44:00Z
**task-id:** TICK-WU-3-AUDITOR-WIRING
**what-done:** AC-10 baseline re-verified pre-edit (auditor-tier1-probe.test.sh 181/181 — matches S4's recorded baseline exactly). Wired `auditor-tier1-probe.sh` per the architect's own-design blueprint (handoff FR-4 + Q3 ratification): added `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` right after `SCRIPT_DIR`/`REPO_ROOT` resolve, then wrapped BOTH trailer branches independently — `1) tt_capture_and_log "auditor-tier1-probe.sh" run_probe; exit $?` and `2|3) tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"; exit $?` — leaving the invalid-tier branch (exit 2) unwrapped per R5. Zero touches inside `run_probe()`/`run_tiered_probe()`/`_emit_verdict()`/any `return`/any `jq -n` site. R4 confirmed: re-ran the unmodified 181-case suite immediately post-edit, before adding any new test — still 181/181, proving the trailer-only design leaves every pre-existing assertion (which sources the script and calls the functions directly, never reaching the trailer) untouched.
**what-considered:**
- only path: the handoff's Design Shape section gives the exact 2-branch diff (distinct from WU-1/WU-2's single-branch mechanical port) — implemented verbatim, no alternative considered (this IS the "own design review" architect already did; my job was faithful wiring + proving it with tests, not re-deriving the design).
**why-decision:** N/A — mechanical wiring of an already-ratified, already-ferreted-out design (the double-log risk analysis and its resolution both belong to architect's decision journal, referenced not repeated here).
**why-change:** no change from plan.

---

### STEP developer-S10 · developer · 2026-08-12T14:45:00Z
**task-id:** TICK-WU-3-AUDITOR-WIRING
**what-done:** Added 7 new test blocks (33 assertions) to `auditor-tier1-probe.test.sh` (181→214): T-LOG (Tier-1 ALL_GREEN logging, full field-shape + session-id-absence check), T-LOG2 (Tier-1 FAILURE exit-code preservation), T-LOG3 (Tier-2/3 wrapped call — exactly ONE log line with SKIP-SPAWN vocabulary, explicitly asserted NOT ALL_GREEN/FAILURE), T-LOG4 (**CRITICAL double-log negative control**: BARE, unwrapped calls to `run_probe("suppress_heartbeat")` — the exact signature `run_tiered_probe()`'s own inner call uses — AND to `run_tiered_probe()` itself both write ZERO log lines, proving logging is a side effect of the explicit trailer-level `tt_capture_and_log` wrap only, never of merely calling either function), T-LOG5 (rotation in-situ, 8 calls capped at 5), T-LOG6 (AC-6 stdout purity + AC-2/AC-3 byte-identity for BOTH tiers), T-LOG7 (AC-4/AC-5 unwritable-log-destination fault injection for BOTH tiers).
**what-considered:**
- For T-LOG3/T-LOG4 (the double-log proof), considered a single test that "directly calls `run_tiered_probe()` and instruments the log file" per the handoff's literal Test Coverage §3 wording, taken at face value — but a bare, unwrapped call to `run_tiered_probe()` cannot itself produce ANY log line (nothing calls `log_tick_usage` unless routed through `tt_capture_and_log`), so a literal single-test reading of "ZERO from inner, ONE from outer" is unsatisfiable as one assertion — the "outer" line only exists once something wraps the outer call.
- Resolved by splitting into two complementary tests instead: T-LOG3 proves the POSITIVE half (the real trailer-shaped wrapped call — `tt_capture_and_log ... run_tiered_probe "$TIER"` — logs EXACTLY once, with Tier-2/3 vocabulary, not Tier-1's) and T-LOG4 proves the NEGATIVE half (bare calls to either function, unwrapped, log ZERO times — ruling out any accidental hook inside `run_probe()`/`run_tiered_probe()` themselves). Together they are strictly stronger than the literal single-test reading: T-LOG3 alone could not detect "an internal hook exists AND is being counted as the single line" (a hypothetical scenario where an internal hook silently replaced the intended trailer-level one); T-LOG4 rules that out directly by proving the bare functions are silent on their own.
- For T-LOG6 (AC-6 byte-identity), initially planned to reuse WU-1/WU-2's ALL_GREEN-happy-path pattern verbatim, but caught before writing: unlike cowork/dev-team's `_emit_verdict()`, auditor's `run_probe()` ALL_GREEN branch mints a LIVE `_now_iso()` timestamp into `last_healthy_at`, and `run_tiered_probe()`'s ALL_GREEN branch can compute a live `heartbeat_age_minutes` — either would make two separate real invocations (raw vs wrapped) only probabilistically byte-identical, a clock-boundary flake this task's own AC-10 discipline forbids introducing.
**why-decision:** Switched T-LOG6 to a FAILURE-path stub (`STUB_DOCKER_PS="one_down"`) for BOTH tiers instead — `run_probe()`'s FAILURE branch reads `last_healthy_at` from the pre-existing heartbeat file (fixed, never re-minted per call) and `run_tiered_probe()`'s non-ALL_GREEN branch short-circuits `heartbeat_age_minutes` to `null` unconditionally (see its own `if checks_verdict = ALL_GREEN` branch) — fully deterministic regardless of elapsed wall-clock time between the two calls, while still exercising the identical AC-2/AC-3/AC-6 contract (byte-identical reprint, single JSON document).
**why-change:** deviation from a literal single-test reading of the handoff's Test Coverage §3 (split into 2 tests) and from WU-1/WU-2's ALL_GREEN-path T-LOG4/T-LOG6 pattern (switched to FAILURE-path for the byte-identity check specifically) — both documented here as this task's own required "design review distinct from mechanical WU-1/WU-2 ports," not silent deviations.

---

### STEP developer-S11 · developer · 2026-08-12T14:46:00Z
**task-id:** TICK-WU-3-AUDITOR-WIRING
**what-done:** Final verification: `auditor-tier1-probe.test.sh` 214/214 (181 pre-existing + 33 new, zero regressions). Sprint-wide cross-check — re-ran all 3 sibling suites unmodified to confirm zero cross-contamination from this change: `tick-telemetry.test.sh` 53/53, `cowork-tick-preflight.test.sh` 58/58, `dev-team-tick-preflight.test.sh` 146/146. `shellcheck -S warning` clean on both touched files (2 self-caught `SC2034` unused-var warnings on `RC_TLOG4_INNER`/`RC_TLOG4_OUTER`, fixed by turning both into genuine exit-code assertions rather than suppressing — same discipline as WU-2's S8 note). `bun test`/`tsc` N/A — pure bash/jq, no `apps/` TypeScript touched (cross-service/ zone, same as WU-0/1/2). Confirmed `docs/data/telemetry/*.jsonl` stays fully git-ignored (WU-0's `.gitignore` entry) — no risk of the now-live-on-disk trailer wiring's real telemetry writes (observed 15 real lines already accumulated in the live `auditor-tier1-probe.jsonl` from cron activity during this session, confirming the feature works end-to-end in situ) leaking into any commit.
**what-considered:**
- only path: verification sequencing (AC-10 baseline → edit → R4 regression-check → new tests → shellcheck → sprint-wide cross-check) mandated by the task + established WU-1/WU-2 precedent; followed as specified.
- Noted but out of scope: `docs/policies/dev-standards.md`'s WU-0 CANONICAL block (line ~615) still reads "WU-1/2/3 wiring is OUT of this WU-0 task's scope... tracked separately" — now stale since all 3 are wired, but WU-1/WU-2 set the precedent of not touching this shared-lib-owned doc from a wiring task's own "Docs updated" step (their domain change was entirely in their own target script + test file, not the lib's documentation). Left as-is for consistency; flagged here for PM/QA awareness at sprint closeout, not fixed by this task.
**why-decision:** N/A — verification sequencing and doc-scope discipline, not a design choice.
**why-change:** no change from plan.

---
