<!-- size-justification: 47L — Step 0c: gateway-free blind detection. Child of main.md. BG-1 2026-06-18. -->

## Step 0c — Blind detection (gateway-free preflight)

Runs BEFORE slot matching (Steps 1–4b). Must never use MCP for its primary check.

### Primary check (jq, shell — no MCP required)

```
BLIND_COUNT = shell: jq '.mcpServers | length' .mcp.json
if BLIND_COUNT == "0":
  SESSION_BLIND = true
else:
  SESSION_BLIND = false
```

### Belt-and-suspenders (optional — primary is sufficient)

```
if SESSION_BLIND == false:
  attempt: call_tool(server="vn-market", tool="list_server_tools", arguments={})
  on error ("No such tool available" / not-connected / timeout):
    SESSION_BLIND = true   # secondary confirmation
  on success:
    SESSION_BLIND = false  # confirmed wired
```

### Export

```
EXPORT SESSION_BLIND  # passed to spawn-fanout.md via running context
```

### On SESSION_BLIND == true

```
log: "[cowork-team] BLIND — mcpServers={}; subagent spawns blocked. Backstops deliver."
→ CONTINUE to Steps 0b, 1–4b, 4.2–4.8 (dispatcher-local, no subagent gateway calls — run for state coherence)
→ spawn-fanout.md Step 5.0 enforces the spawn block (second enforcement point)
→ Steps 5b (last-fired) and Step 6 (telemetry) still execute
```

### On SESSION_BLIND == false

```
→ CONTINUE normally — guard is a no-op
```

RETURN: SESSION_BLIND (bool), passed to spawn-fanout.md
