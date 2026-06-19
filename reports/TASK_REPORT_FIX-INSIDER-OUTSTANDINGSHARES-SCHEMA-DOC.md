## Task Report FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC
date: 2026-06-19
outcome: APPROVED

changed:
- apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts (outstandingShares optional + handler ?? 0 + description)
- apps/mcp-server/src/__tests__/251-mcp-tools.test.ts (+3 tests)
- docs/agents/tools/list/get_insider_signals.md (Required→No, Default=0, no auto-fetch claim)

tests: 16 pass / 0 fail | tsc: 0 errors | ddd: PASS | security: PASS

### RAW-Verify
- schema: `outstandingShares?: number | undefined` at interface L35 — CONFIRMED
- Zod: `z.number().optional()` at L120-122 — CONFIRMED
- handler: `const outstandingShares = input.outstandingShares ?? 0` at L53 — CONFIRMED
- description: "defaults to 0 — signals requiring % outstanding are suppressed when absent" at L114 — CONFIRMED
- doc: Required=No, Default=0, no auto-fetch claim — CONFIRMED

### New Tests (3)
- FIX-INSIDER-OUTSTANDINGSHARES: accepts call with code only (outstandingShares omitted) — PASS
- FIX-INSIDER-OUTSTANDINGSHARES: code-only call returns no-signal message (honest skip) — PASS
- FIX-INSIDER-OUTSTANDINGSHARES: code-only call with 3 distinct buyers → MASS_INSIDER_BUY — PASS

verdict: APPROVED
