# Task Report: TSU-DEV-U3 — 12 Weak-Claim Tools: Deregister 5, Integrate 7
date: 2026-06-07
outcome: APPROVED (code-approved, live-verify pending sprint-final rebuild)

## Test Results
- Unit tests (TSU-DEV-U3-weak-claim-tools.test.ts): 12 pass / 0 fail (QA-reproduced)
- Tool-registry-parity (tool-registry-parity.test.ts): 8 pass / 0 fail (QA-reproduced)
- TypeScript: exit 0 (bun tsc --noEmit, QA-reproduced)

## DDD Compliance: PASS
Interface→infrastructure imports are permitted per DDD rules. No domain→infra violations in any of 12 modified files.

## Security: PASS
No process.env, no secrets, no hardcoded credentials in any modified production file. mock-guard exit 0.

## Registry Diff Verification: PASS
- tool-registry.json totalCount: 157 (was 162 — exactly 5 removals)
- Computed sum of group counts: 157 (consistent)
- Actual distinct tools in registry: 157 (consistent)
- All 5 deregistered tools ABSENT: read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day
- All 7 integrated tools PRESENT: mark_alert_outcome, get_market_foreign_flow, diagnose_foreign_flow_circuit_breaker, reset_foreign_flow_circuit_breaker, get_label_accuracy_report, list_flagged_bctc_cells, submit_bctc_correction

## Deregister Pattern Verification: PASS
- No server.tool("read_bctc_pdf"|"backfill_bctc_scalars"|"compute_accruals"|"get_accuracy_context"|"is_trading_day") anywhere in src/
- No-op register* stubs remain in registry.ts toolRegistry array (harmless — they call `void _server` only)
- readFileSync correctly removed from reports.ts imports (only orphaned import from read_bctc_pdf removal; readdirSync+statSync retained for list_stored_pdfs)
- Handler domain functions retained in all 4 files per architect retain-handler decision

## Signal Row AC-U3-13: PASS
id: tsu-u3-tool-deregister-signal-20260607, status: NEW, to: cowork-refactory-expert

## Live-Verify Deferral
gateway list_server_tools shows old surface until mcp-server rebuild — deferred to sprint-final rebuild per handoff policy. Mark: code-approved, live-verify pending.

## Merge Status
Branch task/TSU-U3-weak-claim-tools merged to main (commits 50772c2a + 57774c6b already on main per handoff). orch-state TSU-DEV-U3 REVIEW→DONE.
