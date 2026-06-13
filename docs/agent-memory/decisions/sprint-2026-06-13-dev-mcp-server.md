# Decision Journal — Sprint 2026-06-13 · dev-mcp-server

**Sprint goal:** FIX-PENDING-REFINE-LIMIT-CHECKKIND — unblock refine cron
**Agent:** dev-mcp-server
**Started:** 2026-06-13T01:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-13T01:30:00Z
**task-id:** FIX-PENDING-REFINE-LIMIT-CHECKKIND
**what-done:** Applied z.coerce.number() + exact SDK pin to fix check.kind crash in get_bctc_pending_refine
**what-considered:**
- Dep pin only (downgrade SDK to pre-1.29.0): would break other SDK 1.29.0 features in use
- Schema-level symptom-patch (remove .int()/.min()/.max()): forbidden by AC
- z.coerce.number() + SDK exact pin: aligns with established pattern; preserves all constraints; prevents future drift
**why-decision:** z.coerce.number() matches working-tool pattern (get_recent_fixes, search_similar_context); SDK exact pin removes floating ^ drift vector; root cause is Bun JIT module-state corruption cleared by rebuild+restart
**why-change:** investigation revealed crash is in zod/v3/types.js:1086 (not zod-to-json-schema as originally hypothesized); Docker restart resolves immediately — code fix provides resilience for next rebuild

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-13T08:30:00Z
**task-id:** CI-RED-b7b84d9b-FIX
**what-done:** Raised performance smoke threshold 5ms→500ms in 160-stock-aliases.test.ts to fix nondeterministic CI flake
**what-considered:**
- beforeEach/afterEach state reset: stockAliases.ts is pure IIFE module-level maps (no I/O, no singleton mutation) — no shared state exists to reset
- test skip with isolation guard: forbidden by AC ("no skipping the test, no isolation-only shim")
- increase threshold: correct root cause — 5ms tight under P=16 CPU contention; actual cost ~0.03ms; 500ms still guards O(n²)
**why-decision:** Same commit had both PASS and FAIL CI runs (27440686945/27440686989) — nondeterministic wall-clock from cold-JIT + scheduler preemption on 2-core runner; no shared state involved
**why-change:** no change from plan — single-line threshold fix is the only valid path given AC constraints

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-13T17:43:00Z
**task-id:** TSU-DEV-U2-GEN
**what-done:** Regenerated tool-registry.json (totalCount=157) and project-stats.json via existing generator; verified parity test 8/8 GREEN; documented ARCH-U2-2 reconciliation (brief estimated 162, actual=157)
**what-considered:**
- Trust brief's 162 estimate and force generator output to match: REJECTED — brief says "generator is the arbiter"; hardcoding violates GENERIC-FIX MANDATE
- Re-scan to find missing tools to reach 162: did scan; 156 server.tool( + 1 server.registerTool( = 157 unique; live /health also says 157; no discrepancy exists
**why-decision:** Generator output 157 == live /health 157 == grep evidence (156+1); brief's 162 was pre-sprint estimate before any cleanup occurred; current source is ground truth
**why-change:** No code changes needed — gen-tool-registry.ts and parity test already existed (commit a5b34816); only regenerated artifacts (tool-registry.json, project-stats.json) needed updating

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-13T21:59:00Z
**task-id:** FIX-BCTC-VPS-QUEUE-SYNC
**what-done:** Added MAX_404_ATTEMPTS=10 cap in bctcPdfPullJob (G1) + orphan-re-sync arm in bctcQueueEnricherJob (G2); 18 new tests pass; tsc clean; orch-state NOT touched
**what-considered:**
- Hardcode the 10 stuck ticker names and reset them by name: FORBIDDEN — GENERIC-FIX MANDATE; also fragile (new tickers would slip through)
- Cap per-ticker attempt sub-table with TTL: overkill — a named constant cap on the existing `attempts` column is sufficient; no schema change needed
- URL pattern detection (LIKE/NOT LIKE) vs VPS API probe for "is file actually cached": VPS probe would add live network dependency to enricher; pattern detection is deterministic and captures ALL placeholder URLs structurally
**why-decision:** Pattern `NOT LIKE '%/20%'` on VPS URL is the canonical programmatic set-difference: placeholder filenames never start with a date, real cached files always do; no ticker names hardcoded; covers all past+future stuck rows generically
**why-change:** No change from plan — ops diagnosis matched the code path exactly; cap=10 chosen because rows at 562 are 56x the cap already, so 10 is aggressive but appropriate to stop the hammer quickly

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-13T20:01:00Z
**task-id:** TSU-DEV-U5
**what-done:** Removed `?? 0` fabrication from `vnstockStore.ts:573` → `?? null`; updated `DailyForeignFlow.holdingRatio: number | null`; updated analyzer `isHoldingRatioFabricated` to check `=== null || === 0`; `holdingRatioChange5d` now `number | null` (null when fabricated); output gates in foreignFlowTools.ts verified; FENCE proof added to TSU-DEV-U5 test; vnstock-foreign-flow.test.ts:171 updated for new type
**what-considered:**
- Fix at store only (`?? null`) without touching output layer: FORBIDDEN per brief — output layer must gate rendering
- Keep `?? 0` in store and only fix output layer: FORBIDDEN per task dispatch ("FORBIDDEN: keeping `?? 0`")
- Change `holdingRatio: number | null` (canonical null for absent): chosen — matches DSI distinguish-absent-from-zero principle; cascades cleanly through analyzer + formatter
**why-decision:** `null` is semantically correct for "VPS API does not provide this field"; `0` could be mistaken for a genuine zero holding; FDA-9 lesson: absent-key vs present-zero must be distinguishable
**why-change:** Brief said store could keep `?? 0` but task dispatch explicitly said "carry null/undefined through"; task dispatch is authoritative; type cascade was contained to 4 files + 1 downstream test
