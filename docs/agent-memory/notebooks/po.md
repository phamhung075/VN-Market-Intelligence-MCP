# PO Notebook

## Last updated: 2026-05-13T~06:15Z (c65 triage — BATCH(1): SPIKE_006-c61-T4)

---

## Cycle 65 triage

### Trigger
Dev-team c65 cron tick. pendingSignals=[] (drained empty). 1 unclaimed TG report: id=2874 unified-agent MEDIUM alert_quality "Alert precision 22% (9 scored/386)". Same signal that drove c60-c61 SPIKE_006 RCA. T-1 (threshold) shipped c61, T-2 (Path 2 wiring) shipped c64, T-3 (intraday gate + calendarDaysElapsed) shipped c63. T-4 unblocked.

### Channel audit (last 10 each)
- MARKET: clean — no errors
- WORK: c64 close + memory notebooks — normal
- BUG: id=2874 unified-agent alert precision — DIRECTLY addressed by T-4 (n<20 guard). No other open bugs.

### Decision: BATCH(1) = T-4 only
- T-4 is the canonical response to TG id=2874 (n=9 → insufficientSample guard).
- T-3 dependency LISTED in TASKS.md is STALE — T-3 shipped c63 (commit `20bab938`, in TASKS_ARCHIVE.md L58). Unblock T-4 manually in notebook decision; PM/agent-father will reconcile Todo row on next cap-rotation.
- 1897d architect brief request: NOT a BATCH item this cycle. USER bundle 1897b/1897d are NON-DISPATCHABLE (config admin only). Architect spike on Phase 4 worktree isolation already escalated c64 (1897c-ESCALATED). Don't double-spawn.
- 1862c-F deferred — depends on container-rebuild; 5-cycle stability gate not yet satisfied.
- SSOT cluster 1888b-k, methodology 1881a/1890a, JANITOR x6: defer (T-4/T-5/T-6 ship sequence is hot path).

### BATCH(1)
1. **SPIKE_006-c61-T4** (FIX-S, HIGH). Owner: dev-mcp-server. Zone: `apps/mcp-server/src/interface/mcp/tools/alerts/`. Files: `alertAccuracy.ts` + `__tests__/183-alert-accuracy.test.ts`. Baseline: 8804 pass, 1 fail (sustained). AC: insufficientSample boolean on AccuracyReport; gate `scoreable=hits+misses<20`; prepend Vietnamese warning "Chua du du lieu danh gia (N=X, can ≥20)"; skip % line; dailyDashboardJob non-breaking (Pick type doesn't include new field). Handoff: `docs/handoffs/TASK_SPIKE_006_c61_T4.md` (already authored c61). Spec frozen — no BA respin.

### Telegram triage
- TG id=2874 → claim with link "SPIKE_006-c61-T4 ship in c65 batch; insufficientSample guard will suppress 22% display when n<20".

### Cross-pollution + WIP
- WIP before: 0 (1894a is USER-blocked, doesn't count). After: 1 (dev-mcp-server T-4).
- Per-agent WIP ≤2: PASS
- File overlap: NONE (single agent, single zone)
- Recurring-bug rule: SPIKE_006 is architect-approved RCA chain (T-1..T-6 atomic ship order); NOT symptom retry. Rule satisfied.
- Zone enforcement: `apps/mcp-server/` → dev-mcp-server per zone-detect SKILL. PASS.

### Items deferred to c66+
- T-5 (write-back + flat-band fix) — sequential after T-4
- T-6 (integration test) — sequential after T-5
- 1862c-E-dashboard / 1894a Cloudflare (USER-blocked, carry)
- 1897b / 1897d USER bundle (config admin only, carry indefinitely)
- 1888b-k SSOT cluster, 1881a/1890a methodology, JANITOR x6
- T-3 row reconciliation in TASKS.md Todo (cosmetic; T-3 in archive)

### Hard-constraint compliance
- WIP ≤2: PASS (1)
- Disjoint zones: PASS (single)
- Recurring-bug: PASS (architect chain)
- Zone tag: PASS (`apps/mcp-server/`)

### Carry-forward to c66
- T-5 next in SPIKE_006 ship order
- TG id=2874 will re-emit until scored pool >20 (T-5 verdictResolutionJob write-back grows the pool). T-4 alone suppresses display; T-5 fixes the underlying pool problem.
