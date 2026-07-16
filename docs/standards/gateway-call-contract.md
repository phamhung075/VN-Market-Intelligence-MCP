# Gateway Call Contract

<!-- size-justification: 115L — single-reader preflight reference closing 6 recurring tool-call error classes identified in 10-session dev-team cron audit (2026-06-14 brief), +§6 Degraded Mode (FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE, 2026-07-08) codifying the sanctioned gateway-blind workaround + de-escalation rule that stops CRITICAL re-raise churn. Each section is load-bearing; no section is lazy-load candidate. -->

**Load when:** cold-start preflight, before any `call_tool` invocation. One read closes all six recurring error classes.
**SSOT index:** this file references (never copies) its upstream SSOTs listed per section.

---

## 1. MCP Gateway — Server String

```
mcp__gateway__call_tool(server="vn-market", tool="<bare_name>", arguments={...})
```

- `server` MUST be exactly `"vn-market"` — NOT `"claude.ai gateway"` / `"claude_ai_gateway"` / `"vnmarket"` / `"vn_market"`.
- `<bare_name>` = tool name without any prefix — e.g. `"task_claim"`, NOT `"mcp__vn-market__task_claim"`.
- NEVER call `mcp__vn-market__*` directly — that connection is off; calls will fail silently.

SSOT: `CLAUDE.md` § MCP Tools — Call_tool wrapper ONLY

---

## 2. Meta-Tool vs Downstream Tool

Gateway meta-tools are called DIRECTLY (not via `call_tool`):

| Meta-tool | Correct call |
|---|---|
| `search_tools` | `mcp__gateway__search_tools(keyword="<intent>")` |
| `list_server_tools` | `mcp__gateway__list_server_tools(server="vn-market")` |
| `list_servers` | `mcp__gateway__list_servers()` |

NEVER pass `search_tools` or `list_server_tools` as `tool=` inside `call_tool(server="vn-market", ...)` — they are not vn-market downstream tools.

**Discovery-first norm:** the verified registry at `docs/agents/tools/list/` is canonical for known tools — look there first. Use `search_tools("<keyword>")` or `list_server_tools("vn-market")` only when a tool name is unknown. Never guess a tool name: two discovery calls cost ~1 turn; a wrong guess + recovery costs 2–4 turns.

SSOT: `docs/standards/mcp-tools.md` § Quick Start — Tool Discovery System

---

## 3. task_claim / task_release — task_id Is Always a String

`task_id` MUST be a quoted string:

```
"task:<id>"            e.g. "task:po-triage-20260614", "task:1963a"
"dev-team-cron-singleton"   (bare singleton key — no prefix)
"cowork-slot:<slot>:<tick>" e.g. "cowork-slot:news-scout-pre-market:20260520T140000Z"
"commit-mutex:main"
```

NEVER pass an integer or unquoted bare ID — wrong type = silent failure or DB type mismatch.

`task_kind` enum (exact casing): `"cowork-slot"` | `"sprint-task"` | `"dashboard-row"` | `"commit-mutex"`

SSOT: `docs/protocols/task-lock-protocol.md` § Four Lock Kinds + § Claim Grammar

---

## 4. send_telegram — Channel Enum + Required Field

```
call_tool(server="vn-market", tool="send_telegram", arguments={
  channel: "work",           // ALWAYS lowercase — "WORK" / "BUG" / "MARKET" are invalid
  message: "<text>"          // required field is "message" NOT "text"
})
```

Valid channel enum values (from `docs/data/system-map.json` `.project.channels[].id`):
`"work"` | `"bug"` | `"market"`

**Ruling — positional shorthand:** `send_telegram(channel="work", "msg")` in pseudocode is NOT acceptable. All call_tool invocations MUST use explicit keyword form: `message="<text>"`. No positional arguments.

SSOT channel definitions: `docs/data/system-map.json` `.project.channels`
Bot command reference: `docs/standards/telegram-commands.md`

---

## 5. Edit / Write — Stale-Read Guard

Before any `Edit` or `Write`: `Read` the file in the SAME turn-sequence as the edit.

