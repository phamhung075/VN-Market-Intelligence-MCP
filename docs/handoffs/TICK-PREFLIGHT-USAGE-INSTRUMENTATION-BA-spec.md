# BA Spec — TICK-PREFLIGHT-USAGE-INSTRUMENTATION

**Task:** BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION · P2 · SPRINT-M · zone `cross-service/` · sprint TICK-PREFLIGHT-USAGE-INSTRUMENTATION
**BA date:** 2026-08-12
**Verdict carried forward:** PO triage 2026-08-12T13:03Z → scope minted (4 rows: WU-0..WU-3, gated) → zero PO blockers on this spec → **NEXT: architect**

---

## 0. Scope binding (from PO decision journal — read verbatim before acting)

Full source: `docs/agent-memory/decisions/sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-po.md`, `.sprint_goal.entries[] sprint_id=TICK-PREFLIGHT-USAGE-INSTRUMENTATION`. Restated so architect never re-derives it:

- **FOUR rows, sequenced, WU-0 gates the rest:** WU-0 shared lib `scripts/agents-flow/lib/tick-telemetry.sh`; WU-1 `cowork-tick-preflight.sh`; WU-2 `dev-team-tick-preflight.sh`; WU-3 `auditor-tier1-probe.sh` (gated last — not the same change as WU-1/WU-2, see §1).
- **scope_out, BINDING, do not re-litigate:** (a) zero change to verdict token / JSON field set / exit code / lock claim-release sequence / MCP call sequence in any of the 4 scripts; (b) zero new tool call, MCP call, git operation, or network I/O on the silent/skip path; (c) no `est_tokens`/cost field computed inside any script; (d) the other 3 family members (`code-janitor-tick-preflight.sh`, `db-integrity-probe.sh`, `orch-sentinel-lite-probe.sh`) are OUT this sprint — record as designated follow-up, do not widen; (e) no analysis/reporting step reading the JSONL — separate row after ≥7 days of accumulated data; (f) `CLAUDE_CODE_SESSION_ID` is NEVER logged, not even hashed (breaks `cowork-tick-preflight.sh:56-57`'s stated contract).
- **Engine = jq**, not python3 — all 4 scripts already hard-depend on it. **Ratio = 4 chars/token**, `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md` §W-1 — reuse, do not invent, do not bake into a script.
- **AC-11 is acceptance-bearing, not a nicety:** `verdict_bytes` is a LOWER BOUND on true per-tick cost (excludes the cron prompt text + flow-doc lines the LLM loads that tick, measures only the tool_result). Every artifact this sprint produces must state this explicitly.
- PO's AC-1..AC-11 (full text: `.task_board.backlog[] id=BA-TICK-PREFLIGHT-USAGE-INSTRUMENTATION` `.desc`) are carried forward **unrenumbered** below. This spec adds FR/NFR mapping and new BA-flagged decision points only.

---

## 1. Live-code findings that refine the design (source-verified this cycle, beyond PO's own read)

Re-read all four scripts end-to-end. PO's 4 source findings (choke points differ / family is 6 not 3 / ratio exists / test seam exists) are confirmed unchanged. Three additional findings below are NEW — none were in the router's brief or PO's journal — and each is a real fault-injection risk given AC-4/AC-5's rigor:

1. **`exit_code` is not produced by the choke point itself.** Every call site in both `cowork-tick-preflight.sh` and `dev-team-tick-preflight.sh` is the two-statement idiom `_emit_verdict "<VERDICT>" ...; return N` — `_emit_verdict()`'s own return status is jq's exit code, not the caller's intended verdict-to-exit-code mapping. The mapping IS deterministic per script (re-verified against every call site this cycle): cowork `SILENT→0`, everything else (`WORK|LOST_ELECTION|DEFER|ERROR|TOMBSTONED`)`→1`; dev-team `SKIP|SKIP-WIDENED→0`, everything else (`RUN|RUN-IDLE|ERROR`)`→1` — both already stated in each script's own header "Exit code:" line. But a logger hooked only at `_emit_verdict()` cannot see the real `$?` — it would need a hardcoded verdict→code lookup table (drift risk: a future verdict path added without updating the lookup silently mis-logs `exit_code`, corrupting the dataset the same way an unstated `verdict_bytes` caveat would) or a change at every `return N` site (wider blast radius than the "~1 line" WU-2 framing). **Architect decision point — FR-7/Q4.**

2. **`elapsed_ms` requires a start-time anchor `_emit_verdict()` does not have** — the natural point is the top of `run_preflight()`, a single addition (mechanically compatible with "~1 line"), but the actual millisecond computation hits a documented project landmine: memory `feedback_bsd_date_3n_literal_corrupts_iso8601` — macOS/BSD `date` has no `%N`/`%3N` and silently emits a wrong literal string with **exit 0**, so no fallback ever fires. Confirmed via repo-wide grep: **zero existing script computes millisecond-precision elapsed time today** — there is no established pattern to copy. The memory's own prescribed fix ("use python3 for ms precision") directly conflicts with this sprint's binding engine decision (jq only, "adding python3 is a new failure mode for zero benefit"). Bash's `EPOCHREALTIME` builtin (no subprocess, no `date` dependency) needs bash ≥5.0; macOS ships bash 3.2 as `/bin/bash` by default and `#!/usr/bin/env bash` resolves per-host `$PATH`. **Architect decision point — FR-6/Q5.**

3. **WU-3's double-log risk is sharper than "6 inline sites, 2 shapes."** `run_probe()` has 3 internal `jq -n` sites (heartbeat-write-FAILED, `ALL_GREEN`, `FAILURE`); `run_tiered_probe()` has 3 more (invalid-tier guard, its own outer wrapper verdict, plus the standalone-dispatcher's invalid-`--tier`-arg case at the bottom of the file) — same 6 sites PO already cited (lines 757/767/772/858/894/921, re-verified this cycle, still accurate). The part PO's finding doesn't spell out: **`run_probe()`'s heartbeat-write-FAILED branch (line ~757) is structurally unreachable when called from `run_tiered_probe()`** — `suppress_heartbeat` mode skips the entire `_write_heartbeat` block that branch lives inside, so that specific site is Tier-1-standalone-only and always real stdout there; it is exactly the other **2** of `run_probe()`'s 3 sites (`ALL_GREEN` line ~767, `FAILURE` line ~772) that carry the actual double-log risk — real stdout for Tier-1 standalone, **captured into a variable only** (never real stdout) when invoked internally by `run_tiered_probe()` (`inner_out=$(run_probe "suppress_heartbeat")`). For Tier-2/3, the true stdout is `run_tiered_probe()`'s own separate final `jq -n` (line ~894, a *different* field set: `{tier, checks_verdict, verdict:SKIP-SPAWN|SPAWN, detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes}`). A hook placed unconditionally at all 6 sites would (a) log a "verdict" for the 2 shared sites on every tier-2/3 tick that never actually reached real stdout, and (b) never log the actual tier-2/3 stdout line at all unless a 7th, separate hook is added at line ~894 — silently corrupting the dataset exactly as PO's `product_decision` warns. **This is the concrete evidence WU-3 needs a real choke-point extraction** (e.g. `run_probe()` stops printing directly and its ONE caller — either the Tier-1 dispatcher or `run_tiered_probe()` — becomes the sole print+log site), not a mechanical per-site port of FR-2/FR-3's pattern.

