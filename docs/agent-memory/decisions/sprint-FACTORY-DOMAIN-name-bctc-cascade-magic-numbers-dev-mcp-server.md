# Decision Journal — Sprint FACTORY-DOMAIN-name-bctc-cascade-magic-numbers · dev-mcp-server

**Sprint goal:** Replace VAS row-code guard magic numbers + BCTC-cascade broadcast-floor magic numbers with named constants (readability-only, values byte-identical).
**Agent:** dev-mcp-server
**Started:** 2026-07-24T04:29:10Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T04:29:10Z
**task-id:** FACTORY-DOMAIN-name-bctc-cascade-magic-numbers
**what-done:** Source-grepped `apps/mcp-server/src` for "cascade"/"broadcast"/"VAS"/"guard" to locate the two magic-number families before touching any code (no fabrication).
**what-considered:**
- VAS row-code guard: found in `domain/services/financial-reports/lib/lineScan.ts` (canonical, shared by `balanceSheetExtractor.ts` via `rowCodeGuard` option + `findValueByCode`) — literal `val >= 10 && val <= 990 && val % 10 === 0` repeated 3× in one file.
- Broadcast-floor: found in `domain/services/cascadeEngine.ts` (Step 3b market-wide broadcast gate, Task 162) — literal default `6` for `broadcastMinImpact`, duplicated as the same fallback default in 2 application-layer call sites (`runImpactChain.ts`, `pollNews.ts`) that load it from `mcp.config.json`'s `alerts.marketWideCascadeMinImpact`.
**why-decision:** Both are the SAME domain concept repeated verbatim (not distinct concepts sharing a coincidental value) — named a single SSOT constant per family and imported it at the 2 duplicate application-layer sites rather than re-declaring separately, per task's own "don't over-consolidate distinct concepts" guidance read in reverse (these ARE the same concept, so DO consolidate). Kept `VAS_ROW_CODE_MIN` (lower bound) and `VAS_ROW_CODE_STEP` (multiples-of increment) as 2 separate named constants even though both equal 10, since they are genuinely distinct domain facts (range floor vs. numbering increment) per the task's explicit instruction not to conflate different meanings.
**why-change:** No change from plan — pure rename/extract, zero logic change, verified via identical `bun test` pass counts before/after on every touched-domain test file + `bun tsc --noEmit` clean.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T04:29:10Z
**task-id:** FACTORY-DOMAIN-name-bctc-cascade-magic-numbers
**what-done:** Named constants added, values verified byte-identical, evidence captured.
**what-considered:** N/A — mechanical extraction only.
**why-decision:**
- `lineScan.ts`: `VAS_ROW_CODE_MIN = 10`, `VAS_ROW_CODE_MAX = 990`, `VAS_ROW_CODE_STEP = 10` — replace all 3 inline `val >= 10 && val <= 990 && val % 10 === 0` occurrences (in `findValue`'s `isGuarded` + `findValueByCode`'s Form A + Form B checks).
- `cascadeEngine.ts`: `export const DEFAULT_BROADCAST_MIN_IMPACT = 6` placed just above `buildCausalChain`, replacing the inline `broadcastMinImpact ?? 6` fallback; `runImpactChain.ts` and `pollNews.ts` now import it and use it for both their `let broadcastMinImpact = ...` initial default AND their `cfg.alerts?.marketWideCascadeMinImpact ?? ...` fallback (previously 2 separate hardcoded `6` literals per file × 2 files = 4 literals + 1 in cascadeEngine.ts = 5 total, now 1 declaration + 4 references).
**why-change:** No change from plan.
