# PO Notebook

## Cycle 2026-05-31 — DWF-EXIT: DYN-WF-FOUNDATION SIGNED OFF (Phase 0 + Phase 2, live-verified)

QA `reports/TASK_REPORT_DWF-QA.md` APPROVED all FR-P0-1..4 + FR-P2-5/6/7; both BLOCKING re-proven (R3 suffix-free key, R1 explicit ttl=180); all DV suites RED→GREEN; mcp-server force-recreated. **Did NOT trust the ledger — spot-checked LIVE via gateway in-container:**
- `is_trading_day(2025-01-27)` → `{is_trading_day:false, session_status:"holiday"}` (Tết); `(2025-01-06)` → `open`. Tool #147 live.
- TTL-cap fix LIVE: `task_claim(ttl_seconds=691200)` → `claimed:true`. The ops-found silent Zod 86400 cap in `coordinationTools.ts` is gone in-container (released after).
- `routing-policy.json` → `.routing_policy` = 8 rules + catch-all `*/*/*/*`→po (key is `.routing_policy`, NOT `.rules`).
- cowork-schedule enabled slots = 14; `pressure-state.json` = 9 schema fields present.

**Verdict: APPROVE — sprint CLOSED.** Phase 2 cutover stable (leader lock + per-work-item idempotent token + published-marker belt). Released umbrella lock `task:DYN-WF-FOUNDATION` (ok:false = TTL already expired across long sprint, acceptable per signoff flow).

**Two NON-BLOCKING findings disposed:**
1. 19 TS18048 test-only errors in `DWF-routing-policy-fence.test.ts` (commit 8105f8fd, `lastRule` undefined) → **DWF-TSC-DEBT PROMOTED to active FIX NOW** (not deferred). Test-only, suite GREEN via bun — did not block. Zone `apps/mcp-server/`. DV: tsc-clean on file + suite stays 7/0.
2. `pressure-state.json` seed `calendar_status:"unknown"` → **ACCEPTED, no task** — initial-state-only, populates next live tick via Step 4.8.

**DWF-PHASE1 GREENLIT as next sprint** — Phase 2 leader lock live + QA-stable ⇒ 0→2→1 ordering satisfied; the "Phase 1 worse than today" hazard is now closed by the live lock. P1-BA NEXT. Brief § Phase 1.

## Carry-over
- DWF-EXIT done. Next: dispatch P1-BA (DWF-PHASE1 spec) + DWF-TSC-DEBT fixer. Phases 3/4/5 STILL DEFERRED — do NOT relitigate.
- DYN-WF settled invariants (never relitigate): deterministic-router only (OQ-6, no LLM), single-JSON pressure-state, opportunistic leader (bounded dark window), no new task_claim kind (cowork-slot), R1 explicit-TTL + R3 suffix-free key.
- KNOWN-OPEN (other sprints): FF-DEAD (foreign-flow dead fleet-wide, HIGH, VPS zone) · FU-TRUST-REFRESH (FPT+ACB PENDING/empty) · BCTC-LAYOUT-FIRST Phase 0 READY · SIG-FOLLOWUP-DRYRUN (X-1).
- TASKS.md scoped `git add <file>` ONLY — tree has MANY unrelated files (DWF/HCM/BTB); NEVER `-A`. main only, no branches.
- task_claim schema = `task_id`/`task_kind`/`owner_agent`/`ttl_seconds` (NOT `kind`/no-owner). Gateway wrapper, bare tool names.
