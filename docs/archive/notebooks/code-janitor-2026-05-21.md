# Code Janitor — Archive (pre-trim)
Archived from 183-line notebook 2026-05-21.

## Session 19 (2026-05-13 — Full codebase scan)

**Scope:** Commits HEAD~20..HEAD; all 5 DRY checks executed.

**Result:** 1 new finding (proposed for backlog); 0 shipped; backlog stable at 9 items.

| Check | Result | Notes |
|-------|--------|-------|
| Classification maps | 0 findings | All ticker→sector maps in canonical sources |
| Ticker arrays | 1 finding | LARGE_CAP_FALLBACK (cascadeExecutor.ts:194) vs MAJOR_CAPS (priceSourceRouter.ts:53): overlapping lists, different membership, different semantic purposes. Not strict dup (domain review needed). Propose JANITOR-034. |
| Magic numbers / crons | 1 recurrent | JANITOR-027: MS_PER_DAY in 21 files (already proposed multi-file refactoring) |
| Schema duplication | 0 findings | All DDL canonical in schema-*.ts |
| Config drift | 0 findings | All fallback patterns safe; no mismatches |

**Proposed:** JANITOR-034 — large-cap ticker list duplication (low priority, requires domain design decision)

**Quality:** Full

## Shipped fixes (cumulative — snapshot)

| ID | Description | Commit |
|----|-------------|--------|
| JANITOR-004 | COMPANY_SHORT_NAME dup display-name map in watchlist.ts | 9c9fc6e6 |
| JANITOR-005 | IMF_HISTORICAL_BASELINE magic number in 3 files | 4c2d83d3 |
| JANITOR-007 | SEVERITY_VI inline in 5 sector tool files | b60cbf2d |
| JANITOR-008 | Log-rotation 10485760 in 10 VPS shell scripts | 54bb7e3b |
| JANITOR-009 | SEVERITY_VI diacritics copy in alertCheckTools.ts | pending |
| JANITOR-014 | detectUnitMultiplier + LOOKAHEAD_LINES + extractNumber — extracted to extractorHelpers.ts | c77dde79 / 830a4962 |
| JANITOR-016 | Private parseVnNumber copies in sscInsider.ts + muasamcong.ts | 6e2cca53 |
| JANITOR-021 | BROWSER_FETCH_TIMEOUT_MS (30000) inlined 4x in discoverBctcPdfUrlBrowser.ts | b33d6856 |
| JANITOR-022 | DBC domain classification: added to agriculture sector in stock-classification.json | TBD |
| JANITOR-023 | CLAUDE_BIN extracted to agentConstants.ts, imported by smartCompactSpawner.ts + qaResponderSpawner.ts | b836f129 |
| JANITOR-024 | DEDUP_WINDOW_SECONDS inlined in isDuplicateReport default parameter | dd2e6b82 |
| JANITOR-025 | GEO_BLOCKED_BREAKER_CONFIG for reuters + tradingEconomics in circuitBreakerRegistry.ts | 61c2cc9b |
| JANITOR-026 | SqliteVnstockRepository _callStore<T> helper extracted — 9 methods | 75f73af3 |
| JANITOR-033 | analysisAgentCount 9→8 in docs/data/project-stats.json | 2026-05-10 |

## Cumulative Metrics (snapshot)

- **Total scans:** 17 (+ 1 housekeeping session)
- **Violations found:** 27 (shipped 14, proposed 9, managed 4; 0 new in scan 17 + c81)
- **Ship-directly success rate:** 52% (14 shipped / 27 found)
- **Backlog density:** 33% (9 open / 27 found)
- **Managed (test coverage):** 15% (4 managed / 27 found)
- **Recurring violations:** 1 (JANITOR-027 multi-file refactoring, flagged again in scan 17 but already proposed)
