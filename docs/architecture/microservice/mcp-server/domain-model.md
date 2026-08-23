# mcp-server — Domain Model

## Core Market Data Types
**File:** `apps/mcp-server/src/domain/models/shared-types.ts`

### VnstockIntradayTick
```typescript
{ code, time (ISO), price (VND), volume, matchType: "Buy"|"Sell"|"Unknown" }
```

### VnstockEvent
```typescript
{ code, eventName, eventDate (YYYY-MM-DD), eventType: "Dividend"|"AGM"|"Share Issuance"|..., description }
```

### VnstockOrderBook
```typescript
{ code, bids: Array<{price, volume}> (top 10), asks (top 10), bidTotal, askTotal, imbalanceRatio }
```

### ShippingIndex
```typescript
{ name: "BDI"|"FBX_ASIA_US"|"SCFI", value, change, changePct, date }
```

### WeatherEvent
```typescript
{ type: "typhoon"|"flood"|"drought"|..., severity: "low"|"medium"|"high"|"critical", regions[], forecastDate, impactDuration, description }
```

### ForeignFlowUpsertItem
```typescript
{ code, date (YYYY-MM-DD), foreign_volume, foreign_room: number|null, holding_ratio: number|null, fetched_at }
```

## Signal Domain
**File:** `apps/mcp-server/src/domain/signals/`

### Signal Builder Pattern (Fluent API + Zod validation)

| Builder | Required Fields | Purpose |
|---------|----------------|---------|
| **ChainCatalystBuilder** | event_type, direction, confidence, affected_stocks[], affected_sectors[], headline, source | Cascade catalyst signals |
| **PriceConfirmationBuilder** | price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence | Price move confirmation |
| **UrgentNewsBuilder** | headline, source, severity | Breaking news alerts |
| **CrossValidateBuilder** | direction, confidence, summary | Multi-source validation |

**event_type enum:** credit_policy, trade_war, earnings, macro, legal, crisis, sector_event
**direction enum:** bullish, bearish, neutral

## Domain Services (85+)
**File:** `apps/mcp-server/src/domain/services/`

### Alert & Signal
| Service | Key Logic |
|---------|-----------|
| `alertGenerator.ts` | Severity escalation: 1 signal→inherit, 2→"high", 3+→"critical" |
| `alertDedup.ts` | Fingerprint-based deduplication |
| `alertCooldown.ts` | Rate limiting per stock |
| `signalDetector.ts` | Core signal detection engine |
| `priceAlertChecker.ts` | Price threshold monitoring |
| `customAlertEvaluator.ts` | User-defined rule evaluation |
| `alertConfidenceScorer.ts` | `deriveConfidenceFromStrength({strength, base, ceiling})` — linear interpolation between `base` (strength=0) and `ceiling` (strength=1), clamped. Pure, no I/O. Used by all 4 alert scan jobs below instead of a frozen confidence literal (FACTORY-SCHEDULER-alert-confidence-literals). |
| `bbBreakoutStrength.ts` | `computeBbBreakoutStrength({close, upper, lower})` — band-penetration ratio in [0,1]: how far `close` moved past the BB20 edge relative to the band's own width. Feeds `bbAlertScanJob`'s confidence via `BB_BREAKOUT_CONFIDENCE_{BASE,CEILING}` (alertThresholds.ts: 0.55–0.85). |
| `rsiExtremityStrength.ts` | `computeRsiExtremityStrength({rsi, direction})` — distance past the 70/30 RSI threshold, normalised to [0,1] against the remaining span to saturation (100 or 0). Feeds `taAlertScanJob`'s confidence via `RSI_EXTREME_CONFIDENCE_{BASE,CEILING}` (alertThresholds.ts: 0.55–0.85). |
| `alertThresholds.ts` | Tunable constants for alert scan jobs: `MIN_DAILY_VOLUME_FOR_ALERTS=100_000`, `NEUTRAL_BAND_PCT=2.0`, plus 4 confidence base/ceiling pairs (`FOREIGN_FLOW_*`=0.55–0.95, `INSIDER_STREAK_*`=0.60–0.95, `BB_BREAKOUT_*`=0.55–0.85, `RSI_EXTREME_*`=0.55–0.85) consumed by `alertConfidenceScorer.ts`. |

