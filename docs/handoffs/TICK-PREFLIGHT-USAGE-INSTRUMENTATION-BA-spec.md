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
