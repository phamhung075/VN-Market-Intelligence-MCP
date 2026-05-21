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

---

## [Developer] — agent-father 2026-05-21

**Status:** DONE

**Fix applied:** `.claude/flows/cowork-team/main.md`

Added "Step 3b — Drift threshold guard" section between Step 2+3 (slot-matcher returns DRIFT_MIN) and Step 4 (silent exit if no matches). The guard:

1. Checks `DRIFT_MIN > 10` immediately after slot-matcher returns.
2. If threshold exceeded: emits WORK channel warning: `[cowork-team] WARN drift_min=X exceeds 10min threshold; slot lock safety margin narrowing. Review system load. Safe limit: drift_min < 15.`
3. Does NOT block spawns — warning-only, all downstream steps continue normally.
4. Rationale documented inline: floor-15 absorbs up to drift_min=14; 10-min threshold provides 5-min safety margin.

**AC walkthrough:**
- AC-1: PASS — Step 3b is post-nominal_tick-calculation (cowork-match-slots.js returns drift_min), pre-spawn (Step 4.6).
- AC-2: PASS — warning message matches spec: `drift_min=X exceeding 10min threshold; review system load`.
- AC-3: PASS (design rationale) — drift_min=5: 5 ≤ 10, no warning emitted.
- AC-4: PASS (design rationale) — drift_min=11: 11 > 10, warning emitted to WORK channel.
- AC-5: N/A — pure flow doc edit, no TypeScript.

**Files changed:** `.claude/flows/cowork-team/main.md` (1 section added, ~16 lines)

---

## [QA] Review Record — 2026-05-21

**Verdict:** APPROVED
**Round:** 1
**Reviewer:** qa
**Commit reviewed:** fc1b9eab
**Smart-Skip:** YES — zero .ts changes, pure .md flow edit

| AC | Check | Result |
|----|-------|--------|
| AC-1 | Step 3b is post-nominal_tick (Step 2+3), pre-spawn (Step 4.6) | PASS — cowork-team/main.md:64, structurally between Step 2+3 and Step 4 |
| AC-2 | Warning message matches spec | PASS — cowork-team/main.md:71-72, drift_min=X + threshold + safe limit documented |
| AC-3 | drift_min=5 → no warning | PASS (design rationale, 5 ≤ 10) |
| AC-4 | drift_min=11 → warning emitted | PASS (design rationale, 11 > 10) |
| AC-5 | tsc 0 errors | N/A — no TypeScript |
| BCTC NFR-3 | No .ts or PDF changes | PASS |
| Caveman | ULTRA preserved | PASS |
| No-block | Spawn not blocked by guard | PASS — cowork-team/main.md:73 "Do NOT block — proceed to Step 4. Warning only." |

**Notes:** Threshold math verified — floor-15 rounding absorbs drift_min up to 14 safely; threshold=10 provides 5-min margin before danger at 15. Current safe envelope drift_min=9 (2026-05-21) is within bound. Warning-only guard has zero false positive risk at current operating envelope.