### Financial Analysis
| Service | Key Logic |
|---------|-----------|
| `baseRateComputer.ts` | Risk-free rate computation |
| `correlationCalculator.ts` | Stock correlation matrices |
| `foreignFlowAnalyzer.ts` | Foreign investor flow analysis — `DailyForeignFlow.holdingRatio: number \| null` (null = absent, VPS API does not return this field; DSI-U5 fix 2026-06-13); `ForeignFlowSignal.is_holding_ratio_fabricated: boolean` guards all render paths |
| `intradayAnalyzer.ts` | Minute-level price movement |
| `orderBookAnalyzer.ts` | Bid/ask imbalance detection |
| `sectorRotationDetector.ts` | Sector leadership rotation |
| `volatilityCalculator.ts` | Historical volatility |

### Macro & Economic
| Service | Key Logic |
|---------|-----------|
| `macroIndicatorScorer.ts` | IMF/FRED/TE SLA tracking |
| `macroIndicatorSla.ts` | Data freshness monitoring |
| `macro/carryTradeSignal.ts` | Carry trade spread signals |
| `macro/yieldSpreadSignal.ts` | US 10Y-2Y spread tracking |
| `macro/macroCalendar.ts` | Economic event calendar |
| `vnIndexPlausibilityGuard.ts` (`evaluateVnIndexPlausibility()`, FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE) | Pure guard comparing macro-indicators' reported `vnIndex` against the local `vn_index_cache` reference. Fail-closed (gap-token) only when the local reference is untrustworthy AND macro reports estimate/tier>=3; fail-open when local ref is untrustworthy but macro is tier-1; unconditional >=5% divergence check (`VNINDEX_CROSS_PLANE_DIVERGENCE_THRESHOLD_PCT`, local-denominator, inclusive) whenever the local reference is fresh, regardless of tier. Structural limit (documented in the file's own doc-comment): on macro-indicators' tier-1 happy path both planes read the SAME physical `market_prices.VNINDEX` row — catches the fixture-fallback/mislabeling incident class, cannot catch a corrupted-but-honestly-tier1-reported value (would need a live re-fetch — out of scope). |

### Specialized
| Service | Key Logic |
|---------|-----------|
| `kinhDich/` (7 services) | Hexagram backtesting, I-Ching mapping |
| `financial-reports/` | bctcValidator, ratioComputer, earningsCalendar |
| `vnTradingCalendar.ts` (`isVnTradingDay(date)`, `getTodayVnDate()`) | Pure, embedded-holiday-data VN exchange calendar. `SESSION_STATUSES = ["open","holiday","half_day","weekend","unknown"] as const` (TASK_2008a FR-A2) is the runtime SSOT `SessionStatus` is derived FROM (`typeof SESSION_STATUSES[number]`) — added because a pure TS type alias has no backing array a Zod schema/domain-check can enumerate over. Consumed by `isTradingDayTool.ts` and, as of TASK_2008a FR-A1, `emitPressureStateTool.ts`'s `EmitPressureStateDeps.computeCalendarStatusFn` default (see `system.md` § `emit_pressure_state`). |
| `tradingWindow.ts` | VN market hours: 09:00-15:30 GMT+7 Mon-Fri |
| `sparkline.ts` | ASCII price visualization |
| `stockSearch.ts` | Ticker normalization + search |
| `publishedMarkerImmunity.ts` (`isPublishedMarkerTaskId(task_id)`, UC-CCA-P3 FR-5 AC-CODE-GATE) | Pure prefix predicate — true iff `task_id` starts with `"published:"`. Zero I/O. Sole domain invariant consumed by `infrastructure/db/coordinationStore.ts`'s `releaseTask()`/`releaseOrphanTask()` — the FIRST statement of both functions refuses release UNCONDITIONALLY when this predicate is true, returning `{released:0/false, reason:"published_marker_immune"}` before any owner-match or heartbeat-staleness check runs. Code-enforced backstop after 3x prose-gate oscillation on `published:*` marker release (2026-07-02/07-03/07-15) — see `docs/architecture-briefs/2026-08-08-uc-cca-p3-published-marker-gate-skill.md` §6. |

## Cron Domain (DASH-CRON-RECHECK-TABLE, TASK-DASH-CRON-1)
**Files:** `apps/mcp-server/src/domain/cron/` — zero imports, pure (Fence-A compliant)

| Module | Export | Logic |
|--------|--------|-------|
| `cronLivenessClassifier.ts` | `classifyCronLiveness(nowMs, lastFireMs, cadenceMs, thresholdMultiplier): CronLivenessStatus` | 4-branch ladder: `null`→NEVER_FIRED; `age<=cadenceMs`→ON_TIME; `age<=cadenceMs×threshold`→LATE; `age<=cadenceMs×3`→MISSED; else STALE. Strict refinement of `schedulerWatchdogJob`'s binary healthy/alert split — guarantees AC-9 PARITY by construction. |
| `humanScheduleFormatter.ts` | `buildHumanSchedule(cronExpr): string` | Hand-rolled formatter for the ~10 cron-expression shapes in `cronConfig.ts` (every-N-min, restricted-hour window, every-N-hour, hourly-at-:MM, comma-list, daily/weekdays/weekly/monthly/quarterly HH:MM). Unrecognized shape → honest raw-expression passthrough (NFR-1, never fabricates). |

