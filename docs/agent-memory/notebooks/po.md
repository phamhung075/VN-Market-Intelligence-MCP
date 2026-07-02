# PO Notebook

_Last: 2026-07-02T04:37Z_

## Tick 2026-07-02T04:35Z — USER feature request: "need merge money-radar to momentum" (coord d3292ca4)

**Intent:** consolidate the two parallel dashboard surfaces (/dashboard/money-radar + /dashboard/momentum, both built from the same mirror template) into ONE unified momentum page. Both feeder APIs already serve HTTP 200 → PURE frontend (apps/frontend/), NO backend/mcp-server work.

**Product decisions locked (into the BA task spec):**
- Merge target: dashboard.momentum.tsx renders TWO labelled sections — 4 momentum honest-NULL cards + 4 money-radar non-null cards; loader fetches BOTH feeds via Promise.allSettled (per-section isolation).
- do-NOT-homogenize (brief §10, HARD): radar cards stay non-null/depth-independent, momentum cards stay honest-NULL/OHLCV-depth-gated; each keeps own FreshnessBadge('daily') + InfoCardExpand source-link.
- money-radar route fate: CONVERT to redirect loader → /dashboard/momentum (preserve deep links; NOT delete; api.money-radar.tsx proxy stays as feeder).
- nav fate: ONE unified nav entry (relabel momentum entry); do NOT add a separate radar entry.
- chain: ba → pm → dev-frontend → qa. Single zone → NO architect split.

**Board actions (po-s138, orch-apply rc=0):**
- MINT `BA-MERGE-MONEY-RADAR-INTO-MOMENTUM` → ready[] (ba, apps/frontend/, SPRINT-S, priority high, user_prioritized). PO does NOT spawn — WIP 2/2 full (both dev-mcp-server BCTC), disjoint zone → dev-team loop adopts when a frontend slot frees.
- SUPERSEDE `FIX-FE-HEADER-NAV-MONEY-RADAR` → ready[]→done[] (DONE, done_verified:false, resolution=superseded-by-merge). Its nav work is folded into the merge; a separate entry pointing at a soon-to-be-redirect route = doomed double-entry.
- APPEND sprint_goal vision entry.
- Conservation verified: ready 3→3, done 53→54, sprint_goal 15→16; idempotent re-run byte-identical.

**Verify:** live SSOT confirms mint in ready[] + supersede in done[]. Zod S0+S1 PASS, 100 pre-existing SHG coherence warns (0 new). Commit orch-state + script + journal + notebook (commit-mutex, explicit paths, --no-verify, local-only; fleet-push timer pushes).

## Carry-over
- BA-MERGE-MONEY-RADAR-INTO-MOMENTUM waiting in ready[] — dev-team loop dispatches ba when it ticks (BA-spec authoring does not consume a coding-WIP slot). PO does NOT spawn.
- FIX-FE-HEADER-NAV-MONEY-RADAR is SUPERSEDED (no longer a live ready task) — do NOT re-mint or dispatch it; its scope lives inside the merge.
- FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-BANK-BS-SECTION-CLASSIFIER both in_progress, deploy-gated on user `up -d --build mcp-server`. Do NOT flip/work around.
- W5-FU-CTG-REFINE + TASK-W5 BLOCKED in review[] — do NOT qa-gate until classifier reflows balance_sheet rows.
- A-30 mcp-server mem: escalated (user rebuild only). If next tick ≥85% → re-escalate.
- 2 ready[] non-mcp remaining (ARCH-DASH-CRON, TOKEN-ECONOMY) + the new merge task — dispatch as slots free.