Under concurrent agent writes (parallel sprint tasks), a file state visible at Read-time may change before your Edit arrives. Pattern: Read → verify → Edit in strict order within one reasoning step.

If Edit returns "modified since last read": re-Read immediately, then re-Edit once. Do NOT retry more than once — escalate if second attempt also fails.

This is a concurrency artifact, not a tool bug.

---

## 6. Degraded Mode — Gateway-Blind Session

**Load when:** `mcp__gateway__*` tools are categorically absent from your own tool binding this session — a recurring session-transport gap (not a config defect; see `feedback_local_cowork_subagents_gateway_blind.md`), root-caused (client-side, CLI MCP-connection lifecycle, no repo fix possible) in `docs/architecture-briefs/2026-07-08-gateway-blind-cli-handshake-spike.md`.

### 6a. Self-diagnosis — inspect your own tool schema, never trust memory

Per `docs/protocols/fail-loud-protocol.md` Anti-Hallucination Rule: **attempt the actual call.** A prior cycle's/session log's "gateway was blind" entry is PAST state — it does NOT predict now. Only your own tool schema this turn (or an actual failed call this turn) is evidence. Never skip a call because a notebook says it failed before.

### 6b. Workaround coverage matrix

| Caller profile | vn-market downstream tools | Gateway meta-tools (`list_servers` / `list_server_tools` / `search_tools`) |
|---|---|---|
| Bash-equipped agent (dev-team, PO, architect, developer, ops) | `mcp_call()` in `scripts/agents-flow/mcp-call.sh` — full coverage, stateless one-shot POST | `mcp_call_gateway_meta()` in same file — 3-step stateful handshake (`initialize` → `notifications/initialized` → `tools/call`, reusing the minted `mcp-session-id` header). Both are sourced the same way: `source scripts/agents-flow/mcp-call.sh` |
| No-Bash cowork cycle agent (alert-commander, market-watcher, news-scout, digest-predict, bctc-analyst, etc.) | `.claude/skills/cycle-bootstrap/SKILL.md` CONFIRMED-BLIND fallback — Write a `docs/signals/*.json` bug-escalation directly, skip `send_telegram` (itself a gateway call, fails identically), exit as a graceful per-cycle DEFER. **No other option exists for this profile** — do not improvise a bespoke recovery. |

**`mcp_call_gateway_meta` argument gotcha (live-verified 2026-07-08):** the raw JSON-RPC `tools/call` schema for `search_tools` requires `{"query": "<text>"}` — NOT `{"keyword": "<text>"}` (the native-tool-call pseudocode in §2 above uses `keyword=` at the Claude-Code tool-binding layer, which is a different call surface than this bash bridge's raw JSON-RPC arguments; passing `keyword` here fails with `unexpected additional properties ["keyword"]`). `list_server_tools` requires `{"server": "<name>"}` (matches §2). `list_servers` takes no arguments (`{}`).

### 6c. Discovery-first fallback stays primary (cross-ref §2)

Even in degraded mode, `docs/data/tool-registry.json` (canonical, machine-generated tool list) closes the vast majority of "which tool do I call" questions without any gateway call at all — meta-tools (bridged or not) are for genuinely unknown tool names only. Check the registry before reaching for either `search_tools` path.

### 6d. De-escalation / dedup rule — stop the re-raise churn

Once gateway-blindness is corroborated **≥2x in the current session** (i.e. a second independent tool-call attempt this session also comes back blind/absent), do **NOT** raise a fresh CRITICAL signal for a further recurrence. Log it once as the corroborating signal, then treat all further recurrences **this session** as routine/expected — the only real resolution is the user performing a `/mcp` reconnect (or a full CLI session restart), which is out of any agent's control. Re-raising CRITICAL per-recurrence produces alert churn with no new information (the diagnosis does not change between the 2nd and the Nth observation) and was the direct trigger for `FIX-GATEWAY-BLIND-DEGRADED-MODE-PROCEDURE`. This mirrors PO's own already-converged triage posture (`docs/agent-memory/notebooks/po.md`) — this section codifies it so every agent knows it, not just PO after the fact.
