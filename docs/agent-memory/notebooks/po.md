# PO Notebook

_Last: 2026-07-31T09:20Z (scoped brief: ohlcv-coverage-gap + agent_signals ts). Journal: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-3.md` STEP po-S86, po-S87._

## This cycle

- **2 findings in, 0 mints, 2 existing rows updated.** Board is 363 backlog / 219 review / 177 awaiting qa — attaching beat minting twice.
- **Finding 1 ("session captured 14% of tickers") is a FALSE ALARM.** The 129 number is real; the incident is not. `intraday_ohlcv_5m` is multi-day and is NOT rewritten by the backfill, so it is the discriminator `updated_at` can never be: distinct codes/day = 118 (07-31), 119 (07-30), 118 (07-29), 118 (07-28), 117 (07-27), 118 (07-24). **Today is identical to every prior session.**
- **`daily_ohlcv` same-day coverage is ~130 BY DESIGN.** Every historical date shows **0–2 same-day writes vs 900–1000 next-day writes** (07-30: 2/939 · 07-24: 2/984 · 07-01: 0/960). The ~940-code universe lands ONLY from the nightly history backfill, which last night UPSERTed **750,317 rows = 97% of the 774,221-row table** (dates 2014-04-16→2026-07-30, 1,497 codes) and so **clobbers `updated_at` on nearly the whole table**. The 25 "frozen at 02:xx" tickers are VFS…XPH — the tail of that alphabetical walk, the only codes it reached after the 02:00Z open.
- **The brief's C-01 claim was imprecise and it matters.** C-01's window is `date >= date('now','-1 day')` = TWO calendar dates. Run live at 09:12Z it returns **947**, C-02 returns **1070**. The threshold (`>=25`) is not the blindness — the WINDOW is. A 900 threshold would also pass.
- **Declined the proposed coverage check.** Today-vs-trailing-median would fire every single day at 09:00Z. Classic auditor-FP shape.
- **Finding 2 verified and the writer pinned to one line.** `alertStore.ts` `storeAlerts()` binds the SAME `alert.createdAt` twice — raw into `created_at`, and through `datetime(?,'+2 hours')` into `expires_at` — so **one row carries both formats** (row 10065: `2026-07-30T14:46:43.612Z` / `2026-07-30 16:46:43`). That adjacent column proves SQLite parses the input fine; fix = wrap the `created_at` placeholder in `datetime(?)`.
- **It is live, not latent.** 09:16Z: `created_at >= datetime('now','-60 minutes')` returns **95**, correct answer **59** — 36 falsely included, **+61%**. 180-min: 98 vs 74. `'T'`(0x54) > `' '`(0x20) at pos 11, so within one date every T row outranks every space row. Cross-day survives by accident.
- **DB read fell back to `immutable=1`, disclosed.** `-readonly` gave CANTOPEN(14) on 20 retries; `market.db-wal`/`-shm`/`-journal` were ALL absent at that moment (verified in the same command). Simple reads succeeded before and after, so the numbers are not stale-WAL artefacts.

## Carry-over

- **`daily_ohlcv.updated_at` is a MUTATION timestamp, not arrival — never diagnose off it.** Nightly backfill rewrites ~97% of rows. This single fact cost a router a whole session. Now on `FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE` (same root cause as its `parsed_at` defect); that row's zone already IS `docs/agents/system-auditor/flow/` with `next_agent: architect`.
- **Not on the board, deliberately:** `recoverMissingOhlcvSession` branch-1 guard is `COUNT(*) WHERE date=? > 0` ⇒ a 129/941 session reads as `alreadyPresent` and no recovery runs. Real but latent — the backfill covers it and its only caller `ohlcvCandleGuard.ts` is watchlist-scoped (58 codes; 6 missing today = 10%, under `ohlcvStalenessCheckJob`'s >50% bar). If OHLCV recovery is ever reworked, fix the guard then.
- **P1 inflation is now a live problem.** I bumped FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT P2→P1 on a measured wrong answer, but backlog already holds **82 P1s**. Priority has stopped being a scheduling lever; specificity + cheapness is what gets a row picked. Worth a policy pass.
- **`FIX-NOTEBOOK-AUTOPRUNE-...-ZERO-TS-NOTEBOOKS` still gates two REVIEW rows** (`...LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES`, `...LINECAP-SWEEP-BYTE-BLIND-BACKSTOP`). Neither can converge on the 11 zero-timestamp notebooks because the pruner declines to run. **Do not let QA merge the three.** `po.md` is one of the 11.
- **`gh run view <run_id> --log-failed` remains the only disposition-grade read for a ci_red.** `failing_jobs[].name` carries zero file identity. size-lint remedies are exactly two: shrink under baseline-upper, or a literal `size-justification: <N>L` in the first 10 lines. **NEVER `--update`.**
- **39 manual-dispatch candidates remain unflagged**, draining 1/tick. Revisit the cap after 3-4 ticks.
- **Not run this tick** (scope = single scoped brief, not a dev-team triage): channel-audit, TNB audit, signal triage, supervised-goahead, manual-dispatch-sweep, sprint-kickoff, review-ba-spec, sprint-signoff.
