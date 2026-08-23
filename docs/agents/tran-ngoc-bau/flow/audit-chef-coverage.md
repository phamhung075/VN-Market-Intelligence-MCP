> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 0.5: Chef Pipeline Cycle-Coverage Check

> Chef Cook Schedule reference: `docs/standards/cron-jobs.md` § Chef Cook Schedule

**Goal:** Verify the chef pipeline fired AND closed cleanly in the past 24h before the layer-walk audit. A dish that never started, or started without closing, is a pipeline failure — not a quality issue.

---

## Step 0.5 — Chef pipeline telemetry (file-proxy — PRIMARY method, last 24h)

`read_telegram_reports` has NO `channel` parameter (zod: `status`/`limit`/`unclaimed_only` only, `limit` capped at 50 not 200 — confirmed c115, 2026-07-21, `F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP`) — any `channel=` value is silently ignored and the tool only ever returns rows from the BUG-only `telegram_reports` table. `[chef]` telemetry is WORK-channel-only and never persisted (per `docs/agents/tools/list/send_telegram.md`), so this call structurally CANNOT surface it, MCP-available or not. **`read_telegram_reports` is NEVER called in this step** — its only valid remaining use fleet-wide is the BUG-report table (`status`/`limit`/`unclaimed_only`), not WORK/MARKET content.

**Primary method — read the file-proxy directly:**
```
docs/data/cowork-schedule.json                          — last_fired timestamps per cron slot
docs/agent-memory/notebooks/unified-agent.md             — chef's own per-cycle notes
docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT>.json  — per-slot RAW synthesis (Step 6.5/7 content)
```
Extract the `[chef] START` / `[chef] SENT` / `[chef] SILENT` / `[chef] FAILED` equivalents from these files (cycle_id, dish_type, slot_utc, reason) the same way Set A/B/F below expect.

**Degrade LOUD if absent (mandatory — do not silently pass):** if the expected `unified-agent-synthesis-<DATE_VN>-<SLOT>.json` for a guaranteed slot in the last-24h window does not exist on disk, treat it as a genuine coverage gap for that slot (same disposition as a missing CLOSE, Rule 2 below) — do NOT assume "not run yet, skip." This file WAS observed genuinely absent live (2026-07-21 eod synthesis) — absent-file is a confirmed live case, not a hypothetical one.

Filter to messages/entries containing `[chef]`. Extract into two sets:

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

<!-- AUTO-CURE 2026-07-18 (tran-ngoc-bau, c113) — FIX-TNB-COVERAGE-WEEKEND-CARVEOUT:
     Root cause confirmed by direct evidence: cowork-schedule.json crons show chef-morning
     ("15 5 * * 1-5") and chef-eod ("45 8 * * 1-5") are Mon-Fri only; ONLY chef-evening
     ("45 19 * * *") fires daily including weekends. The threshold text below previously read
     "Morning + EOD + Evening are guaranteed fire slots" with no day-of-week qualifier, which
     would produce a false-positive BUG alert (Rule 1) if applied mechanically on a Sat/Sun —
     observed live 2026-07-18 (Saturday): only chef-evening fired (correctly), morning/eod
     correctly absent, zero real pipeline defect. Additive clarification only, zero risk to
     the Mon-Fri enforcement path. -->
Expected per 24h window on a **business day (Mon-Fri)**: ≥3 START + ≥3 CLOSE (Morning + EOD + Evening are guaranteed fire slots — see `docs/standards/cron-jobs.md` Chef Cook Schedule). On a **weekend (Sat/Sun)**, only chef-evening is a guaranteed daily slot (cron `45 19 * * *`, no day-of-week restriction) — chef-morning and chef-eod are Mon-Fri only (`1-5`) and their absence on a weekend is expected, NOT a coverage gap. Apply the ≥3 threshold only when the last-24h window spans a business day; on a pure weekend window, expect ≥1 START + ≥1 CLOSE (evening only) and do not raise Rule 1 for the missing morning/eod slots. Intraday starts (SILENT exits) are optional but each START needs a matching CLOSE.

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

If ANY of the Step 0.5 file-proxy sources (`cowork-schedule.json` / `unified-agent.md` notebook / the expected `unified-agent-synthesis-<DATE_VN>-<SLOT>.json`) is missing, unreadable, or empty after 1 re-read:
```
send_telegram(channel="bug", message="[tnb-audit] chef-coverage-check BLOCKED — file-proxy source unavailable | file={path} | reason={error}")
```
Set `pipeline_degraded=true`. Proceed to Phase 1 layer-walk audit (do not EXIT — dish content may still be auditable via the MARKET-side file-proxy in `audit-market.md`). Do NOT retry `read_telegram_reports` here — it is not the source for this check (see Step 0.5 above), so its own success/failure is not the error boundary's condition.

→ Error boundary pattern: `.claude/skills/cowork-boundary/SKILL.md`
