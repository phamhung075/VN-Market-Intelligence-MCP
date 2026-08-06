**Job 6 — market-db-journal-guard, every-15-min WAL re-arm runtime detector**

> Ported VERBATIM from `.claude/commands/crons/cron-market-db-journal-guard.md` (AC-1 of
> `FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`). No subagent spawn — the prompt runs
> the script and branches on its exit code directly; see that authoring doc for the full
> rationale.

```
CronCreate(
  description : "market-db-journal-guard — every-15-min WAL re-arm runtime detector",
  cron        : "*/15 * * * *",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
Run: bash scripts/audits/verify-market-db-journal-mode.sh

Capture the FULL stdout (the verdict is stdout line 1 — this is the WHOLE first line, do
NOT truncate/tail/pipe-strip it) AND the exit code as TWO SEPARATE observations from ONE
invocation — never run this script inside an `&&`/`||` chain and never re-derive the exit
code from a later command (see feedback_verdict_exit_code_gated_by_and_chain_swallows_
actionable_output and feedback_tick_preflight_verdict_is_first_json_key_tail_always_drops_it
— both document a real defect class where a guard's own FAIL got silently swallowed by its
caller's shell plumbing, not by the guard).

Exit code contract (verbatim from the script's own header — 0=PASS/2=FAIL/3=ERROR):
  0 -> PASS  journal_mode=delete AND no live -wal/-shm pair. No action — log
       '[cron-market-db-journal-guard] PASS — <verdict line verbatim>' and stop.
  2 -> FAIL  journal_mode!=delete OR a live -wal/-shm pair exists — the WAL re-arm vector
       is ACTIVE right now. ALERT (see below).
  3 -> ERROR docker unavailable / container not found / the probe itself broke. ALERT (see
       below) — an unmonitored, silently-broken probe is the SAME "guard shipped but never
       armed" defect this cron exists to close, one layer up; do not let it fail silently.

On exit code 2 OR 3:
  call_tool(server="vn-market", tool="send_telegram", arguments={
    channel: "bug",
    message: "[market-db-journal-guard] " + <the exact, unmodified verdict line from
      stdout line 1 — copied VERBATIM, never paraphrased, summarized, or reconstructed
      from memory>
  })
Then log the same line. Do NOT retry, do NOT investigate further, do NOT attempt to fix
the DB yourself (this is a detection-only probe — a code-plane fix, if the verdict is
journal_mode!=delete, is a separate dev-team task, not this cron's job).

MCP: https://zenmidi.com/vn-market/mcp
PROMPT_EOF
)
```
