<!-- size-justification: SPIKE root-cause recon carrying live curl/docker-log forensic evidence inline for RAW-verify by downstream PO/agent-father without re-running the probe — same precedent as 2026-07-03-ctg-bs-realdata-root.md. Splitting would break the single-reader audit trail. -->
# Architecture Brief — SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE

**Task:** SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE | zone: cross-service/ | **Date:** 2026-07-08 | timebox 120min
**Mandate:** find repo-actionable mitigation for the recurring "gateway-blind" defect (mcp__gateway__call_tool absent from an agent's own tool binding) + form an evidence-backed hypothesis for the out-of-repo CLI-side cause. This SPIKE supersedes F1-GATEWAY-TRANSPORT-PROBE / F1-WRITE-MCP-JSON-GATEWAY / F1-AGENT-FATHER-BLIND-GUARD-REMOVE (all CANCELLED — premise falsified, `.mcp.json` already correct).

**Method:** this architect sub-session was itself gateway-blind on spawn (predicted by the dispatch prompt, confirmed empirically — tool schema = exactly `{Read, Edit, Write, Bash}`, zero `mcp__*` tools of ANY kind, not even `mcp__semble__search` despite its usage instructions being injected into context, and not even non-MCP `Glob`/`Grep` which the architect's own tools_package declares). Investigation therefore ran entirely via `Bash` — `docker logs`/`docker inspect` forensics on the local `mcp-gateway` container, plus **live raw-curl replay of the full MCP session lifecycle** (`initialize` → `notifications/initialized` → `tools/call`) against the production endpoint, going one step further than the prior dev-team probe (which only sent a single stateless `tools/list` and inferred health from its protocol-correct rejection).

---

## Verdict (one line)

**The gateway server is not just "up" — it is fully MCP-protocol-functional end-to-end, proven live during this SPIKE by a complete curl-only session handshake. The defect is 100% client-side (this Claude Code CLI/harness's MCP connection lifecycle for this session), and is far more severe than "intermittent, some sessions" — the gateway container's own access log shows a continuous ~3.5-day total silence (zero successful tool calls from ANY session) spanning a mid-window container restart that did not fix it, which rules out the server/container as the cause a second, independent way.**

---

## 1. Evidence — this session is itself gateway-blind (first-hand, not inherited/assumed)

Per `docs/protocols/fail-loud-protocol.md` "Anti-Hallucination Rule — MCP Tool Calls" (never assume MCP is down without attempting the call): this session's actual invokable tool schema, as delivered to the model, is exactly `Read`, `Edit`, `Write`, `Bash` — **zero** `mcp__gateway__*` or `mcp__semble__*` tools, and zero `Glob`/`Grep` (both of which `docs/agents/tools/package/architect.md` declares as this agent's file-system tools, independent of MCP). This matches the exact signature already logged 6+ times since 2026-06-18 across different agent types (chef/unified-agent, digest-predict, bctc-analyst, market-watcher, fb-market-poster, PO, dev-team's own main session) — see `feedback_local_cowork_subagents_gateway_blind.md`.

`.mcp.json` at repo root is confirmed correct (unchanged since the 2026-06-23 fix, commit b3612720): `{"mcpServers":{"gateway":{"type":"http","url":"https://zenmidi.com/gateway/mcp"}}}`.

## 2. Evidence — full live MCP handshake succeeds via raw curl, right now (rules out server/protocol/config)

The prior dev-team probe sent one bare `tools/list` with no session and correctly got a protocol-level rejection ("invalid during session initialization") — proof the server is *reachable*, but not proof the *actual client flow* works, since a compliant client must call `initialize` first. This SPIKE completed that flow:

```
POST https://zenmidi.com/gateway/mcp  {"method":"initialize",...}
→ HTTP 200, header mcp-session-id: ELU7V2IRINESW3RRT2CYEXIYVS
→ body: {"result":{"capabilities":{...},"serverInfo":{"name":"mcp-gateway","version":"v0.1.0"}}}

POST .../mcp  {"method":"notifications/initialized"}  (+ mcp-session-id header)
→ HTTP 202

POST .../mcp  {"method":"tools/list"}  (+ mcp-session-id header)
→ HTTP 200, full 4-tool schema (call_tool/list_server_tools/list_servers/search_tools)

POST .../mcp  {"method":"tools/call","params":{"name":"list_servers","arguments":{}}}  (+ mcp-session-id header)
→ HTTP 200, {"servers":[{"name":"vn-market","tools_cached":false,"transport":"sse"}]}
```

Every step succeeded on the first try, live, on 2026-07-08T04:40Z, over Cloudflare (server header `cloudflare`, HTTP/2, TLS all healthy). **This conclusively rules out the MCP gateway server, its Docker container, Cloudflare routing, and `.mcp.json` config as the cause** — a plain, unauthenticated curl client from the same sandbox network position these sessions run in completes the entire protocol lifecycle without incident.

## 3. Evidence — the gateway container's own logs show a sustained multi-day total outage, not "some sessions"

`docker logs mcp-gateway` (Go binary, `[DEBUG] call_tool invoked: ...` per-call tracing) contains **43,233** historical `call_tool invoked` lines going back to early June — dense, continuous activity. Grepping the **entire** log file for the last such line: the most recent successful `call_tool invoked` anywhere in history is **2026-07-04T19:10:48Z**. Nothing after that, through the probe time (2026-07-08T04:4xZ) — roughly 3.5 days of complete silence on this container's application layer, despite the many dev-team/cowork-team/PO/architect sessions known to have been active in that window (they used the `scripts/agents-flow/mcp-call.sh` bash-bridge instead, which talks directly to the downstream `vn-market` endpoint and never touches this container — consistent with zero logged activity here).

`docker inspect mcp-gateway` shows `RestartCount=0, ExitCode=0, StartedAt=2026-07-07T16:35:17Z` — a **manual/orchestrated restart** (not a crash-loop) roughly 3 days *after* the last successful call, not at the onset of the outage. `~/.claude/logs/headroom-watchdog.log` (an unrelated LLM-proxy watchdog, ruled out as a direct cause since `ANTHROPIC_BASE_URL` is confirmed unset in `~/.claude/settings.json`) independently shows `headroom-proxy` container also vanishing ("not found — docker down or removed") in overlapping windows (2026-06-25, and 2026-07-07T18:13–18:34, i.e. shortly *after* the mcp-gateway restart) — circumstantial evidence of a shared Docker-engine-level event (consistent with `project_host_memory_panic.md`), but **this restart did not resolve the client-side blindness** (the container has logged zero successful calls even after coming back up), which independently corroborates that the root cause is not, and was never, server-side.

## 4. Hypothesis (b) — out-of-repo, CLI/harness-level (flag for user/Anthropic, do not attempt to fix)

Best-evidence hypothesis, ranked by how directly it's supported by the above:

1. **MCP client connection is established once per top-level CLI process and does not self-heal.** Every documented incident (`feedback_local_cowork_subagents_gateway_blind.md`, spanning 2026-06-18 → today) has exactly one working remediation: a user-driven `/mcp` reconnect or a full CLI session restart — never anything server- or repo-config-side. Combined with §2's proof that a *fresh* client (curl) succeeds instantly against the *exact same* live endpoint, the simplest explanation consistent with all evidence is that the CLI's MCP client negotiates its connection/session once (at process start or first use) and, once that connection goes stale or invalid (idle-timeout on the long-lived SSE/streamable-HTTP transport, a downstream server restart invalidating an in-memory session, or a transient network blip), it does not transparently retry a fresh `initialize` — it instead appears to silently omit the MCP tools from the model's available tool schema entirely (this session's own tool list had zero `mcp__*` entries, not an explicit per-call error), rather than surfacing a recoverable error.
2. **Task-tool/background-spawned subagents inherit the parent's (possibly-already-broken) connection state rather than negotiating their own.** Historical evidence (`feedback_local_cowork_subagents_gateway_blind.md` 2026-06-18/06-23 entries) shows that once a long-lived parent session goes blind, *every* subsequently spawned subagent is also blind — including brand-new spawns issued well after the parent's own connection died — and that a mid-session `.mcp.json` file edit does **not** hot-reload into already-running subagents ("registry loads once at init"). This SPIKE adds a new data point: even *this* investigation's own sub-session (spawned fresh, specifically to investigate this defect) was blind on arrival, and — notably — was missing not just MCP tools but also core non-MCP tools (`Glob`/`Grep`) that its own tools-package declares, which is consistent with either (a) a uniformly-reduced tool surface for this invocation's dispatch path (independent of MCP health), or (b) the same inherited-stale-session mechanism extending further than previously documented. This SPIKE cannot distinguish (a) from (b) from inside the repo — flagged for Anthropic-side visibility.
3. **This is very likely a genuine CLI/SDK defect or missing-feature (no automatic MCP reconnect-on-failure), not a Vietnamese-market-repo-specific config problem.** Recommend the user flag this pattern (repeat multi-day gateway-blind windows, remediated only by manual `/mcp`/restart, affecting both interactive and headless/background-dispatched sessions) to Anthropic if not already known, since it materially damages an architecture that depends on many long-running, unattended, cron-fired agent sessions.

**No repo-side code change can fix this** — it lives entirely in the CLI's MCP client runtime.

## 5. Repo-actionable mitigation (a)

**5a. Existing partial fix is real and correctly scoped — do not duplicate.** `FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP` (commits `caba878b7`+`83bca6c04`, shipped 2026-07-07) already added a CONFIRMED-BLIND vs TRANSIENT classification to `.claude/skills/cycle-bootstrap/SKILL.md` Step 0 (`get_cycle_bootstrap`) for the 8 no-Bash cowork cycle agents — on CONFIRMED-BLIND it skips `send_telegram` (itself a gateway call that would fail identically) and writes a `docs/signals/*.json` bug-escalation directly via `Write`, then exits as a graceful per-cycle DEFER. This closes the "silent hang / fabrication" risk for that specific call site and agent class. It does **not** cover: (i) Bash-equipped dispatcher-class agents (dev-team main session, PO, architect) who currently improvise the `mcp-call.sh` bash-bridge workaround with no documented/sanctioned procedure; (ii) the 3 gateway meta-tools (`list_servers`/`list_server_tools`/`search_tools`), which have no bash-callable equivalent at all today.

**5b. `scripts/agents-flow/mcp-call.sh` CAN be extended to cover the 3 blind gateway meta-tools — now proven implementable.** The script's existing `mcp_call()` deliberately targets the **stateless** downstream `vn-market` endpoint (its own header comment: "POST to /mcp works STATELESS — no prior `initialize` handshake needed"). The gateway endpoint is, by contrast, genuinely **stateful** — §2 proves the exact 3-request sequence (`initialize` → `notifications/initialized` → `tools/call`, reusing the returned `mcp-session-id` header) that a bash bridge would need. This is a small, mechanically well-understood extension (a second function, e.g. `mcp_call_gateway_meta`, NOT a rewrite of the existing stateless `mcp_call` — the two endpoints have genuinely different protocol contracts and should stay separate rather than be unified). Recommend implementing as a scoped FIX task (below) rather than in this SPIKE (architect does not implement).

**5c. Discovery-first norm already exists and should be the PRIMARY fallback, not the meta-tool bridge.** `docs/standards/gateway-call-contract.md` §2 already states live meta-tool calls are "only when a tool name is unknown" — `docs/data/tool-registry.json` (183 tools, `lastUpdated: 2026-07-01T10:09Z`, machine-generated, `groups` array) is the sanctioned static reference and should close the vast majority of "which tool do I call" needs even when the gateway is fully healthy. The residual gap the meta-tool bridge (5b) closes is genuinely small: truly novel/unknown tool names during an active blind window, for Bash-equipped agents only.

**5d. The re-escalation churn ("8+ consecutive cowork-team slot withholds re-raised as fresh CRITICAL") is a documentation gap, not a missing mechanism.** PO's own current triage practice (`docs/agent-memory/notebooks/po.md`, 2026-07-08 entries) already treats repeat gateway-blind signals as "routine ... withholds ... resolution = user /mcp reconnect, NOT a PO decision — no action" — i.e. PO has already converged on the right dedup posture ad hoc. This SPIKE recommends **codifying** that posture in `docs/standards/gateway-call-contract.md` as a new §6 so every agent (not just PO after the fact) knows to self-diagnose once, use the sanctioned workaround, and stop re-raising CRITICAL once corroborated ≥2x in the same session — rather than leaving it as tribal knowledge in a notebook that gets pruned.

## 6. Recommended follow-on task

**`FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE`** — type FIX, zone `cross-service/`, size S, next_agent `developer`. Scope (both land together, same PR — doc and script must stay in sync per `docs/policies/dev-standards.md` Script Persistence maintenance clause):
1. Extend `scripts/agents-flow/mcp-call.sh` with a `mcp_call_gateway_meta(tool_name, json_args)` function implementing the 3-step stateful handshake proven live in §2 (`initialize` → `notifications/initialized` → `tools/call`, all three POSTs carrying the `mcp-session-id` returned by step 1) against `https://zenmidi.com/gateway/mcp`, covering `list_servers`/`list_server_tools`/`search_tools`. Keep the existing stateless `mcp_call()` untouched (different endpoint, different contract) — add, don't merge.
2. Add a "§6 Degraded Mode — Gateway-Blind Session" section to `docs/standards/gateway-call-contract.md` covering: (a) self-diagnosis method (inspect own tool schema directly — never trust memory/notebooks/prior-cycle logs, per the fail-loud anti-hallucination rule); (b) the sanctioned workaround coverage matrix (vn-market downstream tools → `mcp_call()`, full coverage; gateway meta-tools → `mcp_call_gateway_meta()` once shipped; no-Bash agents → the already-shipped `cycle-bootstrap/SKILL.md` CONFIRMED-BLIND fallback, no other option); (c) discovery-first fallback via `docs/data/tool-registry.json` (cross-reference existing §2, frame explicitly as the degraded-mode default); (d) the de-escalation rule — once gateway-blindness is corroborated ≥2x in the current session, do not raise a fresh CRITICAL signal; note it once, treat further recurrences as routine/expected until the user performs a `/mcp` reconnect.

Not urgent/blocking — the underlying workaround already works and is in daily use; this closes documentation + a narrow tool-discovery gap and reduces alert churn. Priority: medium.

## 7. What this SPIKE did NOT resolve (accepted, in scope)

The actual client-side defect (§4) cannot be fixed from this repo — flagged for the user/Anthropic, not actioned further here, per this SPIKE's explicit out-of-scope boundary.

## 8. Standard Detection

SPIKE / recon, not a build — **BUILD-STANDARD: not-applicable**.

## Decision Journal
See `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-architect.md`.
