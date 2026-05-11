# Microservice: kinh-dich

**Language:** TypeScript / Bun
**Port:** 5005 (external + internal)
**Service directory:** `apps/kinh-dich-service/`
**Role:** Kinh Dich (I Ching / Book of Changes) hexagram readings and trading signals. Takes 6 market signals → hexagram encoding → reading + Markov transition probabilities → confidence-scored trading interpretation.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | `src/domain/services/kinhDich/` (in mcp-server — shared logic) | hexagramLibrary.ts (64 hexagrams), hexagramResolver.ts, haoEncoder.ts, nuclearComputer.ts, transformedComputer.ts, nguHanhClassifier.ts (Five Elements: Kim/Moc/Thuy/Hoa/Tho), kinhDichReading.ts, kinhDichFormatter.ts, hexagramBacktester.ts, kinhDichWrapper.ts |
| infrastructure | `market.db` (readonly: kinhdich_readings, hexagram_transitions tables via hexagramStore.ts in mcp-server) | Markov transition probability lookup |
| interface | HTTP endpoints | Called by mcp-server for readings |

---

## Tool Surface

Kinh Dich tools live in mcp-server. See `docs/architecture/microservice/mcp-server/kinhdich.md` for: `get_kinhdich_reading`, `get_market_hexagram`, `get_transition_probabilities`, `run_hexagram_backtest`.

Kinh Dich layer rules: `.claude/knowledge/kinh-dich-layer.md`

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
3. Markov transition probabilities: lookup from `hexagram_transitions` table (historical transitions).
4. Default layer: see `.claude/knowledge/kinh-dich-layer.md` for which layer is active.
5. Backtesting (`hexagramBacktester.ts`): measures hexagram prediction accuracy vs actual price moves.
