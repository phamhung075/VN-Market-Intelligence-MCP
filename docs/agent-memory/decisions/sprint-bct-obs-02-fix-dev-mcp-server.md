# Decision Journal — Sprint bct-obs-02-fix · dev-mcp-server

**Sprint goal:** BCT-OBS-02-FIX (BOUNDED-1 direct-execute) — determine at source whether sscCheck (20:00 VN nightly BCTC check) sends its result to WORK, fix root cause if not.
**Agent:** dev-mcp-server
**Started:** 2026-07-23

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T17:13:33Z
**task-id:** BCT-OBS-02-FIX
**what-done:** RAW-verified at source (not the checklist's self-report): grepped `sendTelegram`/`telegram` across `sscCheckerJob.ts` + `checkSscReports.ts` (0 hits) and their FULL git history (`f3eeb9b7d..791b0e4dc`, every commit touching either file) — neither ever called a telegram sender. Live corroboration: `read_telegram_reports` (50 most-recent rows, spans 2026-07-21T17:00Z→2026-07-23T15:16Z, covering both 20:00 VN firings) has zero "ssc" mentions. `docs/data/quality-checklist.json`'s BCT-OBS-02="PASS" (evidence "WORK-channel msg IDs 2743-2766") is a false-positive: live signal msg 3628 (tran-ngoc-bau) proves `read_telegram_reports`'s `channel` param is a no-op (zod schema has no channel field) — the recheck_how the PASS relied on cannot have actually filtered WORK.
**what-considered:**
- Treat as false-premise / no-op-verified (checklist says PASS) — rejected: checklist evidence is a self-report built on a broken probe (channel param no-op), contradicted by exhaustive source+live evidence; the architecture-brief Cluster-D classification (REAL-CODE) is the one that held up.
- Redirect the fix to a different job (bctcQueueEnricherJob / bctcOverdueCheckJob) since checkSscReports() is functionally superseded — rejected: task is explicitly scoped to sscCheck's own WORK-notification behavior, not the discovery pipeline it used to own.
**why-decision:** Root cause is real and in-scope: `runSscCheck()` never sent anything to WORK regardless of outcome (skip/run/error). Fix mirrors the exact precedent already shipped for the sibling issue, `bctcOverdueCheckJob.ts` FR-OBS-01-FIX (commit 7ce61568e) — injectable `sendWorkAlertFn` defaulting to `sendTelegramWork`, non-fatal on send failure.
**why-change:** none — first pass.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T17:20:00Z
**task-id:** BCT-OBS-02-FIX
**what-done:** Implemented: `runSscCheck()` now posts exactly one WORK summary per executed cycle (VPS-only skip / full run / unhandled error); concurrency-guard and T4 dedup-skip early-returns stay silent (nothing new happened). Added `checkSscReportsFn` + `enableLocalBctcFetchOverride` injectable test seams (mcpConfig is a module-load-time singleton — env-var flips mid-test-run cannot move it, same limitation FIX-1281's own suite documents) so both branches are behaviorally testable without hitting network/DB. New test file `FIX-BCT-OBS-02-SSCCHECK-WORK-ALERT.test.ts`, 5 cases (skip-message, full-run-message, concurrency-silence, send-failure-non-fatal, T4-dedup-silence) — all GREEN. Full suite: 14684 pass / 42 fail / 1 error, all pre-existing (RAW-verified: identical failures with `sscCheckerJob.ts` git-stashed out — RSS-degradation timing test, deprecated technical-indicators golden-output test, ohlcv/imf missing-table tests; zero "ssc"/"BCT-OBS" hits in the full failure log).
**what-considered:**
- Fire the WORK message only when something is found (mirror bctcOverdueCheckJob's conditional-on-new-batch pattern) — rejected: checklist's own metric is "WORK channel has sscCheck result message DAILY" / expected "daily WORK message" — an observability heartbeat, not a problem-only alert; conditional-only would leave the VPS-only no-op state (the actual steady-state in production) permanently invisible again.
- Add telegram send inside `checkSscReports()` (application layer) instead of the scheduler wrapper — rejected: DDD layer discipline (checkSscReports is a reusable use case with its own callers/tests); the wrapper already owns the VPS-only-skip branch text and result composition, so it's the natural single place holding the full cycle outcome.
**why-decision:** Matches the AC verbatim (daily WORK message, whatever the outcome) while keeping the change scoped to the wrapper file only, consistent with the FR-OBS-01-FIX precedent's own layering choice.
**why-change:** none from S1's diagnosis.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-23T17:22:00Z
**task-id:** BCT-OBS-02-FIX
**what-done:** Cross-checked this session's sibling BCT-OBS-01-FIX notebook entry (same session, immediately prior) + re-read `coreSend()`: `sendTelegramWork` does ONLY the raw Bot-API POST, zero DB persistence by design (only `sendTelegramBug`→`insertReport` and `sendTelegramMarket` persist). So `read_telegram_reports` can structurally never show a WORK-channel sscCheck message — my own fix's live-send cannot be QA-verified that way either.
**what-considered:** n/a — corroboration note, not a decision point.
**why-decision:** Recorded so QA does not spend a cycle re-trying the checklist's broken `recheck_how`; real verification path is live Telegram WORK channel inspection or `get_system_status` env-var check, not `read_telegram_reports`.
**why-change:** none — strengthens S1's root-cause finding, no code impact.
