<!-- size-justification: 195L — two-finding design brief: F1 gateway-call-contract SSOT + F2 cron-overlap single-flight policy. Both are doc/flow changes only; no production code. Each section is load-bearing for agent-father task decomposition. -->
# Architecture Brief — DEV-TEAM-TOOL-CONTRACT-CRON-OVERLAP

**Date:** 2026-06-14
**Author:** agents-architect
**Priority:** P1
**Status:** IMPLEMENTED — agent-father 2026-06-14 (F1-A: gateway-call-contract.md created; F1-B + F2-A: dev-team/flow/main.md Step 0-PREFLIGHT updated; SF-1 claim/heartbeat/release triad wired at 3 points)
**Scope:** Two findings from 10-session dev-team cron audit (2026-05-31 → 2026-06-11). No production code changes. Doc and flow file changes only.

---

## Finding 1 — Recurring Tool-Contract Misunderstandings

### Problem

Across all 10 audited dev-team cron sessions the dispatcher burned turns recovering from the same six categories of tool-call errors:

| Error class | Frequency |
|---|---|
| Gateway `server=` string wrong (`"claude.ai gateway"` / `"claude_ai_gateway"`) | ×10 |
| `search_tools` / `list_server_tools` invoked as vn-market downstream tool | ~16 |
| Tool-name guessing without discovery (`get_latest_news`, `task_list`, `get_vps_health` …) | ~25 distinct |
| `task_claim` / `task_release` `task_id` passed as non-string | ×14 |
| `send_telegram` channel enum casing (`WORK` ≠ `work`) + `text` vs `message` field | ×6 |
| Edit/Write "file not read / modified since" from stale-read under concurrent writes | ×22 |

These are the same errors every session. The dispatcher knows how to recover — but paying 1–3 turns per recovery × 10 sessions × 6 error classes = systematic token waste. Root cause: no single readable "gateway call contract" block exists that the dispatcher loads at preflight. The facts are scattered across CLAUDE.md (SSOT for server string), `docs/standards/mcp-tools.md` (tool discovery), Telegram channel enum in `docs/standards/alert-message-format.md`, and task-lock protocol. No single preflight read closes all six gaps at once.

### Design Decision — F1

Create one new canonical doc: `docs/standards/gateway-call-contract.md`. It is NOT a duplicate — it is the authoritative single-reader reference that consolidates the six-class error surface. Existing files remain SSOT for their respective topics; this new file is a read-target that references them, not a copy.

Content contract for `docs/standards/gateway-call-contract.md`:

```
## 1. MCP Gateway — Server String (SSOT: CLAUDE.md)
call_tool(server="vn-market", tool="<bare_name>", arguments={...})
- server MUST be exactly "vn-market" — NOT "claude.ai gateway" / "claude_ai_gateway" / "vnmarket"
- <bare_name> = tool name without any prefix (e.g. "task_claim", NOT "mcp__vn-market__task_claim")
- The gateway itself (search_tools / list_server_tools) is a META-TOOL on the gateway session —
  call it as mcp__claude_ai_gateway__search_tools / mcp__claude_ai_gateway__list_server_tools.
  NEVER pass search_tools as tool= inside call_tool(server="vn-market", …).

## 2. Tool Discovery — Mandatory Before Guessing
1. mcp__claude_ai_gateway__search_tools(keyword="<intent>")       ← semantic search across all servers
2. mcp__claude_ai_gateway__list_server_tools(server="vn-market")  ← full schema dump for vn-market
3. Per-tool docs: docs/agents/tools/list/<tool_name>.md
NEVER guess a tool name. Two discovery calls cost 1 turn; a wrong guess + recovery costs 2–4 turns.

## 3. task_claim / task_release — task_id Is Always a String
task_id MUST be a string: "task:<id>" or "cowork-slot:<id>:<tick>" or "commit-mutex:main".
NEVER pass an integer or bare id. Wrong type = silent failure or DB type mismatch.
Enum: task_kind in {"cowork-slot","sprint-task","dashboard-row","commit-mutex"} — exact casing.

## 4. send_telegram — Channel Enum + Required Field
call_tool(server="vn-market", tool="send_telegram", arguments={
  channel: "work" | "bug" | "market",   // lowercase only — "WORK" / "BUG" are invalid
  message: "<text>"                      // field is "message" NOT "text"
})

## 5. Edit / Write — Stale-Read Guard
Before any Edit or Write: Read the file in the SAME turn-sequence as the edit.
Under concurrent agent writes (parallel sprint tasks), a file state visible at Read-time
may change before your Edit. Pattern: Read → verify → Edit in strict order within one
reasoning step. If Edit returns "modified since last read": re-Read then re-Edit once.
This is not a tool bug — it is a concurrency artifact. Do NOT retry more than once.
```

