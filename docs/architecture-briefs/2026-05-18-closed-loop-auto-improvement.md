# ARCH-1947 — Closed-Loop Auto-Improvement Architecture Brief

**Sprint:** 1947
**Author:** Architect
**Date:** 2026-05-18
**Zone:** `apps/mcp-server/` (scheduler layer)
**Spike reference:** `docs/spikes/SPIKE_1947-auto-improve-loop.md`
**Status:** DONE — ready for PM task breakdown

---

## Decision Summary

| Question | Decision |
|---|---|
| Host | Scheduler job inside `apps/mcp-server/src/scheduler/audits/` |
| Trigger | Daily time-based (09:00 UTC), not metric-threshold-based |
| Detection metric | `accuracy_rate` delta: 7-day vs 30-day window per signal_type; threshold 10pp regression OR baseline < 40% with ≥10 samples |
| Hypothesis generator | Rule-lookup table `degradationRules.ts` (Phase 1-2); LLM agent optional Phase 3 |
| Auto-dispatch Phase 1 | NO — shadow mode only (log + Telegram WORK) |
| Auto-dispatch Phase 2 | Manual-gate: write `docs/signals/` JSON, human must drain |
| Auto-dispatch Phase 3 | Full auto, kill-switch env var `SELF_IMPROVE_AUTO_DISPATCH=false` (opt-in only) |
| Recheck window | 7 days post-dispatch; checked on each daily orchestrator run |
| Loop-exit criterion | `hit_rate >= 0.60` sustained over 2 consecutive weekly windows |
| Safety — WIP cap | Phase 3: defer dispatch if In Progress tasks ≥ 2 |
| Safety — cooldown | No re-dispatch for same signal_type within 7 days |
| Safety — recurring-bug | ≥2 failed dispatch cycles for same signal_type → WORK escalation to architect |

---

## DDD Layer Assignment

| Component | Layer | Path |
|---|---|---|
| `degradationRules.ts` | domain/services | `apps/mcp-server/src/domain/services/degradationRules.ts` |
| `DegradedSignalType` interface | domain/models | inline in `degradationRules.ts` |
| `improveCheckStore.ts` | infrastructure/db | `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` |
| `improvementSignalWriter.ts` (Phase 2) | infrastructure/signals | `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` |
| `selfImproveOrchestratorJob.ts` | interface/scheduler | `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` |
| `improve_check_log` schema | infrastructure/db | `apps/mcp-server/src/infrastructure/db/schema-system.ts` (extend `initSystemTables()`) |
| `CRONS.selfImproveOrchestrator` | interface/scheduler | `apps/mcp-server/src/scheduler/cronConfig.ts` |
| Wire in scheduler | interface/scheduler | `apps/mcp-server/src/scheduler/startScheduler.ts` |

DDD constraint: `degradationRules.ts` in domain layer has ZERO imports from infrastructure. The orchestrator job in scheduler layer calls domain + infrastructure, never cross-direction.

---

## Files to Create (Phase 1 — Sprint 1948)

### `apps/mcp-server/src/domain/services/degradationRules.ts` (new, ~60L)

```typescript
// domain/services — pure data, zero imports
export interface DegradedSignalType {
  signal_type: string;
  window_7d_rate: number | null;
  window_30d_rate: number | null;
  sample_count_7d: number;
  sample_count_30d: number;
  degradation_reason: "regression" | "persistently_low";
  delta_pp: number; // baseline_rate - current_rate, in percentage points
}

export interface DegradationHypothesis {
  likely_cause: string;
  suggested_fix: string;
  fix_area: string;
}

export const DEGRADATION_CAUSE_MAP: Record<string, DegradationHypothesis> = {
  "price_confirmation": { ... },
  "chain_catalyst": { ... },
  "volume_spike": { ... },
  "_default": { ... },
};

/** Classify whether a signal_type qualifies as degraded given two accuracy windows. */
export function classifyDegradation(
  signalType: string,
  rate7d: number | null,
  rate30d: number | null,
  count7d: number,
  count30d: number,
): DegradedSignalType | null { ... }

export function lookupHypothesis(signalType: string): DegradationHypothesis {
  return DEGRADATION_CAUSE_MAP[signalType] ?? DEGRADATION_CAUSE_MAP["_default"]!;
}
```

### `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` (new, ~80L)

