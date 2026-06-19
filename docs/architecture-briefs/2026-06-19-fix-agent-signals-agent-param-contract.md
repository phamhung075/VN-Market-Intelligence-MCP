<!-- size-justification: 140L — single contract design brief with brownfield findings, decision rationale, exact schema delta, full caller catalogue, and QA acceptance contract. Not split further — all sections are consumed together by PM + dev-mcp-server. -->

# Architecture Brief — FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT

**Date:** 2026-06-19
**Task:** FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (SPRINT-S, size S, priority high)
**Architect:** architect agent
**Status:** DESIGN DONE — route to dev-mcp-server (single zone, no PM split needed)

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`
  + doc: `docs/agents/tools/list/get_agent_signals.md`
  + callers: see § Caller Catalogue
- **BUILD-STANDARD:** not-applicable (BUG-FIX / schema contract alignment, no new primitives)

### Verified Paths

| File | Lines | Role |
|------|-------|------|
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` | 449–544 | MCP tool registration — Zod schema + handler |
| `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` | 835–935 | `getSignals()` — DB layer called by handler |
| `docs/agents/tools/list/get_agent_signals.md` | — | Public doc — parameter table + usage examples |
| `docs/agents/news-scout/flow/stage-bootstrap.md` | 43–61 | Two call sites (self-history + SIBLING_WINDOW_CACHE) |
| `docs/agents/alert-commander/flow/stage-signals.md` | 31–65 | Two call sites (price_anomaly + chain_catalyst) |
| `docs/agents/market-watcher/flow/main.md` | 53–57 | One call site (SIBLING_RECENT corroboration gate) |
| `docs/agents/tran-ngoc-bau/flow/audit-signals.md` | 6 | One call site (inbox read) |
| `apps/mcp-server/src/__tests__/1968b1-get-agent-signals-hours-back.test.ts` | — | Existing test for hours_back |
| `apps/mcp-server/src/__tests__/1968c-p03-signal-type-filter.test.ts` | — | Existing test for signal_type filter |
| `apps/mcp-server/src/__tests__/DMS-DOUBLEFIRE-SIBLING-DEDUP-CORROBORATION.test.ts` | — | Existing test for from_agent=null path |

---

## Problem Statement

`agent` is registered as `z.string()` (required, no `.optional()`) in the Zod schema at line 461.
The handler has **three distinct execution paths**:

| Path | Condition | `agent` used? |
|------|-----------|---------------|
| **A — all-producers window** | `args.from_agent === null` | NO — returns immediately before line 522 |
| **B — sender-history** | `args.from_agent` is a non-null string | Passed to `getSignals()` BUT immediately overridden at L877: `bindParam = opts.fromAgent` (i.e. `fromAgent`), so `agent` value is never used in the SQL WHERE clause |
| **C — inbox** | `args.from_agent` is undefined | YES — `agent` is used as `bindParam` in `WHERE to_agent = ?` |

**Conclusion:** `agent` is semantically required **only in inbox mode (Path C)**. In sender-history mode (Path B) the `agent` value is silently ignored — the SQL bind parameter is `fromAgent`, not `agent`. In all-producers mode (Path A) `agent` is never touched.

---

## Caller Catalogue

### Callers that PASS `agent`

| Call site | Passes `agent` | Mode | Correct today |
|-----------|---------------|------|---------------|
| `alert-commander/flow/stage-signals.md` L31 | `"alert-commander"` | inbox (price_anomaly filter) | Yes — Path C |
| `alert-commander/flow/stage-signals.md` L60 | `"alert-commander"` | inbox (chain_catalyst filter) | Yes — Path C |
| `tran-ngoc-bau/flow/audit-signals.md` L6 | `"tran-ngoc-bau"` | inbox | Yes — Path C |

### Callers that OMIT `agent` (doc-encouraged, currently BROKEN at Zod boundary)

