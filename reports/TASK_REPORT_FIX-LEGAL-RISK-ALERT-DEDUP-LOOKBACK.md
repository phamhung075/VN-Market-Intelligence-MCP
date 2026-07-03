## Task Report FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK

**Scope verified:** commits `3badf5fe5` (dev-mcp-server, 9 files) + `ce4051a7b` (notebook, 1 file). Two-tier fix for legal_risk CRITICAL alerts re-firing every alert-commander cycle for up to 30 days (qa `a522cb30f` finding during FIX-ALERT-COMMANDER-DEAD-NO-SLOT gate).

- **QUICK (LIVE now, no deploy):** `docs/agents/alert-commander/flow/stage-bootstrap.md` call site now reads `get_legal_risk_signals(days=1, hours_back=6)` — was bare. `days` already existed on the deployed tool, so this bound is effective immediately on the next alert-commander cycle read (flow docs are read live). `hours_back` is forward-compat: the currently-deployed server's non-strict zod schema silently strips the unrecognized key until the ROBUST tier ships.
- **ROBUST (deploy-gated):** `apps/mcp-server/src/interface/mcp/tools/sector/legalRiskTools.ts` — additive, opt-in `hours_back` param (shared `computeCutoffIso()` helper, applied to both the `alerts`-table and `agent_signals` sources) that overrides `days` only when passed. `apps/mcp-server/src/interface/mcp/tools/alerts/alertVerdictTools.ts` `writeAlertVerdict()` — dedup guard: skips appending a new pending row when one already exists for the same `(ticker, alertSource)` pair with `verdict==='pending'`, returns `duplicate:true` instead.

### 1. Tests — re-run independently (not trusting dev's reported numbers)

| Run | Result |
|---|---|
| `bun test src/__tests__/FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.test.ts` (isolated) | **7 pass / 0 fail / 15 expect** |
| Adjacent suites — broadened net beyond dev's claimed file list (case-insensitive grep for `legalrisk\|alertverdict\|get_legal_risk_signals\|write_alert_verdict` across `src/__tests__/`, 14 files incl. the new one) | **124 pass / 0 fail / 402 expect** |
| `bun tsc --noEmit` | **0 errors** (exit 0) |
| `bun scripts/gen-project-stats.ts --dry-run` | `toolCount=183` unchanged (additive param, no new `server.tool()` registration) |