4. **Root-var naming diverges across the 3 wiring targets.** `cowork-tick-preflight.sh`/`dev-team-tick-preflight.sh` both resolve an overridable `PREFLIGHT_ROOT` env var; `auditor-tier1-probe.sh` instead computes a non-overridable `REPO_ROOT` (only its *derived* paths, e.g. `HEARTBEAT_FILE_PATH`, are override seams). WU-0's shared helper needs either a single convention all 3 callers adapt to, or an explicit "log destination passed in by the caller" contract that works under both namings. **Architect decision point — Q6.**

5. **Test seam is real and reusable, not just claimed** (PO's Finding 4, confirmed): `cowork-tick-preflight.test.sh` isolates via `PREFLIGHT_ROOT=$(mktemp -d ...)` + a stubbed `mcp_call`. `auditor-tier1-probe.test.sh` already has a **precedent fault-injection case** — pointing `HEARTBEAT_FILE` at a path whose parent directory does not exist — structurally identical to what AC-5 needs for the new log path. WU-0/1/2/3 test additions should extend these existing patterns, not invent new isolation mechanics.

---

## 2. Requirements

### FR-1 — Shared log-emission helper (WU-0)
**DDD layer: infrastructure.** New `scripts/agents-flow/lib/tick-telemetry.sh`, one function `log_tick_usage(...)` (script name, verdict, tick, verdict_json_bytes, elapsed_ms, exit_code) appending ONE `jq -c` JSON line to the configured destination. Follows the existing shared-lib extraction precedent (`scripts/agents-flow/lib/hook-guard.sh`, `scripts/agents-flow/lib/notebook-section-direction.sh`) — sourced by WU-1/2/3, never duplicated. Ships its own regression suite, green before any wiring (PO's WU-0-gates-the-rest ordering).

### FR-2 — Wire `cowork-tick-preflight.sh` at its `_emit_verdict()` choke point (WU-1)
**DDD layer: infrastructure.** `log_tick_usage` fires once per invocation, capturing the exact string that reaches stdout. Zero change to the emitted stdout line (AC-3/AC-6). Depends on FR-6 (elapsed_ms) and FR-7 (exit_code) being resolved first.

### FR-3 — Wire `dev-team-tick-preflight.sh` at its `_emit_verdict()` choke point (WU-2)
**DDD layer: infrastructure.** Same pattern as FR-2, targeting `dev-team-tick-preflight.sh:200-204`. Gated on WU-0 (FR-1) landing green.

### FR-4 — Wire `auditor-tier1-probe.sh` via an extracted choke point, NOT a per-call-site hook (WU-3)
**DDD layer: infrastructure/application** — this WU needs a real application-layer decision, not a mechanical port. Gated on WU-0/1/2 all green. Architect must design a single logging call point that fires exactly once per real invocation, correctly discriminating the Tier-1-standalone-stdout context from the Tier-2/3-wrapper-stdout context (§1 finding 3). Highest-risk WU in the sprint (925-line script, 1323-line suite) — treat as its own design review, not a copy of FR-2/FR-3.

### FR-5 — Recorded fields, exactly as scoped (no more, no less)
**DDD layer: infrastructure.** Per invocation: `ts` (real wallclock `date -u +%Y-%m-%dT%H:%M:%SZ`, never hand-typed — memory `feedback_hand_typed_iso_timestamps_drift_into_the_future`), `script`, `verdict`, `tick` (where the script has one), `verdict_bytes` (byte length of the EXACT captured stdout line, never re-derived), `elapsed_ms`, `exit_code`. Explicitly NOT: session id (scope_out f), any computed token/cost field (scope_out c).

### FR-6 — `elapsed_ms` measurement mechanism (BA-flagged, §1 finding 2)
**DDD layer: infrastructure.** Architect must pick and document ONE of: (i) bash `EPOCHREALTIME` builtin with an explicit availability check + graceful degrade to second-precision when unset; (ii) accept second-precision and either relabel the field or multiply by 1000 with the resolution limitation documented; (iii) another zero-new-dependency mechanism (engine constraint: jq only, no python3 — memory `feedback_bsd_date_3n_literal_corrupts_iso8601` is the negative precedent, not the fix to copy). Whichever is chosen, the resolution limitation must be stated in the same artifacts AC-11 already mandates — never ship a field named `_ms` that is actually second-granularity without saying so.

### FR-7 — `exit_code` capture mechanism (BA-flagged, §1 finding 1)
**DDD layer: infrastructure.** Architect must pick and document ONE of: (i) a verdict→exit_code lookup table inside the logging call (per-script, mappings differ), with an explicit note that this is a two-places-must-stay-in-sync invariant, flagged for QA regression coverage (a future new verdict path must update both the script and the lookup); (ii) capturing the real post-`return` exit status (wider call-site blast radius than PO's "~1 line" WU-2 framing — must flag the tradeoff if chosen, not silently absorb it).

### FR-8 — Rotation / size cap (PO's AC-8)
**DDD layer: infrastructure.** Size-capped, last-N-lines preserved, atomic truncate (tmp+mv, never in-place). State explicitly whether an append racing a rotation can be lost, and that this is an accepted tradeoff if so — do not leave unstated (PO's own AC-8 wording).

### FR-9 — Fault-tolerant, non-blocking append (PO's AC-4/AC-5/AC-9)
**DDD layer: infrastructure.** Single `O_APPEND` write of one line, never read-modify-write. Unwritable destination (missing parent dir, permission error, disk full) degrades silently — zero effect on caller's stdout, exit code, or lock sequence. Concurrent appenders (cowork 15min, dev-team 7/37min, possibly different sessions) never corrupt each other's lines or the caller's own return status.

### FR-10 (explicit non-goal) — the other 3 family members stay out
**DDD layer: N/A (process constraint).** `code-janitor-tick-preflight.sh`, `db-integrity-probe.sh`, `orch-sentinel-lite-probe.sh` are untouched this sprint (scope_out d). Any implementation touching them is a scope violation — bounce to PO. Record as the designated follow-up, minted only after WU-0 has proven itself on a live cron.

---

## 3. Non-functional requirements

- **NFR-1 — Zero semantic change (AC-3).** Verdict token, JSON field set, exit code, lock claim/release sequence, and MCP call sequence must be byte-identical before/after in all 4 scripts. Carries forward the R2/R3/R4/R7/R8 risk notes from sprint TOKEN-ECONOMY-TICK-PREFLIGHT (`prior_art_folded`) — still binding.
- **NFR-2 — Zero new tool-call cost on the silent/skip path (AC-7, the sprint's entire point).** The logging call is a pure local file append; zero new MCP/git/network I/O; zero new subprocess forks beyond what the jq-line-format + append itself needs.
- **NFR-3 — stdout purity (AC-6).** The verdict line stays the FIRST and ONLY thing on stdout — memory `feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it`. Must be tested with a fault-injected logger that *tries* to write to stdout, proving the guard actually catches this class — not just asserting the happy path is clean.
- **NFR-4 — Test-seam reuse (§1 finding 5).** Extend the existing `PREFLIGHT_ROOT` fixture-isolation pattern and the existing `HEARTBEAT_FILE` parent-dir-missing fault-injection precedent for the new log-path override; do not invent a second isolation mechanism.
- **NFR-5 — Gitignore discipline lands in the same change (Q1).** If architect ratifies PO's `docs/data/telemetry/tick-usage.jsonl` gitignored preference, the `.gitignore` pattern must be added in the SAME change — mirrors the existing `docs/data/cycle-snapshot-*.json` triple-pattern block already present. An undeclared untracked path risks an accidental force-add sweep (memory `feedback_subagent_force_add_secret_leak`, `feedback_shared_main_peer_push_sweeps_held_data_commits`).

---

## 4. Edge cases

- Log destination's parent directory does not exist on first run (fresh clone/VPS) — must self-create or degrade silently per AC-5; architect's call which.
- Concurrent cowork + dev-team ticks appending to the SAME file (if Q2 resolves to one shared file) within the same wallclock second — single-line `O_APPEND` must not interleave partial lines (FR-9).
- Rotation firing exactly while a concurrent appender is mid-write — AC-8's stated-tradeoff requirement.
- `auditor-tier1-probe.sh`'s dual-mode double-count risk (§1 finding 3) — highest-risk edge case in the sprint; a naive port silently corrupts the exact dataset the sprint exists to produce, worse than not shipping WU-3.
- A future verdict path added to a script without updating an FR-7 lookup table (if that design is chosen) — must produce a visible failure mode (sentinel/null + a loud marker), never a silently-wrong `exit_code`.
- macOS (BSD `date`, bash 3.2 default) vs. the Linux cron host (GNU `date`, bash 5.x) — every new date/time computation this sprint, `elapsed_ms` above all, must be verified on both, not just the dev machine — direct hit on memory `feedback_bsd_date_3n_literal_corrupts_iso8601`.
- Not VN-financial-data-specific: pure dev-tooling/cron infrastructure, no VN locale/BCTC/market-data surface — noted explicitly per spec convention rather than omitted.

---

## 5. Blockers

**None requiring PO.** PO's decision journal already resolved every business-priority/scope question (4-vs-1-vs-3-vs-6 rows, engine, ratio, session-id exclusion, log-destination preference). The 6 items below are technical/architecture judgment calls, correctly routed to architect:

1. **Q1** (PO's, restated) — log destination path + git-tracked vs. git-ignored. PO's stated preference: `docs/data/telemetry/tick-usage.jsonl`, git-ignored, overridable only with written rationale (§0).
2. **Q2** (PO's, restated) — one shared JSONL vs. one file per script (rotation fairness).
3. **Q3** (PO's, restated, sharpened by §1 finding 3) — WU-3's extraction shape: a single choke point that correctly discriminates the Tier-1-standalone-stdout context from the Tier-2/3-wrapper-stdout context, not a naive per-call-site hook.
4. **Q4** (BA-flagged, §1 finding 1 / FR-7) — `exit_code` capture mechanism: verdict→code lookup table (drift risk) vs. real post-return capture (wider blast radius).
5. **Q5** (BA-flagged, §1 finding 2 / FR-6) — `elapsed_ms` measurement mechanism given the BSD-date-`%N` landmine and the no-python3 constraint.
6. **Q6** (BA-flagged, §1 finding 4) — WU-0's shared root-resolution convention across cowork/dev-team's `PREFLIGHT_ROOT` vs. auditor's `REPO_ROOT` naming divergence.

---

## 6. Recommended scope/sequencing for architect (PO's ordering, restated with FR mapping)

| Order | WU | FR(s) | Gate |
|---|---|---|---|
| 1 | WU-0 shared lib | FR-1, FR-5, FR-6, FR-7, FR-8, FR-9 | Own regression suite green |
| 2 | WU-1 `cowork-tick-preflight.sh` | FR-2 | WU-0 green |
| 3 | WU-2 `dev-team-tick-preflight.sh` | FR-3 | WU-0 green; ~1 line per PO, pending FR-6/FR-7 resolution |
| 4 | WU-3 `auditor-tier1-probe.sh` | FR-4 | WU-0/1/2 ALL green; separate design review (§1 finding 3) |
| — (non-goal) | code-janitor/db-integrity/orch-sentinel-lite | FR-10 | Follow-up row only, after WU-0 proves itself on live cron |

**QA note carried forward verbatim from PO (AC-10):** the intake brief's suite counts (cowork 20/20, dev-team 37/37, auditor 32/32) are **UNVERIFIED**. Establish the real pre-sprint baseline by running all 3 suites (`bash scripts/agents-flow/cowork-tick-preflight.test.sh`, `bash scripts/agents-flow/dev-team-tick-preflight.test.sh`, `bash scripts/agents-flow/auditor-tier1-probe.test.sh`) before any script edit, not after.

No code changes performed by BA this cycle (spec-only, `plan_only` not set on the row but no production file touched). DDD layer mapping across all FRs lands in infrastructure (and one application-layer decision, FR-4/WU-3) — domain/interface layers are N/A: these are cron-shell-script tooling, not domain model or user-facing surface.

---

## RETURN
DONE: BA spec complete — FR-1..FR-10 (DDD layer: infrastructure, +application for WU-3), 5 NFRs, edge cases, zero PO blockers. PO's AC-1..AC-11 carried forward unrenumbered. 3 new BA-flagged decision points (Q4 exit_code mechanism, Q5 elapsed_ms mechanism/BSD-date landmine, Q6 root-var naming divergence) added alongside PO's Q1-Q3 (Q3 sharpened with exact dual-stdout-context evidence, including the previously-unnoted fact that only 2 of run_probe()'s 3 internal sites carry real double-log risk).
NEXT: architect — technical blueprint for WU-0 (shared lib) first, gating WU-1/WU-2 (mechanical `_emit_verdict` hooks), then WU-3 (choke-point extraction, own design review). Answer/ratify Q1-Q6 explicitly in the architect section of this same file — do not silently pick one without written rationale (Q1 carries a PO preference overridable only with written rationale).
HANDOFF: docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md
PIPELINE: continue

---

## [Architect] Q1-Q6 Ratification

Read all 3 target scripts end-to-end at source (not just the cited line ranges), the 2 in-tree
shared-lib extraction precedents (`hook-guard.sh`, `notebook-section-direction.sh`), both
existing test suites' isolation mechanics, `.gitignore`, and the token-ratio brief before ruling.
One design decision below (§ Design decisions, "the trailer IS the choke point") changes the
shape of Q3/Q4's answer versus how BA framed the two options — ratified here with full written
rationale, not silently substituted.

**Q1 (PO-origin) — log destination + git-tracked vs. git-ignored.**
RATIFIED: `docs/data/telemetry/`, git-ignored. PO's stated rationale stands (churn-vs-tracked-file
commit-sweep hazard; `docs/data/cycle-snapshot-*.json` is real precedent, `*-last-verdict.json`/
`*-last-snapshot.json` are not). **Amendment, not override, with written rationale:** the exact
filename is NOT the single `tick-usage.jsonl` PO's preference literally named — Q2 below rules
one file **per script**, so the directory holds 3 files (`cowork-tick-preflight.jsonl`,
`dev-team-tick-preflight.jsonl`, `auditor-tier1-probe.jsonl`). The directory + git-ignored
decision is unchanged from PO's preference; only the singular-vs-plural filename shape moves, and
only because Q2 (also PO's own open question) resolves against a single shared file. Additional
supporting precedent found this cycle beyond PO's own citation: `docs/data/db-integrity-history.json`
is a second, independently-shipped rolling-telemetry file that is ALSO git-ignored (`.gitignore`
`# Rolling operational telemetry (cap 200, helper recreates)`) — same category of artifact,
same treatment, reinforcing rather than contradicting PO's Q1 preference.

**Q2 (PO-origin) — one shared JSONL vs. one file per script.**
RATIFIED: **one file per script.** Removes the rotation-fairness race PO's own question describes
by construction (no cross-script cap contention possible when each script only ever writes its own
file) rather than by tuning a shared cap large enough to make the race improbable. Zero cost on the
consumer side: a future analysis step (explicitly out of THIS sprint per scope_out (e)) merges
trivially via `cat docs/data/telemetry/*.jsonl | jq -s` or per-script `jq` reads — nothing this
sprint forecloses. Tier-2/3 (auditor) shares its parent script's ONE file with tier-1 (not a 4th
file) — see § WU-3 design; the two verdict vocabularies (`ALL_GREEN|FAILURE` vs
`SKIP-SPAWN|SPAWN`) never collide, so tier is recoverable from `verdict` alone without a
dedicated `tier` field (kept out of FR-5's field set — "no more, no less").

**Q3 (PO-origin, sharpened by BA) — WU-3's choke-point extraction shape.**
RATIFIED, with a different mechanism than either BA-evidenced sub-option implied. See
§ Design decisions "The trailer is the real choke point" below — full rationale there, not
repeated here. Summary: the extraction is NOT inside `run_probe()`/`run_tiered_probe()` at all;
it wraps the script's existing bottom dispatcher (`if [[ BASH_SOURCE[0] == $0 ]]`), which is
already the single point where the Tier-1-standalone-stdout and Tier-2/3-wrapper-stdout paths are
structurally distinguished by the pre-existing `case "$TIER" in 1) ... ;; 2|3) ... ;; esac`. Zero
new touches inside `run_probe()`/`run_tiered_probe()` — their internal `jq -n` sites (all 6 PO/BA
cited) are untouched and their existing 1323-line suite is provably unaffected (see § Test impact).

**Q4 (BA-origin) — `exit_code` capture mechanism.**
RATIFIED, and this is the SAME mechanism that resolves Q3 — not a coincidence, the single design
decision below answers both. Neither of BA's two named options (lookup table / touch every
`return N` site) is adopted. Instead: relocate the log call from inside `_emit_verdict()` to the
already-existing trailer, which calls `run_preflight`/`run_probe`/`run_tiered_probe` exactly ONCE
per real invocation and already does `exit $?` immediately after — the real `$?` is sitting right
there, no lookup table, no per-`return`-site edits, and a *smaller* diff than either of BA's
options (one new trailer line per script, zero edits inside `_emit_verdict()` or any `return N`
statement). This directly closes BA's own stated drift risk ("a future verdict path added without
updating the lookup silently mis-logs exit_code") — there is no lookup table to drift out of sync
with.

**Q5 (BA-origin) — `elapsed_ms` measurement mechanism.**
RATIFIED: bash `EPOCHREALTIME` (sub-second, zero subprocess) when available, graceful degrade to
`date -u +%s`-based **second-precision** (rounds down, reported as a multiple of 1000) when not —
BA's option (i), made concrete. Verified live on this machine this cycle: `bash --version` and
`/bin/bash --version` both report `3.2.57` (macOS system bash) and `EPOCHREALTIME` is unset in
this exact session — the degrade path is this session's live reality, not a hypothetical edge
case. This does **not** touch the `feedback_bsd_date_3n_literal_corrupts_iso8601` landmine at all
(that memory is about `date`'s `%N`/`%3N` format specifier silently producing garbage with exit 0
— the fallback here never calls `date` with any sub-second format specifier, only the always-safe
`date -u +%s`). No python3 introduced (Q5's binding constraint respected). The resolution caveat
is documented in the shared lib's header comment and `dev-standards.md`'s CANONICAL pointer (same
treatment AC-11 already mandates for `verdict_bytes`) — **not** as a new per-row JSON field (FR-5
is explicit: "no more, no less" fields; a per-row precision flag would violate that, and the two
verdict vocabularies already make second-precision rows statistically self-evident — clusters of
`elapsed_ms % 1000 == 0` — without a dedicated flag).

**Q6 (BA-origin) — `PREFLIGHT_ROOT` vs. `REPO_ROOT` naming divergence.**
RATIFIED: WU-0's shared lib does not require either calling script to rename or newly export
anything. `log_tick_usage`'s internal path resolver checks, in order: (1) `TICK_TELEMETRY_LOG_PATH`
(new, explicit override — the "second seam" BA's own backlog-row finding said would still be
needed since `REPO_ROOT` has no override seam today), (2) `PREFLIGHT_ROOT` (cowork/dev-team), (3)
`REPO_ROOT` (auditor), (4) a git-toplevel fallback computed from the lib's own file location
(belt-and-suspenders, matches `hg_resolve_project_root`'s fallback shape). Zero edits to either
existing root-resolution line in any of the 3 scripts. This is *why* Q6 needed an explicit design,
not a naming unification — auditor's test suite has no seam to override `REPO_ROOT` (BA's Finding
4, confirmed live-read this cycle), so a design that only checked `PREFLIGHT_ROOT`/`REPO_ROOT`
would leak auditor's new logging-test writes into the REAL `docs/data/telemetry/` during `bash
auditor-tier1-probe.test.sh` runs — the dedicated override closes that, and is the ONLY seam
auditor's new logging tests need to set.

---

## [Architect] Brownfield Findings

### Zone
`cross-service/` (`system-map.json` `.project.zones[] | select(.id=="cross-service")` →
`path: scripts/`, `specialist: developer`) — confirmed, matches BA's header, single zone, no
split. **BUILD-STANDARD: not-applicable** (bug-fix/instrumentation-add to existing scripts, no new
service, no new microservice primitive — `tick-telemetry.sh` is a shared shell utility, same
class as `hook-guard.sh`/`notebook-section-direction.sh`).

### Verified paths (read end-to-end this cycle)
- `scripts/agents-flow/cowork-tick-preflight.sh:76-82` `_emit_verdict()` (15 call sites,
  `set -u`, no `set -e`) — every call site's own printed jq output is the ONLY unredirected
  stdout write anywhere in `run_preflight()`'s call tree; confirmed via grep of every bare
  `echo`/`printf` in the file — all others are already captured at their call site
  (`presence_result=$(mcp_call ... 2>&1)` etc.) or redirected (`>/dev/null 2>&1`).
- `scripts/agents-flow/cowork-tick-preflight.sh:299-303` — the "Standalone execution" trailer:
  `if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then run_preflight; exit $?; fi`. Exit-code mapping
  (re-verified against every `return` statement): `SILENT`→0 (`_step8_silent_release` line 142
  `return 0`), everything else (`ERROR|TOMBSTONED|DEFER|LOST_ELECTION|WORK`)→1.
- `scripts/agents-flow/dev-team-tick-preflight.sh:200-204` `_emit_verdict()` (14 call sites) —
  same shape, same clean-stdout property verified the same way; `_step55_board_hygiene` (line 420)
  and its callees are the ONE place in this file with unredirected sub-process output risk, and
  it is **already fixed** — see Risk Note below.
- `scripts/agents-flow/dev-team-tick-preflight.sh:682-686` — identical trailer shape. Exit-code
  mapping (re-verified): `SKIP|SKIP-WIDENED`→0, `ERROR|RUN-IDLE|RUN`→1.
- `scripts/agents-flow/dev-team-tick-preflight.sh:490-521` — comment block + code for
  `FIX-DEVTEAM-PREFLIGHT-STEP55-COLDEVICT-STDOUT-LEAK-CORRUPTS-VERDICT` (2026-08-01): a **real,
  already-fixed prior incident** of exactly the stdout-leak class this sprint's AC-6 guards
  against — `_step55_run_cold_evict()` redirects `orch-cold-evict.sh`'s progress output to
  stderr; **`_step55_run_validate()` (line 516-518) and `_step55_git_commit_evict()` (line
  520-527) remain unredirected** (`bash orch-state-validate.sh ...` / `git add` / `git commit`
  print straight through). This is PRE-EXISTING, low-frequency (only reached when
  `_step55_would_evict` detects real byte reduction), and out of this sprint's scope to fix
  (zero-semantic-change constraint) — flagged as Risk Note R6, not remediated here.
- `scripts/agents-flow/auditor-tier1-probe.sh:162-168` — `REPO_ROOT="$(cd "$SCRIPT_DIR/../.." &&
  pwd)"`, non-overridable (only its 4 *derived* `_PATH` vars are). `HEARTBEAT_FILE_PATH` fault-
  injection precedent (BA's Finding 5) confirmed present and reusable in shape, not directly
  reusable for THIS log path since it's a different variable.
- `scripts/agents-flow/auditor-tier1-probe.sh:704-774` `run_probe()` — confirmed (re-verified,
  not just PO/BA's citation) it has exactly 3 internal `jq -n` sites: heartbeat-write-FAILED
  (754-757, unreachable when called with `suppress_heartbeat` — the `if
  [ "$suppress_heartbeat" != "suppress_heartbeat" ]` guard at line 752 wraps the entire write
  attempt, so this branch is Tier-1-standalone-only), `ALL_GREEN` (764-767), `FAILURE`
  (771-772). Every stdout print inside `_check_docker_ps`/`_check_health`/`_check_disk`/
  `_check_mem_creep`/`_check_launchd_agents` is captured at its own call site
  (`out=$(_check_docker_ps 2>&1)`, ×5) — `run_probe()`'s only real stdout is its own final
  verdict line, in every branch.
- `scripts/agents-flow/auditor-tier1-probe.sh:850-898` `run_tiered_probe()` — its internal call
  `inner_out=$(run_probe "suppress_heartbeat")` (line 873) captures `run_probe()`'s output into a
  variable — **never reaches real stdout** when invoked this way. `run_tiered_probe()`'s own only
  real stdout is its final `jq -n` at line 894-896 (`{tier, checks_verdict, verdict, detail,
  last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes}`).
- `scripts/agents-flow/auditor-tier1-probe.sh:900-925` — the "Standalone execution" trailer,
  3 branches: `TIER=1` → `run_probe; exit $?` (line 911-913); `TIER∈{2,3}` →
  `run_tiered_probe "$TIER"; exit $?` (915-917); invalid `--tier` → inline `jq -n` + `exit 2`
  (919-923). **This trailer's own `case` statement IS the exact Tier-1-standalone-vs-
  Tier-2/3-wrapper discriminator Q3 asks for** — it was already there, unrelated to this sprint,
  built for a completely different reason (dispatching which function to call).
- `scripts/agents-flow/lib/hook-guard.sh`, `scripts/agents-flow/lib/notebook-section-direction.sh`
  — both confirmed `set -u`, no `mapfile`/associative-arrays/`local -r` (bash 3.2+ syntax
  discipline, explicit in the latter's header comment) — binding style precedent for
  `tick-telemetry.sh`.
- `scripts/agents-flow/cowork-tick-preflight.test.sh:24,46,65` — sources the script
  (`source "$PREFLIGHT_SH"`, NOT a subprocess), `export PREFLIGHT_ROOT="$TMPDIR_TEST"` before
  sourcing, then calls `run_preflight` (the raw function) directly at every one of its ~13 `OUT=$(run_preflight); RC=$?` assertions — **never reaches the trailer** (`BASH_SOURCE[0] ==
  $0` is false when sourced). Confirms: existing suite is untouched by a trailer-only change, and
  a NEW logging-specific test needs its own call to whatever wraps `run_preflight` for logging
  (see § Design decisions).
- `.gitignore:33-35` — `docs/data/cycle-snapshot-*.json` triple-pattern block (Q1 precedent).
  `.gitignore:59` — `docs/data/db-integrity-history.json` (second Q1 precedent, found this
  cycle, not cited by PO/BA).
- `docs/architecture-briefs/2026-05-21-token-toolcall-economy.md:40` — row `W-1`, "At 4
  chars/token" — confirmed, exact string, do not invent.
- `scripts/db-integrity-history-append.sh` — this repo's existing "rolling history, cap N"
  precedent. **Deliberately NOT reused as-is** — it is read-modify-write (full JSON array parse +
  rewrite per call), acceptable for its own low-frequency LLM-driven call pattern but wrong for a
  15/30-min-cadence preflight script per FR-9's explicit "never read-modify-write" append
  contract; considered and rejected, not overlooked.

### Reuse patterns
- **`scripts/agents-flow/lib/tick-telemetry.sh` (NEW, shared)** — same extraction shape as
  `hook-guard.sh`/`notebook-section-direction.sh`: `tt_`-prefixed functions, `set -u`, bash 3.2+
  syntax only, sourced (never executed standalone).
- **`hg_resolve_project_root`'s fallback shape** — reused as the LAST-resort branch of
  `_tt_log_path()`'s root resolution (see Q6 ratification).
- **`_iso_to_epoch`'s GNU/BSD dual-`date`-path pattern** (auditor-tier1-probe.sh:806-812) — NOT
  needed for `elapsed_ms` (EPOCHREALTIME/`date +%s` avoids the GNU-vs-BSD `-d`/`-j -f` split
  entirely), but the `ts` field (FR-5, `date -u +%Y-%m-%dT%H:%M:%SZ`) reuses this file's own
  existing safe timestamp idiom verbatim — already portable, no new pattern needed.

### Design decisions

**The trailer is the real choke point (resolves Q3 + Q4 together).** All 3 scripts already fully
converge on ONE line, unrelated to this sprint, before this task began:
```bash
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight            # or: run_probe / run_tiered_probe "$TIER"
  exit $?
fi
```
This line is called exactly once per real (non-test, non-sourced) invocation, has the caller's
real `$?` available with zero derivation, and — for auditor specifically — the `case "$TIER" in
1) ...;; 2|3) ...;; esac` around it already IS the Tier-1-vs-Tier-2/3 discriminator Q3 needs.
Design: add ONE new WU-0 function, `tt_capture_and_log <script_name> <fn> [args...]`, that:
1. `t0=$(tt_epoch_ms)`
2. `out=$("$fn" "$@"); rc=$?` — the SAME command-substitution-capture idiom already used
   throughout these scripts for every other sub-call (e.g. `slot_result=$(eval
   "$SLOT_MATCHER_CMD" ...)`) — not a new technique, this codebase's own house style.
3. `t1=$(tt_epoch_ms); elapsed_ms=$(( t1 - t0 ))`
4. `printf '%s\n' "$out"` — reprints the captured verdict, byte-identical (command substitution
   strips only trailing newlines; `jq -n`'s default pretty-printed output — none of these 3
   scripts pass `-c`/`--compact-output` to their verdict `jq -n` calls — has exactly one trailing
   newline and 0+ embedded ones, both preserved exactly).
5. `log_tick_usage "$script_name" "$out" "$elapsed_ms" "$rc"` — see FR-1 primitive below.
6. `return "$rc"`

Each script's trailer becomes (2-line diff, WU-1/WU-2):
```bash
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  tt_capture_and_log "cowork-tick-preflight.sh" run_preflight
  exit $?
fi
```
and for WU-3 (3-branch diff, the `case` body only — `run_probe`/`run_tiered_probe` internals
untouched):
```bash
  case "$TIER" in
    1) tt_capture_and_log "auditor-tier1-probe.sh" run_probe; exit $? ;;
    2|3) tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"; exit $? ;;
    *) jq -n --arg d "invalid --tier value..." '{verdict:"ERROR",...}'; exit 2 ;;   # UNCHANGED — not logged, see Risk Note R5
  esac
```
Zero touches inside `_emit_verdict()`, `run_probe()`, `run_tiered_probe()`, or any `return N`
statement in any of the 3 scripts. `log_tick_usage()` (FR-1's named primitive) stays a separate,
lower-level function — `tt_capture_and_log` is the convenience layer that supplies it with a real
captured string + elapsed_ms + exit_code, matching this repo's existing two-tier lib style
(`hg_run` + `hg_resolve_project_root` in one file, related but distinct primitives).

**`log_tick_usage(script, captured_json, elapsed_ms, exit_code)`** — derives `verdict`/`tick`
FROM the captured JSON itself (`jq -r '.verdict // "UNKNOWN"'` / `'.tick // empty'`) rather than
requiring the caller to pass them separately — single source of truth, matches FR-5's "never
re-derived" spirit for `verdict_bytes`, extended here to `verdict`/`tick` too. `verdict_bytes` is
computed via `printf '%s' "$captured_json" | wc -c` (true byte count, not bash `${#var}`
character count — this repo already uses `wc -c` for byte-cap math elsewhere, e.g.
`context-bloat-backstop.sh`'s TE-T24 byte-cap predicate; `${#var}` is locale-dependent and would
silently undercount under a multi-byte locale). Writes exactly one `jq -c` line via `>>`
(O_APPEND, single `write()` syscall for a JSON line well under PIPE_BUF — no `flock`, matches
FR-9's "never read-modify-write" and this repo's existing no-`flock`-anywhere convention).
**Every failure path inside `log_tick_usage` — unwritable dir, `mkdir -p` failure, empty derived
line — ends in an explicit `return 0`, never propagated to the caller** (AC-5). `mkdir -p
"$(dirname "$logpath")" 2>/dev/null || return 0` self-creates the destination on first run.

**Rotation (FR-8):** `TICK_TELEMETRY_MAX_LINES` (default 5000 — ~52-104 days of history at these
scripts' real cadences; overridable for tests). Checked on every append (`wc -l`, cheap for a
file this size — no hot-path MCP/tool-call cost, NFR-2 is about MCP/git/network calls, not local
`wc`/`tail`); when exceeded: `tail -n "$CAP" "$logpath" > "$logpath.tmp.$$" && mv -f
"$logpath.tmp.$$" "$logpath"` (atomic tmp+mv, mirrors `_write_heartbeat()`'s and
`_widen_write_counter()`'s existing atomic-write idiom in these same scripts). **Explicitly
stated per AC-8's own requirement:** an append that lands between this `tail` read and the `mv`
swap targets the file that is about to be replaced and is lost — accepted, not fixed, given
one-file-per-script (Q2) already collapses the realistic concurrent-writer set to "2 sessions of
the same cron script racing the same tick", already substantially serialized by each script's own
election/SF-1 lock.

**Elapsed-ms primitive (`tt_epoch_ms`, Q5):**
```bash
tt_epoch_ms() {
  if [ -n "${EPOCHREALTIME:-}" ]; then
    local sec="${EPOCHREALTIME%.*}" micro="${EPOCHREALTIME#*.}"
    printf '%s' "$(( sec * 1000 + ${micro:0:3} ))"
  else
    printf '%s' "$(( $(date -u +%s) * 1000 ))"
  fi
}
```
Both branches parse fine under bash 3.2 (plain POSIX parameter expansion + arithmetic — no
bash4+-only syntax anywhere in this lib, matching `notebook-section-direction.sh`'s documented
constraint); the `EPOCHREALTIME` branch is simply unreachable dead code on bash <5.0, verified
live this cycle (`bash --version` / `/bin/bash --version` both `3.2.57` on this machine,
`EPOCHREALTIME` unset).

**Q6 root resolution (`_tt_log_path`):**
```bash
_tt_log_path() {
  local script="$1"
  if [ -n "${TICK_TELEMETRY_LOG_PATH:-}" ]; then printf '%s' "$TICK_TELEMETRY_LOG_PATH"; return 0; fi
  local root="${PREFLIGHT_ROOT:-${REPO_ROOT:-}}"
  [ -z "$root" ] && root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd 2>/dev/null)"
  [ -z "$root" ] && { printf ''; return 1; }
  printf '%s/docs/data/telemetry/%s.jsonl' "$root" "${script%.sh}"
}
```

### Scan clean: true ✓ (6 risk notes below — none block the design)

---

## Risk Notes (pm: propagate into WU task ACs; dev: read before writing code)

**R1 (WU-0, correctness-critical):** `tt_capture_and_log`'s stdout reprint MUST be tested against
a fault-injected `log_tick_usage` (e.g. one that itself tries to `echo` to real stdout) to prove
AC-6/NFR-3 holds through the wrapper, not just assumed from the byte-identity argument above — the
existing `feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it` memory exists
precisely because "should be fine" claims about this exact stdout contract have been wrong before.

**R2 (WU-0/Q6, correctness):** auditor's test suite has **no** seam to override `REPO_ROOT` (only
its derived `*_PATH` vars). Any new auditor logging test MUST set `TICK_TELEMETRY_LOG_PATH`
explicitly — the `PREFLIGHT_ROOT`-only convenience that "just works" for cowork/dev-team's new
tests (already exported by their existing fixture setup) does NOT extend to auditor. Flag this
explicitly in WU-3's task AC so dev doesn't assume parity with WU-1/WU-2's test wiring.

**R3 (WU-1/WU-2, low, byte-identity edge case):** the reprint idiom (`out=$("$fn" "$@")` then
`printf '%s\n' "$out"`) will silently DROP any trailing NUL bytes if `_emit_verdict()`'s jq output
ever contained one (command substitution always strips trailing NULs along with trailing
newlines) — not a realistic risk for compact/pretty JSON text output, noted for completeness only,
not a gating concern.

**R4 (WU-3, positive, confirms Q3 closed cleanly):** because `run_probe()`/`run_tiered_probe()`
internals are completely untouched, the pre-existing 1323-line `auditor-tier1-probe.test.sh`
suite — which calls these functions directly after sourcing, exactly like the cowork/dev-team
suites — needs ZERO changes to stay green. New WU-3 logging tests are additive only.

**R5 (WU-3, scope-narrowing, deliberate):** the trailer's invalid-`--tier` branch (line 919-923)
is NOT wrapped in `tt_capture_and_log` — it is a cron-misconfiguration path (a `--tier` value
outside `{1,2,3}` can only occur if the cron job's own prompt string is wrong), never expected on
a correctly configured live cron, and logging it would add a 4th `tt_capture_and_log` call site
for a case that structurally cannot occur in production. Left un-instrumented; flagged explicitly
rather than silently dropped, per this project's "state the tradeoff, don't leave it unstated"
convention (mirrors AC-8's own requirement, applied here by analogy).

**R6 (dev-team, pre-existing, NOT this sprint's regression):** `_step55_run_validate()` /
`_step55_git_commit_evict()` (dev-team-tick-preflight.sh:516-527) remain genuinely unredirected —
a REAL (if rare, low-frequency, gated behind `_step55_would_evict` detecting actual byte
reduction) latent stdout-leak path independent of anything this sprint touches. `log_tick_usage`'s
defensive `jq -r '.verdict // "UNKNOWN"' 2>/dev/null` degrade means a leak-corrupted capture logs
`verdict:"UNKNOWN", tick:null` rather than crashing the logger — a beneficial side effect (this
sprint's own telemetry may incidentally surface this pre-existing fragility as occasional
`UNKNOWN` rows for a future cleanup) but **not a fix**, and out of scope to fix here
(zero-semantic-change constraint). Do not conflate a future `UNKNOWN`-verdict row with a
regression introduced by WU-2.

---

## File-level change map (for PM decomposition)

**WU-0 — shared lib** (`scripts/agents-flow/lib/` + `.gitignore` + `docs/policies/dev-standards.md`)
- NEW `scripts/agents-flow/lib/tick-telemetry.sh` — `tt_epoch_ms`, `_tt_log_path` (internal),
  `log_tick_usage`, `tt_capture_and_log`, `_tt_rotate` (internal). Bash 3.2+ syntax only.
- NEW `scripts/agents-flow/lib/tick-telemetry.test.sh` — own regression suite (must be green
  before WU-1 starts, per PO's WU-0-gates-the-rest ordering). Minimum cases: one-line-per-call,
  `verdict`/`tick` derived correctly from both field-set shapes (cowork/dev-team's vs auditor
  tier-2/3's), `verdict_bytes` == real byte count (multi-byte-safe), `elapsed_ms` present and
  numeric on both EPOCHREALTIME-available and EPOCHREALTIME-unset paths (force via `unset
  EPOCHREALTIME` / a stubbed value), rotation fires at cap and preserves the newest N lines,
  AC-4-equivalent (logger failure never changes `tt_capture_and_log`'s returned `$rc`), AC-5
  (unwritable `TICK_TELEMETRY_LOG_PATH` parent dir → silent no-op, `tt_capture_and_log` still
  returns the wrapped function's real `$rc`), AC-6 (R1 above — fault-injected logger that tries
  to write to stdout must not leak past the wrapper's own `printf`).
- MODIFIED `.gitignore` — add `docs/data/telemetry/*.jsonl` + `docs/data/telemetry/*.jsonl.tmp.*`
  (same triple-pattern-block convention as `docs/data/cycle-snapshot-*.json`), in the SAME change
  (NFR-5).
- MODIFIED `docs/policies/dev-standards.md` — new CANONICAL block for `tick-telemetry.sh`
  (pointer + one-line usage), same convention as the `hook-guard.sh` CANONICAL block.

**WU-1 — cowork** (`scripts/agents-flow/cowork-tick-preflight.sh` +
`scripts/agents-flow/cowork-tick-preflight.test.sh`)
- MODIFIED: `source "$SCRIPT_DIR/lib/tick-telemetry.sh"` (new source line, alongside the existing
  `source "$SCRIPT_DIR/mcp-call.sh"`); trailer 2-line change (§ Design decisions). Zero other
  lines touched.
- MODIFIED (test): add logging-specific cases calling `tt_capture_and_log` directly (source +
  call, same seam as all existing tests) — assert log file contents, rotation, AC-4/AC-5/AC-6
  negative controls specific to the wired script. Existing ~13+ `run_preflight`-direct assertions
  untouched (provably unreachable-by-this-change per Verified Paths).

**WU-2 — dev-team** (`scripts/agents-flow/dev-team-tick-preflight.sh` +
`scripts/agents-flow/dev-team-tick-preflight.test.sh`)
- Same shape as WU-1. Genuinely ~2-3 line diff once WU-0 exists (PO's original "~1 line" framing
  is now achievable, unlike BA's Q4 concern about it — see Q4 ratification above).

**WU-3 — auditor** (`scripts/agents-flow/auditor-tier1-probe.sh` +
`scripts/agents-flow/auditor-tier1-probe.test.sh`)
- MODIFIED: new source line; trailer's 2 real-invocation branches wrapped (§ Design decisions),
  invalid-`--tier` branch deliberately left unwrapped (R5). Zero touches inside `run_probe()`/
  `run_tiered_probe()`.
- MODIFIED (test): new cases per R2/R4 above — MUST set `TICK_TELEMETRY_LOG_PATH` explicitly
  (no `PREFLIGHT_ROOT`-equivalent seam exists here); assert tier-1-standalone and tier-2/3-wrapper
  both produce exactly one log line each (the double-log risk Q3/PO's product_decision named), and
  that the inner `run_probe(suppress_heartbeat)` call inside `run_tiered_probe()` produces **zero**
  log lines (only the outer wrapper's `tt_capture_and_log` call fires) — this is the single most
  important negative assertion in the whole sprint (directly proves the double-log corruption class
  PO/BA both flagged as the reason WU-3 needed its own design, does NOT occur).

---

## RETURN (architect)
DONE: Q1-Q6 ratified with written rationale (Q3/Q4 resolved together by one design decision —
relocate the log+capture call from inside `_emit_verdict()` to each script's pre-existing
"Standalone execution" trailer, which already converges every verdict path with a real `$?`
available and, for auditor, already discriminates Tier-1-standalone vs Tier-2/3-wrapper via its
own `case "$TIER"` dispatch). WU-0 blueprint complete (`tick-telemetry.sh`: `tt_epoch_ms`,
`log_tick_usage`, `tt_capture_and_log`, rotation, Q6 root resolution) gating WU-1/WU-2 (now
genuinely ~2-3 line diffs, zero touches inside `_emit_verdict()`/any `return N` site) and WU-3
(own choke-point design, zero touches inside `run_probe()`/`run_tiered_probe()`, both existing
1323-line suites provably unaffected). 6 risk notes (R1-R6) for PM/dev. Zero DDD violations —
all infrastructure-layer shell tooling, no domain/interface surface.
ZONE: cross-service/
NEXT: pm | decompose into 4 tasks — WU-0 (`scripts/agents-flow/lib/tick-telemetry.sh` + its own
suite + `.gitignore` + `dev-standards.md` CANONICAL block), WU-1 (cowork, depends_on WU-0), WU-2
(dev-team, depends_on WU-0), WU-3 (auditor, depends_on WU-0+WU-1+WU-2 per PO's gating — own design
review, not a mechanical port). QA note carried forward from BA/PO: establish the REAL pre-sprint
baseline for all 3 existing suites before any edit (AC-10) — the quoted 20/20, 37/37, 32/32 counts
are unverified.
HANDOFF: docs/handoffs/TICK-PREFLIGHT-USAGE-INSTRUMENTATION-BA-spec.md
PIPELINE: continue
