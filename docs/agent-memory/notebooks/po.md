# PO Notebook

## Last updated: 2026-05-17T19:41:47Z · Cycle: c170 — 1938a MCP URL fix filed

### c170 session summary

**Spawn context:** dev-team cycle c170. PREFLIGHT PASS (HEAD.lock cleared at 19:37 UTC). Signal drained: po-signoff-c169.json (NOTHING/idle, moved to processed/). pendingSignals[] = empty.

**Step 0-TNB:** TNB c66 already ACK'd at 18:38:15Z (c169). No new handoff since then. Skipping re-ACK.

**Signal dashboard:** tnb-20260517T150000 row = READ (c169). Dashboard clean.

**Channel audit:** Claude Code execution context lacks MCP call_tool capability (established pattern, cycle 13). Cannot read Telegram channels directly. Anti-hallucination protocol: no phantom reports.

**New user signal — zenmidi.com/mcp probe:**
- User passed `MCP: https://zenmidi.com/mcp` as c170 context.
- Probed: GET + POST `https://zenmidi.com/mcp` → HTTP 404 (Cloudflare, no route in cloudflared config).
- Confirmed: cloudflared config maps `/vn-market/mcp` and `/vn-market/sse` but NOT `/mcp`.
- Confirmed: `https://zenmidi.com/vn-market/sse` → HTTP 200 (working).
- Found: 15 files use wrong URL `https://zenmidi.com/mcp`:
  - 9 × cowork-workspace-team-claude-desktop/*.md
  - 5 × .claude/commands/crons/cron-{dev-team,system-auditor,claude-manager-helper,code-janitor,agent-father,tran-ngoc-bau}.md
  - 1 × .claude/flows/cowork-refactory-expert/main.md
- Root cause of 1937a confirmed: scheduled cowork tasks reference wrong MCP URL → 404 → "MCP connector not available". news-scout notebook 18:20 UTC: "https://zenmidi.com/mcp: no DNS resolution (external isolation)".
- Correct URL: `https://zenmidi.com/vn-market/mcp` (used by cron-news-scout.md and cron-unified-agent.md which work correctly).

**Task filed:** 1938a-cowork-mcp-url-fix (HIGH FIX, zone: cross-service/, owner: developer). Added to Todo in TASKS.md.

**No-Task Guard:**
- In Progress: empty
- Review: empty
- Todo: 1938a HIGH FIX → dispatch immediately (FIX skips planning, direct to execute)
- Backlog: 5 items (4 USER-ACTION/TRACKING + 1937a SPIKE)

**BATCH decision:** BATCH([{type: FIX, id: 1938a-cowork-mcp-url-fix, zone: cross-service/}])

### Carry-over for next cycle

- **1907a digest-predict** CRITICAL — USER-ACTION (Claude Desktop MCP restart) still pending. After 1938a ships, 1937a root cause resolved — digest-predict may also recover if wrong URL was the blocker.
- **1897b USER F1** — USER-ACTION (Docker .git/ VirtioFS exclude) still pending.
- **1937a-cowork-scheduler-mcp-gap** SPIKE — root cause identified (wrong MCP URL). Architect should close SPIKE after 1938a ships.
- **BCTC Q1-2026 banking** — Monday 02:00 UTC FA + report-analyzer cycles.
- **FA OCF post-1930b** — next live FA session.
- **calendar-source-replacement** OBSERVE — no action this cycle.
- **alert-precision-488-unknowns** + **fa-shape-guard-watch** — monitoring.
