# cron-market-db-journal-guard — market.db WAL Re-Arm Runtime Detector

**Purpose:** AC-1 of `FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`. Arms
`scripts/audits/verify-market-db-journal-mode.sh` (shipped 2026-07-30 by
`FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION`, self-tests green, but had
**zero call sites** — no cron, no CI, no agent flow doc, no auditor probe — until this cron). The
script asserts the LIVE running mcp-server container's on-disk `journal_mode` + `-wal`/`-shm`
pair via two read-only `docker exec` calls; it never mutates state. Runs every 15 minutes (PO's
explicit floor — the 2026-07-30 fix survived ~14h before the next re-arm and the corruption took
6 days to surface; a 15-min probe costs nothing, two read-only docker execs).

Policy SSOT this guard enforces: `docs/policies/market-db-journal-mode-policy.md`.
Complementary source-level guard (catches WHICH code path re-armed, not just THAT it did):
`scripts/audits/verify-market-db-journal-source-guard.sh`, wired into CI (`.github/workflows/
ci.yml` job `verify-market-db-journal-source-guard`) — both guards are required, neither
substitutes for the other (see that script's own header).

**No subagent spawn** — unlike most standalone crons, this prompt runs the script and branches on
its exit code directly in the firing session; the only possible action (`send_telegram`) needs no
agent judgment, so a full Claude subagent spawn would be pure token cost for zero benefit. This
mirrors the `db-integrity-probe.sh`/`orch-sentinel-lite-probe.sh` pre-gate idiom, except here the
probe's own verdict IS the final action, not a gate in front of a heavier subagent flow.

---

## Create with CronCreate

- **cron**: `*/15 * * * *` (every 15 minutes, all day — the corruption vector is not market-hours
  scoped: the SHM torn-write mechanism triggers on container stop/restart, which can happen at any
  hour, and a re-arming code path (a migration script, a one-off backfill runner) is not tied to
  trading hours either)
- **recurring**: true
- **durable**: true (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
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
  ```

## Manage
`CronList` | `CronDelete <id>`

## Notes
- **Registered via the `cron-standalone-team` lane** (`.claude/skills/cron-standalone-team/`),
  reusing the existing session-scoped re-arm mechanism per AC-1's explicit instruction — this is
  NOT a new cron-registration mechanism. See `.claude/skills/cron-standalone-team/
  register-job-market-db-journal-guard.md` for the ported-verbatim `CronCreate` call and
  `.claude/skills/cron-standalone-team/SKILL.md` Step 1 for the idempotency-guard entry.
- **Read-only by construction**: the underlying script only issues `docker exec ... bun -e
  "... { readonly: true }"` PRAGMA reads and two `docker exec ... test -f` existence checks —
  never a write, never a PRAGMA assignment. Arming this cron cannot itself cause or mask a
  corruption; it can only observe and report one.
- **Why 96 fires/day is proportionate**: unlike the DB-value anomaly sweep
  (`cron-db-data-integrity.md`, schedule-split to avoid checking an-known-unchanged table), this
  guard's target condition (a persistent SQLite file property) can flip at ANY moment a rogue code
  path executes a `PRAGMA journal_mode=WAL` against market.db — there is no "known-quiet window"
  to schedule around. 96 fires/day of two cheap `docker exec` calls is the PO-set floor, not a
  ceiling to optimize down without new evidence.
- **Alert path proven live, not just self-tested** (AC-1 verification gate — "a scheduled job
  whose alert path is untested is the same unarmed-guard defect one layer up"): at authoring time
  the live container's market.db was genuinely re-armed to WAL (verdict=FAIL, journal_mode=wal,
  wal_present=true, shm_present=true — a real, not synthetic, corruption-vector-active state).
  The exact `send_telegram(channel="bug", ...)` call this cron's prompt issues on a FAIL was run
  once by hand against that live verdict via `scripts/agents-flow/mcp-call.sh`'s `mcp_call`
  bridge and confirmed delivered (`"Message sent to BUG channel. message_id: 4809"`) — the alert
  path is proven end-to-end on real data, not assumed from the script's own `--self-test`.