**Full suite — ran TWICE independently** (own re-runs, not the dev's numbers):
- Run 1: 14236 pass / 42 skip / 69 fail / 5 errors / 44688 expect, 1170 files, 665.67s
- Run 2: 14239 pass / 42 skip / 66 fail / 11 errors, 1170 files, 625.51s — plus the known pre-existing Bun-1.3.13 C++ teardown panic on both runs (documented recurring artifact, not caused by this diff).

Both well under the documented ceiling (`docs/data/project-stats.json` `testBaselineFail=348`). Cross-run count variance (66 vs 69 fail, 5 vs 11 errors) is itself evidence these are pre-existing flaky/timeout tests, not a deterministic regression from a 2-file additive diff. Mapped **every one of the 66 `(fail)` lines** (run 2 full log) to their 20 unique source test files — `1892a-health-vps-news`, `1345a-reuters-fallback`, `235-telegram-send-merge`, `102-job-news-poll`, `1324-push-news-all-sources`, `1146-get-insider-transactions`, `TSU-DEV-U5-foreign-flow-null-holding-ratio`, `1875c-record-signal-outcome-routing`, `1892a-pushNewsHandler`, `1858c-logvpspush-fix`, `083-tool-analysis`, `RAPID-B2-get-market-cap-tool`, `251-mcp-tools`, `1193-push-prices-persist`, `125-test-e2e-briefing`, `1113-vps-proxy-health`, `1518-get-foreign-flow-ohlcv-source`, `VPT-1-vps-proxy-health-endpoint`, `1288-poll-news-shape`, `1898b-rss-degradation-regression` — then `grep`-confirmed **none of the 20 import `legalRiskTools`/`alertVerdictTools`/`alertVerdictStore`**. Case-insensitive scan for `legal_risk`/`alertVerdict` across the entire ~22.5K-line full-suite log: **0 hits**. All 66 failures + 11 errors are the well-documented pre-existing pollNews/VPS-push-log/network-timeout flake cluster (5000ms default per-test timeout hit under full-suite parallel load; several are deliberate fault-injection tests — `Network error`, `Telegram down`, `HOSE/HNX/UPCOM API timeout`).

### 2. Shared `days=30` default NOT lowered (gate criterion #2)

Diff confirms `days` schema unchanged (`z.coerce.number()...optional().default(30)`, max 90). Grepped all `get_legal_risk_signals` call sites across `docs/agents/**/flow/*.md` + `docs/agents/tools/package/*.md`: **7 other call sites across 6 agent flows remain bare** (`bctc-analyst/stage-analyze.md`, `digest-predict/daily.md`, `unified-agent/market-analysis.md` + `market-events-log.md`, `fb-market-poster/weekly-prediction.md` + `main.md`) — none pass `days`/`hours_back`, so none lose their 30-day breadth. Only the one rewritten call site (`alert-commander/stage-bootstrap.md`) now bounds itself explicitly.

### 3. TC4 repeat-fire-suppression — layer + no-suppression-intent verified (gate criterion #3)

Two-part verification, not just reading the test:
1. **Unit-level:** TC4 (same `(ticker,alertSource)` pending pair, 2nd call → `duplicate:true`, store stays length 1), TC5 (different `alertSource` → never suppressed, store grows to 2), TC6 (same pair AFTER prior verdict resolves off `pending` → never suppressed, store grows to 2) — all 3 independently re-run, green.
2. **Architectural:** `write_alert_verdict` is called by alert-commander **after** `send_telegram` fires the MARKET alert (`docs/agents/alert-commander/flow/stage-dispatch-log.md:24`: "call after `send_telegram` AND `mark_alert_read`"). The dedup guard sits strictly downstream of the actual CRITICAL-fire decision — it cannot and does not suppress the Telegram alert itself. `stage-signals.md`'s unconditional "`legal_risk | any | CRITICAL now`" rule is untouched by this diff; only the QUICK-tier lookback bound (`days=1`/`hours_back=6`) narrows how long a stale, already-fired event keeps re-surfacing as "new" input to that unconditional rule. This satisfies `alert-policy.md`'s "Internal Cooldown Rules (never suppress) — Legal risk signals" clause: no suppression was added to the fire-decision path; dedup is scoped to post-fire verdict bookkeeping only.

### 4. Deploy-gate status (gate criterion #4)

**QUICK tier is LIVE** — `stage-bootstrap.md` is a flow doc read live by alert-commander every cycle; `days=1` takes effect on the very next cycle, no mcp-server rebuild needed. **ROBUST tier is DEPLOY-GATED** — `legalRiskTools.ts`'s `hours_back` handling and `alertVerdictTools.ts`'s dedup guard are merged to `main` but have **no effect on the currently-running mcp-server** until the next container rebuild + redeploy. No action requested of QA here; recorded as an operational fact for router/ops.

### 5. DDD compliance: PASS

Neither modified production file lives under `domain/` (`legalRiskTools.ts` under `interface/mcp/tools/sector/`, `alertVerdictTools.ts` under `interface/mcp/tools/alerts/`). Both import from `infrastructure/` (`getDb`, `logger`, `infrastructure/fileStore/alertVerdictStore`) — permitted per `docs/ARCHITECTURE.md` L7 (`domain/` never imports `infrastructure/`; the actual project rule, not "interface never imports infrastructure") and per each file's own pre-existing module-header documentation ("DDD layer: interface — imports from infrastructure/fileStore"). Not a new violation.

### 6. Security: PASS

`grep` for `process\.env`, `password|secret|token` across the 3 changed/new source files (`legalRiskTools.ts`, `alertVerdictTools.ts`, `FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.test.ts`): 0 hits. `bash scripts/audits/mock-guard.sh --files "..."`: **PASS**, exit 0. UUID leak check on the 2 gated commits (`3badf5fe5`, `ce4051a7b`) + their files: `grep -c` for the coordination session token across both commit bodies and all committed files = 0/0 — the notebook entry for this task uses `**Provenance:** router-dispatched` (no raw UUID), correctly scrubbed.

**Out-of-scope observation (not a blocker on this gate):** 3 *other*, already-merged `docs/agent-memory/notebooks/dev-mcp-server.md` entries — commits `85267b624` (2026-07-02, TASK-DASH-CRON-1), `1a9cda30b` (2026-07-03, FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING), `e73a53688` (2026-07-03, FIX-BCTC-BANK-BS-COLUMN-ORDER) — still carry the raw session UUID verbatim in `**Session:** <uuid> (router-dispatched)` lines, predating this task. That's 3 prior instances of the same leak class the router just scrubbed for this task — a recurring pattern. Flagging as a mandatory follow-up (redact those 3 lines in a new commit); out of scope for this specific gate since the lines sit in 3 unrelated, already-merged commits, not in `3badf5fe5`/`ce4051a7b`.

### DJ-GATE-1

`docs/agent-memory/decisions/sprint-FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK.md` (dev-mcp-server's journal) contains `**task-id:** FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK` — gate satisfied.

### Verdict: **APPROVED (PASS)**

All 4 gate-scope items green with raw evidence: tests genuinely re-run (not trusted from dev's numbers) and green; shared `days=30` default confirmed intact for all 6 other agent-flow consumers; TC4 dedup confirmed scoped to the post-fire bookkeeping layer only, preserving `alert-policy.md`'s no-suppression intent for legal_risk; deploy-gate status recorded (QUICK live, ROBUST pending next mcp-server rebuild).

Router owns the review→done_verified board flip. QA did not touch `.task_board`/`orch-state.json`.
