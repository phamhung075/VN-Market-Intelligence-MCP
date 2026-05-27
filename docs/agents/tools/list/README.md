# MCP Tools Documentation Index

**Location:** `docs/agents/tools/list/`
**Format:** Markdown reference files (one file per tool category)
**Last Updated:** 2026-05-05

---

## Categories & Files

### Financial-Reports (~20 tools across 5 categories)

**File:** `financial-reports.md`

| Tool | Purpose | Type |
|------|---------|------|
| `get_bctc_full` | Comprehensive BCTC snapshot + comparison + sentiment | Compound tool |
| `get_earnings_calendar` | Filing deadlines & status for all watchlist stocks | Calendar tool |
| `bctc_skip_queue_item` | Mark VPS queue item as skipped (PDF not found) | Queue mgmt |
| `run_bctc_batch_sweep` | Batch fetch BCTC for all (or custom list) tickers | Batch processing |
| `fetch_ssc_reports` | Legacy — use `get_bctc_full` instead | Deprecated |

**Key Concepts:**
- All monetary values in **million VND** (displayed as tỷ VND = billions)
- Comparison logic: QoQ or YoY, auto-selects prior period
- Sentiment trend: 30-day OLS slope from rag_analyses
- Vietnamese status labels: ĐÃ NỘP, QUÁ HẠN, SẮP ĐẾN, (ước tính)

---

### Kinh Dich (I-Ching) (~10 tools)

**File:** `kinhdich.md`

| Tool | Purpose | Type |
|------|---------|------|
| `get_kinhdich_reading` | Full hexagram reading (stock-specific) | Divination |
| `get_market_hexagram` | Market-wide hexagram (VN-Index + macro) | Market analysis |
| `get_hexagram_history` | Timeline of readings over N days | Timeline |
| `get_transition_probabilities` | Markov transitions (hex → next hex) | Markov analysis |
| `run_hexagram_backtest` | Accuracy test of trading signals vs prices | Backtesting |
| `explain_hexagram` | Full Vietnamese explanation (hex 1-64) | Reference |

**Key Concepts:**
- **6 Hao (lines):** Sentiment, fundamentals, price, foreign flow, sector, macro
- **64 hexagrams:** Different market conditions (1-64)
- **Jitter handling:** Deterministic per-stock jitter when data absent (prevents convergence)
- **Best-effort scoring:** All missing data → 0.0 (neutral); real signals always used if available
- **Markov transitions:** Predicts next hexagram + win rate
- **Vietnamese output:** All labels, explanations, and trading context in Vietnamese

---

### Backtesting (~6 tools)

**File:** `backtesting.md`

| Tool | Purpose | Type |
|------|---------|------|
| `run_backtest` | Execute backtest for a strategy on date range | Execution |
| `get_backtest_runs` | List completed backtest runs (with filtering) | Query |
| `get_backtest_run` | Retrieve full details of one backtest | Detail |
| `delete_backtest_run` | Delete backtest by UUID (irreversible) | Cleanup |
| `export_backtest_run_csv` | Export trades as CSV for spreadsheet | Export |
| `compare_backtest_runs` | Compare 2+ backtests side-by-side | Analysis |

**Key Concepts:**
- **3 strategies:**
  - `kinh-dich-high-confidence` (confidence ≥ 0.7)
  - `kinh-dich-all` (all signals)
  - `combined-high-confidence` (Kinh Dich + TA confirmation)
- **Metrics:** Total return, max drawdown, Sharpe ratio, win rate, per-ticker breakdown
- **Data requirement:** 6+ months OHLCV (use `ohlcv_backfill` if sparse)
- **Mutex:** Only 1 backtest per instance (queuing supported)
- **Equity curve:** Daily equity stored as JSON array

---

### Analysis & Sequential Thinking (~2 tools)

**File:** `analysis.md`

| Tool | Purpose | Type |
|------|---------|------|
| `sequential_market_analysis` | Step-by-step reasoning for complex analysis | Thinking tool |
| `sequential_thinking` | Generic step-by-step (planned) | Planned |

**Key Concepts:**
- **5 analysis types:** `causal_chain`, `bctc_deep_dive`, `signal_verification`, `portfolio_risk`, `hypothesis_test`
- **Features:** Branching, revision, hypothesis tracking, confidence scoring
- **State tracking:** Session-scoped (in-memory, not persisted to DB)
- **Thought progression:** Sequential numbering, dynamic total estimate, revision support
- **Branching:** Create bull/bear/base scenarios, merge into final hypothesis

---

## Tool Count Summary

| Category | Count | Status |
|----------|-------|--------|
| Financial-Reports | 5 (4 active + 1 deprecated) | ✓ Complete |
| Kinh Dich | 6 | ✓ Complete |
| Backtesting | 6 | ✓ Complete |
| Analysis | 2 (1 active + 1 planned) | ✓ Core complete |
| **Total** | **~19 documented** | **✓ All documented** |

---

## Quick Reference by Use Case

### I Need a BCTC Snapshot

→ `get_bctc_full` (one call, 3 sections)

### I Need Filing Deadlines for All My Stocks

→ `get_earnings_calendar`

### I Want a Market Reading (Hexagram)

