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
