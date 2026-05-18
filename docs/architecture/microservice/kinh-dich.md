# Microservice: kinh-dich

**Language:** TypeScript / Bun
**Port:** 5005 (external + internal)
**Service directory:** `apps/kinh-dich-service/`
**Role:** Kinh Dich (I Ching / Book of Changes) hexagram readings and trading signals. Takes 6 market signals → hexagram encoding → reading + Markov transition probabilities → confidence-scored trading interpretation.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | `apps/kinh-dich-service/src/domain/services.ts` | QUE_META (64 hexagrams with Vietnamese names), TRIGRAMS, HAO encoding, classifyHao, computeReading, classifyNguHanh. Self-contained — no mcp-server dependency. |
| application | `apps/kinh-dich-service/src/application/usecases.ts` | ReadingUseCase (live scores → reading; fallback to stored hexagram), MarketHexagramUseCase |
| infrastructure | `apps/kinh-dich-service/src/infrastructure/repositories.ts` | SQLitePriceScoreRepository queries `market_prices_history` (price col + fetched_at); SQLiteKinhDichRepository reads kinhdich_readings + hexagram_markov |
| interface | `apps/kinh-dich-service/src/interface/handlers.ts` | GET /reading/:code, GET /market, GET /health |

---

## Tool Surface

Kinh Dich tools live in mcp-server. See `docs/architecture/microservice/mcp-server/kinhdich.md` for: `get_kinhdich_reading`, `get_market_hexagram`, `get_transition_probabilities`, `run_hexagram_backtest`.

Kinh Dich layer rules: `docs/references/kinh-dich-layer.md`

---

## Upstream Dependencies (data in)

| Source | How |
|--------|-----|
| mcp-server | 6 market signals passed as HTTP request params |
| `market.db` | Readonly: hexagram_transitions (Markov data), kinhdich_readings (history) |

---

## Downstream Dependencies (calls out)

None. Leaf service.

---

## Database Write Authority

None. Reads `market.db` with `readonly:true`. mcp-server writes hexagram readings and transitions to market.db (schema-macro.ts slice: kinhdich_readings, hexagram_transitions tables).

---

## Known Invariants

1. Input: always exactly 6 signals → one hexagram (6 lines).
2. Ngu Hanh (Five Elements) classifier maps hexagram lines to Kim/Moc/Thuy/Hoa/Tho for trading context.
3. Markov transition probabilities: lookup from `hexagram_markov` table (historical transitions).
4. Default layer: see `docs/references/kinh-dich-layer.md` for which layer is active.
5. Price score source: `market_prices_history` table (columns: code, price, fetched_at). Requires ≥6 rows per stock.
6. Fallback path: when price data is insufficient, `ReadingUseCase` uses the stored hexagram number from `kinhdich_readings` and resolves the correct Vietnamese name via `QUE_META`. The `name` field always corresponds to the `hexagram` number in the response.
7. Hexagram names: `QUE_META` in `domain/services.ts` uses full Vietnamese diacritics (e.g. "Kiển" for #39, "Sư" for #7) — the authoritative source is `hexagramLibrary.ts` in mcp-server.
