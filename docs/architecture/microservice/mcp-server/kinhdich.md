# Tool Group: kinhdich (mcp-server)

**Module path:** `src/interface/mcp/tools/kinhdich/`
**Scheduler:** none (on-demand only)
**Domain services:** `src/domain/services/kinhDich/` — hexagramLibrary, hexagramResolver, haoEncoder, nuclearComputer, transformedComputer, nguHanhClassifier, kinhDichReading, kinhDichFormatter, hexagramBacktester, kinhDichWrapper
**Application services:** `src/application/services/kinhDich/kinhDichScoring.ts` — the 6 hào score-computation
functions (`computeSentimentScore`, `computeFundamentalsScore`, `computePriceScore`,
`computeForeignFlowScore`, `computeSectorScore`, `computeMacroScore`, plus `tickerJitter`,
`computeHaoScores`, `computeMacroIndicatorScore`). Moved here (FACTORY-INTERFACE-move-kinhdich-ta-scoring-down,
2026-07-24) out of `kinhDichTools.ts` — they read `market.db` directly (via `getDb()` /
`IKinhDichScoreRepository`), so they don't satisfy `domain/services`' pure-no-I/O convention;
application layer orchestrates infra + computation instead (same pattern as
`application/services/imfConvictionBridge.ts`). Still NOT migrated to the separate
kinh-dich-service HTTP microservice (AC-8, task 285) — this is an internal-to-mcp-server layering
move only.

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_kinhdich_reading` | Full hexagram reading for current market state | ticker?, context? | kinh-dich-service (HTTP) |
| `get_market_hexagram` | Quick hexagram + Ngu Hanh for market | — | kinh-dich-service (HTTP) |
| `get_transition_probabilities` | Markov transition probs from current hexagram | hexagram_id | market.db (hexagram_transitions) |
| `run_hexagram_backtest` | Backtest hexagram predictions vs actual price moves | lookback_days | hexagramBacktester domain svc |

---

## Invariants

1. Input to hexagram: always 6 signals (binary: yin/yang).
2. 64 hexagrams in library — static data, never changes.
3. Ngu Hanh (Five Elements): Kim (Metal), Moc (Wood), Thuy (Water), Hoa (Fire), Tho (Earth). Classification rules: `docs/references/kinh-dich-layer.md`.
4. Nuclear hexagram: computed from lines 2-5 of original hexagram.
5. Transformed hexagram: computed from changing lines (moving yao).
6. Backtesting accuracy tracked in `market.db` (kinhdich_readings table with outcome fields).
7. Hexagram Markov transitions: historical `hexagram_transitions` table populated by `run_hexagram_backtest` and live readings.

## Error handling — genuine data errors → BUG channel (KD-OBS-01-FIX)

All 5 catch blocks that carry HTTP/DB risk (`get_kinhdich_reading`, `get_market_hexagram`,
`get_hexagram_history`, `get_transition_probabilities`, `run_hexagram_backtest`) plus the 3
kinh-dich HTTP route handlers (`handleKinhDichReading`, `handleGetKinhDichSignals`,
`handleKinhDichMarket` — `src/interface/mcp/routes/`) call
`notifyKinhDichError(source, category, detail)` (`src/interface/mcp/tools/kinhdich/kinhDichErrorNotify.ts`)
in addition to `logger.error(...)` before returning their graceful error response:

- Fire-and-forget (`void notifyError(...)`) — never awaited on the response-critical path, never
  throws (Telegram/DB failures inside are swallowed), matching the non-fatal Telegram-send
  pattern used by `accuracyDigestJob.ts`.
- Routes to `sendTelegramBug()` (BUG channel). The message embeds a `📋 <category>` marker
  (e.g. `kinhdich-reading-error`, `kinhdich-market-route-error`) that `sendTelegramBug()`'s
  built-in 4h dedup (`telegramReportStore.isDuplicateReport`) uses to collapse repeated failures
  of the same kind into one BUG report — no extra dedup machinery needed here.
- Both `registerKinhDichTools(server, notifyError?)` and each of the 3 route handlers accept an
  optional injectable `notifyError` param (defaults to the real notifier) for testability.
- **Explicitly out of scope** (benign, not errors): `appendMarketHexagram`/`appendStockHexagram`
  in `src/interface/mcp/tools/market-data/marketTools.ts` catch kinh-dich-service
  unreachable/non-200 and silently omit the hexagram block by design (`logger.warn` only) — this
  is the documented degrade-gracefully path, not a silently-dropped error.
- Tests: `src/__tests__/KD-OBS-01-FIX-kinhdich-bug-notify.test.ts`.
