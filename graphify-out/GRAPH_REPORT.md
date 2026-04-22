# Graph Report - .  (2026-04-22)

## Corpus Check
- 678 files · ~500,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 102 nodes · 99 edges · 32 communities detected
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.84)
- Token cost: 114,987 input · 2,500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]

## God Nodes (most connected - your core abstractions)
1. `Cascade Detection Pattern` - 7 edges
2. `TECH-1278: Insider Dump Sentiment Cascade` - 6 edges
3. `TECH-1279: MSCI Index Inclusion Cascade` - 6 edges
4. `REQ-1279: MSCI Index Inclusion Cascade Detection` - 5 edges
5. `TECH-1281: Agriculture Weather Cascade` - 5 edges
6. `msciDetector.ts` - 5 edges
7. `agricultureDetector.ts` - 5 edges
8. `DDD Compliance Rule` - 5 edges
9. `REQ-1278: Insider Dump Sentiment Cascade` - 4 edges
10. `cascadeExecutor.ts` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Sprint 1278: Insider Dump Sentiment Cascade` --references--> `TECH-1278: Insider Dump Sentiment Cascade`  [EXTRACTED]
  docs/ARCH_REVIEW_1278.md → docs/TECH_1278.md
- `Cascade Detection Pattern` --pattern_of--> `MSCI_INCLUSION_RULES`  [INFERRED]
  docs/TECH_1278.md → docs/TECH_1279.md
- `Cascade Detection Pattern` --pattern_of--> `AGRICULTURE_WEATHER_RULES`  [INFERRED]
  docs/TECH_1278.md → docs/TECH_1281.md
- `Performance Target <50ms keyword detection` --rationale_for--> `Cascade Detection Pattern`  [INFERRED]
  docs/TECH_1279.md → docs/TECH_1278.md
- `Keyword Whole-Word Matching Pattern` --pattern_of--> `agricultureDetector.ts`  [INFERRED]
  docs/TECH_1279.md → docs/TECH_1281.md

## Communities

### Community 0 - "Community 0"
Cohesion: 0.18
Nodes (15): Agent Memory System, agricultureDetector.ts, cascadeExecutor.ts, DDD Compliance Rule, DDD Layer Violations Pattern, Domain Service Pure Logic Principle, Forecast Penalty -0.2 to Credibility, Task 1278b GREEN Phase (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (14): Test Baseline 6171 to 6187 (+16 assertions), cascadeEngine.ts, Confidence Formula: min(1.0, cred × count / 3.0), Credibility Threshold 0.7 for MSCI, Task 1279b GREEN Phase, Large-Cap Cross-Sector Targeting (not peer cascade), MSCI_INCLUSION_RULES, Task 1279a RED Phase (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (14): AGRICULTURE_WEATHER_RULES, Banking Sector Contagion Logic, Blockers in REQ-1281, Cascade Detection Pattern, Task 1281b GREEN Phase, INSIDER_DUMP_RULES, Performance Target <50ms keyword detection, Task 1281a RED Phase (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.24
Nodes (3): calcQoQ(), calcYoY(), getMetricValue()

### Community 4 - "Community 4"
Cohesion: 0.53
Nodes (5): esc(), generateQueDataEntry(), normaliseAction(), normaliseOutcome(), parseHexagram()

### Community 5 - "Community 5"
Cohesion: 0.67
Nodes (3): fetch_with_browser(), parse_rss(), Parse RSS XML into item list.

### Community 6 - "Community 6"
Cohesion: 0.5
Nodes (4): Sprint 054 Complete, feat(get_pipeline_health): System diagnostics MCP tool, feat(bbAlertScanJob): Bollinger Band breakout scanner, test(1309): Bollinger Band alert coverage

### Community 7 - "Community 7"
Cohesion: 1.0
Nodes (0): 

### Community 8 - "Community 8"
Cohesion: 1.0
Nodes (2): Insider Dump Sentiment Bearish, Sentiment Bullish (opposite insider bearish)

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (2): test(france-summary-cron): TDD test written FIRST, fix(france-summary-cron): widen cron to */30 6-8 UTC

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (2): fix(foreign-flow-sentinel): filter 9999999 sentinel value, fix(foreign-flow-validator): DDD layer violation + server.ts integration

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (2): Market Watch Report — 2026-04-01, GREEN: Briefing Quality Gate Verification + Test Suite Completion

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (2): test(hut-sector-reclassify): HUT real_estate → construction, fix(1406): HUT sector reclassification

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): test(diacritics-wave5): Vietnamese string localization, fix(1416): Diacritics localization implementation

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (2): feat(morning-briefing-bctc-deadlines): Earnings calendar section, fix(1422): Morning briefing BCTC deadlines implementation

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (2): feat(maybe-deploy-vps.sh): VPS auto-deploy gate, docs(dev-standards): Step 4a VPS deploy gate

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (2): fix(volume-spike-multiplier): Per-ticker adaptive thresholds, fix(1402): ATC guard boundary safeguard

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (1): Security Review: No SQL Injection Risk

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (1): Backward Compatibility Guarantee

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (1): fix(evening-summary-vnindex-db-read): VNINDEX fresh/stale logic

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (1): fix(1432): GREEN implementation

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (1): QA Verification: e2e health polling + SLA escalation

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (1): fix(scheduler-locks-schema): DDL table + index

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (1): fix(timezone-hardcoding): Test fixture relative dates

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (1): fix(checkpoint-restart-mode): PRAGMA wal_checkpoint(RESTART)

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (1): fix(db-isolation-batch5): Bulk Bun.env DB_PATH replacement

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): docs(agent-roster + mcp-tools): Ops agent introduction

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): test(ohlcv-aggregator): TDD RED tests for runOhlcvDailyAggregator

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (1): fix(278-cycle-peer-sync): DB isolation + stub functions

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): fix(franceSummaryJob-catchup): Startup missed-send recovery

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): refactor(legacy-cleanup): Delete src/server.ts + src/tools/ stubs

## Knowledge Gaps
- **14 isolated node(s):** `Parse RSS XML into item list.`, `Agent Memory System`, `Session 2026-04-22 Morning Work`, `Sentiment Bullish (opposite insider bearish)`, `Performance Target <50ms keyword detection` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 7`** (2 nodes): `shutdown()`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (2 nodes): `Insider Dump Sentiment Bearish`, `Sentiment Bullish (opposite insider bearish)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (2 nodes): `test(france-summary-cron): TDD test written FIRST`, `fix(france-summary-cron): widen cron to */30 6-8 UTC`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (2 nodes): `fix(foreign-flow-sentinel): filter 9999999 sentinel value`, `fix(foreign-flow-validator): DDD layer violation + server.ts integration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (2 nodes): `Market Watch Report — 2026-04-01`, `GREEN: Briefing Quality Gate Verification + Test Suite Completion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `test(hut-sector-reclassify): HUT real_estate → construction`, `fix(1406): HUT sector reclassification`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `test(diacritics-wave5): Vietnamese string localization`, `fix(1416): Diacritics localization implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `feat(morning-briefing-bctc-deadlines): Earnings calendar section`, `fix(1422): Morning briefing BCTC deadlines implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `feat(maybe-deploy-vps.sh): VPS auto-deploy gate`, `docs(dev-standards): Step 4a VPS deploy gate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `fix(volume-spike-multiplier): Per-ticker adaptive thresholds`, `fix(1402): ATC guard boundary safeguard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `purge-phantom-reports.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `Security Review: No SQL Injection Risk`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `Backward Compatibility Guarantee`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `fix(evening-summary-vnindex-db-read): VNINDEX fresh/stale logic`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `fix(1432): GREEN implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `QA Verification: e2e health polling + SLA escalation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `fix(scheduler-locks-schema): DDL table + index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `fix(timezone-hardcoding): Test fixture relative dates`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `fix(checkpoint-restart-mode): PRAGMA wal_checkpoint(RESTART)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `fix(db-isolation-batch5): Bulk Bun.env DB_PATH replacement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `docs(agent-roster + mcp-tools): Ops agent introduction`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `test(ohlcv-aggregator): TDD RED tests for runOhlcvDailyAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `fix(278-cycle-peer-sync): DB isolation + stub functions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `fix(franceSummaryJob-catchup): Startup missed-send recovery`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `refactor(legacy-cleanup): Delete src/server.ts + src/tools/ stubs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.