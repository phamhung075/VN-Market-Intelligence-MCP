# Decision Journal — Sprint CI-RED-8081e584 — QA

## qa-S1 · 2026-06-12 · CI-RED-8081e584-FIX QA gate

**task-id:** CI-RED-8081e584-FIX
**verdict:** APPROVED
**round:** 1 (first QA pass, dev rounds 1+2 both complete)

### What was considered

Six fixed test files covering the original 3 CI-RED failures plus 3 round-2 follow-ons:

**Round 1 (commit b4eeaf49 / 7e341981):**
- 1293a-signal-type-safety.test.ts — 32 pass
- 1295a-signal-builders.test.ts — 16 pass
- VPT-1-vps-proxy-health-endpoint.test.ts — 7 pass
Root cause correctly identified: SYS-FUNC-05 had loosened UrgentNewsFindingDataSchema to all-optional
(commit 815ccaed). Fix: restore strict schema + extract UrgentNewsLooseSchema for post_agent_signal
SIGNAL_TYPE_VALIDATORS only. vpsPushLogStore replaced datetime('now') wall-clock with injectable
now:Date param + parameterised cutoff — prod default = new Date(), no behavior change.

**Round 2 (commit 8a2ef725):**
- 1285-macro-alert-cooldown.test.ts — 2 pass (A2/A3 steps now use injected no-ops in test)
- 1837a-pipeline-state.test.ts — 5 pass ("review" added to validStatuses — legit board status)
- 1987-contam2-push-prices-ohlcv-guard.test.ts + CONTAM-7-ohlcv-unit-contam-integration.test.ts —
  afterAll mock.restore guards added; pre-existing lint violations corrected

**Checks run locally:**
- bun test (6 fixed files): 114 pass / 0 fail
- bun test (all 7 targeted + neighbors, 8 files): 169 pass / 0 fail
- bun tsc --noEmit: exit 0 (clean)
- DDD scan: PASS — no domain→infrastructure imports in any modified file
- Security scan: PASS — no process.env, no secrets; "token" hits are comment-only in intelligenceCycleJob.ts
- mock-guard.sh: EXIT 0

**DDD correctness review:**
- UrgentNewsLooseSchema (passthrough) scoped exclusively to SIGNAL_TYPE_VALIDATORS[urgent_news] in
  post_agent_signal input validation. All other consumers (builders, SignalSchemas barrel) still use
  strict UrgentNewsFindingDataSchema. No weakening of any strict consumer path.
- getVpsProxyHealth now:Date=new Date() default preserves prod behavior identically.
- intelligenceCycleJob CycleDeps macroFetchFn/vnstockSyncFn both have full prod implementations as
  fallback when deps not injected. Prod path unchanged.

**Baselines confirmed:**
- toolCount = 157 (project-stats.json)
- schedulerCount = 79 (project-stats.json)

**CI gate (authoritative fix commit 8a2ef725):**
- Run 27440565189: SUCCESS, 12767 pass / 53 skip / 0 fail
- Run 27440686989 on b7b84d9b (notebook chore): 160-stock-aliases.test.ts failure = pre-existing
  network-flaky test unrelated to fix scope; passes locally (34/0). CI failure on chore commit
  does NOT invalidate fix commit 8a2ef725 which is GREEN.

**BCTC eval gate:** N/A — no BCTC report touches in this sprint.

### Why APPROVED and not CHANGES_REQUESTED

All checks pass. The strict/loose schema split is architecturally sound (two clearly-named exports,
usage bounded by file:line comment). No weakening of any consumer. CI GREEN on the fix commit.
The b7b84d9b chore-commit CI failure is a pre-existing network-flaky test (160-stock-aliases.test.ts)
confirmed passing locally — it is NOT a regression introduced by this fix.
