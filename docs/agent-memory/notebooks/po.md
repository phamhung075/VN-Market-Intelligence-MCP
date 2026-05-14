# PO Notebook

## Last updated: 2026-05-14T10:57:26Z (c98 triage — 1912 PO decisions + FA gateway escalation)

---

## Cycle 98 triage — dev-team Step 1 PO triage

**Input:** 2 pendingSignals[] (1912 architect brief + tnb c51), WIP=0/2 free, 1910a USER-STOPPED Todo, 1909c HOLD.

### Decisions

1. **1912 program — 3 architect open questions ALL CONFIRMED** (architect-recommended defaults adopted):
   - **Q1 Go 1.22** — monorepo base image consistency, stdlib `slices`, `net/http` improvements.
   - **Q2 `mattn/go-sqlite3` (CGO)** — alert-engine q30s + stock-price tier-3 cache cannot eat ~2x pure-Go penalty. Standard `golang:1.22-alpine + apk add gcc musl-dev` per brief R1.
   - **Q3 `log/slog` JSON** — aligns with ops observability roadmap, TNB layers + cowork-side parsers.
   - Program moved Backlog with decisions baked in; sub-task **1912a-gateway-spec (SPRINT-M, BA owner)** added to Todo for Phase 1 dispatch.

2. **FA runtime gap — NOT a server-side bug.** Verified `get_cash_flow` / `get_macro_snapshot` / `get_investment_clock_phase` registered both in `agentBootstrap.ts` financial_analyst[] (L72-75) and `tools/registry.ts` (L99/L197/L201). Per tnb `mcp_gateway.blocker_type=user_action_desktop_config` + SPIKE_C86_MCP_REG, blocker is Claude Desktop / cowork gateway config. **Spawned 1913-fa-mcp-gateway-config-user-action (CRITICAL, F1 USER, BCTC deadline 2026-05-15).** Did NOT spawn a dev FIX — would be misrouted.

3. **1907a digest-predict 5d silence — ESCALATED HIGH → CRITICAL** per tnb c51 recommendation. Same gateway/desktop substrate as 1913; linked.

4. **Alert precision scoring (bug 2874) — DEFERRED.** MEDIUM, no urgency tag, queue WIP discipline + BCTC tomorrow + 1912 launch take priority. Tracked, not actioned.

### WIP plan
- BATCH(2) returned: **1912a-gateway-spec (SPRINT-M, ba zone:apps/api-gateway/)** + **FIX-1913-fa-gateway-config-USER (UNBLOCK, owner=user)**.
- 1910a stays Todo USER-STOPPED until user signal — do NOT redispatch.

### Channel audit
- Skipped MARKET/WORK/BUG read (gateway offline for cowork c46-c51 per tnb). Substrate already in 2 signals processed.

### Recurring-bug compliance
- 1912a-gateway-spec: BA work, no prior FIX on `apps/api-gateway/` Go rewrite. Architect brief is the unblocker.
- 1913: USER action, no code path.

### Carry-forward to c99+
- 1912a spec → architect review → PM sprintify → dev-* (still TBD per zone — Go rewrite needs a new dev role assignment, BA spec must flag this).
- 1912b alert-engine spec (Phase 2) blocked until 1912a P1 ships + 24h smoke window.
- 1912c stock-price spec (Phase 3) blocked until 1912b stable.
- 1913 user-action F1 — user refresh Claude Desktop / cowork MCP config; observe FA next cycle.
- 1907a CRITICAL — observe next 3 cycles for digest-predict signal; if silent again → architect rethink (cowork heartbeat reliability).

### Sign-off
c98 BATCH(2): 1912a-gateway-spec (SPRINT-M, ba) + 1913-fa-gateway-config (UNBLOCK, user). 1907a escalated CRITICAL in place. PO sub-flow EXIT.

---

## Cycle 97 triage — ARCHIVED (1910a dispatched then USER-STOPPED, 1911a probe shipped)

Carry: 1910a stays Todo pending user signal; 1909c HOLD until 2026-05-16.
