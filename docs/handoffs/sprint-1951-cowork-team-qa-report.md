## Sprint 1951 — cowork-team QA Report
date: 2026-05-18
outcome: CHANGES_REQUESTED
sprint: 1951
round: 1

## Test Pipeline

- bun test / tsc: N/A — Markdown flow + JSON + docs-only change, no TypeScript source
- DDD scan: N/A — no TypeScript imports
- Security scan: N/A — no source code, no process.env, no secrets
- Scope: .claude/commands/, .claude/flows/, .claude/commands/crons/, docs/data/, docs/standards/, docs/references/

## AC Walk-Through

| AC | Description | Verdict | Notes |
|----|-------------|---------|-------|
| AC-1 | command file exists | PARTIAL | File on disk but UNTRACKED — not committed |
| AC-2 | flow file exists | PARTIAL | File on disk but UNTRACKED — not committed |
| AC-3 | master cron registered | DEFERRED | Runtime verification; CronCreate step belongs to router |
| AC-4 | sub-hourly slots fire | PASS | news-scout-market, market-watcher-market, market-watcher-prepost, alert-commander-market — crons correct in JSON, captured by ±2min window at :00/:15/:30/:45 |
| AC-5 | silent cycles no noise | PASS (impl) | Step 4 silent exit coded; AC-5 brief example (03:00 UTC) is factually wrong — 4 slots fire at that time. Impl is correct. |
| AC-6 | idempotency during parallel-run | PASS | Delegated to agent flows (Sprint 1949 last_fired pattern); dispatcher does not re-check |
| AC-7 | telemetry written | PASS | Step 6 schema matches brief §6 exactly |
| AC-8 | RemoteTrigger deletion | DEFERRED | Post-parallel-run; AC-8 actions not yet required |
| AC-9 | cowork-schedule.json updated | PASS | agent_id + parallel_group added to all slots; trigger_status=pending_delete on 12 slots |
| AC-10 | cron-jobs.md updated | PARTIAL | Row added correctly but diff is uncommitted |

## Blocking Issues

### BLOCK-1: chef-morning, chef-eod, chef-evening are dead-zone slots — will never fire

**Severity:** CRITICAL — affects 3 guaranteed chef dishes.

**File:** `docs/data/cowork-schedule.json` (slots chef-morning, chef-eod, chef-evening)
**Cross-reference:** `docs/data/cowork-schedule-skipped.json` warnings section

The master cron fires at `:00`, `:15`, `:30`, `:45` of each hour. The ±2min matching window covers only minutes `[58-02, 13-17, 28-32, 43-47]`. Minutes 23 and 37 fall in neither window:

- `chef-morning` (`23 5 * * 1-5`): minute 23 is 7 min from :15 window edge, 7 min from :30 window edge. Never captured.
- `chef-eod` (`37 8 * * 1-5`): minute 37 is 7 min from :30, 8 min from :45. Never captured.
- `chef-evening` (`37 19 * * *`): same as chef-eod. Never captured.

agent-father correctly identified this in `docs/data/cowork-schedule-skipped.json` (OFF_MINUTE_ALIGNMENT warnings) but did NOT fix it. The slots were left with off-minute crons. The file says "router to realign cron grid in follow-up" but this is a production defect — the three guaranteed chef dishes simply will not fire under the new dispatcher.

**Required fix (architect must approve cron changes):**

Option A (preferred — minimal impact): Update slot crons in `cowork-schedule.json` to align with the 15-min grid:
- `chef-morning`: `23 5 * * 1-5` → `15 5 * * 1-5` (08 min earlier, same VN market context)
- `chef-eod`: `37 8 * * 1-5` → `45 8 * * 1-5` (8 min later; still within 24-min window before 09:00 VN close)
- `chef-evening`: `37 19 * * *` → `45 19 * * *` (8 min later; macroRefresh gate at 19:13 gives 32-min margin — safe)

Option B: Widen the dispatcher window from ±2min to ±7min (requires flow change + regression check on all 16 slots to confirm no false matches).

