# CI-RED-e23a8b6a-FIX — dev-mcp-server decision journal

**task-id:** CI-RED-e23a8b6a-FIX

## What

`bun test` on main HEAD `e23a8b6a5` was RED: 3 fail across 2 test files (test-suite +
docker-compose-alignment fix only — no product code touched):

1. `apps/mcp-server/src/__tests__/1336-named-volume-config.test.ts` — stale test.
   Commit `5ba622eca` ("fix(infra): bind-mount market data to host disk instead of
   Docker named volume", 2026-07-15) deliberately reverted the `market_data` named
   volume back to a host bind-mount (`./data/live:/app/data`) after a VM rebuild
   post-hypervisor-crash destroyed the named volume and wiped live data. The test
   still asserted the old named-volume architecture. Rewrote all 3 assertions to
   assert the CURRENT committed `docker-compose.yml` (SSOT): no `market_data:` named
   volume anywhere, 9 services bind-mount `./data/live:/app/data` (8 rw + 1 `:ro` on
   `news-fetch`), and the top-level `volumes:` block only declares
   `pek_model_cache` + `bctc-page-images`.

2. `apps/mcp-server/src/__tests__/278-cycle-peer-sync.test.ts` — test-isolation
   defect. `buildBaseDeps()` stubbed the peer-sync path (`syncSectorPeersFn`) but
   left step A2 (`macroFetchFn` — real Yahoo Finance + SBV network calls) and step
   A3 (`vnstockSyncFn` — real vnstock sync) un-stubbed, so every
   `runIntelligenceCycle()` call hit real outbound network. Passes in local
   isolation (reachable network) but was the CI-only 3rd failure in a
   network-restricted runner. Added `macroFetchFn: async () => {}` and
   `vnstockSyncFn: async () => {}` to `buildBaseDeps()` — same idiom as
   `NO_NET_BASE_DEPS` in `106-intelligence-cycle.test.ts` /
   `1294-macro-spam-fix.test.ts` (CI-RED-8081e584-FIX round 2).

Did NOT touch product code. Did NOT address the FLAG (bind-mount reintroduces the
macOS torn-SHM SQLite-corruption risk 1336 originally guarded) — that is an
architect infra decision, out of scope here.

## Why

CI red blocks the whole fleet (P0). Both failures were test-suite drift, not
regressions: (1) a stale assertion left behind after a deliberate infra revert
commit, (2) a missing network stub matching an already-established
CI-hermeticity idiom used elsewhere in the same codebase.

## How verified

- `cd apps/mcp-server && bun test src/__tests__/1336-named-volume-config.test.ts src/__tests__/278-cycle-peer-sync.test.ts`
  → **13 pass / 0 fail / 29 expect() calls** (both files green).
- `cd apps/mcp-server && bun tsc --noEmit` → clean (exit 0).
- Full suite verification: CI does NOT run bare `bun test` — `.github/workflows/ci.yml`
  runs `bash scripts/ci-per-file-isolation.sh 16` (per-file process isolation,
  explicitly avoids bare `bun test` to eliminate ESM cache contamination). Ran the
  canonical script locally at P=16 and P=4. Neither target file appears in any
  failed-files list. This local host also intermittently threw random
  `Illegal instruction: 4` (SIGILL) Bun-engine crashes across BOTH parallelism
  levels (known host-level Bun-JIT instability, unrelated to this fix — matches
  prior "restart masks Bun-JIT corruption" finding) which non-deterministically
  drops random unrelated files out of the per-run count; confirmed by re-running
  the apparently-failed files individually (e.g. `135-rag-temporal-decay.test.ts`,
  `1019-ssc-pdf-breaker-bypass.test.ts`, `102-job-news-poll.test.ts`,
  `1324-push-news-all-sources.test.ts`, `1398-pollnews-all-dark-cooldown.test.ts`,
  `1793-pollnews-cooldown-persist.test.ts`, `FIX-1267-ssc-circuit-breaker.test.ts`)
  — all pass cleanly (0 fail) in isolation, confirming they were host-crash
  artifacts, not real failures.

  Two OTHER files are genuinely, deterministically red — confirmed by running them
  individually multiple times — but are **pre-existing, unrelated to this task's
  2 target files, and out of scope** (not silently expanding scope per DoD):
  - `src/__tests__/293-ocr-fallback-pipeline.test.ts` — 2 pass / 4 fail. All 4
    failures are real 5000ms test timeouts hanging inside
    `fetchParseAndStoreBctc` at "step 2: extracting PDF text" — looks like the
    same un-stubbed-async-dependency bug class as this task's #2 fix, but in a
    different file/function; NOT touched (out of scope).
  - `src/__tests__/BSD3-brief-sector-drift.test.ts` — 3 pass / 1 fail. Live doc
    `docs/analysis-briefs/BSR.md` still contains a `**Sector**:` line the guard
    test forbids — a content/data issue, not code; NOT touched (out of scope).

  Reporting both to the router per DoD ("If any OTHER file is red, report it —
  do NOT silently expand scope").

No product code, no peer files (notebooks/auditor JSON/cowork-team-*/tool-usage-stats),
no `docs/data/orch/orch-state.json` touched.
