---
task-id: FIX-FRONTEND-NAV-STALE-COUNT-TESTS
agent: qa
cycle: 249
date: 2026-06-13
verdict: APPROVED
---

## qa-S1 — FIX-FRONTEND-NAV-STALE-COUNT-TESTS — APPROVED

what-considered:
- G1 (set-diff / no-lost-coverage): compared describe+it inventory old vs new for all 6 files via git show. All removed tests are replaced 1-for-1 with relative-order equivalents. Old frozen-count test in page14 (1 it) → 1 new relative-order it. Old Suite-2 absolute total (1 it) → 1 derived structural-invariant it. Net coverage ≥ prior across all 6 files. Zero deleted-without-replacement.
- G2 (recurrence-killer): confirmed old lines were toHaveLength(N) / last-entry / second-to-last frozen at moment of page addition. New lines use findIndex+adjacency (itemIdx === predecessorIdx+1) and toHaveLength(ANALYST_NAV.length + SYSTEM_NAV.length) derived invariant. Exactly ONE genuine hardcoded absolute survives: toHaveLength(26) in FE-HEADER-SSOT-top-nav.test.tsx (SSOT canary). No per-page renumber-refreeze found.
- G3 (live vitest): 64 files / 1554 pass / 0 fail — confirmed raw. Prior floor 21 fail / 1533 pass → delta = -21 fail / +21 pass = exactly the 21 stale tests fixed, zero new failures.
- G4 (tsc --noEmit): EXIT 0.
- G5 (zone purity): git show e43480e0 --name-only shows 6 files ONLY, all in apps/frontend/app/__tests__/. Zero production code, zero mcp-server, zero orch-state in the fix commit.

why-change: no change from plan — only path: all five gates green.
