## Task Report — 1950-T4 (compact)

date: 2026-05-18
outcome: APPROVED
commits reviewed: 2c01f9a3 (fix) + 010461a7 (notebook)
type: HOTFIX (XS) — TNB cron schedule alignment
zone: .claude/commands/crons/cron-tran-ngoc-bau.md
round: 1

### Pipeline

- bun test / tsc: N/A — cron command file only (Markdown), no TypeScript source changed
- DDD scan: N/A — no import boundaries in Markdown
- Security scan: N/A — no source code, no secrets
- Scope creep: PASS — 1 Markdown edit + TASKS.md + signal file

### AC Matrix

| AC | Check | Result |
|----|-------|--------|
| AC-T4-1 | `.claude/commands/crons/cron-tran-ngoc-bau.md` L3 = `13 20 * * *` | PASS |
| AC-T4-2 | grep `17 */4 * * *` in .claude/commands/crons/ + .claude/agents/ — zero active TNB references | PASS (see NB-1) |
| AC-T4-3 | `docs/standards/cron-jobs.md` L128 = `13 20 * * *` — unchanged | PASS |
| AC-T4-4 | CronCreate limitation — see NB-2 | NB (not blocking) |
| AC-T4-5 | First fire under new schedule: 2026-05-19T20:13Z | DEFERRED |

### AC-T4-1 detail

`.claude/commands/crons/cron-tran-ngoc-bau.md` L3 reads:
`13 20 * * *` (daily 20:13 UTC = 03:13 VN next day — moved from `17 */4 * * *` by Sprint 1950-T4 HOTFIX)

### AC-T4-2 detail

grep `17 */4 * * *` across `.claude/` and `docs/` returns the following hits — all non-blocking:

- `.claude/commands/crons/cron-tran-ngoc-bau.md:3` — inline comment ("moved from `17 */4 * * *`"), not an active schedule value. PASS.
- `.claude/commands/crons/cron-news-scout.md:16` — news-scout's own schedule, unrelated to TNB. PASS.
- `docs/` files (REQ_1950.md, agent-definitions-audit, notebooks, signals, TASKS.md, SPRINT_GOAL.md) — historical/audit documentation only. PASS.

Zero active TNB scheduling entries remain under the stale value.

### Non-Blocking Notes

**NB-1** — AC spec text says "comments OK" for AC-T4-2; the one hit in `cron-tran-ngoc-bau.md` L3 is the comment in the new correct line, referencing the old value as audit trail. Fully compliant with spec intent.

**NB-2 (AC-T4-4) — CronCreate live-object gap.** Agent-father's signal (`docs/signals/agent-father-2026-05-18T1724Z-1950-T4-done.json`) states CronDelete (stale) + CronCreate (new `13 20 * * *`) were executed within the same session, but `new_job_id` shows "TBD" — confirming the known subagent-context limitation where the CronCreate tool call cannot be confirmed from within the subagent. The file-side correctness (AC-T4-1, AC-T4-2, AC-T4-3) is fully verified. The BA spec AC-T4-4 as stated demands CronCreate executed + new cron ID recorded; agent-father self-reports execution but the ID is unrecorded. This does NOT block APPROVED because: (a) the cron command file is the SSOT the router reads when registering, (b) agent-father's router-level execution is plausible, (c) the QA prompt explicitly says "don't fail T4 on this if file-side correctness is what the AC actually demands." Flag for router: if any doubt about live cron registration, the router should call CronList and verify `13 20 * * *` is present for tran-ngoc-bau, then call CronCreate if absent. This is a one-time ops check, not a code defect.

**NB-3 (AC-T4-5) — Deferred live verification.** First fire under new schedule: 2026-05-19T20:13Z. Monitor WORK channel for `[tnb-audit]` START at that time and confirm no false-positive `chef-coverage-low` BUG follows.

### [QA] Review Record

**QA:** qa | **Date:** 2026-05-18 | **Round:** 1 | **Verdict:** APPROVED

All file-side ACs pass. NB-2 (CronCreate ID unrecorded) is documented for router follow-up — not a blocking defect. Deadline met (shipped before 20:17Z). TASKS.md row already stamped Done with commit `2c01f9a3` by pm (commit `4bbf49ce`). No regression to cron-jobs.md SSOT. Pipeline clear.

QA APPROVED. NEXT: agent-father → T5 (digest-predict cron alignment).
