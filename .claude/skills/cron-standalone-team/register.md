# cron-standalone-team — Register (lazy-load detail)

Loaded from `.claude/skills/cron-standalone-team/SKILL.md` Step 1 ONLY when at least one of the
5 entries is missing — typically once per session restart.

**SSOT:** each `CronCreate` call below is ported VERBATIM from that cron's own
`.claude/commands/crons/cron-*.md` authoring doc — Job 1/2's prompt body is the EXACT
`db-integrity-probe.sh`-gated + `AUDIT_TIER=DATA` text from `cron-db-data-integrity.md` (post
CADRAT-2), Jobs 3-5 are the EXACT short "launch subagent, read and execute main.md" text from
their own authoring docs. If a cadence or prompt ever changes in an authoring doc, re-sync the
matching Job below in the SAME commit — hand-porting without re-syncing is the documented
mechanism that spreads drift across artifacts (see `cron-detect-loop/register.md`'s own SSOT
note for the precedent this skill's Jobs deliberately do NOT repeat: unlike dev-team/Tier-1,
none of these 4 crons' register.md entries are meant to diverge from their authoring docs).

---

## Step 2 — Register missing crons

Only execute `CronCreate` for entries NOT found in Step 1.

**Job 1 — db-data-integrity, weekday session+settlement window**

> CADRAT-2 (2026-08-04): registers the schedule-split + `db-integrity-probe.sh`-gated prompt from
> `.claude/commands/crons/cron-db-data-integrity.md` Job A. If CADRAT-2 has not landed on the live
> authoring doc yet, this row BLOCKS — do NOT register the stale pre-CADRAT-2 `15,45 * * * *`
> single-job shape instead.

```
CronCreate(
  description : "db-data-integrity — weekday session+settlement window (CADRAT-2 Job A)",
  cron        : "15,45 2-9 * * 1-5",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
Run: bash scripts/agents-flow/db-integrity-probe.sh and read its exit code + one-line JSON verdict. If exit code = 0 (verdict=SKIP-SPAWN): done, log '[cron-db-data-integrity] SKIP-SPAWN (no watched table row-count changed since last sweep)', do NOT spawn a subagent. FAIL-OPEN on anything else — exit code 1 (verdict=SPAWN, includes probe faults/missing snapshot/first-run): proceed to the existing prompt body below unchanged.

Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
AUDIT_TIER=DATA
MCP: https://zenmidi.com/vn-market/mcp

DB DATA-ANOMALY SWEEP (detection only — do NOT fix the DB; report to dev-team via signal).

DB ACCESS — the live DB is the named volume, NOT host ./data and NOT the mcp-server
container (it has no sqlite3). Query read-only via the keinos/sqlite3 sidecar:
  docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 \
    sqlite3 "file:/data/market.db?immutable=1" "<SQL>"
Note: use file:?immutable=1, NOT sqlite3 -readonly. After the mcp-server writer restarts and
recreates market.db-shm with its uid, a different-uid sidecar cannot attach that -shm to build
the WAL index -> SQLITE_READONLY(8) -> empty result -> all counts null. immutable=1 bypasses
WAL/-shm entirely and is always safe for a read-only observer.
Canonical DB = /data/market.db (≈300MB). Ignore the 0-byte legacy decoys
(market_data.db, market_intelligence.db, main.db).

CHECK these high-value tables for the 4 anomaly classes (use cheap AGGREGATE queries —
COUNT/MIN/MAX/GROUP BY — not full-table dumps):
  daily_ohlcv, market_prices, market_prices_history, vn_index_cache,
  alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes,
  financial_reports, macro_indicators, sbv_rates, fred_series_daily,
  deep_fetch_queue, deep_fetch_stats, cron_job_runs, scheduler_locks.

ANOMALY CLASSES:
  1. FAIL/MISSING   — a table that should have rows is empty/0; NULL in a NOT-NULL-intent
                      column; failed/stuck rows (e.g. deep_fetch_queue status='failed' or
                      rows stuck 'pending' > N hours; cron_job_runs last run errored).

                      WRITER-PROVENANCE DISCRIMINATOR (MANDATORY, run BEFORE assigning
                      severity to ANY 0-row table this cycle — FIX-AUDITOR-EMPTYTABLE-CHECK-
                      NO-WRITER-DISCRIMINATOR; full policy: docs/agents/system-auditor/flow/
                      data-writer-provenance.md §1-2). Confirmed false positives 2026-08-06
                      (price_alerts, alert_engine_records) shipped CRITICAL "pipeline
                      non-functional" with no check of WHETHER the table has a production
                      writer at all, and pdf_documents was reported "failed, actual=0" when
                      the table does not exist as a table at all — SCHEMA-MISSING and
                      EMPTY-TABLE are DISTINCT findings, never render them identically.
                      For EVERY watched table that reads 0 rows this cycle, run the
                      DETERMINISTIC classifier and use its output verbatim — do NOT hand-judge
                      writer provenance or missing-vs-empty yourself:
                          bash scripts/db-empty-table-classify.sh <table>
                      It runs `SELECT 1 FROM sqlite_master WHERE type='table' AND
                      name=<table>` BEFORE any COUNT(*) (so a genuinely missing table can
                      never be scored as "empty"), then classifies writer provenance by
                      walking `INSERT INTO <table>` sites in source, and emits ONE JSON
                      object: `{table, exists, row_count, class, severity_ceiling,
                      writer_sites[]}`. Map `class`/`severity_ceiling` straight onto this
                      cycle's verdict — zero further LLM judgment required:
                        | class          | severity_ceiling                      | meaning -> verdict |
                        |----------------|----------------------------------------|---------------------|
                        | SCHEMA-MISSING | always_report                          | table does not exist at all (migration/schema gap) -> ALWAYS report, never silenced by this discriminator |
                        | a              | may_stay_critical                      | >=1 non-test writer site NOT exclusively an on-demand tool (scheduler job, application usecase, ingest route, etc.) -> 0 rows here MAY be CRITICAL, a real outage. NEGATIVE CONTROL: daily_ohlcv / market_prices classify "a" — verify they still fire before trusting any "quiet" result from this discriminator |
                        | b              | info_at_most_never_critical            | zero non-test writer sites exist against THIS db (every site found, if any, is test-only or targets a documented separate db file) -> INFO at most, NEVER CRITICAL/WARN — table is expected empty by construction |
                        | c              | info_or_warn_corroborate_to_escalate   | the only writer(s) are an on-demand MCP tool (path under apps/**/interface/mcp/tools/**) -> INFO/WARN — "nobody used the feature yet" != "pipeline broken"; only escalate with a corroborating signal (e.g. a related table shows activity) |
                      If the script exits non-zero (PROBE FAILURE, printed to stderr), record
                      that failure verbatim — never guess a class or fall back to free-text
                      judgment. Confirmed FPs this closes: price_alerts -> class c (sole
                      writer `priceAlertTools.ts` is on-demand); alert_engine_records ->
                      class b (market.db's copy has zero production writers — the one Go
                      writer that exists, `apps/alert-engine/pkg/infrastructure/sqlite.go`,
                      writes to a SEPARATE `alert_engine.db` file, confirmed empirically:
                      that file has no `alert_engine_records` table at all).
  2. STALE/UNAVAIL  — newest timestamp far older than expected (e.g. daily_ohlcv / market_prices
                      not updated within the last trading session; sbv_rates / macro_indicators
                      > 48h old; a feed's max(updated_at) implausibly old).
  3. DUPLICATE/REPEAT— same logical key duplicated (e.g. (ticker,date) appearing >1 in daily_ohlcv;
                      identical alert fired repeatedly; repeated identical macro values across days
                      where they should vary).
  4. INCORRECT/ALEATOR (out-of-range / implausible)
                      — OHLCV scale anomalies (close/open differing from peers by ~1000x, the
                      known x1000 class); price = 0 or negative; volume < 0; O/H/L/C violating
                      H>=O,C,L and L<=O,C; RSI/indicator pegged at 100.0 or single-digit artifacts;
                      usd/vnd or index values outside a sane band; a numeric column whose value
                      is a statistical outlier (>~5σ) vs its own recent history.

THINK BEFORE REPORTING (correct-thinking gate, mandatory):
  For each candidate, ROOT-CAUSE-think first — is it a REAL defect or expected?
  Plausibility-check magnitudes/relationships (non-empty/real-shaped is the FLOOR, not the bar).
  Cross-check against known by-design states (e.g. illiquid ticker → honest gap is OK;
  low extraction_confidence on a scanned PDF is flagged-not-broken). Do NOT report noise.
  Only CONFIRMED anomalies proceed to a signal.

COUNT-NOISE TOLERANCE (regression monitor): live-DB counts wobble by ±1-2 under concurrent
  writes. A delta of ±1-2 on a known anomaly is MEASUREMENT NOISE, not a regression — record
  the count but do NOT call ±1-2 "changed/regression". Only a MATERIAL move is a real change:
  a drop toward 0 (a fix landed), a jump of ≥~5, or a fresh recent-dated violating row.

⚠ NO HALLUCINATED COUNTS (mandatory — confabulation guard):
  For the canonical anomaly COUNTS (OHLC violations, scale anomalies, vnindex-cache rows,
  low-confidence reports) you MUST run the DETERMINISTIC helper and copy its numbers VERBATIM:
      bash scripts/db-integrity-counts.sh
  It emits JSON `{ "scan_ts", "counts": {ohlc_violations_count, scale_gt100x_count,
  vnindex_cache_rows_count, low_confidence_reports_count}, "context": {...} }` straight from
  sqlite. (Renamed 2026-08-06, FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR item 3 —
  formerly `db1_ohlc_violations`/`db2_scale_gt100x`/`db3_vnindex_cache_rows`/
  `c04_low_confidence_reports`; `c04` visually collided with system-auditor's OFFICIAL Tier-3
  `C-04`/`C-08` checks, a different check family. Rename only, no query changed.)
  Use those exact numbers in the history entry + the regression check — NEVER a number you
  recalled/estimated/expected, and NEVER invent a narrative for a change the script didn't show.
  Use your own ad-hoc sidecar queries ONLY for discovering NEW anomalies + classification, not
  for re-counting the known four. Do NOT assume a direction (REBUILD_REQUIRED ⇒ fix may not be
  live). If the helper fails, record null + say so — never a guessed number.
  (2026-06-20: an LLM-counted sweep hallucinated 836→661 "-175 fix deployed" — real count 835,
  fix not deployed, nothing cleaned. This helper + the router's material-change raw-verify exist
  precisely to kill that confabulation class.)

⚠ NO TREND NARRATION (record, don't editorialize): your job is to RECORD the helper's exact
  count + discover NEW anomalies. Do NOT narrate "regression / improvement / +N / -N / re-entry"
  by comparing to prior scans — early history holds LLM-era hallucinated counts (e.g. 661/836)
  that never happened, so any LLM comparison against them invents a false trend. The count-over-
  time comparison is read DETERMINISTICALLY from the history's `counts` fields by the router/dev-
  team, not editorialized by you. State the current number, flag a genuinely-NEW anomaly if found,
  and stop. (2026-06-20: the deterministic helper returned the correct 835, but the agent then
  narrated "661→835 +174 regression, potential row re-entry" by comparing to the prior hallucination.)

RECORD — append THIS scan to docs/data/db-integrity-history.json via the DETERMINISTIC
  helper (do NOT hand-write the file — the LLM kept OVERWRITING it to 1 entry). Build ONLY the
  entry BODY you discover (tables_checked + findings) as a JSON object and pipe it to the helper:
      echo '{ "tables_checked": N, "findings": [
        { "table": "...", "class": "FAIL|STALE|DUP|INCORRECT", "detail": "<what + the query result>",
          "verdict": "REAL|BY-DESIGN|NOISE", "root_cause_hypothesis": "...",
          "signal_id": "<id if reported, else null>" } ] }' | bash scripts/db-integrity-history-append.sh
  The helper STAMPS scan_ts (real `date -u`), EMBEDS the deterministic counts (from
  db-integrity-counts.sh), reads the existing ARRAY, appends ONE entry, caps at 200, atomic-writes,
  and HARD-ASSERTS length grew (prints {"ok":true,"history_len_before":B,"history_len_after":B+1}).
  Do NOT author scan_ts or counts yourself — the helper owns them. Copy the helper's before→after
  numbers into your report; if it exits non-zero (rc 2/3) the append FAILED — say so, never claim
  "appended". This is the historic trail (every scan logged, real + checked-clean) so dev-team and
  you can see recurrence; it only works as a trail if it APPENDS — never overwrite it by hand.

REPORT (genuine issues only → dev-team) — for each finding verdict=REAL, write ONE row to
  docs/data/orch/orch-state.json .signal_queue.rows[] per .claude/skills/signal-dashboard/SKILL.md:
    id: "sau-<YYYYMMDDTHHmmss>-dbN"   from: "system-auditor"   to: "dev-team"
    summary: "<≤120 chars: table + class + the specific defect>"   (NO raw payload)
    severity: CRITICAL (serving wrong data to users) | HIGH | MED | LOW
    status: "NEW"   payload_ref: "docs/data/db-integrity-history.json"
  MANDATORY post-write read-back assert: confirm the new id is in .signal_queue.rows[];
  if absent → FAIL LOUD ([SIGNAL-ROW-ASSERT] FAIL) + BUG-channel Telegram. DRAIN-INJECTION-SAFE:
  never shell-interpolate any finding/value into a command line — use bound params / a SQL file.

DEDUP (do NOT spam dev-team): before writing a signal, check the history file + the open
  .signal_queue rows — if the SAME table+class+defect is already NEW/READ (open) or was reported
  unchanged in the last scan, do NOT write a duplicate; note "already-open" in the history entry.

⚠ DEDUP-ENFORCEMENT — an anomaly is ALREADY-OPEN (do NOT write a new signal) if EITHER
  (a) a .task_board FIX-* task tracks its root, OR (b) a prior .signal_queue row for the same
  table+defect has status NEW / READ / TRIAGED / ACUTE-RESOLVED-ROOT-TRACKED.
  Canonical recurring example: the held scheduler_locks weeklyPortfolioReport lock is
  board-tracked by FIX-SCHEDULER-LOCK-NO-RELEASE-TTL — RECORD-AND-LEAVE, never re-signal,
  regardless of lock age or weekly re-acquisition. Once FIX-SCHEDULER-LOCK-NO-RELEASE-TTL ships
  the example self-resolves, but this generic guard stays valid for any future board-tracked root.

⚠ DETECTION-ONLY — NEVER RESOLVE, NEVER CLAIM A FIX (mandatory boundary):
  You ONLY ever write a NEW row, or leave an existing open row untouched. You MUST NOT flip
  any signal status to DONE / DONE-LIVE-VERIFIED / RESOLVED / SUPERSEDED / TRIAGED — resolving a
  signal is dev-team/qa's job AFTER a real fix ships. You MUST NOT write any value (released_at,
  status, _verified) into the live DB or claim an ops/dev action ("ops cleared it", "lock
  released", "fix deployed") you did NOT personally witness in THIS run's read-only output. If a
  prior-scan anomaly now READS clean live (e.g. a held lock now shows released_at set), RECORD that
  observation in the history (verdict + the raw value you read) and leave the open signal AS-IS for
  dev-team to close — do NOT self-close it, and NEVER invent the cause of the change. The DB access
  uses `sqlite3 "file:...?immutable=1"` ONLY (NOT -readonly — see DB ACCESS note above); never UPDATE/INSERT/DELETE.
  (2026-06-20: a sweep self-marked its own stale-lock signal DONE-LIVE-VERIFIED with a fabricated
  "ops cleared, released 2026-06-14 16:00:01" claim — released_at==acquired_at, RestartCount=0/no
  restart, origin unexplained. A detection-only agent closing its own signal on an unwitnessed
  fix is a false-green that masks the unresolved root cause. RECORD-AND-LEAVE, never self-resolve.)

⚠ HISTORY MUST APPEND, NOT OVERWRITE (mandatory): docs/data/db-integrity-history.json is a
  top-level JSON ARRAY of scan entries and is the durable trail. READ the existing array, APPEND
  exactly one new entry, keep the last 200, write once. NEVER emit a 1-element array that discards
  prior scans — that destroys the trail. Confirm post-write that `jq 'length'` GREW by 1 (or is
  capped at 200); if it dropped to 1, you OVERWROTE — FAIL LOUD and do not claim "entry #N appended".
  (2026-06-20: sweeps narrated "entry #16…#20, last 200 kept" while the file held a SINGLE entry —
  the LLM rewrote the whole file each tick instead of appending. State only what `jq length` proves.)

The dev-team hourly cron (:07) drains the signal → PO triages → mints a fix task →
dispatches the owning zone dev → root-cause permanent fix → qa → done_verified.
You do not fix; you detect, record, and report.
PROMPT_EOF
)
```

**Job 2 — db-data-integrity, daily off-hours backstop**

> Same prompt as Job 1 (byte-identical, per `cron-db-data-integrity.md`'s own "both jobs,
> byte-identical" note) — only the `cron` expression differs.

```
CronCreate(
  description : "db-data-integrity — daily off-hours backstop (CADRAT-2 Job B)",
  cron        : "15 22 * * *",
  recurring   : true,
  durable     : true,
  prompt      : <<'PROMPT_EOF'
Run: bash scripts/agents-flow/db-integrity-probe.sh and read its exit code + one-line JSON verdict. If exit code = 0 (verdict=SKIP-SPAWN): done, log '[cron-db-data-integrity] SKIP-SPAWN (no watched table row-count changed since last sweep)', do NOT spawn a subagent. FAIL-OPEN on anything else — exit code 1 (verdict=SPAWN, includes probe faults/missing snapshot/first-run): proceed to the existing prompt body below unchanged.

Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
AUDIT_TIER=DATA
MCP: https://zenmidi.com/vn-market/mcp

DB DATA-ANOMALY SWEEP (detection only — do NOT fix the DB; report to dev-team via signal).

DB ACCESS — the live DB is the named volume, NOT host ./data and NOT the mcp-server
container (it has no sqlite3). Query read-only via the keinos/sqlite3 sidecar:
  docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 \
    sqlite3 "file:/data/market.db?immutable=1" "<SQL>"
Note: use file:?immutable=1, NOT sqlite3 -readonly. After the mcp-server writer restarts and
recreates market.db-shm with its uid, a different-uid sidecar cannot attach that -shm to build
the WAL index -> SQLITE_READONLY(8) -> empty result -> all counts null. immutable=1 bypasses
WAL/-shm entirely and is always safe for a read-only observer.
Canonical DB = /data/market.db (≈300MB). Ignore the 0-byte legacy decoys
(market_data.db, market_intelligence.db, main.db).

CHECK these high-value tables for the 4 anomaly classes (use cheap AGGREGATE queries —
COUNT/MIN/MAX/GROUP BY — not full-table dumps):
  daily_ohlcv, market_prices, market_prices_history, vn_index_cache,
  alerts, price_alerts, alert_engine_records, agent_signals, signal_outcomes,
  financial_reports, macro_indicators, sbv_rates, fred_series_daily,
  deep_fetch_queue, deep_fetch_stats, cron_job_runs, scheduler_locks.

ANOMALY CLASSES:
  1. FAIL/MISSING   — a table that should have rows is empty/0; NULL in a NOT-NULL-intent
                      column; failed/stuck rows (e.g. deep_fetch_queue status='failed' or
                      rows stuck 'pending' > N hours; cron_job_runs last run errored).

                      WRITER-PROVENANCE DISCRIMINATOR (MANDATORY, run BEFORE assigning
                      severity to ANY 0-row table this cycle — FIX-AUDITOR-EMPTYTABLE-CHECK-
                      NO-WRITER-DISCRIMINATOR; full policy: docs/agents/system-auditor/flow/
                      data-writer-provenance.md §1-2). Confirmed false positives 2026-08-06
                      (price_alerts, alert_engine_records) shipped CRITICAL "pipeline
                      non-functional" with no check of WHETHER the table has a production
                      writer at all, and pdf_documents was reported "failed, actual=0" when
                      the table does not exist as a table at all — SCHEMA-MISSING and
                      EMPTY-TABLE are DISTINCT findings, never render them identically.
                      For EVERY watched table that reads 0 rows this cycle, run the
                      DETERMINISTIC classifier and use its output verbatim — do NOT hand-judge
                      writer provenance or missing-vs-empty yourself:
                          bash scripts/db-empty-table-classify.sh <table>
                      It runs `SELECT 1 FROM sqlite_master WHERE type='table' AND
                      name=<table>` BEFORE any COUNT(*) (so a genuinely missing table can
                      never be scored as "empty"), then classifies writer provenance by
                      walking `INSERT INTO <table>` sites in source, and emits ONE JSON
                      object: `{table, exists, row_count, class, severity_ceiling,
                      writer_sites[]}`. Map `class`/`severity_ceiling` straight onto this
                      cycle's verdict — zero further LLM judgment required:
                        | class          | severity_ceiling                      | meaning -> verdict |
                        |----------------|----------------------------------------|---------------------|
                        | SCHEMA-MISSING | always_report                          | table does not exist at all (migration/schema gap) -> ALWAYS report, never silenced by this discriminator |
                        | a              | may_stay_critical                      | >=1 non-test writer site NOT exclusively an on-demand tool (scheduler job, application usecase, ingest route, etc.) -> 0 rows here MAY be CRITICAL, a real outage. NEGATIVE CONTROL: daily_ohlcv / market_prices classify "a" — verify they still fire before trusting any "quiet" result from this discriminator |
                        | b              | info_at_most_never_critical            | zero non-test writer sites exist against THIS db (every site found, if any, is test-only or targets a documented separate db file) -> INFO at most, NEVER CRITICAL/WARN — table is expected empty by construction |
                        | c              | info_or_warn_corroborate_to_escalate   | the only writer(s) are an on-demand MCP tool (path under apps/**/interface/mcp/tools/**) -> INFO/WARN — "nobody used the feature yet" != "pipeline broken"; only escalate with a corroborating signal (e.g. a related table shows activity) |
                      If the script exits non-zero (PROBE FAILURE, printed to stderr), record
                      that failure verbatim — never guess a class or fall back to free-text
                      judgment. Confirmed FPs this closes: price_alerts -> class c (sole
                      writer `priceAlertTools.ts` is on-demand); alert_engine_records ->
                      class b (market.db's copy has zero production writers — the one Go
                      writer that exists, `apps/alert-engine/pkg/infrastructure/sqlite.go`,
                      writes to a SEPARATE `alert_engine.db` file, confirmed empirically:
                      that file has no `alert_engine_records` table at all).
  2. STALE/UNAVAIL  — newest timestamp far older than expected (e.g. daily_ohlcv / market_prices
                      not updated within the last trading session; sbv_rates / macro_indicators
                      > 48h old; a feed's max(updated_at) implausibly old).
  3. DUPLICATE/REPEAT— same logical key duplicated (e.g. (ticker,date) appearing >1 in daily_ohlcv;
                      identical alert fired repeatedly; repeated identical macro values across days
                      where they should vary).
  4. INCORRECT/ALEATOR (out-of-range / implausible)
                      — OHLCV scale anomalies (close/open differing from peers by ~1000x, the
                      known x1000 class); price = 0 or negative; volume < 0; O/H/L/C violating
                      H>=O,C,L and L<=O,C; RSI/indicator pegged at 100.0 or single-digit artifacts;
                      usd/vnd or index values outside a sane band; a numeric column whose value
                      is a statistical outlier (>~5σ) vs its own recent history.

THINK BEFORE REPORTING (correct-thinking gate, mandatory):
  For each candidate, ROOT-CAUSE-think first — is it a REAL defect or expected?
  Plausibility-check magnitudes/relationships (non-empty/real-shaped is the FLOOR, not the bar).
  Cross-check against known by-design states (e.g. illiquid ticker → honest gap is OK;
  low extraction_confidence on a scanned PDF is flagged-not-broken). Do NOT report noise.
  Only CONFIRMED anomalies proceed to a signal.

COUNT-NOISE TOLERANCE (regression monitor): live-DB counts wobble by ±1-2 under concurrent
  writes. A delta of ±1-2 on a known anomaly is MEASUREMENT NOISE, not a regression — record
  the count but do NOT call ±1-2 "changed/regression". Only a MATERIAL move is a real change:
  a drop toward 0 (a fix landed), a jump of ≥~5, or a fresh recent-dated violating row.

⚠ NO HALLUCINATED COUNTS (mandatory — confabulation guard):
  For the canonical anomaly COUNTS (OHLC violations, scale anomalies, vnindex-cache rows,
  low-confidence reports) you MUST run the DETERMINISTIC helper and copy its numbers VERBATIM:
      bash scripts/db-integrity-counts.sh
  It emits JSON `{ "scan_ts", "counts": {ohlc_violations_count, scale_gt100x_count,
  vnindex_cache_rows_count, low_confidence_reports_count}, "context": {...} }` straight from
  sqlite. (Renamed 2026-08-06, FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR item 3 —
  formerly `db1_ohlc_violations`/`db2_scale_gt100x`/`db3_vnindex_cache_rows`/
  `c04_low_confidence_reports`; `c04` visually collided with system-auditor's OFFICIAL Tier-3
  `C-04`/`C-08` checks, a different check family. Rename only, no query changed.)
  Use those exact numbers in the history entry + the regression check — NEVER a number you
  recalled/estimated/expected, and NEVER invent a narrative for a change the script didn't show.
  Use your own ad-hoc sidecar queries ONLY for discovering NEW anomalies + classification, not
  for re-counting the known four. Do NOT assume a direction (REBUILD_REQUIRED ⇒ fix may not be
  live). If the helper fails, record null + say so — never a guessed number.
  (2026-06-20: an LLM-counted sweep hallucinated 836→661 "-175 fix deployed" — real count 835,
  fix not deployed, nothing cleaned. This helper + the router's material-change raw-verify exist
  precisely to kill that confabulation class.)

⚠ NO TREND NARRATION (record, don't editorialize): your job is to RECORD the helper's exact
  count + discover NEW anomalies. Do NOT narrate "regression / improvement / +N / -N / re-entry"
  by comparing to prior scans — early history holds LLM-era hallucinated counts (e.g. 661/836)
  that never happened, so any LLM comparison against them invents a false trend. The count-over-
  time comparison is read DETERMINISTICALLY from the history's `counts` fields by the router/dev-
  team, not editorialized by you. State the current number, flag a genuinely-NEW anomaly if found,
  and stop. (2026-06-20: the deterministic helper returned the correct 835, but the agent then
  narrated "661→835 +174 regression, potential row re-entry" by comparing to the prior hallucination.)

RECORD — append THIS scan to docs/data/db-integrity-history.json via the DETERMINISTIC
  helper (do NOT hand-write the file — the LLM kept OVERWRITING it to 1 entry). Build ONLY the
  entry BODY you discover (tables_checked + findings) as a JSON object and pipe it to the helper:
      echo '{ "tables_checked": N, "findings": [
        { "table": "...", "class": "FAIL|STALE|DUP|INCORRECT", "detail": "<what + the query result>",
          "verdict": "REAL|BY-DESIGN|NOISE", "root_cause_hypothesis": "...",
          "signal_id": "<id if reported, else null>" } ] }' | bash scripts/db-integrity-history-append.sh
  The helper STAMPS scan_ts (real `date -u`), EMBEDS the deterministic counts (from
  db-integrity-counts.sh), reads the existing ARRAY, appends ONE entry, caps at 200, atomic-writes,
  and HARD-ASSERTS length grew (prints {"ok":true,"history_len_before":B,"history_len_after":B+1}).
  Do NOT author scan_ts or counts yourself — the helper owns them. Copy the helper's before→after
  numbers into your report; if it exits non-zero (rc 2/3) the append FAILED — say so, never claim
  "appended". This is the historic trail (every scan logged, real + checked-clean) so dev-team and
  you can see recurrence; it only works as a trail if it APPENDS — never overwrite it by hand.

REPORT (genuine issues only → dev-team) — for each finding verdict=REAL, write ONE row to
  docs/data/orch/orch-state.json .signal_queue.rows[] per .claude/skills/signal-dashboard/SKILL.md:
    id: "sau-<YYYYMMDDTHHmmss>-dbN"   from: "system-auditor"   to: "dev-team"
    summary: "<≤120 chars: table + class + the specific defect>"   (NO raw payload)
    severity: CRITICAL (serving wrong data to users) | HIGH | MED | LOW
    status: "NEW"   payload_ref: "docs/data/db-integrity-history.json"
  MANDATORY post-write read-back assert: confirm the new id is in .signal_queue.rows[];
  if absent → FAIL LOUD ([SIGNAL-ROW-ASSERT] FAIL) + BUG-channel Telegram. DRAIN-INJECTION-SAFE:
  never shell-interpolate any finding/value into a command line — use bound params / a SQL file.

DEDUP (do NOT spam dev-team): before writing a signal, check the history file + the open
  .signal_queue rows — if the SAME table+class+defect is already NEW/READ (open) or was reported
  unchanged in the last scan, do NOT write a duplicate; note "already-open" in the history entry.

⚠ DEDUP-ENFORCEMENT — an anomaly is ALREADY-OPEN (do NOT write a new signal) if EITHER
  (a) a .task_board FIX-* task tracks its root, OR (b) a prior .signal_queue row for the same
  table+defect has status NEW / READ / TRIAGED / ACUTE-RESOLVED-ROOT-TRACKED.
  Canonical recurring example: the held scheduler_locks weeklyPortfolioReport lock is
  board-tracked by FIX-SCHEDULER-LOCK-NO-RELEASE-TTL — RECORD-AND-LEAVE, never re-signal,
  regardless of lock age or weekly re-acquisition. Once FIX-SCHEDULER-LOCK-NO-RELEASE-TTL ships
  the example self-resolves, but this generic guard stays valid for any future board-tracked root.

⚠ DETECTION-ONLY — NEVER RESOLVE, NEVER CLAIM A FIX (mandatory boundary):
  You ONLY ever write a NEW row, or leave an existing open row untouched. You MUST NOT flip
  any signal status to DONE / DONE-LIVE-VERIFIED / RESOLVED / SUPERSEDED / TRIAGED — resolving a
  signal is dev-team/qa's job AFTER a real fix ships. You MUST NOT write any value (released_at,
  status, _verified) into the live DB or claim an ops/dev action ("ops cleared it", "lock
  released", "fix deployed") you did NOT personally witness in THIS run's read-only output. If a
  prior-scan anomaly now READS clean live (e.g. a held lock now shows released_at set), RECORD that
  observation in the history (verdict + the raw value you read) and leave the open signal AS-IS for
  dev-team to close — do NOT self-close it, and NEVER invent the cause of the change. The DB access
  uses `sqlite3 "file:...?immutable=1"` ONLY (NOT -readonly — see DB ACCESS note above); never UPDATE/INSERT/DELETE.
  (2026-06-20: a sweep self-marked its own stale-lock signal DONE-LIVE-VERIFIED with a fabricated
  "ops cleared, released 2026-06-14 16:00:01" claim — released_at==acquired_at, RestartCount=0/no
  restart, origin unexplained. A detection-only agent closing its own signal on an unwitnessed
  fix is a false-green that masks the unresolved root cause. RECORD-AND-LEAVE, never self-resolve.)

⚠ HISTORY MUST APPEND, NOT OVERWRITE (mandatory): docs/data/db-integrity-history.json is a
  top-level JSON ARRAY of scan entries and is the durable trail. READ the existing array, APPEND
  exactly one new entry, keep the last 200, write once. NEVER emit a 1-element array that discards
  prior scans — that destroys the trail. Confirm post-write that `jq 'length'` GREW by 1 (or is
  capped at 200); if it dropped to 1, you OVERWROTE — FAIL LOUD and do not claim "entry #N appended".
  (2026-06-20: sweeps narrated "entry #16…#20, last 200 kept" while the file held a SINGLE entry —
  the LLM rewrote the whole file each tick instead of appending. State only what `jq length` proves.)

The dev-team hourly cron (:07) drains the signal → PO triages → mints a fix task →
dispatches the owning zone dev → root-cause permanent fix → qa → done_verified.
You do not fix; you detect, record, and report.
PROMPT_EOF
)
```

**Job 3 — agent-father, daily orphan+roster sweep**

```
CronCreate(
  description : "agent-father daily orphan+roster sweep",
  cron        : "23 14 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=agent-father). Read and execute docs/agents/agent-father/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 4 — claude-manager-helper, Mon+Thu repo drift heal**

> ⚠️ CronCreate fires at MACHINE-LOCAL time (France), NOT UTC — see
> `cron-claude-manager-helper.md`'s own DST note. `30 19 * * 1,4` is the CEST (summer) expression;
> switch to `30 18 * * 1,4` for CET (winter) per that doc.

```
CronCreate(
  description : "claude-manager-helper Mon+Thu repo drift heal",
  cron        : "30 19 * * 1,4",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=claude-manager-helper). Read and execute docs/agents/claude-manager-helper/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

**Job 5 — code-janitor, every 6h DRY-hygiene sweep**

```
CronCreate(
  description : "code-janitor every-6h DRY-hygiene sweep",
  cron        : "0 */6 * * *",
  recurring   : true,
  durable     : true,
  prompt      : "Launch subagent (subagent_type=code-janitor). Read and execute docs/agents/code-janitor/flow/main.md\nMCP: https://zenmidi.com/vn-market/mcp"
)
```

On each success: log `[cron-standalone-team] Registered <job-name> (id=<id>).`

On each failure: log error verbatim +
`send_telegram(channel="bug", "[cron-standalone-team] CronCreate FAILED for <job-name>: <error>")`.
Do NOT retry. Continue with remaining jobs.
