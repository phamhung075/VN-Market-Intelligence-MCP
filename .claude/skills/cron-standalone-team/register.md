# cron-standalone-team — Register (lazy-load detail)

Loaded from `.claude/skills/cron-standalone-team/SKILL.md` Step 1 ONLY when at least one of the
5 entries is missing — typically once per session restart.

**SSOT:** each `CronCreate` call below is ported VERBATIM from that cron's own
`.claude/commands/crons/cron-*.md` authoring doc. If a cadence or prompt ever changes in an
authoring doc, re-sync the matching Job below in the SAME commit.

---

## Step 2 — Register missing crons

Only execute `CronCreate` for entries NOT found in Step 1.

**Job 1 — db-data-integrity, weekday session+settlement window**

See `.claude/skills/cron-standalone-team/register-job-db-integrity-weekday.md` for full `CronCreate` definition.
CADRAT-2 (2026-08-04): schedule-split + `db-integrity-probe.sh`-gated prompt. If CADRAT-2 has
not landed yet, this row BLOCKS.

**Job 2 — db-data-integrity, daily off-hours backstop**

See `.claude/skills/cron-standalone-team/register-job-db-integrity-offhours.md` for full `CronCreate` definition.
Same prompt as Job 1 (byte-identical) — only the cron expression differs.

**Job 3 — agent-father, daily orphan+roster sweep**

See `.claude/skills/cron-standalone-team/register-job-agent-father.md` for full `CronCreate` definition.

**Job 4 — claude-manager-helper, Mon+Thu repo drift heal**

See `.claude/skills/cron-standalone-team/register-job-claude-manager-helper.md` for full `CronCreate` definition.
⚠️ CronCreate fires at MACHINE-LOCAL time (France), NOT UTC — see authoring doc's DST note.

**Job 5 — code-janitor, every 6h DRY-hygiene sweep**

See `.claude/skills/cron-standalone-team/register-job-code-janitor.md` for full `CronCreate` definition.

**Job 6 — market-db-journal-guard, every-15-min WAL re-arm runtime detector**

See `.claude/skills/cron-standalone-team/register-job-market-db-journal-guard.md` for full
`CronCreate` definition. AC-1 of `FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`
(2026-08-06) — no subagent spawn, prompt runs the probe script directly and branches on exit code.

---

## Execution

On each success: log `[cron-standalone-team] Registered <job-name> (id=<id>).`

On each failure: log error verbatim +
`send_telegram(channel="bug", "[cron-standalone-team] CronCreate FAILED for <job-name>: <error>")`.
Do NOT retry. Continue with remaining jobs.
