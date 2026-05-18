> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 0.5: Chef Pipeline Cycle-Coverage Check

> Chef Cook Schedule reference: `docs/standards/cron-jobs.md` § Chef Cook Schedule

**Goal:** Verify the chef pipeline fired AND closed cleanly in the past 24h before the layer-walk audit. A dish that never started, or started without closing, is a pipeline failure — not a quality issue.

---

## Step 0.5 — Read WORK channel telemetry (last 24h)

```
read_telegram_reports(channel="work", limit=200)
```

Filter to messages containing `[chef]`. Extract into two sets:

**Set A — START lines** (`[chef] START`):
- Parse: `dish_type`, `slot_utc`, `cycle_id`
- Count total START lines → `start_count`

**Set B — CLOSE lines** (`[chef] SENT` or `[chef] SILENT`):
- Parse: `dish_type`, `slot_utc`, `cycle_id`
- Count total CLOSE lines → `close_count`

**Set F — FAILED lines** (`[chef] FAILED`):
- Parse: `dish_type`, `cycle_id`, `reason`
- Do NOT raise new BUG (already alerted by chef.md FAILED path). Enumerate in Step 7 WORK audit row.

---

## Step 0.5a — Pair START ↔ CLOSE by cycle_id

For each `cycle_id` in Set A:
- Look up matching `cycle_id` in Set B
- If match found → mark as **CLOSED**
- If no match found → mark as **STUCK**

Log each pair:
```
[chef-coverage] cycle_id={X} dish={Y} slot={Z} → CLOSED|STUCK
```

---

## Step 0.5b — Apply guaranteed-count threshold

Expected per 24h window: ≥3 START + ≥3 CLOSE (Morning + EOD + Evening are guaranteed fire slots — see `docs/standards/cron-jobs.md` Chef Cook Schedule). Intraday starts (SILENT exits) are optional but each START needs a matching CLOSE.

**Rule 1 — Low coverage:**
If `start_count < 3` OR `close_count < 3`:
```
send_telegram(channel="bug", message="[tnb-audit] chef-coverage-low | starts={start_count} closes={close_count} expected≥3 | window=last-24h")
```
Then proceed (do not EXIT — audit continues with degraded pipeline context).

**Rule 2 — Stuck cycle:**
For each STUCK `cycle_id`:
```
send_telegram(channel="bug", message="[tnb-audit] chef-stuck | cycle_id={X} | dish={Y} | last_seen=START | slot={Z}")
```
One BUG message per stuck cycle_id.

**Rule 3 — FAILED enumeration (WORK only, no new BUG):**
If Set F is non-empty, append to Step 7 WORK audit row:
```
Chef FAILED cycles: {count} — {cycle_id_1} reason={reason_1} | {cycle_id_2} reason={reason_2} ...
```

---

## Step 0.5c — Log coverage result

Append coverage summary to session state (used by Step 7 WORK report):

```
[chef-coverage] starts={start_count} closes={close_count} stuck={stuck_count} failed={failed_count}
  guaranteed_ok={true|false}  ← true if start_count ≥ 3 AND close_count ≥ 3 AND stuck_count = 0
```

If `guaranteed_ok=false`, tag this audit cycle as `pipeline_degraded=true` — the Step 7 WORK audit row must include the coverage summary prominently.

---

## Error boundary

If `read_telegram_reports` fails or returns empty after 1 retry:
```
send_telegram(channel="bug", message="[tnb-audit] chef-coverage-check BLOCKED — cannot read WORK channel | reason={error}")
```
Set `pipeline_degraded=true`. Proceed to Phase 1 layer-walk audit (do not EXIT — dish content may still be auditable via MARKET channel reads).

→ Error boundary pattern: `.claude/skills/cowork-boundary/SKILL.md`
