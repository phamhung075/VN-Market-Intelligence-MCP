# Chef Pipeline Runbook

<!-- size-justification: 128L — operational reference: cron schedule table + telemetry key + recovery procedure. Three discrete sections; atomic manual for on-call diagnosis. -->

> Lazy-load this file when: diagnosing missed chef dishes, reading WORK telemetry, recovering a stuck or silent chef slot.

---

## 1. Cron Schedule Reference

Full schedule → `docs/standards/cron-jobs.md` § Chef Cook Schedule (SSOT).

| Schedule (UTC) | VN (GMT+7) | Dish type | Agent |
|----------------|------------|-----------|-------|
| `15 5 * * 1-5` | 12:15 | `morning` | unified-agent |
| `13 2-8 * * 1-5` | XX:13 | `intraday` | unified-agent |
| `45 8 * * 1-5` | 15:45 | `eod` | unified-agent |
| `45 19 * * *` | 02:45+1 | `evening` | unified-agent |

The registered cron expression is `29 * * * *` (hourly at :29 UTC). The schedule values above are dispatch time-windows handled inside `docs/agents/unified-agent/flow/main.md` — the cron fires each hour and exits immediately outside these windows.

Minimum guaranteed dishes per weekday: 3 (morning + eod + evening). Intraday fires every hour 02–08 UTC but exits silently when 0 clusters qualify.

TNB audit fires at `13 20 * * *` (20:13 UTC = 03:13 VN+1) — audits last chef narrative after EOD dish settles.

Cron command file: `.claude/commands/crons/cron-unified-agent.md`
Cron registration note: cron objects are session-scoped (Claude Code runtime). Re-register via CronCreate if a new session is started. See `docs/ARCHITECTURE.md` OQ-2.

---

## 2. WORK Telemetry Line Meanings

All telemetry uses prefix `[chef]`. Lines are machine-parseable. No emoji.

### 2a — START (ENTRY)

```
[chef] START {dish_type} | slot={slot_utc} | cycle={cycle_id}
```

Emitted immediately after Bootstrap, before any data reads. Confirms the chef slot fired and the cycle is alive.

| Field | Meaning |
|-------|---------|
| `dish_type` | `morning` \| `intraday` \| `eod` \| `evening` |
| `slot_utc` | Scheduled fire time (not wall-clock). Example: `2026-05-19T05:23Z` |
| `cycle_id` | `chef-{dish_type}-{YYYYMMDDTHHmmZ}`. Stable ID — grep this to pair START with CLOSE. |

### 2b — SENT (CLOSE success)

```
[chef] SENT {dish_type} | slot={slot_utc} | cycle={cycle_id} | clusters={N} | convergence={true|false}
```

Emitted after notebook append (Step 8). Confirms MARKET dish was published.

| Field | Meaning |
|-------|---------|
| `clusters` | Number of clusters that qualified in Step 1 |
| `convergence` | `true` if ≥1 cluster qualified; `false` if 0 clusters (Morning/EOD/Evening always publish even with 0 clusters) |

### 2c — SILENT (CLOSE intraday 0 clusters)

```
[chef] SILENT intraday | slot={slot_utc} | cycle={cycle_id} | clusters=0
```

Emitted from Step 1 intraday gate when 0 clusters qualify. No MARKET message is written. This is a normal, healthy exit — not an error.

### 2d — FAILED

```
[chef] FAILED {dish_type} | slot={slot_utc} | cycle={cycle_id} | reason={failure_reason}
```

Emitted when an unhandled exception exits Steps 0–7. A companion one-liner also goes to the BUG channel. No MARKET dish was published. Step 8 notebook append was skipped.

| Field | Meaning |
|-------|---------|
| `reason` | Exception message or tool name that raised. One line. |

---

## 3. Recovery Procedure for Missed Slot

### 3a — Diagnosis

1. Search WORK last 24h for START lines:
   ```
   grep "\[chef\] START" <WORK_24h_export>
   ```
   Expected weekday: ≥3 lines (morning + eod + evening). Fewer than 3 = missed slot.

2. For any START without a matching SENT/SILENT/FAILED:
   ```
   grep "{cycle_id}" <WORK_24h_export>
   ```
   One line only = stuck cycle (no CLOSE).

3. Check for FAILED lines:
   ```
   grep "\[chef\] FAILED" <WORK_24h_export>
   ```
   FAILED present = exception was caught and logged. Check BUG channel for the companion one-liner.

### 3b — Recovery Actions

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| No START at slot time | Cron not registered / session restarted | Re-register via CronCreate from `.claude/commands/crons/cron-unified-agent.md`. Verify CronList shows `29 * * * *` for unified-agent. |
| FAILED with `timeout` reason | MCP tool timeout (common: `get_market_hexagram`, `get_macro_snapshot`) | Re-run chef manually for the missed dish type: spawn unified-agent with `$DISH_TYPE=<type>`. Chef will publish a late dish. |
| FAILED with `read_telegram` or `send_telegram` reason | Telegram MCP unreachable | Check MCP server health (`http://localhost:3000/sse`). Restart Docker if down: `docker compose restart`. |
| START present but no CLOSE (stuck) | Chef session may still be running | Wait 5 min. If still no CLOSE, the session likely died mid-cycle. Re-run manually. |
| SILENT for morning/eod/evening | Logic error — these dish types must always publish | Treat as FAILED. Re-run manually. Morning/EOD/Evening are guaranteed-publish paths. |

### 3c — Manual Re-run

To publish a late dish for a specific slot:

1. Spawn unified-agent subagent.
2. Provide `$DISH_TYPE` = `morning` | `eod` | `evening` (do not re-run intraday after the session — stale data).
3. Chef will emit a new START with a new `cycle_id` based on current wall-clock. The original missed slot will remain unmatched in WORK history — acceptable for manual recovery.

### 3d — TNB Audit False Positives

If a missed slot causes `chef-coverage-low` BUG from `tran-ngoc-bau`:
- The BUG is accurate — at least 1 slot was genuinely missed.
- Resolve by completing the recovery above.
- TNB next audit cycle (20:13 UTC) will clear automatically when ≥3 START + ≥3 CLOSE are present in the new 24h window.