| Call site | Omits `agent` | Mode | Broken today |
|-----------|--------------|------|--------------|
| `news-scout/flow/stage-bootstrap.md` L43 | omits | sender-history (`from_agent="news-scout"`) | YES — Zod rejects |
| `news-scout/flow/stage-bootstrap.md` L56 | omits | all-producers (`from_agent=null`) | YES — Zod rejects |
| `market-watcher/flow/main.md` L53 | omits | all-producers (`from_agent=null`) | YES — Zod rejects |

### Package docs (require update regardless of direction chosen)

| File | Current text | Fix needed |
|------|-------------|------------|
| `docs/agents/tools/list/get_agent_signals.md` L16 | `agent` Required: Yes | Reconcile to reflect optionality in non-inbox modes |
| `docs/agents/tools/package/news-scout.md` L44 | `agent: string` (req) | Update |
| `docs/agents/tools/package/tran-ngoc-bau.md` L42 | `agent: string` (req) | Update |
| `docs/agents/tools/package/alert-commander.md` L33 | `agent: string` (REQUIRED) | Update |

---

## Decision — Direction A

**Chosen: Direction A — make `agent` optional-when-not-inbox-mode.**

Rationale:

1. **Caller intent is sender-history / all-producers** — three live flow call sites (news-scout ×2, market-watcher ×1) legitimately omit `agent` because they have no "receiving agent" concept in those modes. Forcing them to pass a dummy value (`agent="news-scout"` for a from_agent query) is semantic noise that misleads future readers.

2. **`agent` is already dead in Path B** — `getSignals()` at L877 replaces `agent` with `fromAgent` as the SQL bind parameter when `fromAgent` is set. Making `agent` required for Path B is a schema lie: the tool accepts it, logs no error, and ignores it.

3. **Path A (from_agent=null) never touches `agent` at all** — requiring it is pure overhead with zero benefit.

4. **Breaking impact of Direction B is worse** — Direction B would require adding `agent` to 3 flow call sites and re-testing them. Those flow docs are executed by live cowork agents; an incorrect add breaks the sender-history dedup and corroboration gate patterns. Direction A touches only the schema (one `.optional()` change + `agent ?? ""` guard in Path C) and aligns doc with reality.

5. **No callers are harmed** — the three callers that already pass `agent` in inbox mode continue to work identically. The change is additive.

---

## Exact Schema Change

### File: `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts`

**Schema delta (lines 461–463):**

```typescript
// BEFORE
agent: z
  .string()
  .describe("Agent name to fetch signals for (e.g. 'alert_commander')"),

// AFTER
agent: z
  .string()
  .optional()
  .describe(
    "Agent name to fetch signals for (e.g. 'alert_commander'). " +
    "Required in inbox mode (from_agent omitted). " +
    "Omittable in sender-history mode (from_agent=string) and all-producers mode (from_agent=null).",
  ),
```

**Handler guard (line 522 — Path C only):**

The handler must guard the `getSignals()` call on Path C (inbox, `from_agent` is undefined):

```typescript
// BEFORE (line 522)
const signals = getSignals(db, args.agent, {

// AFTER
if (args.from_agent === undefined && !args.agent) {
  return {
    content: [{
      type: "text" as const,
      text: "Error: `agent` is required when using inbox mode (from_agent not provided).",
    }],
  };
}
const signals = getSignals(db, args.agent ?? "", {
```

The early-return guard produces a user-readable error for the one case where `agent` truly is mandatory (inbox mode). The `?? ""` fallback on `getSignals` call is unreachable after the guard but satisfies TypeScript's type narrowing.

---

## Doc Reconciliation

### `docs/agents/tools/list/get_agent_signals.md`

Update the parameter table row for `agent`:

```
| `agent` | string | **Conditional** | — | Receiving agent name. Required in inbox mode (from_agent omitted). Omittable in sender-history mode (from_agent=string) or all-producers mode (from_agent=null). |
```

Replace the plain example in § Use Cases (News Scout L-4 pattern) to show omitted `agent`:

```
SELF_SIGNALS_CACHE = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "from_agent": "news-scout",
  "status": "all",
  "hours_back": 6
})
```

(This matches stage-bootstrap.md which is already correct — doc was the laggard.)

### Package docs

