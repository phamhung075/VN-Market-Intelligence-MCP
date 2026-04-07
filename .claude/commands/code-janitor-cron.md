Re-create the code-janitor cron job. Use CronCreate with:

- cron: `17 */3 * * *`
- prompt:
  ```
  Code Janitor — scan for hard-code / DRY violations every 3 hours.

  STEP 1: Re-read .claude/agents/code-janitor.md (the file may have been updated).
  STEP 2: Follow the instructions in that file EXACTLY. Respect the "propose don't apply" default; only ship single-file mechanical fixes that have existing test coverage.

  Do NOT just exit when nothing is found. Write the three-section report regardless and send a short summary to WORK channel via send_telegram(channel="work", ...).
  ```

After creating the cron, run the agent once immediately to establish a baseline of known findings in `.claude/state/code-janitor-known-findings.json`.
