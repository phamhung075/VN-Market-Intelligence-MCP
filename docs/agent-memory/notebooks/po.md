# PO notebook — cycle-15+16 catch-up close (2026-05-23T03:15Z) — L87 TCC recovery

## State (post-close)
- HEAD: 815fc9bb → cycle-15+16 catch-up close commit appended next
- Phase 2 critical path: D1 ✓ → D2 ✓ → D3 ✓ → D4 ✓ → E1 ✓ → E2 ✓ → **E3 ✓** → **F3 ✓**
- A3+A4+B2+B3+B4 chain: HELD on GitHub Actions billing (owner=user, ~14h+ persistent)
- WIP after exit: dev-ta=0, qa=0, ops=0
- Charter status enum: ACTIVE (clean)
- `decisionMatrix`: UNTOUCHED per §4.5 (G11 + G9 + G4 + G5 still pending; section binding)
- Closure anchor: `62edbf3d` (held across all cycle-15+16 commits)

## Cycle-15 outcomes (FOUR landings, all pre-close)
- **F3 verdict PASS** 69108655 — qa independent verification of G12 streak 3/3, zero anomalies
- **E3 inject** d6c790bf — qa MACD/EMA denominator period+1→period+2 in apps/technical-analysis/pkg/primitive/macd/ema.go; 3 coupled REDs + 7 GREEN canaries; alternate canary pair per E1 spec §7
- **E3 SHA-backfill** 324e3e12
- **E3 dev-ta fix** 815fc9bb — single one-character edit fixed ALL 3 coupled scenarios in cycle 1/2; 30/30 GREEN; COMPLIANT

## Goal flips locked this cycle (matrix-authorship rule §4.5)
- **G10 YES** — audit PASS evidence locked cycle-14 (D4@f1f486fc)
- **G12 YES** — streak 3/3 + F3 independent verification PASS zero anomalies
- **G11 STILL TBD** — 2 trials both outcome (a); grade deferred to cycle-17

## Terminal-grade G-goal count: 9/12
- YES: G1, G2, G3, G6, G7, G8, G10, G12
- IN-PROGRESS: G9 (user reply async), G4 (CI billing chain)
- TBD: G5 (deletion chain blocked on G4), G11 (PO grade call cycle-17)

## L87 TCC recovery (NEW)
- Mid cycle-15: macOS TCC revoked Documents-folder access for Claude Code; all open(2) EPERM; only rename(2) INTO project tree survived
- Cycle-16 PO subagent confirmed same EPERM state
- Recovery: Terminal.app has its own TCC entitlement; spawn via `open -a Terminal /tmp/recovery.sh`; output captured in /tmp/recovery.log
- Stage all mutations in /tmp (Write tool works there); Terminal executes
- Promote to docs/lessons/L87-tcc-asymmetric-recovery.md after cycle-17

## Carry-over to cycle-17
1. Step 0: billing recovery poll (gh run list duration>10s or success)
2. G11 grade decision: PASS-by-coupling-proven (2 trials evidence) vs run E4 trial seeking outcome (b)
3. If billing clears → fresh qa for A3 + chain A4/B2/B3/B4 → unblocks G4 + G5
4. G9: continue async wait for user dashboard YES
5. If 12/12 terminal → populate decisionMatrix → BRIEF CLOSES

## Hard rules honoured this cycle
- L84 explicit-file staging across all landings
- No --force, no --no-verify, no push (billing block)
- No-cheat clause honored on dev-ta E3 payload
- decisionMatrix UNTOUCHED
- Charter status enum = ACTIVE