Option C: Separate standalone CronCreate for each off-minute slot (defeats sprint goal, not recommended).

**Architect must confirm which option before fixer implements.**

---

### BLOCK-2: Primary Sprint 1951 files are untracked — not committed to main

**Severity:** HIGH — deliverable is not persisted in version control.

**Files:**
- `.claude/commands/cowork-team.md` — untracked
- `.claude/flows/cowork-team/main.md` — untracked
- `.claude/commands/crons/cron-cowork-team.md` — untracked

**Uncommitted diffs:**
- `docs/standards/cron-jobs.md` — cowork-team row added, not committed
- `docs/references/workflow-map.md` — Related note added, not committed

git status shows `??` for all three primary files. Commit `cdb556bd` only contains the earlier `cowork-dispatcher` approach files, not the Sprint 1951 pivot deliverables.

**Required fix:** Commit the 5 files in one commit with correct convention:
```
feat(1951/scheduler): cowork-team master cron dispatcher

Sprint: 1951
Task: 1951
AC: AC-1 command / AC-2 flow / AC-10 cron-jobs.md / workflow-map Related note
```

---

### BLOCK-3: Stale committed flow at wrong path creates dual-dispatcher confusion

**Severity:** MEDIUM — operational confusion risk.

**File:** `.claude/flows/cowork-dispatcher/main.md` (committed via `cdb556bd`)

This file implements a `cowork-dispatcher` (old approach — RemoteTrigger-based per its own header: "Fires every 15 min via RemoteTrigger"). The Sprint 1951 pivot creates `cowork-team` (CronCreate-based), but `cowork-dispatcher` remains committed and operational. Its `docs/data/cowork-dispatcher-trigger.json` has `status: pending_register` — if a router registers it, a second dispatcher runs alongside cowork-team.

**Required fix:** Either:
- Delete `.claude/flows/cowork-dispatcher/main.md` and `docs/data/cowork-dispatcher-trigger.json` in the same commit as BLOCK-2 fix, OR
- Add a clear deprecation header to cowork-dispatcher/main.md and set `status: deprecated` in cowork-dispatcher-trigger.json

The cowork-team flow must be the sole active dispatcher path.

---

## Non-Blocking Observations

**NB-1: OQ-2 collision-detection guard will fire very frequently during market hours.**

`docs/flows/cowork-team/main.md` Step 4b — the WARN sends to WORK whenever ≥2 slots share the same `agent_id` in a single fire window. `market-watcher` has 4 enabled slots (`market`, `prepost`, `offhours`, `eod`) meaning during market hours (02:00-08:59 UTC weekdays) the WARN fires on every master tick (at least 20 WORK messages per weekday from this guard alone). Brief §5 R3 says this is expected; the guard is non-blocking. But WORK channel noise may trigger noise-fatigue for TNB auditor and dev-team drain-signals. Consider suppressing WARNs for `parallel_group` matches in a follow-up.

**NB-2: Brief AC-5 example is factually wrong.**

Brief §10 AC-5: "At 03:00 UTC on a weekday (no slot due), dispatcher exits silent." Verified: at 03:00 UTC on a weekday, `news-scout-market`, `market-watcher-market`, `market-watcher-prepost`, and `alert-commander-market` all match. The implementation correctly fires them. The brief example should say a Saturday or a mid-hour window (e.g., 10:15 UTC) as the silent example. Not a code bug — brief inaccuracy only.

**NB-3: cowork-dispatcher/main.md Step 3 also silently exits with no telemetry signal.**

The old `cowork-dispatcher/main.md` (Step 3) says "stop silently — no log, no Telegram" for empty MATCHES. The new `cowork-team/main.md` Step 4 writes a silent telemetry signal (correct per brief §6). No fix needed for cowork-team. Note only.

## Merge Status

BLOCKED — do not merge. Three blocking issues require fixer action and architect decision on BLOCK-1 cron realignment.

Signal: `docs/signals/qa-1951-cowork-team-changes-requested.json`
