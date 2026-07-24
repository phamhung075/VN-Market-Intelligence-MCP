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

## Closeout (CORRECTED — double-closeout race)
The dev-mcp-server worker (agent a3769b0614590e95c) completed the FULL closeout ITSELF:
`440e924f7` (code+test) → `0e354e21c` (notebook/WORK.md/journal) → `b80230d90` (orch-state
status-flip: in_progress→review next=qa, head→idle in one orch-apply write). It was NOT
abandoned — its transcript-final "I'll stop and wait for the background notification" was a
legitimate no-sleep-poll pause waiting on its own full-suite `bun test` (14771/14772 pass;
49-50 fails are the documented pre-existing flaky/resource-contention class, zero touching
agentSignalTools/get_agent_signals — grep-confirmed). Ref `feedback_background_subagent_transcript_silence_is_not_death`.

dev-team dispatcher (git author report-analyzer) RACED the worker's own closeout off a STALE
snapshot (read head=in_progress + uncommitted file, then acted as if abandoned): wrote this
journal (`ea5f0b4f3`, kept — the only FIX-AGENTSIGNALS-specific decision entry) and issued a
code+test commit that was a harmless NO-OP (worker had already committed identical content;
diff vs 440e924f7 empty). No duplicate flip/push occurred — explicit-pathspec commits swept
zero peer files; the dispatcher's only durable acts were this journal + releasing the outer
`task:FIX-AGENTSIGNALS-FROMAGENT-SCHEMA` dispatcher lock (released:1). Lesson captured in
memory `feedback_bgfan_double_closeout_race_stale_snapshot`.

## Remaining (ops/QA — NOT a new rebuild gate)
Rebuild + LIVE gateway RAW-verify of `get_agent_signals({from_agent:'news-scout'})` on the
running container is still outstanding: the fix has been live-shipped code since `8a6b798ce`
(2026-06-19) but was never RAW-verified against a rebuilt container per the original
verification_gate. QA routes this onto the EXISTING rebuild queue — do NOT treat this commit
as opening a new `rebuild_required` gate.
