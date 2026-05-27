# Tool Group: kinhdich (mcp-server)

**Module path:** `src/interface/mcp/tools/kinhdich/`
**Scheduler:** none (on-demand only)
**Domain services:** `src/domain/services/kinhDich/` — hexagramLibrary, hexagramResolver, haoEncoder, nuclearComputer, transformedComputer, nguHanhClassifier, kinhDichReading, kinhDichFormatter, hexagramBacktester, kinhDichWrapper

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
