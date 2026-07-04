# alert-engine — Use Cases

**Language:** Go 1.22 | **Package:** `pkg/application/`

## EvaluateAlertUseCase — thin adapter over `alert_pipeline.Pipeline`

**FACTORY-ALERT-consolidate-dual-engines (2026-07-04):** `EvaluateAlertUseCase`
no longer contains its own mute/dedup/cooldown/store/telegram orchestration.
It is a thin DTO-mapping adapter over the tested
`pkg/module/alert_pipeline.Pipeline` (see `docs/architecture/microservice/alert-engine/testing.md`
and `pkg/module/alert_pipeline/pipeline.go`), which is the single source of
truth for evaluation logic. Two engines used to duplicate this logic with
several behavioral divergences — all reconciled below.

- **File:** `apps/alert-engine/pkg/application/evaluate.go`
- **DTOs:** `apps/alert-engine/pkg/application/dtos.go`
- **Input:** `EvaluateAlertRequest`
- **Output:** `EvaluateAlertResponse`
- **Delegate:** `alertpipeline.Pipeline.Run(ctx, domain.AlertRequest, time.Now())`
  — the adapter is the one place in the request path allowed to read the wall
  clock; the pipeline itself stays deterministic (`now` injected).

### DTOs

```go
type EvaluateAlertRequest struct {
    Stock        string   `json:"stock"`
    Severity     string   `json:"severity"`
    Message      string   `json:"message"`
    SignalTypes  []string `json:"signalTypes,omitempty"`
    ActionCode   string   `json:"actionCode,omitempty"`
    SendTelegram bool     `json:"sendTelegram,omitempty"` // default false (openapi.yaml)
}

type EvaluateAlertResponse struct {
    Fired        bool   `json:"fired"`
    CooldownSec  int    `json:"cooldown_sec"`
    Reason       string `json:"reason"`
    Fingerprint  string `json:"fingerprint"`
    AlertID      string `json:"alert_id"`      // "" when not fired
    Code         string `json:"code"`          // echo of normalised stock
    TelegramSent bool   `json:"telegram_sent"`
}
```

### Execution Flow (delegated to `Pipeline.Run`)

1. **Classify severity** — `signal-classifier` primitive; invalid → fired=false (defense-in-depth; the HTTP layer already rejects invalid severities before `Execute` is called, so this only matters for non-HTTP/future direct callers).
2. **Build fingerprint** — `dedup-key-builder` primitive (stock + sorted signalTypes + message prefix, 8-char DJB2 hex).
3. **Dedup check** — `AlertRepositoryPort.HasDuplicateFingerprint` (60min-equivalent window = `cfg.CooldownMinutes`) → fired=false, reason="duplicate: fingerprint seen recently".
4. **Cooldown/cap check** — `cooldown-gate` primitive over `GetRecentAlerts` → fired=false if suppressed.
5. **Mute check** — `MutePort.IsStockMuted` → fired=false, reason="muted: stock is muted".
6. **Store the alert** — `AlertRepositoryPort.StoreAlert`. **Fired = gates passed AND recorded — independent of Telegram delivery** (see Reconciliation below).
7. **Format message** — `[SEVERITY] STOCK: message`.
8. **Route to Telegram** — only when `req.sendTelegram=true`; channel from the classifier (`critical`/`high`→market, `medium`/`low`→work). Any port error or skip is treated as `telegram_sent=false`, never fails the request.
9. **Return** `EvaluateAlertResponse` — `cooldown_sec` is always `cfg.CooldownMinutes*60` (a constant window value, not reason-dependent); `alert_id` is `""` unless fired.

### Reconciliation record (two engines → one)

Before this task, `EvaluateAlertUseCase.Execute` contained a full second inline
orchestration ("Engine B") that duplicated `alert_pipeline.Pipeline` ("Engine
A", the tested primary — `pipeline_test.go`) with these divergences, now
resolved by making `Pipeline` the single implementation and reconciling its
behavior to the documented `api/openapi.yaml` contract:

| Divergence | Old Engine B (discarded) | Old Engine A (as tested) | Reconciled (now live) |
|---|---|---|---|
| Order | mute→dedup→cooldown→store→telegram | classify→dedup→cooldown→mute→format→telegram→store | classify→dedup→cooldown→mute→**store**→format→telegram. Read-only checks (dedup/cooldown/mute) only affect which `reason` string wins when multiple conditions overlap simultaneously (rare edge case) — `fired` outcome is unaffected. |
| Store timing | before telegram, always on fire | after telegram, only if `sent==true` | **before telegram, always once gates pass** (matches B's safety property + the `fired`/`telegram_sent` contract in openapi.yaml — a Telegram outage or missing credentials can never re-open the dedup/cooldown window for a signal that already fired) |
| Severity validation | none (any string used) | invalid → not fired | kept (A) — dead-in-practice on the HTTP path (already filtered by `router.go`), but protects direct/future non-HTTP callers |
| `sendTelegram` opt-out | honored (default false) | none — always routed | **honored** — added `domain.AlertRequest.SendTelegram`; `Pipeline.Run` only calls `TelegramPort.Send` when true |
| Telegram error handling | swallowed (`_ = err`) | propagated as a pipeline error (→ HTTP 500) | **swallowed** (B's behavior) — the real `TelegramClient.Send` never returns a non-nil error in practice (see `infrastructure/telegram.go`), so this is a defensive no-op change with zero live risk |
| Channel routing | inline switch (critical/high→market, else work) | `signal-classifier` primitive | classifier (A) — byte-identical routing table to B's switch for all valid severities |
| `cooldown_sec` on mute-suppressed responses | `0` (inconsistent with all other branches, which returned `1800`) | not modeled | **fixed to the constant `cfg.CooldownMinutes*60`** on every branch — matches openapi.yaml ("Cooldown window in seconds applied to this stock"); no caller/test asserted the old `0` |
| Response shape | richer `EvaluateAlertResponse` (`alert_id`, `code`, `telegram_sent`) | `Result{Fired,Fingerprint,Channel,Reason}` | `Result` extended with `CooldownSec`, `AlertID`, `TelegramSent`; adapter still returns `EvaluateAlertResponse` unchanged for callers (`router.go`) |

No caller outside `apps/alert-engine/` was found to depend on the Go
microservice's `/evaluate` response shape or reason strings (`clients.ts`
declares `ALERT_ENGINE_URL` but has no `evaluateAlert` wrapper; TS scheduler
jobs write to a separate local `alertStore.ts`, not this service) — this
pilot microservice's `/evaluate` endpoint is currently only exercised by its
own Go test suite and `cmd/sandbox` scenarios.
