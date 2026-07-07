---
name: cycle-bootstrap
description: >
  Step 0 for all cowork cycle agents. Calls get_cycle_bootstrap then handles
  errors with fail-loud protocol. Used in alert-commander, financial-analyst,
  unified-agent, report-analyzer, news-scout, market-watcher, digest-predict,
  bctc-analyst. NOT for fb-market-poster (downstream consumer — not a valid
  get_cycle_bootstrap enum value; use get_market_snapshot + get_market_context
  instead).
---

## Anti-Hallucination — MANDATORY before Step 0

**You have MCP gateway access (search your tools for `call_tool`). DO NOT claim it is unavailable. CALL IT.**

```
RULE: ALWAYS attempt the actual call. Never skip based on session log, memory, or prior cycle state.
Session logs record PAST state. They do NOT predict current state.
"MCP was down at 14:38" does NOT mean it is down now.
```

Violation = phantom incident: fake blocker reports, cascading false failures, corrupted pipeline state.

**NEVER invent tool names.** Only call tools listed in `docs/agents/tools/package/<your-agent-id>.md` or your flow docs. If unsure → Read your package file first. If tool not there → SKIP the step, log `[SKIP] No tool: <name>`.

**FORBIDDEN outputs when blocked:**
- Standalone blocker/incident/recovery files (`*-BLOCKED.md`, `*-eod-blocker-report.md`, `*-cycle-error.md`)
- Docker-compose commands, curl commands, or infrastructure recovery steps written anywhere
- "Next Steps for Dev Team" / "Resolution Required" / "Recommended Action" sections
- Files outside your allowed outputs: session log, notebook, channel messages

Blocked = one-line `send_telegram(channel="bug")` + drop signal `docs/signals/{agent-id}-{ISO}.json` (type: bug-escalation) + EXIT. Nothing else.

## Telegram Channel Routing — MANDATORY

Read `.claude/skills/telegram-channel-routing/SKILL.md` before any `send_telegram` call.
Every call MUST include `channel=` explicitly: `"market"` | `"work"` | `"bug"`.

## Step -0 — Unconditional Cycle Anchor Capture

Before any branch (tick-snapshot hit OR direct MCP call), capture the cycle start anchor:

```
CYCLE_START_UTC = date -u +"%Y-%m-%dT%H:%M:%SZ"
```

This value is set ONCE here and is never overwritten by later steps. It is path-independent:
it is set regardless of whether Step -1 hits a snapshot or falls through to Step 0.
The exec-proof gate (`exec-proof-gate/SKILL.md` EP-0) requires this value to be non-null.

---

## Step -1 — Tick Snapshot Check (L-6, 1968b2)

Before calling `get_cycle_bootstrap`, check for a shared tick snapshot file:

```
TICK = current UTC time formatted as HH:MM (round to nearest 5-min slot, e.g. 02:05 → "02:05")
SNAPSHOT_PATH = docs/data/cycle-snapshot-<HH:MM>.json
```

1. Does `SNAPSHOT_PATH` exist?
   - NO → fall through to Step 0 (direct MCP call — canonical path).
2. Is the file timestamp within the last 7 minutes of current UTC?
   - NO (stale, >7min old) → treat as absent → fall through to Step 0.
3. YES (file exists AND fresh) → READ the snapshot. Extract `market_context` and `macro_snapshot` fields. Skip `get_cycle_bootstrap` in Step 0 and skip `get_macro_snapshot` if your flow calls it in Step 0b.
   - Log: `[BOOTSTRAP] tick-snapshot hit: <TICK> — skipping get_cycle_bootstrap`.
   - Proceed directly to Step 0b (Regime Extraction).

**Fallback is the canonical path.** If the snapshot file is absent, stale, malformed, or unreadable → fall through to Step 0. Never block on a missing snapshot.

**Note:** The snapshot writer (cowork-team dispatcher) is a future task. Until it lands, Step -1 will always miss and fall through to Step 0 — zero behavior regression.

## Step 0 — Bootstrap

```
get_cycle_bootstrap(agent_name="<agent-id>")
```

### Execution Proof Bootstrap

`CYCLE_START_UTC` was already captured unconditionally in Step -0. No capture needed here.

Optionally, if the bootstrap response contains a `.timestamp` field that is more precise,
you MAY refine: `CYCLE_START_UTC = response.timestamp` — but only if the field is non-null.
Never overwrite with null.

Every flow using this skill MUST:
1. Treat `CYCLE_START_UTC` (set in Step -0) as the cycle anchor — it is available on ALL paths.
2. At completion, check the EXEC-PROOF invariant before calling `log_agent_work(completed)`.
   See → skill: `.claude/skills/exec-proof-gate/SKILL.md`

