# alert-engine — Testing

## Unit Tests
**File:** `apps/alert-engine/src/__tests__/unit/alert-engine.test.ts`

| Test | Assertion |
|------|-----------|
| computeFingerprint deterministic | Same input → same 8-char hex |
| computeFingerprint order-independent | signalTypes sorted before hash |
| computeFingerprint stock-dependent | Different stock → different hash |
| shouldSuppressAlert cooldown | Recent matching alert → suppress |
| shouldSuppressAlert daily cap | 3+ alerts today → suppress |
| shouldSuppressAlert critical bypass | Critical non-MACRO → no suppression |
| shouldSuppressAlert MACRO rules | Critical MACRO → follows normal rules |
| isDuplicate empty list | Returns false |
| isDuplicate membership | Known fingerprint → true |
| EvaluateAlertUseCase fire | Store + return fired=true |
| EvaluateAlertUseCase mute | Muted stock → fired=false |
| EvaluateAlertUseCase dedup | Duplicate fingerprint → fired=false |
| EvaluateAlertUseCase telegram | sendTelegram=true → TelegramPort.send called |

## Integration Tests
**File:** `apps/alert-engine/src/__tests__/integration/alert-handlers.test.ts`

| Test | Assertion |
|------|-----------|
| GET /health | 200 |
| POST /evaluate (fire) | 200, fired=true |
| POST /evaluate (suppressed) | 200, fired=false |
| POST /evaluate (validation) | 400 on missing fields |
| POST /evaluate (invalid JSON) | 400 |
| Stock code uppercased | Input normalization |

## Run Commands
```bash
cd apps/alert-engine && bun test
cd apps/alert-engine && bun tsc --noEmit
```
