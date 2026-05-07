# kinh-dich-service — Infrastructure

## SQLiteKinhDichRepository
- **File:** `apps/kinh-dich-service/src/infrastructure/repositories.ts`

### getLatestReading(stockCode)
```sql
SELECT hexagram_number, bien_que_number, trading_signal, confidence
FROM kinhdich_readings
WHERE stock_code = ?
ORDER BY timestamp DESC LIMIT 1
```

### getMarkovData(hexagramNumber)
```sql
SELECT next_hexagram, next_name, probability
FROM hexagram_markov
WHERE from_hexagram = ?
ORDER BY probability DESC LIMIT 1
```

## SQLitePriceScoreRepository
- **File:** `apps/kinh-dich-service/src/infrastructure/repositories.ts`

### computeScores(stockCode, days)
```sql
SELECT close, volume FROM price_history
WHERE code = ? ORDER BY date DESC LIMIT ?
```

**6-Dimension Score Computation (all clamped to [-1, 1]):**

| Dimension | Name | Formula | Scale |
|-----------|------|---------|-------|
| D1 | Short-term momentum | last 5d avg vs prev 5d avg | x10 |
| D2 | Fundamentals proxy | last price vs 30d average | x5 |
| D3 | Technical | last session change | x20 |
| D4 | Foreign flow proxy | volume trend (recent 5 vs prev 5) | x2 |
| D5 | Sector proxy | price vs first-half average | x3 |
| D6 | Macro proxy | 0.5*D2 + 0.5*D1 | composite |

## Database Tables Used
- `kinhdich_readings`: stockCode, hexagram_number, bien_que_number, trading_signal, confidence, timestamp
- `hexagram_markov`: from_hexagram, next_hexagram, next_name, probability
- `price_history`: code, date, close, volume (for score computation)

## Environment Variables
```
PORT    → 5005
DB_PATH → ./data/market.db (readonly)
```
