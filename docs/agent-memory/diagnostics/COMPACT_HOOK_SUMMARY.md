# Compact Hook Injection Failure — Executive Summary

**Date:** 2026-05-04
**Status:** NEW ANOMALY — Missing PostCompact Hook
**Severity:** Medium
**Category:** Configuration (not code bug)

## Problem

User ran `/compact` command. Output appeared locally ("[2mCompacted [22m") but was NOT injected back into Claude Code session.

## Root Cause

**Missing `PostCompact` hook in `~/.claude/settings.json`**

Current configuration:
```json
"hooks": {
  "UserPromptSubmit": [...],
  "PostToolUse": [...],
  "Stop": [...]
  // ❌ Missing: "PostCompact"
}
```

## What's Working

- ✅ iTerm2 session ID capture (calibrate-ctx-overhead.sh)
- ✅ Auto-compact triggering via osascript (stop-context-advisor.sh)
- ✅ Context monitoring and thresholds

## What's Broken

- ❌ NO hook to capture and inject `/compact` output back into session

When `/compact` executes:
1. Claude Code runs compaction internally
2. Summary is displayed in terminal
3. Claude Code fires `PostCompact` event
4. NO HOOK catches it → summary never injected into conversation history

## Configuration Requirement

Add to `~/.claude/settings.json`:

```json
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
```

And create `/Users/admin/.claude/hooks/post-compact-injector.sh` to capture and re-inject the compact summary.

## Impact

- Only affects manual `/compact` invocations (user gets the output locally but not in conversation)
- Does NOT affect auto-compact functionality (that works)
- Workaround: Use auto-compact (context > 40%) instead of manual `/compact`

## Full Diagnostic

See: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory/diagnostics/COMPACT_HOOK_DIAGNOSIS_2026-05-04.md`

## Design Reference

See: `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/smart-compact-protocol.md` (section "Hook Scripts")

## Dedup Status

**NEW issue.** No prior reports in past 7 days. Last smart-compact-protocol commit was 2026-05-02 (documented expected hooks but didn't verify they were configured).