`CronLivenessStatus = "ON_TIME" | "LATE" | "MISSED" | "STALE" | "NEVER_FIRED"`

## Narrative Truth Gate Domain (CCATO-MCP-T1-DOMAIN-ENGINE)
**Files:** `apps/mcp-server/src/domain/services/narrativeTruthGate/` — zero fs/network I/O, pure.
TS port of `scripts/narrative-truth-gate.sh`'s python scan/classify/quarter-resolve engine
(CCATO = Claim Contradicts Authorized Tool Output). Full design:
`docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md` §3.2.

| Module | Export | Logic |
|--------|--------|-------|
| `claimCandidateScanner.ts` | `scanClaimCandidates(postBody, claimMap): ClaimCandidate[]`, `findTickers`, `splitParagraphs`, `splitSentences` | Sentence-split + negation-lexicon scan + dimension-keyword co-occurrence anchor + VN-ticker ([A-Z]{2,4}) extraction. Dedup: ≤1 candidate per (paragraph, dimension) — first matching sentence wins. `requires_ticker=false` dims still resolve a concrete probe ticker from the whole post. |
| `verdictClassifier.ts` | `classifyVerdict(respObj, toolNullMarkers): "NON_NULL"\|"NULL"\|"ERROR"`, `flattenText`, `summarizeVerdict` | `null`/`{_probe_error}` → ERROR; blank/marker-matched flattened text → NULL (honest gap); else NON_NULL (CCATO contradiction). |
| `quarterResolver.ts` | `resolveLatestElapsedYoyPeriods(now: Date): YoyPeriodPair` | Latest FULLY-ELAPSED fiscal quarter (Jan-Mar rolls back to prior year Q4) + its YoY comparison period, for `compare_financials`'s `ticker_actionCode_yoy` arg_style. Injectable clock. |

Input SSOT (loaded by the caller, not this layer): `docs/data/claim-tool-map.json` (`negation_lexicon`,
`dimensions[]`, `non_ticker_tokens`, `tool_null_markers`) — schema mirrored by `ClaimToolMap` in
`claimCandidateScanner.ts` (re-exported from `claimToolMapTypes.ts`). `tool_null_markers` is an
OPTIONAL field on `ClaimToolMap` (`string[] | undefined`, added by CCATO-MCP-T5-USECASE) — the
original T1 shape omitted it since `claimCandidateScanner.ts` never reads it; `verdictClassifier.ts`'s
`classifyVerdict()` does, and T5's `runNarrativeTruthGate.ts` is the caller that threads it through
(`claimMap.tool_null_markers ?? []`). SSOT loader landed:
`infrastructure/fileStore/claimToolMapLoader.ts`'s `loadClaimToolMap()` — see
`docs/architecture/microservice/mcp-server/infrastructure.md` § File Store Readers
(CCATO-MCP-T2-CLAIM-MAP-LOADER). Signal-emit writer also landed:
`infrastructure/signals/narrativeContradictionSignalWriter.ts` — see
`docs/architecture/microservice/mcp-server/infrastructure.md` § Signal Writers
(CCATO-MCP-T4-SIGNAL-WRITER). Live re-probe adapters (`infrastructure/probes/narrativeTruthProbeAdapters.ts`,
CCATO-MCP-T3-PROBE-ADAPTERS) and use-case orchestration (`application/usecases/runNarrativeTruthGate.ts`,
CCATO-MCP-T5-USECASE — see `docs/architecture/microservice/mcp-server/usecases.md` § Narrative Truth
Gate) are also landed. MCP tool registration + skill dual-path + integration DoD harness remain
separate, not-yet-landed sub-tasks (CCATO-MCP-T6-T8) of the same sprint (`SPRINT-CCATO-TRUTHGATE-MCP-NATIVE`).

## Repository Interfaces
- `IWatchlistRepository`, `IMarketPriceRepository`
- `IKinhDichScoreRepository`, `IHexagramRepository`
- `IJobRunRepository`

## Key Business Constants
- Trading window: 09:00-15:30 GMT+7 Monday-Friday
- Pre-market: 08:30 GMT+7
- VN timezone offset: 7 hours (GMT+7)
- Price drop alert default: -3%
- Price rise alert default: +5%
- Volume spike threshold: 2x 20-day average
