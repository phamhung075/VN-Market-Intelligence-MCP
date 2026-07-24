# Decision Journal — Sprint FACTORY-DOMAIN-extract-sentiment-lexicons · dev-mcp-server

**Sprint goal:** Extract sentiment lexicon + negation tables from sentimentClassifier into a dedicated data module (pure data/logic separation, behavior-preserving).
**Agent:** dev-mcp-server
**Started:** 2026-07-24T03:23:59Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T03:23:59Z
**task-id:** FACTORY-DOMAIN-extract-sentiment-lexicons
**what-done:** Investigated `apps/mcp-server/src/domain/services/sentimentClassifier.ts` — identified DATA (VN_BULLISH/VN_BEARISH/EN_BULLISH/EN_BEARISH keyword-weight tables + derived ALL_BULLISH/ALL_BEARISH, FLIP_NEGATION_TOKENS/SOFT_NEGATION_TOKENS/NEGATION_WINDOW negation scope tables, SentimentKeyword interface) vs LOGIC (tokenize, findOccurrences, currentSentenceBefore, detectNegation, classifySentiment — all stay).
**what-considered:**
- New file location `domain/data/sentimentLexicons.ts` (task's suggested example path) vs sibling `domain/services/sentimentLexicons.ts`.
- Checked repo convention: `domain/services/vnHolidayData.ts` and `domain/services/stockAliases/catalog.ts` are existing data modules living as siblings inside `domain/services/`, not in a `domain/data/` subfolder — no `domain/data/` directory exists anywhere in the codebase.
**why-decision:** Mirrored the LIVE convention (`domain/services/<name>.ts` sibling data module) over the task's illustrative example path — task text says "mirror any existing data-module pattern in the codebase," which takes priority over the "e.g." suggestion.
**why-change:** No change from plan otherwise — pure verbatim move, byte-diffed old vs new table literals (Python regex comparison) to prove zero-drift before touching the classifier import.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T03:23:59Z
**task-id:** FACTORY-DOMAIN-extract-sentiment-lexicons
**what-done:** Also moved ALL_BULLISH/ALL_BEARISH (the longest-first sorted merge) and NEGATION_WINDOW into the data module rather than leaving them in the classifier.
**what-considered:**
- Leave ALL_BULLISH/ALL_BEARISH derivation (spread+sort) in classifier since it's "computed", only move raw VN/EN tables.
- Leave NEGATION_WINDOW in classifier since it parameterizes the detectNegation algorithm.
**why-decision:** ALL_BULLISH/ALL_BEARISH is still pure data preparation (a merge+sort of the same static tables, deterministic, no algorithm/text-scanning logic) — grouping it with the lexicon tables keeps the classifier free of any table-shape knowledge. Task text explicitly calls NEGATION_WINDOW a "scope rule" alongside negation word tables, so it was extracted with FLIP_NEGATION_TOKENS/SOFT_NEGATION_TOKENS as part of the negation table, not the negation-application algorithm (which remains 100% in `detectNegation`).
**why-change:** No change from plan.
