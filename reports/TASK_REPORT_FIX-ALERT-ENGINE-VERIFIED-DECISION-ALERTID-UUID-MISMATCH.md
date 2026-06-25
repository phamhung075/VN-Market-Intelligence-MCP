## Task Report FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH
date: 2026-06-25
outcome: APPROVED

changed:
- apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts:257-258 (hoist daySlot, semantic id)
- apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts:244-245 (hoist daySlot, semantic id)
- apps/mcp-server/src/__tests__/FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH.test.ts (5 TCs, new file)

commit: 57a781a14ed86aa828011c0651e8286805f4d3d0 — 3 files, 324 insertions / 4 deletions

## Test Results
- New test file (5 TCs): 5 pass / 0 fail [22 expect() calls, 70ms]
- Full suite: 13382–13384 pass / 102–104 fail (variance = Bun JIT crash at end of run)
- Pre-existing failures: 107 known pre-existing per dev report; confirmed subset here:
  - 1307-ta-alert-scan-job: all failures = "table agent_signals has no column named confidence_score" — schema-drift in old test buildDb(), last touched b3ea96fa (2026-06-19), 6 days before fix
  - 1309-bb-alert-scan-job: same confidence_score schema-drift, last touched b3ea96fa (2026-06-19)
  - 1133-foreignFlowAlertJob, 1517-foreignFlowAlertJob: unrelated (foreign flow job, no touch by fix)
  - pollNews tests: timeout failures (5000ms network), unrelated
  - 235-send_telegram: unrelated channel routing
  - cowork-schedule.json schema: unrelated
- TypeScript: bun tsc --noEmit → EXIT 0 (no output)
- None of the pre-existing failures reference the 3 files touched by commit 57a781a1

## Verify Criteria Evidence

### (a) Semantic id format — PASS
taAlertScanJob.ts:258: `const id = \`alert-\${code}-\${alertType}-\${daySlot}\``
bbAlertScanJob.ts:245: `const id = \`alert-\${code}-\${alertType}-\${daySlot}\``
TC-1 confirms exact value: alert-VCB-ta_overbought-2026-06-25
TC-3 confirms exact value: alert-FPT-ta_bb_breakout_up-2026-06-25
Both match SEMANTIC_ID_RE = /^alert-[A-Z0-9]+-[a-z_]+-\d{4}-\d{2}-\d{2}$/ — identical to alerts.id format.

### (b) UUID-emitting writer eliminated — PASS
Pre-fix state (commit 1d0d6fbd, parent of 57a781a1):
  bbAlertScanJob.ts:240: `const id = crypto.randomUUID();`
Post-fix: `const id = \`alert-\${code}-\${alertType}-\${daySlot}\``
TC-5: regression guard asserts UUID_RE.test(alert_id) === false for both jobs. PASS.

### (c) storeAlerts propagates alert.id → agent_signals.alert_id — PASS
apps/mcp-server/src/infrastructure/db/alertStore.ts:190-196: insertSignal.run(..., alert.id, ...)
The 4th positional arg maps to the `alert_id` column (INSERT at alertStore.ts:149-157).
storeAlerts is NOT touched by the fix; propagation path confirmed unchanged.
TC-2 and TC-4 both query agent_signals.alert_id and resolve to an alerts row (no orphan). PASS.

### (d) Dedup safety — fingerprint UNIQUE unchanged — PASS
computeScanAlertFingerprint in apps/mcp-server/src/domain/services/alertDedup.ts:89-95
Returns: `scan:\${ticker}:\${alertType}:\${daySlot}` — unchanged, not touched by commit 57a781a1.
taAlertScanJob.ts:263 and bbAlertScanJob.ts:250: fingerprint computed independently of id.
The DB UNIQUE constraint on `fingerprint` column is the authoritative dedup gate.
Semantic id change does not affect fingerprint path — no insert collision risk.

## DDD Compliance: PASS
taAlertScanJob.ts and bbAlertScanJob.ts both declared "scheduler layer — may import from domain/ and infrastructure/".
No imports from application/ or interface/ present.
alertStore.ts is infrastructure; storeAlerts unchanged.

## Security: PASS
- No process.env in touched files (bun.env pattern only)
- No hardcoded credentials/tokens/secrets
- mock-guard.sh --files "taAlertScanJob.ts bbAlertScanJob.ts" → EXIT 0

## Commit Integrity: PASS
git show --stat 57a781a1: exactly 3 files, 324 insertions / 4 deletions.
No stray files, no secrets, no unrelated changes.

## Merge / Branch Status
Work is on main (no branches per project policy — commit already on main).
No merge action required. No branch to delete.

## Rebuild Flag: REBUILD REQUIRED
This fix is in apps/mcp-server (scheduler code). The running mcp-server container
was started before commit 57a781a1 (2026-06-25T17:09:47+0200). The container must
be rebuilt and recreated to pick up the semantic-id fix; otherwise UUID orphans
continue accumulating at +96/day. Flag for PO/ops: schedule mcp-server Docker rebuild.

## Board Status Recommendation
DONE — done_verified=YES | REBUILD_REQUIRED (mcp-server container)
