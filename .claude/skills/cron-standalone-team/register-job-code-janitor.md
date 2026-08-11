**Job 5 — code-janitor, every 6h DRY-hygiene sweep**

> Ported VERBATIM from `.claude/commands/crons/cron-code-janitor.md`
> (FIX-CRON-CODEJANITOR-NO-PRESPAWN-GATE-BOOTS-FULL-SESSION-4X-DAILY,
> `docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md` §3/§6). The prompt runs
> `scripts/agents-flow/code-janitor-tick-preflight.sh` first — a deterministic SKIP-SPAWN/SPAWN
> pre-gate mirroring `db-integrity-probe.sh` (CADRAT-2, row 6-7) and
> `verify-market-db-journal-mode.sh` (row 8) — before ever considering the subagent launch. See
> that authoring doc for the full rationale + the PRE-GATE CONTEXT note.

```
CronCreate(
  description : "code-janitor every-6h DRY-hygiene sweep (pre-spawn gated)",
  cron        : "0 */6 * * *",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
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
PROMPT_EOF
)
```
