**Job 2 — db-data-integrity, daily off-hours backstop**

> Same prompt as Job 1 (byte-identical, per `cron-db-data-integrity.md`'s own "both jobs,
> byte-identical" note) — only the `cron` expression differs.
>
> ⚠️ FIX-CRON-DST-LOCAL-EVAL-MOMENT-ANCHORED-EXPRESSIONS (2026-08-06): CronCreate fires
> MACHINE-LOCAL (France), not UTC — `cron` below is the CEST (current-season) value ported
> verbatim from the authoring doc; switch to CET `0 23 * * *` at DST changeover (re-sync from
> `cron-db-data-integrity.md` Job B, the SSOT).
>
> PROMPT DE-DUP (2026-08-06, byte-cap root-cause fix): the `prompt` text is sourced from EXACTLY
> ONE place — the "prompt (both jobs, byte-identical)" code block in `.claude/commands/crons/
> cron-db-data-integrity.md` §"Create with CronCreate". It is no longer copy-pasted into this file
> or into `register-job-db-integrity-weekday.md` (that duplication was the root cause of both files
> re-breaching the byte cap after every db-integrity content fix). When registering this cron, open
> the authoring doc and paste its prompt code block verbatim as `prompt` below. Any future content
> fix to the prompt happens ONLY in the authoring doc — never here, never in the weekday file.

```
CronCreate(
  description : "db-data-integrity — daily off-hours backstop (CADRAT-2 Job B)",
  cron        : "0 0 * * *",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
  <-- paste VERBATIM from .claude/commands/crons/cron-db-data-integrity.md's
      "prompt (both jobs, byte-identical)" code block — see PROMPT DE-DUP note above -->
  PROMPT_EOF
)
```
