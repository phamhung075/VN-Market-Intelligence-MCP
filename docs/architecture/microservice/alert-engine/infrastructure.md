# alert-engine — Infrastructure

**Language:** Go 1.22 | **Package:** `pkg/infrastructure/`

## SQLite Schema

### alert_engine_records
```sql
CREATE TABLE IF NOT EXISTS alert_engine_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stocks        TEXT NOT NULL,
  signal_types  TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL DEFAULT '',
  fingerprint   TEXT NOT NULL DEFAULT '',
  severity      TEXT NOT NULL DEFAULT 'medium',
  triggered_at  TEXT NOT NULL,
  sent_telegram INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_alert_engine_stocks ON alert_engine_records(stocks, triggered_at);
CREATE INDEX idx_alert_engine_fingerprint ON alert_engine_records(fingerprint, triggered_at);
```

### alert_mutes
```sql
CREATE TABLE IF NOT EXISTS alert_mutes (
  stock       TEXT PRIMARY KEY,
  muted_until TEXT NOT NULL
);
```

## SQLiteAlertRepository
- **File:** `apps/alert-engine/pkg/infrastructure/sqlite.go`
- WAL mode + single-writer — `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000`

### GetRecentAlerts(stock, withinMinutes)
```sql
SELECT id, stocks, signal_types, message, fingerprint,
       severity, triggered_at, sent_telegram
FROM alert_engine_records
WHERE stocks = ? AND triggered_at >= datetime('now', '-N minutes')
ORDER BY triggered_at DESC
```

### CountTodayAlerts(stock)
```sql
SELECT COUNT(*) FROM alert_engine_records
WHERE stocks = ? AND triggered_at >= datetime('now', 'start of day')
```

### StoreAlert(alert)
```sql
INSERT INTO alert_engine_records
  (stocks, signal_types, message, fingerprint, severity, triggered_at, sent_telegram)
VALUES (?, ?, ?, ?, ?, ?, ?)
```
Returns `lastInsertId`

### HasDuplicateFingerprint(fingerprint, withinMinutes)
```sql
SELECT COUNT(*) FROM alert_engine_records
WHERE fingerprint = ? AND triggered_at >= datetime('now', '-N minutes')
```

## SQLiteMuteRepository

### IsStockMuted(stock)
```sql
SELECT muted_until FROM alert_mutes WHERE stock = ?
```
Returns true if `muted_until > now`

## TelegramClient
- **File:** `apps/alert-engine/pkg/infrastructure/telegram.go`
- Implements `domain.TelegramPort`

### Send(ctx, channel, text)
1. Resolve chatID: market→TELEGRAM_INFO_MARKET_GROUP_ID, work→TELEGRAM_INFO_WORK_CHANNEL_ID, bug→TELEGRAM_REPORT_BUG_CHANNEL_ID
2. If no token or chatID → return false, nil (silent skip AC-13)
3. POST `https://api.telegram.org/bot{token}/sendMessage`
4. Body: `{ chat_id, text, parse_mode: "HTML" }`
5. Returns `resp.StatusCode >= 200 && < 300`

## Environment Variables
```
PORT                           → 5006
DB_PATH                        → ./data/market.db (readonly reads)
ALERT_ENGINE_DB_PATH           → ./data/alert_engine.db (WRITE)
TELEGRAM_BOT_TOKEN             → (secret)
TELEGRAM_INFO_MARKET_GROUP_ID  → (chat id)
TELEGRAM_INFO_WORK_CHANNEL_ID  → (chat id)
TELEGRAM_REPORT_BUG_CHANNEL_ID → (chat id)
```

## Log Schema
See `apps/alert-engine/README-log-schema.md` for full field list and examples.
