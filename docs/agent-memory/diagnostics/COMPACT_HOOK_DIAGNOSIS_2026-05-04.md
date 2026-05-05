# Compact Hook Injection Failure — Diagnosis Report
**Date:** 2026-05-04
**Severity:** Medium
**Status:** Confirmed — Missing PostCompact Hook

---

## Symptom

User ran `/compact` command locally in iTerm2:
- **Local output:** `[2mCompacted [22m` (ANSI formatted text) appeared in terminal
- **Claude Code session:** Output was NOT injected back into the conversation
- **Expected behavior:** Compact summary should be captured and injected into the Claude Code session context

---

## Root Cause

**Missing PostCompact hook in settings.json**

The Claude Code system requires a `PostCompact` hook to:
1. Detect when `/compact` command completes in the terminal
2. Capture the compaction summary output
3. Send it back to the Claude Code session via decision mechanism

**Current hook configuration** (`~/.claude/settings.json`):
```json
"hooks": {
  "UserPromptSubmit": [ ... ],
  "PostToolUse": [ ... ],
  "Stop": [ ... ]
  // ❌ MISSING: "PostCompact"
}
```

**What exists:**
- ✅ `calibrate-ctx-overhead.sh` (UserPromptSubmit) — captures iTerm2 session ID, stores in `/tmp/iterm-session-<SESSION_ID>.txt`
- ✅ `stop-context-advisor.sh` (Stop) — auto-sends `/compact` via osascript when context exceeds threshold
- ❌ NO hook to receive and inject `/compact` output back

---

## Configuration Audit

### Hook Files Present
```
/Users/admin/.claude/hooks/
├── calibrate-ctx-overhead.sh      (2026-05-03 23:01)  ✅ UserPromptSubmit
├── lesson-advisor.sh               (2026-05-03 23:27)  ✅ UserPromptSubmit
├── post-task-compact-advisor.sh    (2026-05-02 02:42)  ✅ PostToolUse (TaskUpdate)
├── stop-context-advisor.sh         (2026-05-04 01:01)  ✅ Stop
├── stop-context-advisor.sh.bak     (2026-05-04 00:48)  (backup)
└── wiki-index-build.sh             (2026-05-03 23:15)  ✅ UserPromptSubmit
```

### Missing Hook Files
- ❌ `post-compact-hook.sh` or similar (PostCompact event handler)
- ❌ `compact-injector.sh` (for capturing terminal `/compact` output)

### iTerm2 Session ID Capture
✅ **Working:** `calibrate-ctx-overhead.sh` (line 83-92) successfully:
1. Calls osascript to get iTerm2 session ID: `osascript -e 'tell application "iTerm2" to get unique ID of current session'`
2. Stores in `/tmp/iterm-session-<SESSION_ID>.txt` for later use

Example file location:
```
/tmp/iterm-session-34fe0c1e-0bdd-4767-8780-9ec3666bd276.txt
```

This is used by:
- `stop-context-advisor.sh` (line 111-124) to send `/compact` to the specific iTerm2 session
- (but no hook to receive the response)

---

## How It Should Work

### Current Flow (Incomplete)
```
User types: /compact in iTerm2
     ↓
Claude Code built-in /compact executes
     ↓
Output: "[2mCompacted [22m" appears locally
     ↓
❌ NO HOOK CONFIGURED
     ↓
Output is NOT captured or sent back to session
```

### Required Flow (Missing)
```
User types: /compact in iTerm2
     ↓
Claude Code built-in /compact executes
     ↓
Output: "[2mCompacted [22m" + summary appears locally
     ↓
✅ PostCompact HOOK FIRES
     ↓
Hook captures stdout from /compact (if available)
     ↓
Hook sends via decision:block to inject into session
     ↓
Claude Code receives and appends to conversation
```

### Missing Hook Implementation
A `PostCompact` hook should:
1. **Trigger:** After `/compact` command completes (Claude Code PostCompact event)
2. **Capture:** Compact output from Claude Code (stdin or event data)
3. **Format:** Extract compaction summary text
4. **Send:** Via decision JSON with message content back to Claude Code

**Important clarification:**
- `/compact` is a Claude Code built-in CLI command — it's not a bash command in iTerm2
- The current system auto-types `/compact` into iTerm2 (line 122 in `stop-context-advisor.sh`)
- But `/compact` runs **inside Claude Code**, not as a terminal command
- Claude Code's `/compact` event should fire a `PostCompact` hook to inject the summary back

---

## Memory Notes

User has documented hook infrastructure in project memory:
- `[LESSON: Hook iTerm2 capture](lessons/claude-code-hook-iterm2-capture.md)`
  - "UserPromptSubmit session ID capture, retry pattern, auto-type /compact"
  - Suggests the pattern was previously understood

References suggest:
- iTerm2 session capture is working (`calibrate-ctx-overhead.sh` ✅)
- Auto-compact triggering is working (`stop-context-advisor.sh` ✅)
- BUT: **No mechanism to receive the compact output**

---

## Data

### Session File
Latest session: `/Users/admin/.claude/projects/-Users-admin-Documents-Hung---works-----PROJET---labo-VN-Market-Intelligence-MCP/34fe0c1e-0bdd-4767-8780-9ec3666bd276.jsonl` (2026-05-04 18:14, 2.8MB)

