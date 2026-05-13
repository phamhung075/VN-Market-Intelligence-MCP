# dev-team notebook

## Current state (c79 close — 2026-05-13T20:55Z)
- Pipeline: idle. Main HEAD `fce95405` (pm-c79 housekeeping).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **35/35** (2 fired in c79: #34 PREFLIGHT age=1403s com.apple PID 51247, #35 mid-cherry-pick age=376s com.apple PID 43751 — both auto-cured).

## c79 cycle log
- PREFLIGHT: HEAD.lock cure #34 (age=1403s, com.apple Spotlight, lsof captured to preflight-lsof-20260513T182848Z.log). Drained signals (empty).
- PO triage: BATCH(2) parallel disjoint zones — 1899a-routes (SPRINT-M, spec ready, fast-track) + CLEAN-c79-stale-artifacts (3 buckets).
- Tier execution (parallel):
  - Track A (dev-mainserver-crawls worktree): 1899a-routes — Hono router with `createRouter()` DI factory (mirrors macro-indicators). 5 routes: GET /health + POST/GET /news/reuters/headlines + POST/GET /news/bloomberg/headlines. Reuters fallback RSS→stealth wired. Bloomberg no fallback (per §6c). handlers.ts 142L, test files 199L + 197L. Feat `2c0b9f45` → cherry-picked to main `644c8fe4`. 137/137 tests, 0 tsc.
  - Track B (code-janitor, no isolation/used main worktree): CLEAN-c79 — Bucket A: removed 3 .claire/ orphan worktree dirs + gitignore line. Bucket B: fixed gitignore pattern `reports/*-evening.json` → `**/reports/*-evening.json` (was repo-root-scoped). Bucket C: created docs/agent-memory/sessions/.retention.md (7-day policy for preflight-lsof logs) + gitignore. Commits `4bdc1316` (A+B) + `cb0fdb56` (C) → main via ff-merge.
- HEAD.lock cure #35 mid-cherry-pick: age=376s com.apple PID 43751, stash error triggered detection. lsof captured to preflight-lsof-20260513T184721Z.log.
- Merge gate:
  - CLEAN-c79: ff-merge to main `cb0fdb56` (tree-verify exit 0, c2-alert exit 0). Branch deleted.
  - 1899a-routes: cherry-pick `644c8fe4`+`43609750` to main (tree-verify exit 0, c2-alert OK). Worktree unlocked + removed. Branch deleted.
- QA gates:
  - 1899a-routes: APPROVED. 137/137 + AC 9/9, 0 tsc, DDD PASS (handlers.ts imports application+domain only, no infra), security PASS. TASK_REPORT_1899a-routes.md written.
  - CLEAN-c79: skipped formal QA gate (CLEAN type, no functional change; tree-verify+c2-alert sufficient).
- pm c79 update: TASKS.md 72L (down from 73L). 1899a-routes + CLEAN-c79 → Done. 1899a-gateway (Tier 4) + 1899a-tests (Tier 5) **both unblocked** for c80 parallel pickup. Notebook + housekeeping commit `fce95405`.

## Lessons / patterns
- **Janitor without isolation:worktree**: code-janitor worked directly in main worktree on `clean/c79-stale-artifacts` branch instead of an isolated worktree. ff-merge back was clean but bundled 2 unrelated notebook updates (alert-commander, news-scout) in commit `4bdc1316`. Pattern: always pass `isolation: "worktree"` to background agents to avoid main-worktree branch confusion + hook noise leaking into feat commits.
- **createRouter() factory for testable Hono router**: 1899a-routes adopted dev-macro-indicators pattern of `createRouter({deps})` accepting injected ports → enables full mock injection without launching real browsers in tests. New canonical pattern for HTTP services with browser/network deps.
- **HEAD.lock pattern persists**: cures #34+#35 both held by com.apple Spotlight indexer (PID 51247, 43751). Persists across reboots / git refs. Pattern: long-idle (>>60s) com.apple-held HEAD.lock = orphan from prior ref update, safe to cure when no live git pid. Log to `preflight-lsof-*.log` for archive.
- **POST primary + GET alias parity**: 5 routes = 1 health + 2 POST + 2 GET aliases for backwards-compat / curl convenience. Pattern mirrors macro-indicators routing.

## Carry-over to c80
- **1899a-gateway** (Tier 4, MEDIUM) — UNBLOCKED. Wires api-gateway routing + docker-compose news-fetch service block. Zone: multi.
- **1899a-tests** (Tier 5, MEDIUM) — UNBLOCKED. Parallel-eligible with gateway (different zones). Zone: apps/news-fetch/.
- **1899a-cron** (Tier 5) — blocked-by 1899a-gateway.
- **1899a-bloomberg-test-split** (LOW) — split 494L test into ≤200L files.
- **1900c-health-probe-refine** (LOW).
- **1862c-E/F, 1888b/c/d/e SSOT, 1881a/1890a/1897b/JANITORs** in Backlog (unchanged).
- **1897b-carry (URGENT-F1: USER ACTION PENDING)** — Docker .git/ exclude.
- **preflight-lsof-* logs**: now gitignored per CLEAN-c79 bucket C. .retention.md documents 7-day rotation.
