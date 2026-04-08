# Position Schema — User Position Ledger

**When to read this file:** When implementing or analyzing position management features, position-aware analysis blocks, or the `/set_position` / `/check_position` command flow. Load only when your task touches positions, P/L, stop-loss, or the position ledger.

---

## Commands

| Command | Syntax | Effect |
|---------|--------|--------|
| Set/update position | `/set_position TICKER PRICE QTY` | qty > 0 = buy, qty < 0 = sell, `0 0` = clear position |
| Check position | `/check_position` | Show current holdings with P/L, stop-loss suggestion, TP ladder |

---

## Position Ledger Rules

### Buying (qty > 0)
- Avg cost = weighted average across all buy entries
- Formula: `avg_cost = (old_qty * old_avg_cost + new_qty * new_price) / (old_qty + new_qty)`
- Emit explanation: "Mua thêm {qty} @ {price} → avg cost mới: {new_avg_cost}"

### Selling (qty < 0)
- Clamped to current holdings: cannot sell more than you own
- If qty_sell > holdings → clamp to holdings, emit explanation: "Chỉ bán được {holdings} (không đủ số lượng)"
- Avg cost updates on partial sell (remove portion, keep weighted avg)
- Emit explanation: "Bán {qty} @ {price} → còn lại {remaining} @ {avg_cost}"
- **No realized P/L tracking** — only current holdings matter

### Clear position (`0 0`)
- Removes all entries for that ticker
- Emit explanation: "Đã xóa toàn bộ vị thế {TICKER}"

---

## Position-Aware Analysis Block

Included in every analysis that touches a held stock. Fields:

```
Vị thế {TICKER}:
  Avg cost:     {avg_cost} VND
  Current price: {price} VND
  P/L:          {pct}% ({vnd} VND)
  Stop-loss:    {stop_loss} VND  (see computation below)
  TP ladder:    +10% @ {tp1}, +20% @ {tp2}, +30% @ {tp3}
  24h action:   HOLD / BUY_MORE / SELL_PARTIAL / EXIT
  Kinh Dịch:    {hexagram_name} — {1-line signal}
```

---

## Stop-Loss Computation

Computed implicitly by server (not stored explicitly):

```
stop_loss = max(
  entry_price - 2 * ATR14,
  nearest_support,
  avg_cost * 0.93   ← hard floor: never more than 7% below avg cost
)
```

- `ATR14` = 14-day Average True Range for the ticker
- `nearest_support` = most recent swing low in price history
- Result is the tightest (highest) of the three values

---

## TP Ladder

```
TP1 = avg_cost * 1.10   (10% gain)
TP2 = avg_cost * 1.20   (20% gain)
TP3 = avg_cost * 1.30   (30% gain)
```

Agents include these levels in any analysis touching a held stock.

---

## Configuration

Alert thresholds for position-danger live in `mcp.config.json` under `alertPolicy` section. See `.claude/knowledge/alert-policy.md` for the full alert firing rules.

---

## MCP Tools for Position Management

- `set_position(ticker, price, qty)` — create/update/clear
- `get_positions()` — read all current holdings
- `close_position(ticker)` — alias for set_position(ticker, 0, 0)
- `get_portfolio_risk()` — VaR, max drawdown per position
- `get_portfolio_conviction()` — cross-signal validation per position