`docs/agents/tools/package/news-scout.md` L44:
```
| `get_agent_signals` | Recent inter-agent signals (last 24h) | `from_agent: string` (req in sender-history mode); `agent: string` (req in inbox mode) |
```

`docs/agents/tools/package/alert-commander.md` L33 and `docs/agents/tools/package/tran-ngoc-bau.md` L42:
```
| `get_agent_signals` | ... | `agent: string` (req in inbox mode), `signal_type?: string` |
```

---

## Files to Touch

| File | Change type |
|------|-------------|
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` | Schema: `.optional()` on `agent`; handler: guard + `?? ""` |
| `docs/agents/tools/list/get_agent_signals.md` | Parameter table: Required → Conditional; add mode notes |
| `docs/agents/tools/package/news-scout.md` | Param caption update |
| `docs/agents/tools/package/alert-commander.md` | Param caption update |
| `docs/agents/tools/package/tran-ngoc-bau.md` | Param caption update |

**NOT touched** (already correct):
- `docs/agents/news-scout/flow/stage-bootstrap.md` — callers are already correct (omit `agent`)
- `docs/agents/market-watcher/flow/main.md` — caller already correct (omits `agent`)
- `docs/agents/alert-commander/flow/stage-signals.md` — callers already correct (pass `agent`)
- `docs/agents/tran-ngoc-bau/flow/audit-signals.md` — already correct (passes `agent`)
- `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — no change (DB layer is already correct; it never reads `agent` when `fromAgent` is set)

---

## Risk Flags

- **Low risk** — `agent` changing from required to optional is a Zod-level relaxation. No existing caller that passes `agent` will break.
- **TypeScript narrowing** — dev must use `args.agent ?? ""` or a proper type guard at line 522 to satisfy TS strict mode; do not use `args.agent!` (non-null assertion would defeat the guard).
- **Scan clean:** true — no DDD violation, no security surface, no memory or performance concern.

---

## Next Stage

**Direct dispatch to dev-mcp-server.** No PM split needed — all changes are in a single zone (`apps/mcp-server/src/interface/mcp/tools/news-analysis/`) plus doc-only files. Task is atomic; no subtask decomposition required.

---

## QA Acceptance Test Contract

QA gates on a new test file: `apps/mcp-server/src/__tests__/FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts`

### AC-1: inbox mode requires `agent`

```
GIVEN from_agent is undefined
AND agent is undefined (or empty string)
WHEN get_agent_signals is called
THEN response.content[0].text contains "Error:" and mentions "`agent` is required"
AND no DB query is executed
```

### AC-2: sender-history mode works without `agent`

```
GIVEN from_agent = "news-scout" (non-null string)
AND agent is NOT provided
AND signals exist from news-scout
WHEN get_agent_signals is called
THEN signals from news-scout are returned correctly
AND no error is thrown
AND Zod does not reject the call (safeParse passes)
```

### AC-3: all-producers mode works without `agent`

```
GIVEN from_agent = null
AND agent is NOT provided
AND hours_back = 0.25
WHEN get_agent_signals is called
THEN signals from all producers in the 15-min window are returned
AND no error is thrown
```

### AC-4: existing inbox callers pass `agent` — no regression

```
GIVEN from_agent is undefined
AND agent = "alert-commander"
AND signals exist addressed to "alert-commander"
WHEN get_agent_signals is called
THEN signals addressed to alert-commander are returned
AND Zod schema accepts the call (backward-compat)
```

### AC-5: Zod schema — agent is optional

```
GIVEN the Zod schema for get_agent_signals
THEN schema.safeParse({ status: "all", from_agent: "news-scout", hours_back: 6 }).success === true
AND schema.safeParse({ agent: "alert-commander", status: "unread" }).success === true
```

---

## RETURN

```
DONE: Technical design complete
ZONE: apps/mcp-server/src/interface/mcp/tools/news-analysis/ + docs/agents/tools/
NEXT: dev-mcp-server | schema + guard change + doc reconciliation (5 files, no DB migration)
HANDOFF: docs/architecture-briefs/2026-06-19-fix-agent-signals-agent-param-contract.md
PIPELINE: continue
```
