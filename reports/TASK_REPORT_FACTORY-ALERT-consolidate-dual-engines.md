# Task Report: FACTORY-ALERT-consolidate-dual-engines — Consolidate dual alert-evaluation engines

date: 2026-07-04
outcome: **APPROVED**
scope: apps/alert-engine/ (Go microservice) — working tree UNCOMMITTED at review time, dispatcher commits on PASS.

## What changed

`application.EvaluateAlertUseCase.Execute` is now a thin DTO-mapping adapter over
`pkg/module/alert_pipeline.Pipeline` (the tested primary engine). `cmd/server/main.go`
no longer discards the constructed Pipeline (`_ = alertpipeline.New(...)` removed) — it
is now actually wired in and used. The previously-duplicated inline orchestration in
`EvaluateAlertUseCase` ("Engine B" — mute→dedup→cooldown→store→telegram, untested,
was the one actually live in production) is retired; `alertpipeline.Pipeline` ("Engine A",
tested via `pipeline_test.go`, previously wired but discarded) becomes the single
implementation, with its `Run()` reconciled to match the documented `api/openapi.yaml`
contract.

12 dirty files, all under `apps/alert-engine/`: `cmd/sandbox/main.go`, `cmd/server/main.go`,
`pkg/application/{dtos.go,evaluate.go,evaluate_test.go}`, `pkg/domain/models.go`,
`pkg/infrastructure/{sqlite.go,telegram.go}`, `pkg/interface/http/{router.go,router_test.go}`,
`pkg/module/alert_pipeline/{pipeline.go,pipeline_test.go}`. Additionally 4 architecture
docs updated (`docs/architecture/microservice/alert-engine/{api-reference,domain-model,
testing,usecases}.md`) — not flagged by the dispatcher but appropriate and accurate
(cross-checked below).

## Test Results (re-run independently, not trusting dispatcher badges)

- `go build ./...` → exit 0
- `go vet ./...` → exit 0
- `go test ./... -count=1` → 7 packages ok, 0 fail (application, infrastructure,
  interface/http, module/alert_pipeline, primitive/cooldown-gate,
  primitive/dedup-key-builder, primitive/signal-classifier)
- `CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all`
  → total=11 pass=11 fail=0 status=OK
- `golangci-lint run ./...` (v2.12.2) → 0 issues

All figures match the dispatcher's reported numbers exactly.

## DDD Compliance: PASS
- `pkg/domain/` has zero imports of `pkg/infrastructure`/`pkg/application`
- `pkg/infrastructure/` has zero imports of `pkg/application`
- `pkg/module/alert_pipeline/` documents and respects its Fence-A boundary (`ports.go:7`)
- `EvaluateAlertUseCase` (adapter) contains zero orchestration logic — verified by
  full read of `evaluate.go`: only DTO field mapping + one `time.Now()` injection
- `pkg/domain/_deprecated/services_v1.go` — zero non-test imports anywhere in
  `pkg/`/`cmd/` (repo-wide grep), confirmed NOT resurrected

## Security: PASS
- No hardcoded credentials (`TelegramClient` reads config only)
- No `process.env`-equivalent leakage patterns found
- Repo-wide grep for `SentToTelegram`/`sent_to_telegram` outside `apps/alert-engine/`
  → zero hits (no external consumer depends on this column's value)

## 4 whitespace-only claims verified via `git diff`
`dtos.go`, `sqlite.go`, `telegram.go`, `router.go` — confirmed each diff is pure
gofmt struct-field realignment (aligned `json` tags / field names) or, in
`router.go`, a multi-line reformat of an inline anonymous interface literal.
Zero behavior change in any of the 4.

## Scrutiny of the 5 reconciliation decisions (the reason this QA gate was spawned)

**1. Store-timing (the substantive behavioral change) — SOUND, APPROVED.**
- (a) `api/openapi.yaml:117-119` literally reads `fired: "True if the alert passed
  all gates and was recorded"` and `telegram_sent: "True if the alert was
  dispatched to Telegram"` (line 140-142) — two independently-defined booleans.
  The contract text supports full decoupling; worker's claim is accurate.
- (b) No double-store on retry: `StoreAlert` writes the fingerprint row inside
  the SAME gate sequence that runs `HasDuplicateFingerprint` first (step 3,
  before step 6/store). A retried identical request within the cooldown window
  hits the dedup short-circuit at step 3 and returns before reaching
  `StoreAlert` again — architecturally idempotent, unchanged real dedup
  mechanism (SQLite repo), only the position of the fired-engine's own store
  call moved.
- (c) `SentToTelegram` always `0`: confirmed via
  `git diff` on `pipeline.go` — the OLD tested-but-never-wired Pipeline
  (`_ = alertpipeline.New(...)` in `main.go`, pre-fix) required
  `telegram.Send`→`sent==true` BEFORE calling `StoreAlert` at all, and wrote
  `SentToTelegram: 1` unconditionally in that branch. But this engine was
  **never live** — `cmd/server/main.go` discarded it. The engine that WAS
  actually serving traffic (`application.EvaluateAlertUseCase`, old
  `evaluate.go`, confirmed via `git diff`) called `StoreAlert` with no
  `SentToTelegram` field set in the struct literal (Go zero value = `0`),
  BEFORE the Telegram send. So the always-`0` behavior is unchanged versus
  what was actually being served — worker's claim ("both old engines never
  persisted true post-send status" as observed by a live caller) holds for
  the engine that mattered. Repo-wide grep confirms zero downstream readers
  depend on this column's value (not used for retry/re-dispatch gating
  anywhere in the codebase) — non-blocking, no live risk.