### Error handling (fail-loud)

<!-- SSE-handshake race: fresh cron sessions may not complete MCP gateway registration before Step 0 executes; 1 retry + 5s gap converts the race into a tolerable startup delay. -->

**GATEWAY-BLIND guard (FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP, 2026-07-07) — check FIRST, before the retry table:**
A locally Agent-spawned cowork subagent can land with `mcp__gateway__call_tool` categorically
absent from its own tool binding even though `.claude/agents/<agent-id>.md` correctly grants it and
`.mcp.json` correctly registers the `gateway` server — a **session-level MCP transport gap, not a
config defect** (config layer root-caused + fixed 2026-06-23 commit b3612720; verified still correct
fleet-wide 2026-07-07 — every cowork agent's frontmatter already carries the grant). Recurs after
host/Docker outages or long-lived sessions until the user runs `/mcp` reconnect or restarts CLI —
see `feedback_local_cowork_subagents_gateway_blind.md`. **Not fixable from inside the flow** — the
guard's job is to fail loud safely without wasting a turn on a call that cannot succeed, not to
reconnect anything.

Classify the Step 0 error:
- **CONFIRMED-BLIND** — error text contains "no such tool" / "tool not found" / "unknown tool" (the
  tool is categorically absent from this subagent's binding, not merely erroring) → skip the 5s
  wait/retry entirely (a categorically-absent tool never reconnects mid-turn) → go straight to
  **GATEWAY-BLIND fallback** below.
- **TRANSIENT** — any other error/timeout (SSE-handshake race, 5xx, malformed response) → use the
  retry table below; if the retry ALSO fails → **GATEWAY-BLIND fallback** below (never loop a 3rd time).

| Error | First occurrence | Second occurrence (after 5s wait) |
|---|---|---|
| tool-not-found / MCP unavailable (TRANSIENT class) | Wait 5s → retry `get_cycle_bootstrap` once | GATEWAY-BLIND fallback below — NOT `send_telegram` (see why) |
| `market_context` error | `send_telegram(channel="bug")` + drop signal → STOP immediately | — |
| Any other error | `send_telegram(channel="bug")` + drop signal → STOP | — |

**GATEWAY-BLIND fallback (Write-fallback signal + graceful DEFER — mirrors the already-DONE
FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH pattern of file-based signals over a Bash-dependent
path). Do NOT call `send_telegram` here:** `send_telegram` is itself an `mcp__gateway__call_tool`
call and fails identically when the gateway is blind — attempting it wastes a turn and is exactly
what forced prior cycles into ad-hoc raw-Write escalations (bctc-analyst-slot-2 ×3, unified-agent
chef-evening ×1, all 2026-07-07).

1. `Write` a bug-escalation signal directly — canonical schema (matches `fail-loud-protocol.md` §
   Output Boundary item 5; routes through `drain-signals.js` unchanged. Do NOT invent a bespoke
   schema — a prior ad-hoc signal missing `from`/`to`/`type`/`payload` silently broke the drain
   router's `{from} → {to}` routing log line):
   ```
   Write(docs/signals/<agent-id>-<ISO-timestamp>-gateway-blind.json, {
     "from": "<agent-id>", "to": "po", "type": "bug-escalation",
     "payload": "[<agent-id>] Step 0 bootstrap failed: gateway-blind — get_cycle_bootstrap unavailable (mcp__gateway__call_tool absent from this subagent's binding; session-transport gap, not config — see feedback_local_cowork_subagents_gateway_blind.md). No data fetched, no signals emitted, no fabrication this cycle. slot=<slot_id> tick=<TICK>.",
     "priority": "high", "createdAt": "<ISO timestamp>"
   })
   ```
2. Append to your own notebook (direct `Write`/`Edit` — no MCP needed):
   `"Cycle <TICK> — DEFERRED at Step 0: gateway-blind (no MCP tool access this session)."`
3. **EXIT cleanly this cycle — a graceful DEFER, not a crash.** No lock was held (blocked before any
   `task_claim`), so no STOP-RELEASE/orphan-lock risk. The next scheduled fire spawns a fresh
   subagent that may land sighted (transport reconnect is independent of this flow's state) — do
   not retry further within this cycle beyond the single TRANSIENT retry above.

Never proceed with a degraded bootstrap — stale context produces worse signals than silence.

## Step 0b — Regime Extraction

→ skill: `.claude/skills/regime-extraction/SKILL.md`

Each flow declares which variables it needs (e.g. `Variables: REGIME, CARRY_REGIME`).

## Error Boundary — MANDATORY

→ skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Covers tool failure handling, signal drop, forbidden outputs, BUG telegram dedup.

## End of Cycle

→ skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Session log + notebook write + doc self-heal.