```typescript
// infrastructure/db layer
export interface ImproveCheckRow {
  id?: number;
  signal_type: string;
  window_7d_rate: number | null;
  window_30d_rate: number | null;
  sample_count_7d: number;
  sample_count_30d: number;
  hypothesis: string;
  dispatch_status: "shadow" | "dispatched" | "deferred_wip_cap" | "improvement_confirmed" | "no_improvement" | "worsened";
  fix_signal_id: string | null;
  checked_at: string;
  rechecked_at: string | null;
}

export function insertImproveCheck(db: Database, row: Omit<ImproveCheckRow, "id">): void
export function getPendingRechecks(db: Database, minAgeDays: number): ImproveCheckRow[]
export function updateImproveCheckStatus(db: Database, id: number, status: ImproveCheckRow["dispatch_status"], recheckedAt: string): void
export function getRecentCheckForSignalType(db: Database, signalType: string, withinDays: number): ImproveCheckRow | null
```

### `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` (new, ~150L)

```typescript
// scheduler layer (interface/scheduler)
export interface SelfImproveOrchestratorDeps {
  db?: Database;
  sendWork?: (text: string) => Promise<boolean>;
}
export interface SelfImproveOrchestratorResult {
  degradedTypes: number;
  coverageGaps: number;
  dispatched: number; // always 0 in Phase 1 (shadow mode)
  shadowOnly: boolean;
}
export async function runSelfImproveOrchestrator(deps?: SelfImproveOrchestratorDeps): Promise<SelfImproveOrchestratorResult>
export async function runSelfImproveOrchestratorCron(): Promise<void>
```

---

## Files to Modify (Phase 1 — Sprint 1948)

### `apps/mcp-server/src/infrastructure/db/schema-system.ts`

Add `improve_check_log` table to `initSystemTables()`. Schema: see SPIKE doc §8.

### `apps/mcp-server/src/scheduler/cronConfig.ts`

Add:
```typescript
/** selfImproveOrchestrator — daily accuracy degradation detection at 09:00 UTC (SPIKE-1947) */
selfImproveOrchestrator: Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '0 9 * * *',
```

### `apps/mcp-server/src/scheduler/startScheduler.ts`

Import `runSelfImproveOrchestratorCron` from `./audits/selfImproveOrchestratorJob.js` and add cron wire after the `accuracyDigestJob` block:
```typescript
cron.schedule(CRONS.selfImproveOrchestrator, async () => {
  await jobRunRepo.wrapRun('selfImproveOrchestratorJob', async () => {
    await runSelfImproveOrchestratorCron();
  });
});
```

---

## Test Strategy

| Test file | Tests | Target |
|---|---|---|
| `1948-self-improve-detection.test.ts` | 6+ | classifyDegradation: degraded / not degraded / insufficient sample / null rates / persistently-low / neutral stock |
| `1948-self-improve-store.test.ts` | 4+ | insertImproveCheck, getPendingRechecks, updateImproveCheckStatus, getRecentCheckForSignalType |
| `1948-self-improve-orchestrator.test.ts` | 6+ | full run with degraded data, full run with clean data, schema-absent guard, all-neutral guard, shadow-mode dispatch_count=0 |

All tests use `DB_PATH = :memory:` via the existing `setup.ts` preload.

---

## Risk Flags

- **R-1 (HIGH):** Insufficient sample volume in early weeks. Phase 1 is safe (shadow only). Do NOT advance to Phase 2 until 4+ weeks of signal_outcomes data with ≥10 samples per signal_type. Monitor via `improve_check_log.dispatch_status = 'insufficient_sample'` count.
- **R-2 (MEDIUM):** Two-window delta conflates seasonal vs structural degradation. Acceptable in Phase 1 (human reviews WORK message). Requires re-calibration threshold review before Phase 3.
- **R-8 (LOW, CRITICAL if violated):** DB single-writer constraint. Orchestrator MUST run inside mcp-server process. Never call `improveCheckStore.ts` from a cross-service HTTP handler.

---

## Sequence for Sprint 1948

```
1948a (schema + store) → 1948b (domain rules + detection) → 1948c (orchestrator + tests + wiring)
                                                                    ↓
                                                        OBSERVE-1948d (7-day shadow gate)
```

All three impl tasks are sequential (shared files: schema-system.ts, cronConfig.ts, startScheduler.ts touch points). No parallelism safe here without worktrees.

---

## Environment Variables (Sprint 1948)

Add to `.env.example`:
```bash
# Self-Improve Orchestrator (SPIKE-1947)
CRON_SELF_IMPROVE_ORCHESTRATOR="0 9 * * *"
SELF_IMPROVE_AUTO_DISPATCH="false"
```

`SELF_IMPROVE_AUTO_DISPATCH` is read in Phase 3 only. Phase 1 code ignores it (always shadow). Document it in Sprint 1948 so the infrastructure is in place.