**2. `cooldown_sec` standardization — CONFIRMED SOUND.**
Old live engine (`evaluate.go`, pre-diff) explicitly returned `CooldownSec: 0`
only on the muted branch, `cfg.CooldownMinutes*60` (1800) on every other
branch — an inconsistency, not a documented invariant. `openapi.yaml:120-123`
describes `cooldown_sec` as "Cooldown window in seconds applied to this stock"
(a static per-stock configuration value, not a countdown), which is more
consistent with a constant. `git diff` on `evaluate_test.go` confirms the old
`TestEvaluateUseCase_DoesNotFireWhenMuted` never asserted `CooldownSec`. New
tests (`TestRun_CooldownSec_PresentOnEveryBranch`) explicitly cover dedup/
muted/invalid-severity branches all returning 1800. No regression.

**3. Ordering — CONFIRMED, Fired outcome unaffected.**
New `Pipeline.Run` keeps Engine A's order (classify→fingerprint→dedup→
cooldown→mute→store→format→route), not Engine B's mute-first order. Since
every suppression branch returns `Fired: false` regardless of which specific
gate short-circuited first, a simultaneous-suppression edge case (e.g. a
stock both muted AND in cooldown) can only change which `Reason` string wins
— `Fired` is `false` under either ordering. No functional divergence.

**4. Channel routing — CONFIRMED BYTE-IDENTICAL.**
`pkg/primitive/signal-classifier/classifier.go:48-59`: `critical|high →
ChannelMarket`, `medium|low → ChannelWork` — matches the retired inline
switch in old `evaluate.go` (`severity==Critical||High → ChannelMarket else
ChannelWork`) for all 4 valid severities. One genuine improvement, not a
regression: the old live switch had no invalid-severity rejection (any
garbage string silently defaulted to `ChannelWork` and still fired); the new
classifier rejects invalid severities (`Valid: false`) before evaluation
proceeds, consistent with `openapi.yaml:77-84`'s strict 4-value severity enum.

**5. DDD/adapter shape — CONFIRMED.**
`EvaluateAlertResponse` (`dtos.go`) retains all 7 documented fields
(`fired`, `cooldown_sec`, `reason`, `fingerprint`, `alert_id`, `code`,
`telegram_sent`). `evaluate.go` adapter body is pure request/response mapping
plus the one `time.Now()` composition-root injection — zero mute/dedup/
cooldown/store/telegram logic remains in `pkg/application/`.
`pkg/domain/_deprecated/services_v1.go` — zero non-test imports, not
resurrected. `domain.EvaluateAlertResult` (dead, unused type) removed
alongside — repo-wide grep confirms zero references anywhere, safe deletion.

## Architecture docs cross-check
`docs/architecture/microservice/alert-engine/usecases.md` was updated with a
reconciliation table matching every finding above line-for-line, including
the claim that `infrastructure/telegram.go`'s `TelegramClient.Send` never
returns a non-nil error in any code path (independently verified by reading
the full function — every error branch returns `(false, nil)`), which
grounds the "swallowed = zero live risk" claim for the Telegram
error-handling divergence (item not separately gated above but checked as
part of the reconciliation table review).

## Issues Found
### Blocking
None.

### Non-Blocking
- `SentToTelegram` DB column is now permanently `0` for every stored alert row
  (was already the case for the actually-serving engine; the tested-but-never-
  -wired engine's `1` value is retired along with it). No downstream consumer
  reads this column today, but if a future feature wants a true post-send
  audit trail, a background reconciliation job (or a second best-effort
  `UPDATE` after `telegram.Send`) would be needed — recommend a BACKLOG note
  if this becomes a real product need, not a blocker now.
- Two unrelated untracked files present in the working tree
  (`docs/data/auditor-tier2-last-healthy.json`,
  `docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md`) —
  not part of this diff, not touched by this review, flagging only so the
  dispatcher's commit scope stays limited to the 12 code files + 4 doc files
  reviewed here.

## Merge Status
Working tree left UNCOMMITTED per dispatch instructions — dispatcher (main
terminal) commits + closes orch-state `FACTORY-ALERT-consolidate-dual-engines`
(`in_progress`→`done_verified`) and releases the task lock.
