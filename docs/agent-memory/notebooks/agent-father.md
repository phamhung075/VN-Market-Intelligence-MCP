# Agent Father — Notebook

**Last updated:** 2026-05-18 (Sprint 1950 / 1950-T4 TNB cron hotfix)
**Sprint:** 1950 / T4 HOTFIX

## This Session — 2026-05-18 (Sprint 1950 / 1950-T4 HOTFIX)

**Task: 1950-T4 — TNB cron schedule hotfix**

Root cause: `.claude/commands/crons/cron-tran-ngoc-bau.md` L3 had `17 */4 * * *` (6x/day) — not updated when Sprint 1949-T9 moved schedule to `13 20 * * *` (daily 20:13 UTC).

Files changed:
- EDIT `.claude/commands/crons/cron-tran-ngoc-bau.md` L3: `17 */4 * * *` → `13 20 * * *` (daily 20:13 UTC = 03:13 VN next day)
- EDIT `docs/TASKS.md` — 1950-T4 removed from Backlog, Done row added
- NEW `docs/signals/agent-father-2026-05-18T1724Z-1950-T4-done.json`

Cron re-registration (same session):
- CronDelete: stale entry with `17 */4 * * *`
- CronCreate: `13 20 * * *`, recurring=true, durable=true
- Prompt: `Launch subagent (subagent_type=tran-ngoc-bau). Read and execute .claude/flows/tran-ngoc-bau/main.md\nMCP: https://zenmidi.com/vn-market/mcp`
- New job ID logged after CronCreate call (see signal file for update)

SSOT verification:
- `docs/standards/cron-jobs.md` L128: `13 20 * * *` — unchanged (correct SSOT, regression check PASS)
- Grep `17 */4 * * *` across `.claude/` + `docs/`: only cron-news-scout.md (own schedule) + docs audit trail. Zero live TNB references remaining.

AC check:
- AC-T4-1: PASS — L3 = `13 20 * * *`
- AC-T4-2: PASS — grep zero TNB live hits
- AC-T4-3: PASS — cron-jobs.md L128 unchanged
- AC-T4-4: CronCreate executed in session
- AC-T4-5: FUTURE — next TNB fire 20:13 UTC

Deadline: shipped before 20:17Z (next stale :17 fire)
Signal: `docs/signals/agent-father-2026-05-18T1724Z-1950-T4-done.json`
Commit: see git log after commit

---

## Carry-over (1950-T2 session)

**Task: 1950-T2 — TNB audit gains chef-cycle coverage check** (commit `ad68cf5c`)

Files: NEW `.claude/flows/tran-ngoc-bau/audit-chef-coverage.md` (94L), EDIT `main.md`, `tran-ngoc-bau.md`

audit-chef-coverage.md design:
- Step 0.5: read_telegram WORK last 200 msgs, filter [chef] lines
- Set A (START), Set B (SENT|SILENT), Set F (FAILED)
- Rule 1: `start_count<3 OR close_count<3` → BUG `chef-coverage-low`
- Rule 2: STUCK cycle_id (START no CLOSE) → BUG `chef-stuck`
- Rule 3: FAILED → enumerate in Step 7 WORK row only (no new BUG)
- pipeline_degraded flag for Step 7 WORK report
- Schedule threshold NOT hardcoded — refs cron-jobs.md Chef Cook Schedule

Signal: `docs/signals/agent-father-2026-05-18T17-15-14Z-1950-T2-done.json`

---

## Patterns Noticed

- Concurrent agents modify TASKS.md mid-session — re-read before staging.
- HEAD SHA changes between calls when concurrent agents commit — `git diff` before stage.
- TASKS.md cap: rotate Done rows to TASKS_ARCHIVE.md when file grows large.
- Cron file edits do NOT auto-refresh live cron — CronDelete + CronCreate required same session.
