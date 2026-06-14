# Gateway Call Contract

<!-- size-justification: 67L — single-reader preflight reference closing 6 recurring tool-call error classes identified in 10-session dev-team cron audit (2026-06-14 brief). Each section is load-bearing; no section is lazy-load candidate. -->

**Load when:** cold-start preflight, before any `call_tool` invocation. One read closes all six recurring error classes.
**SSOT index:** this file references (never copies) its upstream SSOTs listed per section.

---

## 1. MCP Gateway — Server String

```
mcp__claude_ai_gateway__call_tool(server="vn-market", tool="<bare_name>", arguments={...})
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
| `search_tools` | `mcp__claude_ai_gateway__search_tools(keyword="<intent>")` |
| `list_server_tools` | `mcp__claude_ai_gateway__list_server_tools(server="vn-market")` |
| `list_servers` | `mcp__claude_ai_gateway__list_servers()` |

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
