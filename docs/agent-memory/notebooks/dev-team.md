# dev-team notebook

## Current state (c78 close — 2026-05-13T19:55Z)
- Pipeline: idle. Main HEAD `059a2be2` (pm-c78 notebook).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **33/33** (1 fired in c78: #33 stash attempt age=583s com.apple PID 51247 — long-idle, auto-cured immediately).

## c78 cycle log
- PREFLIGHT: clean entry on `7139f3e3`. Drained signals (TNB carry from c77, all archived).
- PO triage: BATCH(2) — 1899a-reuters-fallback (HIGH Todo) + 1898b (HIGH FIX, live re-verify needed).
- ba live re-verification of 1898b: returned **PARTIAL** verdict (active sources HEALED post c73 restart; ghost rows linger for legacy/disabled Reuters RSS + Trading Economics). Scoped down to 2-line `recordDisabled()` fix + 8 regression tests RSS-REG-01..08.
- Tier 1 execution (parallel, disjoint zones):
  - Track A (dev-mainserver-crawls worktree): 1899a-reuters-fallback — DataDome detection (body+header), DOM `article[data-testid="Article"]`, confidence LOW. Feat `3e04dc5f`. 28/28 tests, 0 tsc, DDD PASS, all files ≤200L.
  - Track B (dev-mcp-server worktree task/1898b-rss-regression): 1898b feat `619d22a4` → cherry-picked to main `0a76cf8d`. Developer noted spec said `source_type contains "nhandan"` but `source_type` is the layer discriminator (`"news"`); identity is in `source_url`. Corrected assertions to `source_url` — still satisfies AC intent (verified by QA).
- Merge gate:
  - 1899a-reuters-fallback → main `3e04dc5f` (tree-verify PASS, c2-alert OK).
  - 1898b → main `0a76cf8d` (tree-verify PASS exit 0, c2-alert OK exit 0).
- QA gates:
  - 1899a-reuters-fallback: APPROVED `e0a5da53`/`a070960c`. 28/28 + 112/112 full suite, 0 tsc errors, DDD PASS, AC 28/28.
  - 1898b: APPROVED `d8bc4991`. 8/8 RSS-REG-01..08 + 4/4 1335 baseline, 0 tsc, AC 8/8. Developer's `source_url` correction confirmed correct.
- pm c78 update: TASKS.md `19594166` → 73L (down from 83L). 1899a-reuters-fallback + 1898b moved to Done. **1899a-routes unblocked** (only depended on reuters-fallback). pm notebook `059a2be2`.

## Lessons / patterns
- **Long-idle HEAD.lock**: cure #33 fired at age=583s (~10 min) — far past 60s threshold, com.apple PID 51247 holding (Spotlight indexer). Lock from a stash op never released. Pattern: if `git status` returns and HEAD.lock persists, the lock is orphaned from an aborted ref update. Safe to remove immediately when age >>60s and no live `git` PID.
- **Spec vs reality on field semantics**: 1898b spec asserted on `source_type` containing source name, but newsNormalizer.ts:961 sets `sourceType` as a discriminator (`"news"`). Dev caught this during impl, corrected to `source_url`. ba spec should grep the codebase for field-value examples before locking AC assertions on field semantics — saves a CHANGES_REQUESTED cycle.
- **PARTIAL re-verify saves cycle effort**: ba's live re-verification of 1898b revealed RSS was healed for active sources but ghost rows persisted for permanently-disabled sources. Scoped to 2-line fix instead of full RSS rewrite. Pattern: ALWAYS live re-verify HIGH FIX tasks where reproduction depends on time-sensitive state (recent ingestion, source health flags).
- **Stash before cherry-pick** when WORK tree has stray hook commits / untracked files. `git stash push -u -m "<sprint>-precherry-<task>"` then `pop` after cherry-pick + tree-verify. Prevents `vos modifications locales seraient écrasées` errors mid-merge-gate.

## Carry-over to c79
- **1899a-routes** (Tier 3) — fully unblocked, ready for pickup. Wires Reuters + Bloomberg fallback into the news-fetch route layer.
- **1899a-gateway** (Tier 4) — blocked-by 1899a-routes.
- **1899a-cron, 1899a-tests** (Tier 5) — blocked-by 1899a-gateway.
- **1899a-bloomberg-test-split** (LOW) — split 494L test into 4 ≤200L files by logical group.
- **1900c-health-probe-refine** (LOW).
- **1862c-E/F, 1888b/c/d/e SSOT, 1881a/1890a/1897b/JANITORs** in Backlog (unchanged).
- **1897b-carry (URGENT-F1: USER ACTION PENDING)** — Docker .git/ exclude.
- **`.claire/worktrees/` orphan dir** + **`apps/mcp-server/reports/2026-05-{13,14}-evening.json`** still untracked — candidate janitor sweep target c79.
- **4 preflight lsof logs from c77-c78** untracked — keep for HEAD.lock root-cause archive; consider rotation policy if log dir grows.