→ `get_kinhdich_reading` (stock) or `get_market_hexagram` (market)

### I Want to Test a Trading Strategy

→ `run_backtest` (kinh-dich-high-confidence or combined-high-confidence)

### I Need to Explain a Hexagram to a User

→ `explain_hexagram` (1-64)

### I Need Step-by-Step Thinking for a Complex Decision

→ `sequential_market_analysis` (causal_chain, bctc_deep_dive, signal_verification, etc.)

### I Have a Batch of Tickers to Fetch BCTC For

→ `run_bctc_batch_sweep` (concurrent, 5 at a time)

---

## Database Tables

### Financial-Reports Domain

- `financial_reports` — BCTC data
- `bctc_vps_queue` — VPS fetch queue
- `rag_analyses` — Sentiment for trends

### Kinh Dich Domain

- `kinhdich_readings` — Stored hexagram readings
- `kinhdich_transitions` — Markov transition frequencies

### Backtesting Domain

- `backtest_signals` — Trading signals
- `backtest_prices` — OHLCV data
- `backtest_results` — Completed backtest runs

---

## Error Codes & Messages

### Missing Data

```
Chưa có dữ liệu BCTC cho VCB. Kiểm tra bằng list_stored_pdfs.
Danh sách theo dõi trống (Thêm cổ phiếu vào watchlist để xem lịch nộp BCTC)
Chưa có lịch sử quẻ Kinh Dịch cho VCB trong 30 ngày qua. Chạy get_kinhdich_reading trước.
```

### Invalid Input

```
Lỗi: VCB không có trong watchlist. Thêm cổ phiếu trước khi đọc Kinh Dịch.
Lỗi: Quẻ 99 không tồn tại. Quẻ Kinh Dịch chỉ có số từ 1 đến 64.
Error: Strategy not found: invalid-strategy-id
```

### Queue/Mutex Issues

```
Queue item not found: FPT 2025 Q1
Error: Backtest already running. Please wait or delete the running instance.
```

---

## Vietnamese Standards

- **Timestamps:** UTC with Vietnamese labels in output
- **Dates:** DD/MM/YYYY in user display, YYYY-MM-DD in JSON
- **Monetary:** Displayed as "tỷ VND" (billions), stored as million VND
- **Percentages:** Decimal representation (0.1523 = 15.23%)
- **Sectors:** 16 sectors from stock-classification.json (banking, steel, etc.)

---

## Key Design Patterns

### Dependency Injection

All tools accept optional `_testDb` parameter:

```typescript
registerBctcFullTools(server, _testDb?: Database)
```

Enables unit testing without real DB.

### Best-Effort Scoring

All hao computations wrap in try/catch; missing data → 0.0 (neutral).

```typescript
function computeSentimentScore(code: string): number {
  try {
    // ...
    return value;
  } catch {
    return 0.0;  // Default on any error
  }
}
```

### Jitter Handling

When raw score is exactly 0.0:

```typescript
const jitter = tickerJitter(code, hao_seed);
const final = score === 0.0 ? jitter : score;
```

Deterministic, small (|jitter| ≤ 0.089), prevents convergence.

### Mutex Pattern (Backtesting)

Only 1 backtest per instance:

```typescript
if (isRunning) return { error: "Already running" };
```

Other requests queue or fail gracefully.

---

## Testing Strategy

### Unit Tests

- Mock DB with in-memory SQLite (Bun.env.DB_PATH = ":memory:")
- Inject test data directly
- Test edge cases (empty data, missing columns, invalid inputs)

### Integration Tests

- Use real test database
- Populate fixtures (watchlist, market_prices, rag_analyses)
- Verify end-to-end flows

### Performance Tests

- Backtest with 2+ years data × 30 tickers
- Verify Sharpe calculation accuracy
- Check CSV export time

---

## Related Documentation

- **MCP Tool Specs:** `docs/standards/mcp-tools.md` (full signatures)
- **Stock Classification:** `docs/{policies,protocols,standards,references}/stock-classification.md` (16 sectors)
- **Kinh Dich Logic:** `docs/references/kinh-dich-layer.md` (architecture)
- **BCTC Extraction:** `docs/protocols/bctc-extraction-runbook.md` (VPS pipeline)
- **Alert Policy:** `docs/policies/alert-policy.md` (Telegram integration)

---

## Maintenance & Updates

### Adding a New Tool

1. Write TypeScript handler in `apps/mcp-server/src/interface/mcp/tools/<category>/`
2. Register on McpServer instance
3. Add documentation to `/docs/agents/tools/list/<category>.md`
4. Update MCP tool count in this README
5. Test with injected DB

### Updating Docs

1. Reflect actual return signatures
2. Update parameter tables
3. Add examples if behavior changed
4. Verify Vietnamese labels match code

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-05 | Initial documentation: 5 categories, ~19 tools |

---

## Questions & Support

- **Tool signature mismatch?** Check `apps/mcp-server/src/interface/mcp/tools/<category>/index.ts`
- **DB schema changed?** Verify `infrastructure/db/schema.js` and migration scripts
- **Backtest not running?** Check `backtest_results` table for queue status
- **Kinh Dich score wrong?** Enable debug logging in hao computation functions

