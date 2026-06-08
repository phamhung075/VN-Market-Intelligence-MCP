# Decision Journal — Board Housekeeping 2026-06-08

**Session:** PM housekeeping; Router pre-verified code, task state, and rebuild dispatch  
**Task ID:** HOUSEKEEPING-2026-06-08-SBV-MACRO  
**Timestamp:** 2026-06-08T07:58:33Z  
**Zone:** pm / ops

---

## Summary

Two linked code-level fixes from the macro/SBV FX refresh layer are now code-complete but remain in **DONE-CODE-AWAIT-REBUILD** status pending mcp-server container rebuild + next cron fire.

1. **FIX-MACRO-REFRESH-DEAD** (commit b7ce338f) — C-09 macro half: env-var mismatch (MACRO_SERVICE_URL→MACRO_INDICATORS_URL in clients.ts) + re-throw in macroIndicatorRefreshJob catch block. **VERIFIED LIVE**: get_macro_snapshot returns fresh data (fetchedAt=2026-06-08T05:00:43Z, fedFundsRate=3.62 not 5.33 regression, is_estimate=false).

2. **FIX-SBV-REFRESH-SILENT-SWALLOW** (commit cbfd8e31) — B-12 SBV half: re-throw on fetch failure in sbvRatesJob.ts catch block (mirrors b7ce338f pattern). Tests pass (6/6 in FIX-SBV-REFRESH-SILENT-SWALLOW.test.ts including AC-1 DB integration verifying cron_job_runs.status='error'; sbvRatesJob.test.ts TC-3/TC-4 assert re-throw). **Router raw-verified**: throw err present in sbvRatesJob.ts:153 post-fix.

Both fixes are semantically complete; live freshness restores only when:
1. mcp-server container is rebuilt with both commits
2. The next scheduled cron fires (macroIndicatorRefreshJob at 06:00 GMT+7 daily; sbvRatesRefreshJob every 4 hours)
3. Auditor B-12 clears (SBV FX freshness <24h)

---

## What Was Considered

**Scope:** Two root causes, one code-level fix each, both shipped in commits. Board state decision is to:
- Flip both tasks to DONE-CODE-AWAIT-REBUILD (or fold into one row if board semantics require)
- Dispatch ops to rebuild mcp-server ONLY (targeted rebuild, NOT docker compose down && up — per rebuild-recreate-destroys-peers feedback)
- Link/resolve signal sau-c109-b12-continuation (NEW, CRITICAL) against these tasks (no new FIX needed)

**Alternative:** Leave tasks in TODO pending rebuild; this would block PM's board sight until ops completes rebuild. Instead, we mark code as done, flag pending rebuild, and ops owns the execution gate.

---

## Why This Decision

**Justification:**
- Code review (router) verified both re-throws are present and correct
- Test suites pass (6+5=11 tests across both FIX_*.test.ts files)
- Macro half is already verified LIVE in the data plane (c-09 cleared)
- SBV half is code-correct per pattern from macro fix, awaits only runtime validation (rebuild + cron fire + auditor B-12 clear)
- Signal sau-c109-b12-continuation (NEW, CRITICAL, 26.9h stale) is a continuation of the SAME SBV staleness issue; escalating it as a separate FIX would duplicate work and bloat the board

**Signal Resolution:**
- sau-c107-b12 (TRIAGED): "folded into FIX-MACRO-REFRESH-DEAD" — now both macro AND SBV halves are resolved under the umbrella
- sau-c109-b12-continuation (NEW, CRITICAL): dedup guard in place per notes; resolved by same rebuild + B-12 auditor clear; link/close not as new FIX but as continuation of c107 resolution

---

## Board State Changes

### Task Status Updates

**FIX-MACRO-REFRESH-DEAD:**
- **From:** TODO (as-is from triage)
- **To:** DONE-CODE-AWAIT-REBUILD
- **Note:** C-09 macro half verified LIVE via get_macro_snapshot; B-12 SBV half is mirrored fix now code-complete; both halves require mcp-server rebuild + next cron fire for full validation

**FIX-SBV-REFRESH-SILENT-SWALLOW:**
- **From:** TODO (newly created in triage 2026-06-08T04:57Z)
- **To:** DONE-CODE-AWAIT-REBUILD
- **Note:** Code-complete per cbfd8e31; tests AC-1 pass (cron_job_runs.status='error' on fetch-fail); awaits mcp-server rebuild + next sbvRatesRefresh cron (every 4h) + auditor B-12 clear to verify live freshness

### Signal Resolutions

**sau-c107-b12:** Already TRIAGED with resolution note referencing FIX-MACRO-REFRESH-DEAD. Recommend update resolution to reflect both macro (C-09) + SBV (B-12) halves now code-complete:
```
"resolution": "PO triage 2026-06-08T02:17:24Z: folded into FIX-MACRO-REFRESH-DEAD. 
Root cause 1 (C-09 macro env-var + re-throw): DONE, LIVE verified 2026-06-08T05:00:43Z. 
Root cause 2 (B-12 SBV re-throw): code-complete cbfd8e31, awaits rebuild + cron fire (sbvRatesRefresh every 4h). 
Paired signal sau-c109-b12-continuation (26.9h stale) is dedup; resolves with same rebuild."
```

**sau-c109-b12-continuation (NEW, CRITICAL):** Mark as TRIAGED, link to above resolution (not a new FIX; continuation of c107):
```
"status": "TRIAGED"
"resolution": "Continuation of sau-c107-b12; dedup active. 
Both resolved by: FIX-MACRO-REFRESH-DEAD (C-09 + B-12 SBV) + mcp-server rebuild + next cron fire. 
Auditor B-12 will clear when SBV FX freshness <24h post-rebuild."
```

---

## Rebuild Dispatch Decision

**Ops Action Required:** Rebuild mcp-server container (rebuild-only, NOT full down && up per project feedback on peer-destroy risk).

**Rationale:**
- Both cbfd8e31 and b7ce338f must be in the running container's code
- Targeted rebuild keeps peer services (macro-service, pdf-extractor, etc.) running
- Reduces blast radius vs full compose restart (previously caused ~21min downtime)

**Verification Post-Rebuild:**
1. `docker ps -a` — verify peer containers still UP, mcp-server newly started
2. Wait for next cron windows:
   - macroIndicatorRefreshJob: daily 06:00 GMT+7 (next: ~tomorrow if it's past 06:00)
   - sbvRatesRefreshJob: every 4h (next fire within 4h)
3. Auditor B-12 check: poll auditor fresh check → should clear SBV FX freshness <24h
4. PM (next cycle): flip both tasks to DONE once B-12 auditor clears

---

## Pre-Commit Gate (DJ-GATE-1)

✓ Journal entry written (this file)  
✓ Task board prepared for atomic update (DONE-CODE-AWAIT-REBUILD status + signal resolution notes)  
✓ Router verified raw code (re-throw present in sbvRatesJob.ts:153; tests pass)  
✓ Rebuild dispatch decision recorded (ops to rebuild mcp-server only, targeted)

---

## Next Steps

1. **PM:** Commit journal entry + board state update (task_board modifications + signal_queue updates)
2. **Ops:** Execute targeted mcp-server rebuild; verify docker ps -a (peers UP); monitor next cron fire
3. **PM (next cycle):** After B-12 auditor clears, flip both DONE-CODE-AWAIT-REBUILD → DONE; unblock next tier (FIX-PDF-EXTRACTOR-UNHEALTHY reparse queue, etc.)
