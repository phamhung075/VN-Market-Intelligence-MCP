# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · qa

**Sprint goal:** Systemic remake — churn-not-product review fix order (idle-loops→verif→detector).
**Agent:** qa
**Started:** 2026-07-04T10:45:12Z

---

### STEP qa-S1 · qa · 2026-07-04T10:45:12Z
**task-id:** FACTORY-ALERT-consolidate-dual-engines
**what-done:** Re-verified dev-team's uncommitted Go consolidation (12 files, apps/alert-engine) independently — build/vet/test/sandbox/lint + 5 flagged reconciliation decisions.
**what-considered:**
- Trust dispatcher's raw-verify badges vs re-run everything myself — re-ran all 4 (go build/vet/test/lint) + sandbox scenario myself, all matched claims exactly
- Store-timing change (fire decoupled from Telegram) — checked openapi.yaml literal contract text, confirmed it explicitly separates fired/telegram_sent
- Whether store-before-send is a live regression — traced that the OLD LIVE engine (Engine B, wired in main.go pre-fix) already stored before Telegram (fire-and-forget); the engine that required Telegram-success-before-store (old Engine A/tested pipeline) was NEVER wired into main.go (discarded via `_ = alertpipeline.New(...)`) — so no regression vs actual serving behavior
- SentToTelegram always-0 column — grepped whole monorepo for any reader of this column outside alert-engine's own sqlite.go/test — zero external consumers, not a live regression risk
**why-decision:** All 5 scrutiny points verified sound against ground truth (code reads + openapi.yaml text + whole-repo grep), not just worker's claims. TelegramClient.Send confirmed (by reading infrastructure/telegram.go) to never return non-nil error in any branch, validating the doc's "swallowed = zero live risk" claim. 0 issues found → APPROVED.
**why-change:** no change from plan — routine PASS gate, all checks green.