Reference links in that file (not inline copies):
- SSOT server string → CLAUDE.md § MCP Tools
- Tool surface → `docs/standards/mcp-tools.md`
- Full task-lock grammar → `docs/protocols/task-lock-protocol.md`
- Telegram channels → `docs/standards/telegram-commands.md`

### Preflight Hook — F1

Extend `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT (after the cron-announce `send_telegram` line, before the HEAD.lock guard) with a single load directive:

```
# GCC-PREFLIGHT: load gateway call contract before any tool call
→ Read docs/standards/gateway-call-contract.md   (one file, ~60L, ~250 tokens)
```

No new section, no structural change to PREFLIGHT. One line added immediately after `start_epoch` assignment block, before the `if .git/HEAD.lock` branch. The directive signals that this file MUST be read every cold-start; it is not lazy-loaded.

### Files — F1

| File | Action | Owner |
|---|---|---|
| `docs/standards/gateway-call-contract.md` | CREATE — ~60L canonical contract (see content contract above) | agent-father |
| `docs/agents/dev-team/flow/main.md` | EDIT — add one GCC-PREFLIGHT read directive in Step 0-PREFLIGHT after `start_epoch` line | agent-father |

No other files touched. `docs/standards/mcp-tools.md` is NOT changed — it remains the full tool surface SSOT.

---

## Finding 2 — Cron-Overlap / Concurrent Dev-Team Sessions

### Problem

- Cron schedule: `7 * * * *` (every 60 min). Source: `.claude/commands/crons/cron-dev-team.md`.
- Observed tick durations: 53s (clean idle) to 3h28m (heavy sprint). Majority of non-idle sessions exceed 60 min.
- A new cron fires while the prior tick is still active → two dev-team sessions run concurrently.
- Current mitigation: YIELD/session-gate + per-task `task_claim` mutex in `docs/agents/dev-team/flow/main.md` Step 0b.
- Known failure: orphaned owner-session-scoped locks (2026-06-05 agent-father SKIPPED because it could not release a peer's lock — matches memory `lock_orphaned_by_rebuild`). The task_release tool returns `ok=false` when the lock's `owner_session` does not match the caller — correct behavior, but leaves the second session deadlocked until TTL expiry (up to 3600s).

### Options Evaluated

**Option A — Widen cron to `0 */2 * * *` (every 2h)**

- Pros: trivially prevents overlap for all observed tick durations ≤ 1h39m; 3h28m outlier (single heavy sprint) is exceptional; 99% of ticks clear in < 2h.
- Cons: (a) a genuine 3h28m outlier would still overlap even at 2h cadence; (b) reduces responsiveness — signals that arrive 1min after a tick start wait up to 119min for the next triage; (c) the cron schedule is a CronCreate argument inside `.claude/commands/crons/cron-dev-team.md` — it controls the fire rate but changing it does not prevent future cadence creep if sprint size grows.
- Verdict: **REJECTED**. Does not solve the structural problem, only delays recurrence.

**Option B — Session-level single-flight lock with TTL-only release**

A cron-fire-level lock (not per-task) keyed on the cron session itself. The entering dispatcher claims a fleet-wide singleton "dev-team-session" lock at the top of Step 0-PREFLIGHT, before any work. If the lock is held by a peer cron instance, the incoming cron exits immediately (single-flight SKIP). Release is TTL-only — no owner-session binding — so mcp-server restart (which generates a new session ID) does not strand the lock; TTL expiry cleans it up naturally.

- Pros: (a) structurally prevents overlap regardless of tick duration; (b) TTL-only release survives restarts (resolves the orphaned-lock failure mode exactly); (c) extends the EXISTING mutex-wrap pattern — no new concept introduced; (d) PO triage still runs within the lock (no responsiveness loss — the skipping cron just exits early, next fire in 60min will check again).
- Cons: (a) if a tick stalls (e.g. agent hangs mid-sprint), the lock holds for TTL (3600s max) before next session can enter — acceptable: the per-task heartbeat already detects stall; (b) TTL must be set conservatively (e.g. 90 min = 5400s = 1.5× the observed 99th percentile tick duration of ~69min).
- Verdict: **SELECTED**.

### Design — F2

**New lock key:** `"dev-team-session:" + $(date -u +"%Y%m%dT%H0000Z")` (hourly slot key — not a random UUID, so that a restart within the same cron-hour naturally re-uses the same key and the TTL-countdown continues rather than resetting).

Wait — using an hourly slot key is fragile if clocks drift. Simpler and safer: use a bare singleton key `"dev-team-cron-singleton"` with TTL=5400s (90min). Any cron instance that cannot claim it exits immediately. The TTL itself is the session-window bound.

**Placement:** After `start_epoch` assignment and `send_telegram` cron-START announce, BEFORE the HEAD.lock guard (Step 0-PREFLIGHT, very top). This ensures even the HEAD.lock self-cure path is gated — preventing two concurrent sessions from both attempting HEAD.lock removal.

**Pseudocode to insert at top of Step 0-PREFLIGHT:**

```
# SINGLE-FLIGHT GUARD (SF-1) — session-level cron overlap prevention
sf_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "dev-team-cron-singleton",
  task_kind:   "sprint-task",
  owner_agent: "dev-team",
  ttl_seconds: 5400,          # 90min — 1.5× observed 99th-pct tick duration
  payload:     "{\"site\":\"SF-1\",\"tick\":\"" + ts + "\"}"
})
if not sf_result.claimed:
  log "[dev-team] SF-1 SKIP — session already running (holder: " + sf_result.current_holder.owner_agent + " since " + sf_result.current_holder.claimed_at + ")"
  send_telegram(channel="work", message="[dev-team] cron SKIP — session single-flight held by peer (TTL ~" + sf_result.current_holder.expires_in_s + "s)")
  JUMP TO end   # exit immediately — do NOT run any step
