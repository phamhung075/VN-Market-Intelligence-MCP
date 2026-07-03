## Task Report FIX-FB-DAILY-FIRER-CLI-FLAG

**Scope note:** launchd bash backstop, ZERO test-suite coverage. Per task instructions, full ~14000-test TS suite was NOT run (irrelevant to a bash script change). Verification below is targeted to the 5 checks specified.

changed: `scripts/cowork-fb-daily-firer.sh:138` (1 line deleted)

### 1. `git show b19ac43c5 --stat`
```
commit b19ac43c5fa2a0b97a76bccf173a563770110a48
Author: report-analyzer <daihung.pham@gmail.com>
Date:   Fri Jul 3 12:27:45 2026 +0200

    fix(crons/fb-daily-firer): drop unsupported --no-update-notification flag
    ...
 scripts/cowork-fb-daily-firer.sh | 1 -
 1 file changed, 1 deletion(-)
```
Diff:
```diff
 "$CLAUDE_BIN" \
   --dangerously-skip-permissions \
-  --no-update-notification \
   -p "run $FLOW_PATH  slot=$SLOT_ID" \
   >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
```
PASS — exactly one file changed, exactly one deletion, and the deleted line is `--no-update-notification`.

### 2. `bash -n scripts/cowork-fb-daily-firer.sh`
```
SYNTAX_OK exit=0
```
PASS — 0 syntax errors after the change.

### 3. Invocation block + installed CLI flag support
Current lines 136-139:
```bash
"$CLAUDE_BIN" \
  --dangerously-skip-permissions \
  -p "run $FLOW_PATH  slot=$SLOT_ID" \
  >> "$LOG_FILE" 2>> "$LOG_ERR_FILE"
```
```
$ which claude
/Users/admin/.local/bin/claude
$ claude --version
2.1.198 (Claude Code)
$ claude --help 2>&1 | grep -ic "dangerously-skip-permissions"
2
$ claude --help 2>&1 | grep -c "no-update-notification"
0
```
PASS — `--dangerously-skip-permissions` is supported (count 2 ≥ 1); `--no-update-notification` is absent from `--help` (count 0), confirming the flag is genuinely unsupported by the installed CLI and its removal is the correct fix (not a version-skew false positive).

**Extra corroboration (beyond spec'd checks, live reproduction):**
```
$ claude --dangerously-skip-permissions --no-update-notification -p "echo qa-smoke-test-broken"
error: unknown option '--no-update-notification'
```
This reproduces the exact incident-log error text (`docs/agent-memory/sessions/fb-daily-firer-error.log`: `error: unknown option '--no-update-notification'`) verbatim, confirming root cause with the OLD flag set still present. Did not execute the corrected (post-fix) invocation live against the real `$FLOW_PATH` — that would trigger a genuine fb-market-poster agent run / real publish side-effects, out of scope for this bash-syntax verification.

### 4. `grep -rn "no-update-notification" scripts/ launchd/`
```
(no output, exit code 1 / 0 hits)
```
PASS — no other caller left broken; the flag is fully removed from the codebase's script/launchd surface.

### 5. Root-cause match + scope check
`docs/signals/router-fbfirer-dead-cli-flag-20260703.md` root cause: `scripts/cowork-fb-daily-firer.sh:136-140` — `--no-update-notification` (line 138) not recognized by installed `claude` CLI → hard exit before `-p` prompt runs. Proposed fix: "Delete line 138 ... remaining invocation is valid." This is EXACTLY what `b19ac43c5` did — no scope drift.

Secondary observations flagged in the same doc (double-fire at 09:08Z/09:23Z — plist `StartCalendarInterval` cadence; log-noise double-write; tracked runtime logs not gitignored) were explicitly marked "non-blocking, note for the fixer" in the root-cause doc and were correctly NOT touched by `b19ac43c5` (1-file, 1-line diff, confirmed above) — in scope per task instructions as non-blocking follow-ups, not regressions.

`git status --short scripts/cowork-fb-daily-firer.sh` → empty (working tree matches merged commit, no stray uncommitted drift).

`66ed3df09` is decision-journal-only (`docs/agent-memory/decisions/sprint-MERGE-MONEY-RADAR-INTO-MOMENTUM-developer.md`, +15L, new file) — no production code touched, confirmed via `git show --stat`.

### Verdict
tests: N/A (bash script, zero test-suite coverage per task scope) | syntax: 0 errors | flag-support: confirmed | dead-caller sweep: 0 hits | root-cause match: exact
**verdict: APPROVED**

Note: per hard constraint, this report does NOT flip `docs/data/orch/orch-state.json .task_board` — router owns the review → done_verified promotion.
