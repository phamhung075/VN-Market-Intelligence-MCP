# Handoff — TASK_1967-05: cowork-team dispatcher-wrap release timing

**Task:** 1967-05 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** XS

---

## Summary

cowork-team dispatcher releases lock BEFORE spawn completes in the nominal case, which is safe by design but lacks a drift_min threshold guard. At drift_min ≥ 15 (currently max 9), two parallel spawns could claim the same slot.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-07

**Repro path:line:** `cowork-team/main.md:173-183` — "After each spawn attempt (success OR failure) — release lock immediately (try/finally)"

**Design confirmed safe:** Lock is tick-scoped (floor-15min key), so release is safe by design IF drift_min < 15. Current max observed drift (2026-05-21): drift_min=9, well within safe bound.

**Latent risk:** At drift_min ≥ 15: two parallel market-watcher spawns → double API calls + conflicting notebook writes

---

## Current Behavior

- cowork-team fires ~every 900s (15min)
- Drift envelope (max observed): 5-9 minutes (median=5)
- Lock held only during Agent() call, released immediately after
- Safe due to floor-15 rounding: floor(:09/15)×15=:00

---

## Expected Behavior

- Explicit drift_min > 10 threshold guard sending WORK warning
- Documented 10-min warning threshold in cowork-team/main.md
- Prevents false sense of safety if drift_min grows to 13+

---

## Proposed Fix

**Zone:** `.claude/flows/cowork-team/main.md`

**Fix surface:** cowork-team Step N (after nominal_tick calculation, before agent spawn):
1. Check `drift_min` against threshold (recommend 10)
2. If `drift_min > 10` → emit WORK channel warning: "cowork dispatcher drift exceeding 10min; slot lock safety margin narrowing"
3. Proceed with spawn (do NOT block)

**Alternative:** Add to system-auditor Tier-2 or Tier-3 to monitor drift_min trend and alert if approaching 15

**Blast radius:** Low — warning-only, no functional change; prevents latent risk if system load increases

**Dependency chain:** None — standalone flow edit

---

## Acceptance Criteria

1. [ ] cowork-team/main.md Step N (post-nominal_tick, pre-spawn) includes `if drift_min > 10 → emit WORK warning`
2. [ ] Warning message: "cowork dispatcher drift_min=X exceeding 10min threshold; review system load"
3. [ ] Test: drift_min=5 → no warning ✓
4. [ ] Test: drift_min=11 → warning emitted ✓
5. [ ] tsc 0 errors

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `.claude/flows/cowork-team/main.md`
- **Model:** claude-haiku-4-5-20251001

---

## Related

- REQ-1967-3c (dispatcher-wrap release-on-error)
- ITEM-10 (cowork fire-drift sustained at drift_min=5, max 9)
- ITEM-22 (dispatcher-wrap outer release on spawn failure — related lock pattern)
