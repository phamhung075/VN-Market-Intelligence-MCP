# Agent Father — Notebook

**Last updated:** 2026-05-18 (Sprint 1950 / MAINT-1950b+c+d — notebook archival + YELLOW fixes + workflow-map sweep)
**Sprint:** 1950 / MAINT

## This Session — 2026-05-18 (Sprint 1950 / T3 chef pipeline runbook)

**Task: 1950-T3 — Chef pipeline operator runbook**

Files created/changed:
- NEW `docs/protocols/chef-pipeline-runbook.md` (95L) — 3 sections: cron schedule, telemetry meanings, recovery procedure
- EDIT `docs/standards/cron-jobs.md` — added runbook reference line under Chef Cook Schedule heading
- EDIT `docs/TASKS.md` — 1950-T3 moved Backlog → Done

Runbook covers:
- Section 1: Cron schedule table (4 dish types + TNB audit slot), references cron-jobs.md as SSOT
- Section 2: START/SENT/SILENT/FAILED telemetry field definitions with grep patterns
- Section 3: Diagnosis steps + recovery action table + manual re-run instructions + TNB false-positive auto-clear

T3 is the documentation deliverable that closes Sprint 1950 (T1/T2/T4/T5 all prior QA-APPROVED).

---

## This Session (prior) — 2026-05-18 (Sprint 1950 / T5 digest-predict alignment)

**Task: 1950-T5 — digest-predict cron alignment + scope cleanup**

Root cause: Sprint 1949-T5 scoped digest-predict to weekly Sunday-only, but (1) cron command file was missing, (2) flow main.md still had daily/monday/monthly dispatch rows, (3) agent.md still listed Monday responsibility.

Files changed:
- NEW `.claude/commands/crons/cron-digest-predict.md` — `47 13 * * 0`, recurring=true, durable=true
- EDIT `.claude/flows/digest-predict/main.md` — stripped to Sunday-only dispatch; 3 stale rows removed
- EDIT `.claude/agents/digest-predict.md` — Monday responsibility + schedule block + inter_agent trigger removed; 3 startup lazy-load triggers fixed (waterfall policy)
- EDIT `docs/data/cowork-schedule.json` — digest-monday-predict slot disabled (enabled: false)

CronCreate: agent-father has no MCP tools; cron file created as registration artifact. QA must invoke CronCreate from the cron command file to arm the live cron — flagged as AC-T5-7 open item.

SSOT verification:
- `docs/standards/cron-jobs.md` L118: `47 13 * * 0` — unchanged (PASS)
- sub-flow files daily.md/monday.md/monthly.md: still on disk (PASS)
- grep `30 13 * * *`: only REQ_1950.md spec text (not live code) — PASS

AC check:
- AC-T5-1: PASS — cron file exists with `47 13 * * 0`, recurring=true, durable=true
- AC-T5-2: PASS — cron-jobs.md L118 unchanged
- AC-T5-3: PASS — flow dispatch table = 1 active Sunday window
- AC-T5-4: PASS — no routing rows to daily/monday/monthly
- AC-T5-5: PASS — daily.md, monday.md, monthly.md on disk
- AC-T5-6: PASS — no live Monday responsibility in agent.md
- AC-T5-7: DEFERRED — CronCreate requires MCP; QA to execute from cron command file
- AC-T5-8: PASS — `30 13 * * *` only in REQ_1950.md spec text (not live files)

---

## This Session (prior) — 2026-05-18 (Sprint 1950 / 1950-T4 HOTFIX)

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

## This Session — 2026-05-18 (Sprint 1950 / MAINT-1950b+c+d)

**Tasks: MAINT-1950b + MAINT-1950c + MAINT-1950d — doc/notebook hygiene bundle**

MAINT-1950b (notebook archival):
- Archived 5 oversized notebooks to `docs/archive/notebooks/<agent>-2026-05-18.md`
- Live notebooks rewritten to current cycle + carry-over: ops 2510L→53L, market-watcher 2500L→79L, qa-responder 2313L→56L, pm 1167L→64L, alert-commander 579L→48L
- All ≤200L waterfall lazy-load cap (AC met)

MAINT-1950c (YELLOW audit findings):
- Added `model: claude-haiku-4-5` to `.claude/agents/semble-search.md` frontmatter
- Moved orphan news-scout-cycle notebooks (05-16 + 05-17T1820) to `docs/archive/notebooks/`
- WORK.md assessed as valid status file (not notebook), retained

MAINT-1950d (residue sweep):
- Fixed `docs/references/workflow-map.md` L103: removed "+ monday predict" from digest-predict row
- Verified `docs/standards/cron-jobs.md` L120: `47 13 * * 0` unchanged (correct)
- Grep: zero live "monday predict" references remaining

All 3 MAINTs bundled into one chore commit (doc/notebook hygiene).

---

## Keep (maintenance) — 2026-05-18 ~19:00 UTC
- Trigger: manual (MAINT-1950b/c/d bundle)
- Agents scanned: 5 notebooks (ops, market-watcher, qa-responder, pm, alert-commander)
- Auto-fixes: 3 (ops.md truncated to 54L; WORK.md removed stale placeholder; semble-search model field confirmed present)
- Escalations: 0
- Orphans found: 0 (news-scout cycle orphans already in archive; WORK.md removed)
- Lesson: When notebooks are already truncated by concurrent agents, archives exist — verify live file state before writing. workflow-map/cron-jobs were already clean from T5 fix; grep confirmed zero stale residue in live docs.

---

## Patterns Noticed

- Concurrent agents modify TASKS.md mid-session — re-read before staging.
- HEAD SHA changes between calls when concurrent agents commit — `git diff` before stage.
- TASKS.md cap: rotate Done rows to TASKS_ARCHIVE.md when file grows large.
- Cron file edits do NOT auto-refresh live cron — CronDelete + CronCreate required same session.
- Archive files may exist from earlier same-day sessions — check before creating duplicates.
- Live notebooks may already be truncated by prior sessions; always check actual wc -l first.
- Notebook archival: copy full file first, then overwrite with slim version — never truncate in-place without backup.
