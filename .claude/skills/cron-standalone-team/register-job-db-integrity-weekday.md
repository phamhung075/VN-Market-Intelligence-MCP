**Job 1 — db-data-integrity, weekday session+settlement window**

> CADRAT-2 (2026-08-04): registers the schedule-split + `db-integrity-probe.sh`-gated prompt from
> `.claude/commands/crons/cron-db-data-integrity.md` Job A. If CADRAT-2 has not landed on the live
> authoring doc yet, this row BLOCKS — do NOT register the stale pre-CADRAT-2 `15,45 * * * *`
> single-job shape instead.
>
> ⚠️ FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS (2026-08-06): CronCreate fires
> MACHINE-LOCAL (France), not UTC — `cron` below is the CEST (current-season) value ported
> verbatim from the authoring doc; switch to CET `15,45 3-10 * * 1-5` at DST changeover (re-sync
> from `cron-db-data-integrity.md` Job A, the SSOT).
>
> PROMPT DE-DUP (2026-08-06, byte-cap root-cause fix): the `prompt` text is sourced from EXACTLY
> ONE place — the "prompt (both jobs, byte-identical)" code block in `.claude/commands/crons/
> cron-db-data-integrity.md` §"Create with CronCreate". It is no longer copy-pasted into this file
> or into `register-job-db-integrity-offhours.md` (that duplication was the root cause of both
> files re-breaching the byte cap after every db-integrity content fix). When registering this
> cron, open the authoring doc and paste its prompt code block verbatim as `prompt` below. Any
> future content fix to the prompt happens ONLY in the authoring doc — never here, never in the
> offhours file.

```
CronCreate(
  description : "db-data-integrity — weekday session+settlement window (CADRAT-2 Job A)",
  cron        : "15,45 4-11 * * 1-5",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
  <-- paste VERBATIM from .claude/commands/crons/cron-db-data-integrity.md's
      "prompt (both jobs, byte-identical)" code block — see PROMPT DE-DUP note above -->
  PROMPT_EOF
)
```
