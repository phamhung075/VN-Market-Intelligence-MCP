# Decision Journal — FIX-AGENTSIGNALS-FROMAGENT-SCHEMA

**task-id:** FIX-AGENTSIGNALS-FROMAGENT-SCHEMA
**agent:** dev-mcp-server (impl) · dev-team (BGFAN-1 closeout)
**date:** 2026-07-24T22:23Z
**zone:** apps/mcp-server/

## Context
Backlog row (po-s94, minted 2026-06-17T01:34Z) targeting `get_agent_signals({from_agent})`
returning MCP `-32602 invalid_type: agent Required` → news-scout SELF_SIGNALS_CACHE
sender-history warm-up emptied every cycle.

## Finding (verify-live premise reconciliation)
The effective fix **already landed** under a differently-named task —
commit `8a6b798ce` (FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT, 2026-06-19), two days
after this row was filed, before the backlog row was reconciled. `agent` is already
`.optional()` in HEAD (confirmed at source: `git diff` removed-side already carries
`.optional()`; `8a6b798ce` is an ancestor of origin/main → the running image has it).
This row was a **stale duplicate**.

## Change (test-hardening only — zero runtime-behavior delta)
1. Extracted the inline `get_agent_signals` zod shape → exported const
   `GetAgentSignalsShape` (byte-identical shape + `as const`) so tests assert against
   the REAL runtime contract instead of a hand-mirrored copy that can drift.
2. Added `src/__tests__/FIX-AGENTSIGNALS-FROMAGENT-SCHEMA.test.ts` (8 tests, 17 asserts):
   schema-layer (`{from_agent}` alone, GENERIC non-allowlist, inbox `{agent}` alone,
   `{}` not hard-rejected at zod) + end-to-end (real McpServer + registerAgentSignalTools
   + in-memory DB): AC-1 returns own rows, AC-2 empty-cache returns empty (never -32602),
   AC-3 inbox no-regression, AC-4 neither-present = controlled readable handler error
   (`Error: \`agent\` is required`), NOT a protocol -32602.

Design note: the fix_spec's `zod .refine/.or` suggestion was deliberately NOT used —
a `.refine` failure surfaces as the same hard `-32602` class the ticket exists to
eliminate. The landed direction (schema-optional + runtime handler guard returning a
readable tool-response error) is correct and is what AC-4 locks in.

## Fence (dispatcher-verified at source, not self-report)
- `bun test src/__tests__/FIX-AGENTSIGNALS-FROMAGENT-SCHEMA.test.ts` → **8 pass / 0 fail**.
- `bunx tsc --noEmit` (apps/mcp-server) → **exit 0**.
- `8a6b798ce` ancestor of origin/main → **no rebuild required** (running image already fixed).

## Closeout
dev-mcp-server worker (agent a3769b0614590e95c) implemented the edit + test but abandoned
closeout (stopped mid-commit with a confused "wait for background notification" message —
head left in_progress, no commit/flip). dev-team dispatcher completed the BGFAN-1 closeout:
committed code+test+journal, flipped in_progress→review (next=qa), reset head idle, pushed,
released `task:FIX-AGENTSIGNALS-FROMAGENT-SCHEMA`. QA verifies test-green + (optional) live
gateway RAW `get_agent_signals({from_agent})` non-`-32602`; no rebuild step needed.
