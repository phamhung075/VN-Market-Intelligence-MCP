# Portfolio Schema — Stock Classification & Position Ledger

**Load when:** stock labeling, sector routing, impact chain assignment, position management, position-aware analysis, `/set_position`, `/check_position`, P/L, stop-loss.

---

## Stock Classification

### Watchlist Stocks

| Ticker | Company | Sector | Exchange | Warning |
|--------|---------|--------|----------|---------|
| VNM | Vinamilk | Retail / Dairy | HOSE | — |
| FPT | FPT Corp | Tech / IT outsourcing | HOSE | — |
| VCB | Vietcombank | Banking | HOSE | — |
| HPG | Hoa Phat Group | Steel | HOSE | NOT banking! |
| VEA | VEAM Corp | Automotive (Honda/Toyota/Ford JV) | UPCOM | NOT aviation! |

### Trade Exposure (revenue by geography)

| Ticker | Breakdown |
|--------|-----------|
| VNM | Vietnam 80% \| Middle East 8% (Iraq/UAE/Oman dairy) \| ASEAN 5% \| US 3% \| China 2% |
| FPT | Vietnam 52% \| Japan 22% (IT outsourcing) \| US 12% (cloud/AI) \| EU 8% \| Korea 2% \| ASEAN 4% |
| VCB | Vietnam 92% \| US 3% (USD/bonds) \| Japan 2% (Mizuho 15% stake) \| China 1% |
| HPG | Vietnam 65% \| ASEAN 15% (exports) \| China 5% (IMPORT ore/coal) \| Australia 5% (IMPORT ore) \| EU 5% (HRC, anti-dumping risk) \| India 3% |
| VEA | Japan 55% (Honda VN 30%, Toyota VN 20% dividends) \| US 25% (Ford VN ~350B VND/yr) \| Vietnam 15% (farm equipment, trucks) |

### Reverse Map — Event → Affected Stocks

| Event | Stocks | Exposure |
|-------|--------|----------|
| Middle East tension | VNM (8% direct dairy), HPG (indirect shipping/oil costs) | — |
| Japan slowdown (BOJ/yen) | FPT (22% IT contracts), VEA (55% Honda/Toyota dividends), VCB (2% Mizuho) | — |
| US macro (Fed/USD) | VEA (25% Ford dividends), FPT (12% IT), VCB (3% USD/bonds) | — |
| China (PMI/trade) | HPG (5% iron ore import cost + Chinese steel competition), VNM (2% exports) | — |
| EU (anti-dumping) | FPT (8% IT), HPG (5% HRC exports — anti-dumping tax risk) | — |

### Sector Peers

| Stock | Sector | Peers |
|-------|--------|-------|
| VCB | Banking | BID, CTG, TCB, MBB |
| FPT | Tech | CMG, ELC |
| HPG | Steel | HSG, NKG |
| VNM | Retail/Dairy | MWG, FRT, PNJ |
| VEA | Automotive | HAX, CTF, TMT |

---

## Position Schema — User Position Ledger

### Commands

| Command | Syntax | Effect |
|---------|--------|--------|
| Set/update | `/set_position TICKER PRICE QTY` | qty>0=buy, qty<0=sell, `0 0`=clear |
| Check | `/check_position` | Holdings with P/L, stop-loss, TP ladder |

### Ledger Rules

**Buying (qty > 0)**
- `avg_cost = (old_qty * old_avg_cost + new_qty * new_price) / (old_qty + new_qty)`
- Emit: "Mua them {qty} @ {price} → avg cost moi: {new_avg_cost}"

**Selling (qty < 0)**
- Clamp to current holdings (cannot oversell)
- If qty_sell > holdings → clamp, emit: "Chi ban duoc {holdings} (khong du so luong)"
- Emit: "Ban {qty} @ {price} → con lai {remaining} @ {avg_cost}"
- No realized P/L tracking — only current holdings matter

**Clear (`0 0`):** removes all entries, emit: "Da xoa toan bo vi the {TICKER}"

### Position-Aware Analysis Block

```
Vi the {TICKER}:
  Avg cost:      {avg_cost} VND
  Current price: {price} VND
  P/L:           {pct}% ({vnd} VND)
  Stop-loss:     {stop_loss} VND
  TP ladder:     +10% @ {tp1}, +20% @ {tp2}, +30% @ {tp3}
  24h action:    HOLD / BUY_MORE / SELL_PARTIAL / EXIT
  Kinh Dich:     {hexagram_name} — {1-line signal}
```

### Stop-Loss Computation (server-side, never stored)

```
stop_loss = max(
  entry_price - 2 * ATR14,    <- 14-day Average True Range
  nearest_support,             <- most recent swing low
  avg_cost * 0.93              <- hard floor: max 7% below avg cost
)
```

### TP Ladder

```
TP1 = avg_cost * 1.10   (10%)
TP2 = avg_cost * 1.20   (20%)
TP3 = avg_cost * 1.30   (30%)
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| `set_position(ticker, price, qty)` | Create/update/clear |
| `get_positions()` | Read all holdings |
| `close_position(ticker)` | Alias for set_position(ticker, 0, 0) |
| `get_portfolio_risk()` | VaR, max drawdown per position |
| `get_portfolio_conviction()` | Cross-signal validation per position |

Alert thresholds for position-danger → `mcp.config.json` `alertPolicy`. Full rules → `.claude/knowledge/telegram-alerts.md`
