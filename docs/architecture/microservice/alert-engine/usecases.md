# alert-engine — Use Cases

## EvaluateAlertUseCase
- **File:** `apps/alert-engine/src/application/usecases.ts`
- **Input:** `EvaluateAlertRequest`
- **Output:** `EvaluateAlertResponse`

### DTOs

```typescript
interface EvaluateAlertRequest {
  stock: string
  severity: AlertSeverity
  message: string
  signalTypes?: string[]
  actionCode?: string
  sendTelegram?: boolean     // default false in microservice mode
}

interface EvaluateAlertResponse {
  fired: boolean
  cooldown_sec: number       // 1800 (30*60) on success
  reason: string
  fingerprint: string
}
```

### Execution Flow

1. **Compute fingerprint** from stock + signalTypes + message prefix (8-char hex)
2. **Mute check:** `mutePort.isStockMuted(stock)` → fired=false, reason="stock muted"
3. **Dedup check:** Get alerts from last 60 min, check fingerprint → fired=false, reason="duplicate"
4. **Cooldown/Cap check:** `shouldSuppressAlert()` → fired=false if suppressed
5. **Store alert:** Insert into DB with timestamp=now, sentToTelegram=0
6. **Send Telegram** (if sendTelegram=true):
   - Channel: `'market'` if severity in [critical, high], else `'work'`
   - Text format: `[SEVERITY] STOCK: message`
7. **Return:** fired=true, fingerprint, cooldown_sec=1800
