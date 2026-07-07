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

### STEP qa-S2 · qa · 2026-07-07T18:10:00Z
**task-id:** CI-RED-c5b5f885-FIX
**what-done:** RAW-verified dev-mcp-server's CI-red fix independently — did not trust claimed green badge or claimed no-leak.
**what-considered:**
- Trust `gh` badge vs pull real job logs — pulled `bun test` job conclusion + log content for both post-fix runs (28886901289, 28887280793) AND all 3 pre-fix red runs; FAILEDFILE lists match the claim exactly (1410 3/3, 262 2/3, 183-alert-accuracy 1/3 unrelated)
- Mock-leak claim — independently ran 1410+257 together and 262+258 together (not the worker's own runs) to reproduce; sibling DI/real-fetch assertions still pass, proving no leak in both directions; also read ci-per-file-isolation.sh and confirmed leak is structurally impossible under real CI (one process per file)
- Diff scope — `git show 1efb6f918` confirms 2 test files only, mock-guard.sh confirms 0 production files
- Local full-suite via project's own CI-equivalent script (not bare bun test, per journal's own prior warning) — 1410/262 absent from the 12 failed files; residual fails match prior QA baseline (TASK_REPORT_CI-RED-323b512b-FIX.md) class of pre-existing local network flake
**why-decision:** Every claim independently reproduced against ground truth (real GH Actions logs, my own bun test runs, my own script read) rather than relayed. DJ-GATE-1 journal entry present (sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md STEP S2). verification_gate=ci_green_on_subsequent_push satisfied (1efb6f918 ≠ original red SHA f71643fb, both post-push runs conclusion=success) → APPROVED, flip review→done_verified.
**why-change:** no change from plan — routine PASS gate, all checks green.
