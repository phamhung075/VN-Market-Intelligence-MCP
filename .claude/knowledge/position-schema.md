# Position Schema — User Position Ledger

**Load when:** position management, position-aware analysis, `/set_position`, `/check_position`, P/L, stop-loss.

## Commands

| Command | Syntax | Effect |
|---------|--------|--------|
| Set/update | `/set_position TICKER PRICE QTY` | qty>0=buy, qty<0=sell, `0 0`=clear |
| Check | `/check_position` | Holdings with P/L, stop-loss, TP ladder |

## Ledger Rules

**Buying (qty > 0)**
- `avg_cost = (old_qty * old_avg_cost + new_qty * new_price) / (old_qty + new_qty)`
- Emit: "Mua thêm {qty} @ {price} → avg cost mới: {new_avg_cost}"

**Selling (qty < 0)**
- Clamp to current holdings (cannot oversell)
- If qty_sell > holdings → clamp, emit: "Chỉ bán được {holdings} (không đủ số lượng)"
- Emit: "Bán {qty} @ {price} → còn lại {remaining} @ {avg_cost}"
- No realized P/L tracking — only current holdings matter

**Clear (`0 0`):** removes all entries, emit: "Đã xóa toàn bộ vị thế {TICKER}"

## Position-Aware Analysis Block

```
Vị thế {TICKER}:
  Avg cost:      {avg_cost} VND
  Current price: {price} VND
  P/L:           {pct}% ({vnd} VND)
  Stop-loss:     {stop_loss} VND
  TP ladder:     +10% @ {tp1}, +20% @ {tp2}, +30% @ {tp3}
  24h action:    HOLD / BUY_MORE / SELL_PARTIAL / EXIT
  Kinh Dịch:     {hexagram_name} — {1-line signal}
```

## Stop-Loss Computation (server-side, never stored)

```
stop_loss = max(
  entry_price - 2 * ATR14,    ← 14-day Average True Range
  nearest_support,             ← most recent swing low
  avg_cost * 0.93              ← hard floor: max 7% below avg cost
)
```

## TP Ladder

```
TP1 = avg_cost * 1.10   (10%)
TP2 = avg_cost * 1.20   (20%)
TP3 = avg_cost * 1.30   (30%)
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `set_position(ticker, price, qty)` | Create/update/clear |
| `get_positions()` | Read all holdings |
| `close_position(ticker)` | Alias for set_position(ticker, 0, 0) |
| `get_portfolio_risk()` | VaR, max drawdown per position |
| `get_portfolio_conviction()` | Cross-signal validation per position |

Alert thresholds for position-danger → `mcp.config.json` `alertPolicy`. Full rules → `.claude/knowledge/alert-policy.md`
