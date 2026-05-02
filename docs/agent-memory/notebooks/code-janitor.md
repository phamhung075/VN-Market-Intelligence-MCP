# Code Janitor Notebook

## Last updated: 2026-05-02

## State summary

### Shipped fixes (cumulative)

| ID | Description | Commit |
|----|-------------|--------|
| JANITOR-004 | COMPANY_SHORT_NAME dup display-name map in watchlist.ts | 9c9fc6e6 |
| JANITOR-005 | IMF_HISTORICAL_BASELINE magic number in 3 files | 4c2d83d3 |
| JANITOR-007 | SEVERITY_VI inline in 5 sector tool files | b60cbf2d |
| JANITOR-008 | Log-rotation 10485760 in 10 VPS shell scripts | 54bb7e3b |
| JANITOR-009 | SEVERITY_VI diacritics copy in alertCheckTools.ts | pending |
| JANITOR-014 | detectUnitMultiplier + LOOKAHEAD_LINES + extractNumber — extracted to extractorHelpers.ts | c77dde79 / 830a4962 |
| JANITOR-016 | Private parseVnNumber copies in sscInsider.ts + muasamcong.ts | 6e2cca53 |

### Open backlog

| ID | Description | Blocker |
|----|-------------|---------|
| JANITOR-011 | Puppeteer launch config dup in tradingEconomicsChromium.ts | No test coverage on affected paths |
| JANITOR-013 | SignalTypeEnum re-lists SignalType union (two-file change) | Two-file change |
| JANITOR-017 | BROWSER_UA string in 18 source files (18-file fan-out) | 18-file fan-out across 3 layers |
| JANITOR-020 | MACRO_CODES + section-builder logic parallel impl in marketContextBuilder.ts vs marketContextTools.ts | Two-file change; marketContextTools.ts must delegate to domain builder |

### Managed (monitored by tests)

| ID | Description |
|----|-------------|
| mcp.config.json:referenceStocks | Duplicate of SECTOR_PEERS — guarded by 1252 + 1282 tests |

## Notes for next scan

- JANITOR-020: Task 1563 (Sprint 226) created marketContextBuilder.ts as DDD extraction — but marketContextTools.ts was never updated to use it. Good candidate when a developer touches either file.
- JANITOR-013: small two-file change — good candidate if a developer is already touching agentSignalStore.ts
- JANITOR-011: unblockable until puppeteer paths get integration test coverage
- Next scan: watch for any new private number-parsing copies in infrastructure/fetchers