### Temp Files
```
/tmp/iterm-session-34fe0c1e-0bdd-4767-8780-9ec3666bd276.txt    ✅ (session ID capture working)
/tmp/ctx-overhead-34fe0c1e-0bdd-4767-8780-9ec3666bd276.txt     ✅ (overhead calibration working)
/tmp/ctx-compact-cooldown-Users-admin-Documents-Hung...txt     ✅ (cooldown tracking)
```

---

## Recommended Fix

### Option A: Add PostCompact Hook (Recommended)

**Step 1:** Create `/Users/admin/.claude/hooks/post-compact-injector.sh`
- Reads compact output from stdin (if available)
- Formats as decision JSON
- Sends summary back to Claude Code session

**Step 2:** Register in settings.json
```json
"hooks": {
  "UserPromptSubmit": [ ... ],
  "PostToolUse": [ ... ],
  "Stop": [ ... ],
  "PostCompact": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "/Users/admin/.claude/hooks/post-compact-injector.sh"
        }
      ]
    }
  ]
}
```

### Option B: Redirect Compact Output (Temporary)

Manually capture `/compact` output by redirecting to a file, then inject via decision mechanism.

**This is not ideal** — relies on manual steps vs. automated hook.

---

## Impact Assessment

- **Frequency:** Only when user manually runs `/compact`
- **Scope:** Single user, local session
- **Data Loss:** No — compaction still happens locally, just not reflected in Claude Code
- **Blocker:** Not critical, but defeats the purpose of compact auto-injection feature

---

## What Actually Happens vs. What Should Happen

### Scenario: Context > 40%, Auto-Compact Triggered

**Step 1: stop-context-advisor.sh fires (Stop hook)**
```bash
# stop-context-advisor.sh line 114-130 (HIGH threshold)
# Checks: context > 40% AND SESSION_FILE != */subagents/*
# Action: osascript types "/compact" into iTerm2 session

(sleep 1.5 && osascript - "$ITERM_SID" <<'APPLESCRIPT') 2>/dev/null &
  tell application "iTerm2"
    repeat with s in sessions
      if unique ID of s is targetID then
        tell s to write text "/compact"  # <-- TYPES /compact INTO iTerm2
        return
      end if
    end repeat
  end tell
end run
```

**Step 2: Claude Code receives /compact**
- User (or osascript) types `/compact` into Claude Code terminal
- Claude Code CLI parses it as a built-in slash command
- Claude Code executes compaction internally

**Step 3: Compaction Completes**
- Claude Code generates output: "[2mCompacted [22m" (ANSI formatted)
- Claude Code fires `PostCompact` event to all registered hooks
- ❌ NO HOOK REGISTERED FOR PostCompact
- Output is only shown in terminal, NOT injected back into session context

### Why the Output Disappears

When `/compact` runs:
1. Claude Code internal state is compacted (history summarized)
2. Compaction summary is generated
3. Summary is displayed in user's terminal output
4. **But:** No hook captures it
5. **Therefore:** The summary is not automatically injected into the next response

The summary gets printed to terminal (which the user sees locally) but the conversation history in Claude Code is not updated with this output.

---

## Dedup Check

**Is this a NEW issue or recurring?**

Check recent fixes:
- No prior reports in MEMORY.md about compact hook failures
- No related commits in git log for compact hook setup
- Feature appears to be designed but not fully implemented

**Verdict:** NEW ANOMALY (not reported in past 7 days)

---

## Next Steps

1. **Confirm** with user if they normally use `/compact` output injection
2. **Implement** PostCompact hook as per Option A
3. **Test** by running `/compact` and verifying output appears in Claude Code
4. **Document** the hook's purpose in `.claude/knowledge/` (if needed)
5. **Update** MEMORY if this becomes a recurring pattern

---

## Files Referenced

- `/Users/admin/.claude/settings.json` — Hook configuration
- `/Users/admin/.claude/hooks/calibrate-ctx-overhead.sh` — Session ID capture (WORKING)
- `/Users/admin/.claude/hooks/stop-context-advisor.sh` — Auto-compact trigger (WORKING)
- `/Users/admin/.claude/hooks/post-task-compact-advisor.sh` — Task completion advisor
- `/Users/admin/Mon Drive/Brain/.claude/skills/iterm-compact/scripts/iterm-compact.sh` — iTerm2 send (WORKING)
- `/Users/admin/.claude/projects/-Users-admin-Documents-Hung---works-----PROJET---labo-VN-Market-Intelligence-MCP/memory/MEMORY.md` — User memory (no prior reports)

---

## Classification

| Aspect | Value |
|--------|-------|
| **Root Cause** | Missing PostCompact hook in settings.json |
| **Component** | Claude Code hooks infrastructure |
| **Severity** | Medium (feature designed but incomplete) |
| **Scope** | Configuration/setup, not code bug |
| **Reproducibility** | 100% (always fails when `/compact` used manually) |
| **Blocker** | No (workaround: use stop-context-advisor auto-compact instead) |
| **Is Code Bug** | No (is configuration/setup issue) |
| **Requires Developer** | No (requires hook configuration, not code fixes) |

