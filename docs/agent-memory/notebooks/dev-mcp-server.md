# dev-mcp-server -- Notebook

## 2026-07-31 — FIX-CI-SIZELINT-MCPSERVER-ENERGYTOOLS-NEW-OFFENDER (BOUNDED-1 auto-pickup, P0) → REVIEW, next_agent=qa

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. own prior FDA-5 commit (af272fe1d) grew `energyTools.ts` 152L→215L (baseline=152, upper=167) with no size-justification header — new size-lint offender, same red job as the SIX-UNCOVERED/pdfx rows above.

**Remedy chosen: justification token, not shrink.** The 63L growth is the `EnergyGridResult` type declaration + its rationale docstring + the `structuredContent` return object-literal — functional code (type safety + FDA-5's estimate-flag structural guarantee), not redundant comment restatement like the sibling pdfx fix (3 near-duplicate paragraphs → 1). Even zeroing every comment line (~24L) would leave the file ~191L, still 24L over tolerance — shrink was not a viable remedy without regressing FDA-5's own AC. Added `size-justification: 224L` inside the first 10 lines (declared matches actual exactly); comment-only, zero logic/type/export touched.

**Evidence:** `bun tsc --noEmit` clean. Targeted suite `DSI-S3-sector-fin.test.ts`: 27/27 pass (comment-only diff, no behavior change expected/observed). `gen-project-stats.ts --dry-run`: toolCount=183, cronJobCount=88 — unchanged. Full `bun test`: 14958 pass/40 skip/52 fail (557.75s) — inside the documented pre-existing flake band; spot-checked 2 of the 53 fail-list entries (vnstock-3statement.test.ts, 1146-get-insider-transactions.test.ts) in isolation — both 27/27 pass standalone, confirming parallel-load flakiness not a regression; zero energy/FDA-5-related names in the fail list. **AC-4 verified on the CI plane (not just local):** run 30608934628 (head `f4feb65517e8353cafb8e6694ed5258dca46c6b9`, confirmed descendant of `22bdf63b5` via `git merge-base --is-ancestor`) — `size-lint` job step FAIL but `gh run view 30608934628 --log-failed` lists exactly 1 offender: `apps/macro-indicators/pkg/application/usecases_vmt_liquidity_resolvers.go` (sibling FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER's file, still `ready[]`) — `energyTools.ts` absent (grep -i energyTools = 0 matches). `bun test` CI job on this same run: green. DJ: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md S38.

Zone health: tsc clean, tool/scheduler counts unchanged (183/88), 1 file touched (energyTools.ts, header comment only) | HEALTHY.

## 2026-07-31 — FDA-7 (BOUNDED-1 auto-pickup, P3/S) → REVIEW, next_agent=qa

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. `get_macro_snapshot` is a thin HTTP proxy to macro-indicators:5004. Two provenance-omission fallbacks were dishonest: `fetchedAt ?? new Date().toISOString()` re-stamped "now" when the Go response omitted `fetchedAt` (older build), making a stale snapshot look freshly fetched; `source_tier` defaulted to `2` (optimistic aggregator tier) when no present `signals.*` component carried a tier annotation.

**Fix (`macroTools.ts`):** `fetchedAt` fallback changed `new Date().toISOString() → null` (type widened `string → string | null`) — the proxy now surfaces the absence explicitly instead of fabricating a fresh timestamp. `sourceTier` fallback changed `2 → 4` (conservative/unknown), matching this file's own `CarryProvenance`/`MacroDataSourceInputs` convention for estimate/unknown provenance. No structuredContent added — unlike FDA-5/6, this envelope's `fetchedAt`/`source_tier` are already real top-level wire fields, so `null` on the existing field already satisfies the "surface the absence" requirement.

**Tests (`089-tool-macro.test.ts`, new "FDA-7" describe block):** 4 new cases — fetchedAt is null (not a fresh ISO string) when Go response omits it; source_tier=4 when signals present but none carry a tier; source_tier=4 when `signals` is entirely absent; regression guard that a real Go-supplied fetchedAt still passes through unchanged. RED confirmed pre-fix via `git stash` (3 failures: got `"2026-07-31T..."` instead of null, got `2` instead of `4`), GREEN post-fix. File: 21/21 pass (was 17).

**Evidence:** `bun tsc --noEmit` clean. Targeted suite (089-tool-macro + 1881a-source-tier + 1423d/1423f/1570c + 1903a + 1918a + H3-urgent-news + TASK-unblock-cowork + DSI-S1-MACRO, 10 files): 128/128 pass. Fresh server boot (`DB_PATH=:memory:`, free port): `/health` toolCount=183, zero import errors; dashboard probes (`/api/bctc-inspect`, `/dashboards/news-fetch/`) both 200. `gen-project-stats.ts --dry-run`: toolCount=183, cronJobCount=88 — both unchanged. Full `bun test`: 14961 pass/40 skip/53 fail/47465 expect (571.59s) — inside the documented pre-existing flake band (52-59); all 128 targeted macro-suite tests (incl. the 4 new FDA-7 ones) green, so none of the 53 standing failures are macro/FDA-7-related. Doc updated: `docs/agents/tools/list/get_macro_snapshot.md` (signature + Integration Notes). Also touched: `macroSnapshotGuard.ts` doc comment (`fetchedAt?: string | null`, no logic change — guard was already agnostic to this field). DJ: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md S39.

Zone health: tsc clean, tool/scheduler counts unchanged (183/88), 4 files touched (macroTools.ts + macroSnapshotGuard.ts + test + tool doc) | HEALTHY.

## 2026-07-31 — FDA-10 (BOUNDED-1 auto-pickup, P3/XS) → REVIEW, next_agent=qa

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. Comment-only cleanup: `shippingIndex.ts` module header (L7) and `SHIPPING_SYMBOLS` JSDoc (L73-77) both claimed an "SCFI placeholder that resolves to BDI" — false. Independently re-verified `SHIPPING_SYMBOLS` (L79-82) has always contained only `^BDI`/`^BFIY`; no SCFI symbol/proxy/placeholder logic exists anywhere in the file (`grep -i scfi` confirmed only these 2 comment mentions). A prior read-only Slice-A audit (FAKE-DATA-AUDIT 2026-06-05) already confirmed no fabrication occurs — this closes the stale-comment residue.

**Fix:** Deleted the L7 mention entirely; corrected the L73-77 JSDoc to state SCFI has no free Yahoo ticker and is NOT fetched or proxied. Zero functional/logic change — `SHIPPING_SYMBOLS`/fetch logic untouched.

**Evidence:** `bun test src/__tests__/252-shipping-index.test.ts`: 8 pass/0 fail (unchanged). `bun tsc --noEmit`: clean. Commit `ec27c69d3`. DJ: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md S40.

Zone health: tsc clean, 1 file touched (shippingIndex.ts, comment-only) | HEALTHY.
