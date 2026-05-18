# Agent Father — Notebook

**Last updated:** 2026-05-18 (Sprint 1951 / 1951a — 12 RemoteTriggers created, 4 failed min-1h constraint)
**Sprint:** 1951 Phase 1 (1951a DONE, 1951b active)

## This Session — 2026-05-18 (Sprint 1951 / 1951a RemoteTrigger creation)

**Task: 1951a — Create 16 RemoteTriggers for cowork schedule**

Result: PARTIAL SUCCESS (12/16 created, 4 failed)

Triggers created (12):
- chef-morning: trig_019nwLpkYELqFdE1DZaRhPUk
- chef-intraday: trig_015M6yJMwShWmVcm6XNpVQ3U
- chef-eod: trig_011HNsRMNiQwa3vNwN1b9Anh
- chef-evening: trig_01CLotVE4XinDFxM2jErUCir
- digest-sunday: trig_014GzK19w1ZNpwnRjA91ce3P
- tnb-audit: trig_01LpUxJ98v2aK22FqLSBtL1G
- financial-analyst-morning: trig_01Du7kZ59vzagGh5GvkTY3Gi
- financial-analyst-midday: trig_011JSNKJEMs5fQwGCmLUkuWT
- news-scout-offhours: trig_01Mooo3zi5MFysRAWsHwaztd
- news-scout-sentiment: trig_016gauuJbAhdbzNcA3LYCFSh
- market-watcher-offhours: trig_01W62B3yS7AERMwsGrap4e7U
- market-watcher-eod: trig_01PUAqNa8gMWRjc6DWqcV7xh

Failed (4) — new API constraint discovered:
- news-scout-market (*/15 2-8 * * 1-5): API min-interval=1h, rejected
- market-watcher-market (*/15 2-8 * * 1-5): API min-interval=1h, rejected
- market-watcher-prepost (*/30 * * * 1-5): API min-interval=1h, rejected
- alert-commander-market (*/15 2-8 * * 1-5): API min-interval=1h, rejected

Key finding: RemoteTrigger API enforces minimum 1-hour interval (not documented in SPIKE-1951a).
SPIKE-1951a only verified syntax support, not API runtime constraint.
Sub-hourly slots need workaround: either CronCreate session-based fallback or hourly+watchdog.

Technical: Used `claude -p --allowedTools RemoteTrigger --model claude-haiku-4-5` subprocess
to call RemoteTrigger. Native Claude Code tool accessible when tengu_surreal_dali flag enabled.
Drifted trigger (news-scout-market `0 2-8 * * 1-5`) created by model silently — disabled.

Files: EDIT docs/data/cowork-schedule.json (trigger_id + trigger_error per slot), EDIT docs/TASKS.md
Commit: bb4ed0c3

---

## Carry-over (Sprint 1950 T1-T5 + MAINT-b/c/d)

All 2026-05-18 Sprint 1950 tasks DONE. See git log for commits:
- 1950-T1 chef.md telemetry (f4688989)
- 1950-T2 coverage audit (ad68cf5c + d307d294)
- 1950-T3 chef runbook (0e3c96c9 + 1d425787)
- 1950-T4 TNB cron hotfix (2c01f9a3)
- 1950-T5 digest-predict finalization (3c560cab + af3b22d0)
- MAINT-b/c/d notebook archival + YELLOW fixes (d5c78d45)

---

## Patterns Noticed

- Concurrent agents modify TASKS.md mid-session — re-read before staging.
- HEAD SHA changes between calls when concurrent agents commit — `git diff` before stage.
- TASKS.md cap: rotate Done rows to TASKS_ARCHIVE.md when file grows large.
- Cron file edits do NOT auto-refresh live cron — CronDelete + CronCreate required same session.
- Archive files may exist from earlier same-day sessions — check before creating duplicates.
- Live notebooks may already be truncated by prior sessions; always check actual wc -l first.
- Notebook archival: copy full file first, then overwrite with slim version — never truncate in-place without backup.
- RemoteTrigger: must use claude CLI subprocess, not Bash directly. Haiku model may silently drift cron — verify.
- API min-interval=1h enforced at runtime — test constraints empirically, don't rely on syntax-only SPIKE findings.
