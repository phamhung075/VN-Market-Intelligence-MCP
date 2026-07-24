# Decision Journal — Sprint FACTORY-DOMAIN-split-newsNormalizer · dev-mcp-server

**Sprint goal:** Split newsNormalizer.ts (1086L at pickup) into sibling TYPES/TABLES/HELPERS modules — behavior-preserving.
**Agent:** dev-mcp-server
**Started:** 2026-07-24T03:56:33Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T03:56:33Z
**task-id:** FACTORY-DOMAIN-split-newsNormalizer
**what-done:** Split `newsNormalizer.ts` into `newsNormalizerTypes.ts` (4 type aliases + `AnalysisEntry`), `newsNormalizerTables.ts` (8 keyword/lookup data tables), `newsNormalizerHelpers.ts` (14 pure helper functions incl. `ALL_CATALOG_CODES`). Main file kept to `normalizeNews()` orchestration only, re-exporting the pre-split public surface (`decodeHtmlEntities`, `truncateAt120`, `buildDecisionResume`, `DOMAIN_VN_LABEL`, 4 types, `AnalysisEntry`) so all ~50 existing import call sites are untouched.
**what-considered:**
- Mirror sentimentLexicons.ts precedent (data-only extraction, types/helpers stay) — rejected: task explicitly asked for TYPES + HELPERS + DATA TABLES all extracted, broader than the sentiment precedent.
- Put `ALL_CATALOG_CODES` in the tables file (literal data) vs. co-locate with `extractStockTickers` in helpers — chose helpers: it's a derived cache (`Object.keys(STOCK_CATALOG)`) tightly coupled to one consumer, not a hand-authored lookup table.
- Sibling-file naming: `newsNormalizer{Types,Tables,Helpers}.ts` prefix-shared in `domain/services/` (not a `data/` subfolder) — matches the live FACTORY-DOMAIN-extract-sentiment-lexicons convention this session.
**why-decision:** Byte-diffed every table/interface/function body old-vs-new (14/14 functions, all 8 tables, full `AnalysisEntry`, `normalizeNews()` itself) — zero drift. Re-export chain in the main file means zero call-site churn across ~50 files.
**why-change:** No change from task brief.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T03:56:33Z
**task-id:** FACTORY-DOMAIN-split-newsNormalizer
**what-done:** Verified behavior preservation: `bun tsc --noEmit` clean; ran the full 50-file newsNormalizer-touching test set before AND after the split — identical `575 pass / 0 fail / 1166 expect() calls`. `gen-project-stats.ts --dry-run` static probe unaffected (toolCount 184, cronJobCount 88 — domain-layer split, no tool/cron registration touched).
**what-considered:**
- Full `bun test` (whole suite) per generic G12 gate vs. scoped newsNormalizer test set per task's explicit override — chose scoped set: task brief explicitly named this as the correct proof and flagged host resource conservation given concurrent mcp-server memory pressure this session.
- Server-boot probe (Gate 2b) — explicitly skipped per task brief (pure code split, no runtime wiring touched).
**why-decision:** Task brief is more specific than the generic zone flow for this dispatch; byte-diff evidence + identical test counts is stronger behavior-preservation proof than a boot probe for a pure domain-layer file split.
**why-change:** No change from task brief.