# SF-1 claimed — proceed with full cron tick
```

**Release:** call `task_release(task_id="dev-team-cron-singleton")` in the finally-block at JUMP TO `end` (the session exit point). Since this is TTL-only semantics (no owner-session binding at the DB level with the `sprint-task` kind), a server restart does not create an orphaned lock — the TTL clock continues and expires naturally. The `ok=false` on release is acceptable (TTL already expired after a long tick).

**Heartbeat:** The `sprint-task` kind has a 3600s default TTL; we override to 5400s. The dispatcher already calls `task_heartbeat` for per-task locks. Add heartbeat for the SF-1 lock at the same cadence (every 5 min) during the long pipeline steps (Step 3 execution). This extends the effective window beyond 5400s for legitimately long sessions while still expiring naturally if the session crashes.

**No cron schedule change.** The `7 * * * *` schedule in `.claude/commands/crons/cron-dev-team.md` stays unchanged. The single-flight lock is the gate; the fire rate is intentionally kept at 1h so skipped sessions catch up within 60 min of the prior session completing.

### Files — F2

| File | Action | Owner |
|---|---|---|
| `docs/agents/dev-team/flow/main.md` | EDIT — add SF-1 single-flight guard pseudocode at top of Step 0-PREFLIGHT, after `start_epoch` and cron-START `send_telegram` lines, before HEAD.lock guard; add `task_release("dev-team-cron-singleton")` at JUMP TO `end` exit point; add heartbeat call at Step 3 entry | agent-father |

No cron schedule change. No new tool. No new DB table. SF-1 reuses the existing `task_claim` / `task_release` / `task_heartbeat` tools and the `sprint-task` lock kind already in production.

---

## Sequencing

Both findings are independent and can be implemented in parallel. Neither blocks the other.

| Task | File(s) | Gate |
|---|---|---|
| F1-A: Create `docs/standards/gateway-call-contract.md` | new file | none |
| F1-B: Add GCC-PREFLIGHT directive to `docs/agents/dev-team/flow/main.md` | flow edit | F1-A complete |
| F2-A: Add SF-1 + heartbeat + release to `docs/agents/dev-team/flow/main.md` | flow edit | none |

F1-B and F2-A both edit the same file (`main.md`). Agent-father MUST serialize those two edits (apply F1-B first, then F2-A, or vice versa — no concurrent write to the same file).

---

## Acceptance Criteria

| AC | Verification |
|---|---|
| `docs/standards/gateway-call-contract.md` exists, ≤70L, covers all 5 contract sections | file read |
| `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT contains `GCC-PREFLIGHT` read directive after `start_epoch` | grep GCC-PREFLIGHT |
| `docs/agents/dev-team/flow/main.md` Step 0-PREFLIGHT contains SF-1 task_claim block with key `"dev-team-cron-singleton"` and TTL=5400 | grep dev-team-cron-singleton |
| `docs/agents/dev-team/flow/main.md` exit point (JUMP TO end) contains `task_release("dev-team-cron-singleton")` | grep dev-team-cron-singleton |
| `docs/agents/dev-team/flow/main.md` Step 3 entry contains SF-1 heartbeat call | grep SF-1 |
| gateway-call-contract.md references CLAUDE.md, mcp-tools.md, task-lock-protocol.md, telegram-commands.md by path | file read |
| No duplicate of gateway-call-contract.md content in mcp-tools.md or CLAUDE.md | human review |

---

## Out of Scope

- Worktree stale-base baseRef fix (done 2026-06-07, verified healthy — do not touch)
- Chain order po→ba→architect→pm→dev→qa (verified healthy)
- BGFAN-1 background spawn mandate (verified healthy)
- Router-verify-raw pattern (verified healthy)
- QA gating (verified healthy)
- Any production code changes — this brief is doc/flow only

---

*Authored: 2026-06-14T12:18:16Z | Zone: docs/standards/ + docs/agents/dev-team/flow/*
