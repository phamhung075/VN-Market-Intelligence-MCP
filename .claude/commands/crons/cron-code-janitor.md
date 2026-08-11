# cron-code-janitor — Every-6h DRY-Hygiene Sweep + Pre-Spawn Gate

**Purpose:** FIX-CRON-CODEJANITOR-NO-PRESPAWN-GATE-BOOTS-FULL-SESSION-4X-DAILY, implementing
`docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md` §3/§6 (row 11 — the one
concrete gap that brief found across all 11 outer-heartbeat crons in this fleet). Before this fix,
the prompt below unconditionally launched a full code-janitor subagent session 4x/day; its only
gate (`docs/agents/code-janitor/flow/main.md`'s CADRAT-3 `git diff` Pre-Check) ran POST-boot and
gated only the in-flow Decision-Tree DRY scan — the 3 every-scan sweeps (Memory Prune / Notebook
Line-Cap / Cold Archive) ran unconditionally regardless, and the last 10 recorded cycles (≈4.3
days, notebook Session 32→41) showed the DRY-scan branch suppressed 10/10 times: every boot paid
for `main.md` + tools-package + notebook reads to shell out to 3 scripts that need zero LLM
judgment. This mirrors the SAME deterministic pre-spawn shell-gate pattern already used by
WU-1/2/3 (`cowork-tick-preflight.sh`/`dev-team-tick-preflight.sh`), CADRAT-2
(`db-integrity-probe.sh`, `cron-db-data-integrity.md`), and market-db-journal-guard
(`verify-market-db-journal-mode.sh`) — 8/11 outer heartbeats already gated the full subagent boot
behind a deterministic shell pre-gate before this fix; the brief's own §4 explicitly rejected an
LLM/local-model pre-gate for this family (3 documented live instances of a safe-looking fuzzy gate
silently disabling its own mechanism, including one discovered the same session as the brief).

**Gate:** `scripts/agents-flow/code-janitor-tick-preflight.sh` — SKIP-SPAWN/SPAWN verdict, 2
branches:
- **Branch A** (any `src/**`|`apps/*/src/**` file touched since `HEAD~3` — SAME command + scope
  as main.md's own CADRAT-3 Pre-Check, cross-referenced so the two never silently drift apart,
  per the brief's §5.2 auditability contract): verdict=SPAWN, the gate runs zero mutation, and
  the subagent's own `main.md` flow (unconditional every-scan sweeps + the now-warranted DRY
  scan) runs exactly as it did before this fix.
- **Branch B** (diff empty): the gate itself runs the 3 deterministic sweep scripts directly —
  no subagent boots to do it — then verdict=SPAWN only if a judgment-needing signal fired
  (a `SIGNAL-WRITTEN` payload, a `safe-fail` needing manual review, or Cold Archive's rare
  non-trivial monthly leg), else verdict=SKIP-SPAWN. Either way the gate commits (explicit
  pathspec, DELTA-scoped `git status` diff — never a bare/broad add) whatever the sweeps moved,
  so a SKIP-SPAWN tick never leaves the working tree dirty for the next (up to 6h-later) fire.
  See the script's own header for the full verdict/exit-code contract and the SIGNAL-WRITTEN
  double-run correctness note (a subagent's later re-run of the SAME idempotent sweep script
  would otherwise silently drop the payload's signal_queue row — closed via the PRE-GATE CONTEXT
  block in the prompt below, not a `main.md` edit).

---

## Create with CronCreate

- **cron**: `0 */6 * * *` (every 6h)
- **recurring**: true
- **durable**: true (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Run: bash scripts/agents-flow/code-janitor-tick-preflight.sh and read the exit code + the
  FULL one-line JSON verdict (stdout — the ONLY thing printed) as TWO SEPARATE observations
  from ONE invocation — never inside an `&&`/`||` chain, never re-derive the exit code from a
  later command (feedback_tick_preflight_verdict_is_first_key_tail_always_drops_it;
  feedback_verdict_exit_code_gated_by_and_chain_swallows_actionable_output — both document a
  real defect class where a guard's own verdict got silently swallowed by its caller's shell
  plumbing, not by the guard).

  Exit code contract (0=SKIP-SPAWN / 1=SPAWN — FAIL-OPEN on any probe/sweep-exec fault, never
  suppress a legitimate run):
    0 -> SKIP-SPAWN. The gate already ran the 3 deterministic sweeps (Memory Prune / Notebook
         Line-Cap / Cold Archive) directly and committed whatever they moved — nothing left to
         do this tick. Log '[cron-code-janitor] SKIP-SPAWN (<verdict JSON .detail field
         verbatim>)' and STOP. Do NOT launch a subagent.
    1 -> SPAWN. Read the verdict JSON's `.sweeps_ran` field to tell the two reasons apart:
         (a) `.sweeps_ran == false` — src/**|apps/*/src/** changed since HEAD~3 (same scope
             main.md's own CADRAT-3 Pre-Check documents). The gate ran ZERO mutation this tick —
             proceed to Launch below exactly as before this fix, no extra context needed.
         (b) `.sweeps_ran == true` — src diff was empty, but the gate's OWN run of the 3 sweeps
             found a judgment-needing signal this tick (see `.detail` +
             `.sweeps.memory_prune.signal_written` / a `safe-fail` / a non-trivial Cold Archive
             leg). Proceed to Launch below, but paste this PRE-GATE CONTEXT block into the
             subagent's own launch prompt verbatim, right after the "Launch subagent" line:

             "PRE-GATE CONTEXT: the 3 every-scan sweeps already ran once THIS tick, before you
             booted — <paste the verdict JSON's `.sweeps` object here verbatim>. Your own re-run
             of them inside main.md is safe (idempotent, no-op on anything already moved) but
             will report SIGNAL-SKIP/SKIP-EXISTS/NO-CHANGE for whatever the pre-gate already
             handled — that is expected, not a bug, do not re-investigate it. If
             `.sweeps.memory_prune.signal_written == true` above: the payload at
             `.sweeps.memory_prune.payload_ref` is GENUINELY NEW this tick even though your own
             re-run will show SIGNAL-SKIP (the pre-gate's run already created it) — APPEND the
             `.signal_queue.rows[]` row for it per main.md's Memory Prune Sweep section anyway;
             main.md's 'skip this row on SIGNAL-SKIP' text predates this pre-gate and does not
             know about this specific case."

  Launch subagent (subagent_type=code-janitor). Read and execute docs/agents/code-janitor/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`

## Notes
- **Registered via the `cron-standalone-team` lane** (`.claude/skills/cron-standalone-team/`) —
  see `.claude/skills/cron-standalone-team/register-job-code-janitor.md` for the `CronCreate`
  call ported VERBATIM from this doc (SSOT divergence discipline: re-sync both in the SAME
  commit if this prompt ever changes — see that skill's own SSOT note).
- **Gate script + tests:** `scripts/agents-flow/code-janitor-tick-preflight.sh` (new) +
  `scripts/agents-flow/code-janitor-tick-preflight.test.sh` — stubs `_git_diff_src_files` /
  `_git_status_scoped` / `_run_{memory_prune,notebook_linecap,cold_archive}_sweep` /
  `_commit_paths` wholesale (same seam pattern `dev-team-tick-preflight.sh`'s `_step55_*`
  functions already use) — never exercises real git or the real sweep scripts against the live
  repo. Run: `bash scripts/agents-flow/code-janitor-tick-preflight.test.sh`.
- **Verdict trace (auditability contract, brief §5.1):** every tick's verdict — SKIP-SPAWN or
  SPAWN — is written atomically (tmp+mv) to
  `docs/data/code-janitor-tick-preflight-last-verdict.json`, independent of whether a notebook
  entry exists for that tick. A SKIP-SPAWN tick intentionally has NO code-janitor notebook entry
  (no subagent booted to write one) — the verdict file IS that tick's durable trace.
- **`main.md` is UNCHANGED by this fix** — Branch A boots the exact same flow as before; Branch
  B's PRE-GATE CONTEXT block (above) is carried entirely by the CronCreate prompt's own dynamic
  narration, not a code change to the flow doc.
- **Deviation from the architecture brief worth flagging explicitly:** the brief's §3 lists
  `SIGNAL-WRITTEN` as one of 3 SPAWN triggers without noting that this gate's OWN execution of
  `memory-prune-sweep.sh` consumes the "first run" transition that marker depends on — a
  subagent's later re-run of the same idempotent script would see the payload already on disk
  and log `SIGNAL-SKIP`, and `main.md`'s existing "skip this row on SIGNAL-SKIP" text would then
  silently drop the `.signal_queue.rows[]` row for a payload that IS genuinely new (the exact
  pointer-integrity-leak defect class `main.md`'s own Memory Prune Sweep section already warns
  about, and the same "safe-looking gate silently disables its own mechanism" shape the brief's
  §4 flags 3 other live instances of). Closed via the PRE-GATE CONTEXT instruction above instead
  of a `main.md` edit — kept in scope (this task's file list did not include `main.md`) while
  still fixing the root cause rather than shipping the brief's literal text with a known gap.
