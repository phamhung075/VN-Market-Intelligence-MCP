---
name: anti-hallucination
description: >
  Prevents cowork agents from claiming MCP tools are unavailable without trying.
  SSOT for the "always call, never assume" rule. Referenced by all flow files
  and cycle-bootstrap skill.
---

## Anti-Hallucination Rule

**You HAVE MCP gateway access (search your tools for `call_tool`). DO NOT claim it is unavailable. CALL IT.**

```
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

### Rules

1. **NEVER say** "MCP is not available in this session" — that is a hallucination.
2. **ALWAYS call the tool first.** If it fails, report the REAL error from the response.
3. The tool is listed in your tools and WILL work. **TRY IT.**
4. If the call returns an error → report the actual error message → follow error boundary in your flow.
5. If you cannot find the tool in your tool list → you are wrong. It is there. Call it anyway.

---

### Anti-Invention Rule (tool name hallucination)

**NEVER invent, guess, or fabricate a tool name.** Only call tools that:
- Appear in your actual tool list (provided at session start), OR
- Are explicitly documented in your flow/cycle file

If a tool name is NOT in your package file and NOT in your flow docs:
1. **Do NOT call it** — you will get an error and waste a cycle.
2. **Do NOT assume it exists** based on naming patterns (e.g., don't guess `update_analysis_brief` because `fetch_analysis` exists).
3. Instead → **Read `.claude/tools/package/<your-agent-id>.md`** to verify your allowed tools.
4. If the tool is not listed there → **skip the step** and log: `[SKIP] No tool found for: <intent>`.

### Verification Protocol (before any `call_tool`)

```
Step 1: Is tool name in my package file (.claude/tools/package/<agent>.md)?
  YES → call it
  NO  → Step 2

Step 2: Is tool name in my flow/cycle doc?
  YES → call it (may be a new tool not yet in package)
  NO  → DO NOT CALL. Log [SKIP].
```

**SSOT for tool names:** `.claude/tools/list/` (count → `jq '.toolCount' docs/data/project-stats.json` files). If a name has no matching file there, it does not exist.

**Root cause:** Agents pattern-match tool names from training data or adjacent names. This creates phantom calls that fail silently or trigger false bug reports.
