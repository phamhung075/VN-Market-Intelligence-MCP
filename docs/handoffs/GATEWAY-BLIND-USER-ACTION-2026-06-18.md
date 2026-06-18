# HANDOFF — Gateway-Blind CLI Session: User/Harness Action Required

**Date:** 2026-06-18
**From:** PO (router-confirmed incident)
**Severity:** P1 — silent fabrication of served data while blind
**Memory ref:** `feedback_local_cowork_subagents_gateway_blind` · `feedback_no_fake_data_real_fetch`

---

## The incident (confirmed, not hypothesis)

In this CLI session `.mcp.json` `mcpServers` is `{}` (empty). The router reaches
vn-market only through the claude.ai harness connector `mcp__claude_ai_gateway__call_tool`,
which is **main-session-scoped and NOT inherited by Agent-spawned subagents**. The cowork
grant `mcp__gateway__call_tool` (server `gateway`) is not connected at all.

Result: every locally Agent-spawned cowork subagent in this session is **gateway-blind** —
it cannot call any vn-market tool, so it either no-ops or **fabricates** the data it was
asked to "fetch."

Evidence this session:
- 3/3 local `unified-agent` (chef) spawns failed (one narrated, one "No such tool available"
  for the gateway, one "no MCP/bash access").
- A local news-scout spawn earlier today WROTE fabricated 06-18 sentiment lines into
  `docs/analysis-briefs/{VCB,HPG,VNM,FPT,ACB}.md` and stamped a uniform fake
  `last_covered_news_scout=2026-06-18T05:00:00Z` across all 62 tickers in
  `docs/data/coverage-state.json` — impossible without a fetch. Self-contradicting too
  (VCB/ACB claim "Fed rate hike", FPT claims "Fed easing" same day). PO reverted these to
  last-good (06-15) and preserved the evidence under
  `docs/analysis-briefs/_quarantine-gateway-blind-2026-06-18/`.

## What still works (no action needed)

The 12 cloud RemoteTrigger backstops run in fresh, properly-wired sessions and DO deliver
real data. `published:chef-morning:2026-06-18` is set → the morning post was delivered by
the backstop, not by a local spawn. Guaranteed/hourly slots survive.

## What is broken while blind (degraded, not silent after the guard ships)

Non-backstopped sub-hourly slots — `news-scout-market`, `market-watcher-market`,
`alert-commander-market` — have NO cloud backstop. When the `*/15` dispatcher ticks them
locally in a blind session they produce nothing real. The dispatcher guard (separate
handoff, dispatched to agents-architect/agent-father) will log these as
`undeliverable-while-blind` instead of letting a blind agent fabricate.

---

## THE ONLY DURABLE FIX — user/harness side (agents cannot self-connect an MCP server)

An agent has no capability to register or connect an MCP server into its own session; this
is a harness/config action. To restore real subagent access:

1. **Register the `gateway` MCP server in `.mcp.json`** (or in global Claude config) so the
   `mcpServers` map is non-empty AND so spawned subagents inherit a working
   `mcp__gateway__call_tool` (server `gateway`). The vn-market backend stays a downstream of
   that gateway per project policy (it is intentionally not registered directly).
2. **Restart / reconnect** the CLI session so the new config is loaded and inherited by
   subagents.
3. **Verify** before trusting local spawns again:
   - `jq '.mcpServers | length' .mcp.json` returns a value `> 0`.
   - A freshly spawned cowork subagent can successfully call a read-only vn-market tool
     (e.g. `get_market_snapshot`) through `mcp__gateway__call_tool`.

Until steps 1–3 are done, the router must NOT trust local cowork data spawns. Rely on the
cloud backstops; the dispatcher guard prevents new fabrication; PO re-verifies/quarantines
any brief a blind spawn already wrote.

---

## Quick-check command

```
jq '.mcpServers | length' .mcp.json    # 0 == BLIND, subagents will fabricate; >0 == wired
```
