# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-07-31 (FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER — S3 hand-dispatch, size-lint sole remaining CI offender)

**Task:** `usecases_vmt_liquidity_resolvers.go` (224L, cap 120L) had a real package doc comment but not the literal `size-justification:` token, no baseline entry → `--check` new-offender, this was the SOLE remaining size-lint CI offender (confirmed via `gh run view 30608987675 --log-failed`).

**Action:** Added `// size-justification: 231L — ...` inside the first 10 lines (option a, per task's own preference order) naming why PolicyRatesResolver (VMT-5a) + omoResolver (VMT-5b) — two sibling composition-root-logic-gate extractions of the same refactor — share one file; declared count matches the real post-edit `wc -l` exactly (224L→231L after the 7-line insert). Did NOT run `--update` (would launder unrelated offenders repo-wide). `git diff` confirms only the target `.go` file changed — `scripts/audits/size-lint-justification.sh` and `docs/data/size-lint-baseline.json` untouched.

**Verification:** `go build`/`go vet`/`go test ./pkg/application/...` all green. Local `--check` exits 0. CI-plane VERIFIED (not just local): pushed commit `e02e20192`, `gh run view 30611631146 --json jobs -q '.jobs[]|select(.name=="size-lint")|.conclusion'` == `success` on the exact pushed headSha `e02e201925f0cdeec81e95ea30c77e4a0afe4082`.

**Commit:** `e02e20192` (1 file, +7L). Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S2.

Zone health: HEALTHY (comment-only change, build/vet/test green, CI size-lint job confirmed green on pushed SHA) | FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER → REVIEW (next_agent: qa)

---

## Session 2026-08-01 (FIX-MACRO-INDICATORS-EMPTY-COLUMNS — BOUNDED-1 pickup, DECLINED: wrong zone, 3rd occurrence of same class)

**Task:** BOUNDED-1 idle-capacity auto-pickup, labeled zone `apps/macro-indicators/`. Same zone-mislabel class as the two 2026-07-28/07-30 SBV occurrences (see above) — `apps/macro-indicators` matched by domain-keyword/table-name, not by verified write-path owner.

**RAW-verify:** `sqlite3 data/live/market.db` — table has exactly 1 row (`UNIQUE(country)`, id=675, country=vietnam); only `cpi=5.46`/`gdp_growth=7.4`/`interest_rate=4.5` set, the other 9 columns NULL, `fetched_at` fresh (today) despite that.

**Finding:** Traced every writer. `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts` storeIndicators() — dead (writes `country='VN'`, comment self-flags unwired). `apps/mcp-server/src/infrastructure/fetchers/tradingEconomics.ts` storeMacroIndicators()/fetchMacroIndicatorsWithFallback() — dead, zero call sites outside its own barrel re-export (grep-confirmed), and only ever handles 3 of 12 fields anyway. The one LIVE cron, `macroIndicatorRefreshJob.ts`, writes `interest_rate` for real (Go `/snapshot` sbvRefinancingRate) but its `cpi`/`manufacturing_pmi` path (`parseCpiFromExternal`/`parsePmiFromExternal` reading `GET /macro/external sources.tradingEconomics`) is doubly dead: live-curled my own Go `/external` handler (`handlers_external.go`) and confirmed the live response has no `tradingEconomics` key at all (only `vn-market`/`commodity-prices`/`macro-signals`); separately mcp-server's client calls `POST` against that `GET`-only route (405). `gdp_growth`/`inflation_rate` are hardcoded `null` in that INSERT, COALESCE-preserved only (explains the misleadingly-fresh `fetched_at` on a frozen value — same class as the known usdVnd frozen-value anti-pattern). The other 7 columns never appear in any live INSERT column list. The only writer covering all 12 columns, `macroPushHandler.ts`'s VPS-push allowlist, is fed by `vps-scripts/fetch-tradingeconomics.sh` — SSH-confirmed live on the VPS: 500+ consecutive hourly `SKIP: TE_API_KEY not configured` cycles since deploy — and `fetch-gso.sh`, whose browser automation was deliberately removed (VPS too lite), pushing only empty payloads. Both credential/infra-blocked, not a code bug. `apps/macro-indicators/` (my zone) has ZERO write access to `market.db` by design (init.md: reads-only) — structurally cannot implement any part of this fix. Bonus finding: 2 of the 9 empty columns (`trade_balance`, `current_account`) DO have a live alternate source already in my own zone (VMT-6/7 `POST /trade-balance` / `POST /bop`, real NSO/GSO data) never wired into `macro_indicators` — flagged as dev-mcp-server's concrete actionable path (no new credential needed for those 2).

**Action:** No code change (either zone). Corrected `docs/data/orch/orch-state.json` via `scripts/orch-apply.sh` (exit 0, conservation 770/770): moved row `in_progress`→`backlog` with `zone: apps/mcp-server/`, `owner_agent: dev-mcp-server`, full root_cause/generic_mandate trace embedded (incl. the trade_balance/current_account actionable path + the credential-blocked TE/GSO finding); `.head` reset to idle/router. Corrected `docs/data/orch/archive/backlog-detail.json` (direct atomic write, item-count-preserved 442/442) with the same trace + `related: [FIX-SBV-FETCHER-ZERO-VALUE-EMIT, FU-SBV-EFFECTIVE-DATE-COLUMN]`. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S3.

**Recurrence flag for PO (3rd time):** this is the THIRD backlog row mislabeled `zone: apps/macro-indicators/` for the identical structural reason — `apps/macro-indicators` is a CONSUMER/reader of `market.db`, never a write-path owner, by explicit agent-definition design. Both prior occurrences (2026-07-28, 2026-07-30) already recommended a one-time audit of remaining `apps/macro-indicators`-tagged backlog rows against actual write-path ownership; neither recommendation was actioned before this one burned a third BOUNDED-1 cycle. Re-recommending now, more strongly: run the audit before a 4th occurrence.

**Task lock:** `task:FIX-MACRO-INDICATORS-EMPTY-COLUMNS` NOT released by this agent — INV-GATEWAY-1 reserves task_claim/task_release to the dev-team dispatcher session (owner_client_session=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae) that holds it on my behalf.

Zone health: HEALTHY (no code changed, Go service unaffected) | FIX-MACRO-INDICATORS-EMPTY-COLUMNS → returned to BACKLOG, re-zoned apps/mcp-server/ (not a dev-macro-indicators task)

---

## Session 2026-08-11 (FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE — PO-minted, split-zone task)

**Task:** POST `/liquidity-state` hung 18.4s vs mcp-server cron's 15s deadline (PO's live probe falsified the alert's own "unreachable" causes — container/health/route all fine). PO forbade raising `deadlineMs`; wanted the handler's own upstream fetch bounded, plus a 2nd defect (alert wording conflates deadline-exceeded/unreachable) fixed "in the same pass."

**Finding:** `LiquidityStateUseCase.Execute` calls TWO sequential upstream SBV HTML fetches — `policyRatesProvider.FetchPolicyRates` + `omoProvider.FetchOMO` — against the raw 60s handler ctx, each bounded only by its OWN `http.Client.Timeout` (30s/45s). This endpoint was the sole gap versus BOP/CPI/Trade/MacroGSO, which all already share `domain.FetchBudgetSec` (8s SSOT, `ports.go:24`). The 2nd defect (`sbvOmoLiquidityCronJob.ts:70`) is 100% in `apps/mcp-server/` — out of zone, not touched.

**Action:** Wrapped both fetches in ONE shared `context.WithTimeout(ctx, FetchBudgetSec)` (not 8s+8s=16s — proved with `TestFetchDeadline_LiquidityState_BothHanging_SharedBudget`, RED@24s→GREEN@8s). Tightened redundant infra client Timeouts to the same const. 5 new tests, docs updated (`usecases.md`/`infrastructure.md`/`testing.md`). Moved task_board row `backlog→review` (`scripts/orch-apply.sh`, conservation 774/774) with residual mcp-server defect flagged in `status_note` for a PO follow-up mint, not dropped. Worktree gap: `orch-apply.sh`'s bun validator needed `apps/mcp-server` node_modules (absent in fresh worktree) — symlinked from main checkout (gitignored, non-destructive) rather than a full `pnpm install`.

**Verification:** `go build`/`go vet`/`go test ./...` all green (35 files/301 top-level/562 total cases). G12 sandbox both tiers GREEN. Fences A/B/C clean. Decision journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-macro-indicators.md` STEP dev-macro-indicators-S4.

**Commits:** `eb6524da9` (code+tests+docs), `19be31ef1` (task_board move).

Zone health: HEALTHY (build/vet/test/G12/Fences all green) | FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE → REVIEW (next_agent: qa); residual mcp-server error-string defect needs a separate follow-up FIX row for dev-mcp-server
