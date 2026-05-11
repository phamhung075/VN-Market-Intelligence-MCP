# alert-engine — Domain Model

## Types

### AlertSeverity & TelegramChannel
```typescript
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
type TelegramChannel = 'market' | 'work' | 'bug'
```

### AlertRequest
```typescript
interface AlertRequest {
  stock: string
  severity: AlertSeverity
  message: string
  signalTypes?: string[]
  actionCode?: string
}
```

### CooldownConfig
```typescript
interface CooldownConfig {
  cooldownMinutes: number          // default 30
  maxAlertsPerStockPerDay: number  // default 3
}
```

### StoredAlert (DB record)
```typescript
interface StoredAlert {
  id?: number
  stocks: string
  signalTypes: string              // CSV format
  message: string
  fingerprint: string              // 8-char hex (DJB2 hash)
  severity: AlertSeverity
  triggeredAt: string              // ISO timestamp
  sentToTelegram: number           // 0|1
}
```

### EvaluateAlertResult
```typescript
interface EvaluateAlertResult {
  fired: boolean
  cooldown_sec: number
  reason: string
  fingerprint?: string
}
```

## Repository Ports

### AlertRepositoryPort
```typescript
interface AlertRepositoryPort {
  getRecentAlerts(stock: string, withinMinutes: number): StoredAlert[]
  countTodayAlerts(stock: string): number
  storeAlert(alert: Omit<StoredAlert, 'id'>): number
  hasDuplicateFingerprint(fingerprint: string, withinMinutes: number): boolean
}
```

### MutePort
```typescript
interface MutePort {
  isStockMuted(stock: string): boolean
}
```

### TelegramPort
```typescript
interface TelegramPort {
  send(channel: TelegramChannel, text: string): Promise<boolean>
}
```

## Domain Service Functions
- **File:** `apps/alert-engine/src/domain/services.ts`

### computeFingerprint(alert)
- Uses DJB2 hash: `djb2(stock|sorted(signalTypes)|message[0:50])`
- Returns 8-char hex string (deterministic)

### shouldSuppressAlert(alert, recentAlerts, config)
**Suppression rules (checked in order):**

1. **Critical bypass:** severity='critical' AND actionCode!='MACRO' → **no suppression**
2. **Cooldown window:** For each recent alert in window (default 30 min):
   - If stocks match AND signal overlap → **suppress**
   - Signal overlap = empty signalTypes OR any signal in common
3. **Daily cap:** count >= maxAlertsPerStockPerDay (default 3) → **suppress**

Returns `{ suppress: boolean, reason: string }`

### isDuplicate(fingerprint, recentFingerprints)
Simple array membership check within 60-minute window.

## Error Classes
- `AlertEngineError` (base)
- `AlertSuppressedError(reason)` — message: "Alert suppressed: {reason}"
