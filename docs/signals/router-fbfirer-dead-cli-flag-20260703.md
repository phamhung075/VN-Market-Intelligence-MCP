# Repair: fb-daily launchd firer dead — unsupported `--no-update-notification` crashes every fire

- **Filed:** 2026-07-03 by router (during cowork fb-daily RAW-verify)
- **Type:** repair_task_request → PO → backlog
- **Suggested task id:** `FIX-FB-DAILY-FIRER-CLI-FLAG`
- **Severity:** HIGH (guaranteed-slot backstop silently non-functional)
- **Scope:** 1-line fix — ideal for `fixer`.

## Incident

`scripts/cowork-fb-daily-firer.sh` is the launchd backstop that fires the **guaranteed**
`fb-daily` cowork slot when no live CLI session runs the cowork dispatcher
(context: `project_cowork_guaranteed_slot_needs_live_cli_session`). Its plist
`launchd/com.vn-market.fb-daily-firer.plist` fired today (2026-07-03) at **09:08:54Z** and
**09:23:56Z**, but BOTH invocations crashed instantly:

```
docs/agent-memory/sessions/fb-daily-firer-error.log:
  error: unknown option '--no-update-notification'
```

The `claude` CLI subprocess exits before the `-p 'run ...'` prompt runs, so the firer produces
**zero** output. The fb-daily post for 2026-07-03 was produced ONLY because a live CLI session
ran the cowork dispatcher (09:15Z tick → spawned fb-market-poster `a15d1d5`, committed
`e4d17bb6d`). On any day with no live session, the guaranteed fb-daily post would silently fail.

## Root cause

`scripts/cowork-fb-daily-firer.sh:136-140`:

```bash
"$CLAUDE_BIN" \
  --dangerously-skip-permissions \
  --no-update-notification \        # <-- line 138: flag not supported by installed claude CLI
  -p "run $FLOW_PATH  slot=$SLOT_ID" \
  >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
```

The installed `claude` CLI version does not recognize `--no-update-notification` → hard exit.

## Proposed fix (minimal)

1. **Delete line 138** (`  --no-update-notification \`). The remaining invocation
   (`--dangerously-skip-permissions -p "..."`) is valid. No `launchctl` reload needed —
   launchd execs the script fresh on each fire.
2. Verify: run `claude --dangerously-skip-permissions -p 'echo ok'` (or `--help`) to confirm the
   corrected flag set parses. Confirm `fb-daily-firer-error.log` no longer records the option error
   on the next scheduled fire.
3. (Optional, if update-notification noise is a concern) suppress via a supported mechanism
   (env var) rather than the removed flag.

## Secondary observations (non-blocking, note for the fixer)

- **Double-fire:** the firer fired twice today (09:08Z + 09:23Z, ~15 min apart). Inspect the plist
  `StartCalendarInterval` — a guaranteed daily slot should fire once (the flow's published-marker
  gate `published:fb-daily:<VN-DATE>` dedups the *post*, so this is efficiency, not a double-post).
- **Log noise:** each line is written twice (log() tee + stdout redirect to the same LOG_FILE).
- **Tracked runtime logs:** `docs/agent-memory/sessions/fb-daily-firer.log` and
  `fb-daily-firer-error.log` are git-tracked; consider `.gitignore` (runtime logs).
