# Architecture Brief — 1890a FA Tool-Package +5 Tools

**Date:** 2026-05-14
**Task:** 1890a-spec-expanded
**Zone:** `apps/mcp-server/`
**Status:** DESIGN COMPLETE — ready for PM task split

---

## Routing Summary

5 tools audited. 4 unique actions required:

| Tool | Exists | Action | Subtask |
|------|--------|--------|---------|
| `get_macro_snapshot` | YES | Manifest + doc add | B |
| `get_insider_signals` | YES | Doc verify only | B |
| `get_bond_maturity_calendar` | YES | Manifest + doc add | B |
| `get_cash_flow` | NO | BUILD + register + manifest + doc | A |
| `get_investment_clock_phase` | YES | Manifest + doc add | B |

**Key finding:** `get_insider_signals` is already in `SKILL_MANIFEST` (`agentBootstrap.ts:64`). TNB audit tracked this as a gap because the package doc was incomplete, not the manifest. No manifest change needed — doc-verify only.

---

## DDD Layer Assignment

### Subtask A — `get_cash_flow` (build)

```
Interface:    apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts
              (new file — MCP handler + registration fn)
Registry:     apps/mcp-server/src/interface/mcp/tools/registry.ts
              (1 import + 1 array entry)
Manifest:     apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts
              (1 string in financial_analyst array)
Domain:       NONE — data fully pre-computed by fetchParseAndStoreBctc.ts;
              direct DB read is correct (no new domain service, no new port)
Infra:        NONE — uses existing getDb() + financial_reports table
```

No new domain service, no new repository interface, no new DB migration.
The `financial_reports` table already stores all required columns (`operating_cf`,
`investing_cf`, `financing_cf`, `capex`, `free_cash_flow`). The OCF/NI ratio is a
trivial arithmetic derived at read time inside the handler.

Pattern reference: `computeAccrualsTool.ts` — same module, same pattern:
direct DB read, injectable `_testDb`, no domain import.

### Subtask B — manifest + doc edits (no code build)

```
Manifest:     apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts
              (3 string additions to financial_analyst array: T1, T3, T5)
SSOT mirror:  docs/SKILL_MANIFEST.md (same 3 additions — required by comment at line 27)
Package doc:  .claude/tools/package/financial-analyst.md
              (new "Macro Intelligence" section for T1/T5, add T3 to existing or new section,
               update T2 params)
```

---

## Risk Flags

**R1 — CRITICAL — BCTC banking window open today**
ACB/BID/CTG/EIB/MBB/VCB/VPB Q1/2026 filings due 2026-05-15. FA Layer 7 G-step (OCF/NI)
skipped 5 consecutive cycles. Subtask A must ship before the 03:30 UTC FA cycle tomorrow.
Deploy order: Subtask A first, Subtask B can follow concurrently.

**R2 — `get_insider_signals` caller contract**
Handler requires `outstandingShares` (mandatory number). Prior package doc listed `—` for params.
Any FA cycle calling without this param receives empty signal list (silent degradation, no error).
Subtask B doc update MUST include `code`, `outstandingShares`, `windowDays?` params.

**R3 — `get_bctc_full` overlap**
`get_bctc_full` already returns `operatingCF` and `freeCashFlow`. `get_cash_flow` is NOT a
replacement — it is a focused forensic tool exposing the full 4-line CF statement plus the
OCF/NI forensic ratio. Package doc note required: call `get_cash_flow` after `get_bctc_full`
in the G-step, not instead of it.

**R4 — SKILL_MANIFEST SSOT dual-update**
`agentBootstrap.ts` comment at line 27 explicitly requires `docs/SKILL_MANIFEST.md` updated in
the same commit. Subtask B must update both or tests will flag SSOT drift.

**R5 — tool count comment in registry.ts**
`registry.ts` inline comments track running tool count (#127, #128, #129, #130...).
New `get_cash_flow` = tool #131. Subtask A must update the comment.

---

## Test Strategy

**Subtask A — get_cash_flow:**
- Unit test file: `apps/mcp-server/src/__tests__/1890a-get-cash-flow.test.ts`
- 3 cases minimum: (1) happy path with real fixture row, (2) no-row-found returns `found: false`,
  (3) `net_profit = 0` → `ocf_ni_ratio = null` (division guard)
- Inject `_testDb` (Bun in-memory SQLite) — no live DB in tests
- No new integration test needed (DB schema untouched)

**Subtask B — manifest edits:**
- Existing bootstrap test (if present) may need string array update
- No new test required — manifest is data, not logic

---

## Parallelization

Subtask A and B have zero code dependency. Both can be dispatched simultaneously.
Subtask A delivery is the critical path for BCTC banking deadline.

---

## Handoff to PM

**Subtask A:** agent=dev-mcp-server, zone=apps/mcp-server/, size=SPRINT-S, priority=CRITICAL
**Subtask B:** agent=agent-md-editor (or dev-mcp-server), zone=apps/mcp-server/ + docs/, size=SPRINT-S, priority=HIGH

Both subtasks block FA methodology score improvement from NEEDS_ATTENTION → GOOD.
