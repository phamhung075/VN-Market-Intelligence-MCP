# Stock Classification

**When to read this file:** When you need to know what sector/industry each watchlist stock belongs to, or to avoid misclassification errors (e.g. confusing VEA automotive with aviation). Load only when your task involves stock labeling, sector routing, or impact chain assignment.

---

## Watchlist Stock Classifications

| Ticker | Company | Sector | Exchange | Key Warning |
|--------|---------|--------|----------|-------------|
| VNM | Vinamilk | Retail / Dairy | HOSE | — |
| FPT | FPT Corp | Tech / IT outsourcing | HOSE | — |
| VCB | Vietcombank | Banking | HOSE | — |
| HPG | Hoa Phat Group | Steel | HOSE | NOT banking! |
| VEA | VEAM Corp | Automotive (Honda/Toyota/Ford JV) | UPCOM | NOT aviation! |

## Trade Exposure Map (revenue by geography)

```
VNM (Vinamilk) — Retail/Dairy
  Vietnam 80% | Middle East 8% (Iraq/UAE/Oman dairy exports) | ASEAN 5% | US 3% | China 2%

FPT — Tech/IT outsourcing
  Vietnam 52% | Japan 22% (IT outsourcing) | US 12% (cloud/AI) | EU 8% | Korea 2% | ASEAN 4%

VCB (Vietcombank) — Banking
  Vietnam 92% | US 3% (USD transactions, bonds) | Japan 2% (Mizuho 15% stake) | China 1%

HPG (Hoa Phat) — Steel
  Vietnam 65% | ASEAN 15% (exports) | China 5% (IMPORT iron ore/coking coal) | Australia 5% (IMPORT ore) | EU 5% (HRC exports, anti-dumping risk) | India 3%

VEA (VEAM) — Automotive
  Japan 55% (Honda VN 30%, Toyota VN 20% dividends) | US 25% (Ford VN dividends ~350B VND/yr) | Vietnam 15% (farm equipment, trucks)
```

## Reverse Map — "Which stocks does event X affect?"

```
Middle East tension/conflict:
  VNM: 8% direct (dairy exports Iraq/UAE)
  HPG: indirect (shipping, oil prices affect costs)

Japan slowdown (BOJ, GDP, yen):
  FPT: 22% direct (IT outsourcing contracts)
  VEA: 55% direct (Honda/Toyota dividends)
  VCB: 2% (Mizuho partnership)

US macro (Fed, recession, USD/VND):
  VEA: 25% (Ford dividends)
  FPT: 12% (IT services)
  VCB: 3% (USD/VND, bonds)

China (PMI, credit, trade):
  HPG: 5% import iron ore (cost exposure) + Chinese steel competition
  VNM: 2% exports

EU (ECB, anti-dumping):
  FPT: 8% IT outsourcing
  HPG: 5% HRC exports (anti-dumping tax risk)
```

## Sector Peers (for comparison analysis)

| Stock | Sector | Peer tickers |
|-------|--------|-------------|
| VCB | Banking | BID, CTG, TCB, MBB |
| FPT | Tech | CMG, ELC |
| HPG | Steel | HSG, NKG |
| VNM | Retail/Dairy | MWG, FRT, PNJ |
| VEA | Automotive | HAX, CTF, TMT |
