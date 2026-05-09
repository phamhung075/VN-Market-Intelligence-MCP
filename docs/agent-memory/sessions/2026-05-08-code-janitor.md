# Code Janitor — 2026-05-08 Session

**Cycle time:** 2026-05-08 22:16 VN

## Scan Summary

Scan ran on commits HEAD~20..HEAD (30 commits, 20-day rolling window from 2026-04-18 to 2026-05-08).

**Check results:**
- Check 1 (Duplicate classification maps): CLEAN
- Check 2 (Hard-coded ticker arrays): CLEAN
- Check 3 (Repeated magic numbers / cron duplication): CLEAN
- Check 4 (Schema duplication): CLEAN
- Check 5 (Config drift): CLEAN

## Key Findings

### Fixed since last scan (2026-05-02)

**JANITOR-020: MACRO_CODES duplication — SHIPPED**
- Status: COMPLETE (commit ca94e876, 2026-04-30)
- marketContextTools.ts no longer duplicates MACRO_CODES, section builders
- Now delegates to marketContextBuilder.js (domain layer)
- buildWatchlistSection, buildMacroSection, buildAlertsSection, buildAnalysisSection, buildSystemStatusText all imported from domain
- Test coverage: 8558 tests pass (no regression)
- Risk: RESOLVED

**JANITOR-013: SignalTypeEnum duplication — SHIPPED**
- Status: COMPLETE (commit 2adf8829, 2026-04-30)
- SignalTypeSchema now defined once in agentSignalStore.ts (SSOT)
- agentSignalTools.ts imports SignalTypeSchema directly: `import { SignalTypeSchema, type SignalType } from agentSignalStore.js`
- No re-declaration of z.enum in interface layer
- Test coverage: 8558 tests pass
- Risk: RESOLVED

**JANITOR-022: MAX_TURN_CHARS + MAX_TURNS magic numbers — SHIPPED**
- Status: COMPLETE (commit f34852b0, 2026-05-02)
- smartCompactSpawner.ts extracted 500 → MAX_TURN_CHARS, 60 → MAX_TURNS at file top
- Single-file mechanical fix
- Test: 1821b-smart-compact-tool.test.ts PASS (2 tests)
- Risk: RESOLVED

**JANITOR-023: CLAUDE_BIN duplication — SHIPPED**
- Status: COMPLETE (commit extraction to agentConstants.ts, merged 2026-05-02)
- Both smartCompactSpawner.ts and qaResponderSpawner.ts now import from ./agentConstants.js
- Single source of truth: `export const CLAUDE_BIN = "/Users/admin/.local/bin/claude"`
- Risk: RESOLVED

### Remaining backlog (unchanged since last scan)

| ID | Description | Severity | Blocker |
|----|-------------|----------|---------|
| JANITOR-011 | Puppeteer launch config dup in tradingEconomicsChromium.ts (2 locations) | LOW | No test coverage on affected paths |
| JANITOR-014 | detectUnitMultiplier + extractNumber + LOOKAHEAD_LINES duplicate in 3 extractors | MEDIUM | Three-file change; requires extractorHelpers.ts |
| JANITOR-016 | parseVnNumber copies in sscInsider.ts + muasamcong.ts | — | SHIPPED (6e2cca53) |
| JANITOR-017 | BROWSER_UA string in 18+ source files (18-file fan-out) | LOW | 18-file change across 3 layers |

## Data Quality

**Managed duplication (guarded by tests):**
- mcp.config.json:referenceStocks ↔ SECTOR_PEERS (tests 1252 + 1282 pass)

## No new violations found

All modifications in HEAD~20..HEAD maintain DRY principle:
- pollNews.ts: ALL_DARK_ALERT_COOLDOWN_MS extracted to const at module top ✓
- vpsPushLogStore.ts: safeLogVpsPush wrapper added (no duplication) ✓
- cascadeEngine.ts: DGC/DPM cascade rules added (business logic, not duplication) ✓
- marketContextBuilder.ts: MACRO_CODES remains SSOT (no drift) ✓
- cronConfig.ts: CRONS array immutable, all values sourced from Bun.env with fallbacks ✓
- agentConstants.ts: centralized CLAUDE_BIN (already shipped fix for JANITOR-023) ✓

## Scan Quality

**Knowledge load:** PASS
- fail-loud-protocol.md ✓
- janitor-procedures.md ✓
- code-janitor-known-findings.json ✓

**Test coverage:** 8558 tests passing (verified via recent commits 4cc44750, 05123e8f)

**Exit status:** CLEAN — no new violations, 4 known backlog items remain (unchanged)

---

## Scan 6 (2026-05-08 subsequent run)

**Cycle time:** 2026-05-08 subsequent (after 40ee2453, docs(tasks): move 1858c to Done)

**Scope:** Last 15 commits (HEAD~15..HEAD) including:
- 40ee2453: docs(tasks): move 1858c to Done
- 0511631d: task(1858c): add safeLogVpsPush wrapper — silent failure hardening
- 87368da6: fix(1858c): add safeLogVpsPush to prevent silent failures in VPS push handlers
- 0f01e917: fix(1858a): extend pollNews all-dark cooldown 4h→24h
- 6fd15c70: fix(1858a): extend pollNews all-dark alert cooldown from 4h to 24h
- 05123e8f + earlier

**Check results:**
- Check 1 (Duplicate classification maps): CLEAN
- Check 2 (Hard-coded ticker arrays): CLEAN — ticker strings found only in rules/tests (expected)
- Check 3 (Repeated magic numbers): CLEAN — constants properly named and distinct
- Check 4 (Schema duplication): CLEAN — vnstock_trading_stats migration is acceptable (not production DDL)
- Check 5 (Config drift): CLEAN

**Key observations:**
- JANITOR-023 (CLAUDE_BIN duplication): VERIFIED SHIPPED
  - Both smartCompactSpawner.ts and qaResponderSpawner.ts now import from ./agentConstants.js
  - agentConstants.ts defines `export const CLAUDE_BIN = "/Users/admin/.local/bin/claude"`
  - Commit: b836f129 (merge), 56a8851e (actual fix)
  - Previous state file marked this as "proposed" — UPDATE: mark as "shipped"

- No new duplication patterns detected in recent commits
- All constants follow naming discipline
- safeLogVpsPush wrapper (1858c) is a new function, not duplication

**Exit status:** CLEAN — 0 new findings | JANITOR-023 status update needed
