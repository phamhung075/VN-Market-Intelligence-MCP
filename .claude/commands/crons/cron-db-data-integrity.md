# cron-db-data-integrity — Live DB Data-Anomaly Sweep → Signal → dev-team

**Purpose:** Every 30 min, an agent inspects the **live market DB** for *data* anomalies
(missing/failed, stale/unavailable, duplicate/repeat, incorrect/out-of-range — the "aleator"
class), records every finding to a JSON history, and writes GENUINE issues as signals to
`orch-state.json .signal_queue.rows[]` so the hourly dev-team cron drains them into permanent,
root-cause fixes. **Detection only — never fixes the DB directly.**

Complements `cron-system-auditor.md` Tier-3 (deep DB integrity, daily) with a frequent,
data-value-focused pass. Cadence offset to `:15/:45` to avoid colliding with the
system-auditor `*/30` (:00/:30) and dev-team `:07` crons.

---

## Create with CronCreate

- **cron**: `15,45 * * * *`   (every 30 min, offset)
- **recurring**: true
- **durable**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute docs/agents/system-auditor/flow/main.md
  AUDIT_TIER=DATA
  MCP: https://zenmidi.com/vn-market/mcp

  DB DATA-ANOMALY SWEEP (detection only — do NOT fix the DB; report to dev-team via signal).

  DB ACCESS — the live DB is the named volume, NOT host ./data and NOT the mcp-server
  container (it has no sqlite3). Query read-only via the keinos/sqlite3 sidecar:
    docker run --rm -v vn-market-intelligence-mcp_market_data:/data keinos/sqlite3 \
      sqlite3 -readonly /data/market.db "<SQL>"
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
    For the canonical anomaly COUNTS (db1 OHLC-violations, db2 scale, db3 vnindex-cache, c04
    low-confidence) you MUST run the DETERMINISTIC helper and copy its numbers VERBATIM:
        bash scripts/db-integrity-counts.sh
    It emits JSON `{ "scan_ts", "counts": {db1_ohlc_violations, db2_scale_gt100x,
    db3_vnindex_cache_rows, c04_low_confidence_reports}, "context": {...} }` straight from sqlite.
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

  RECORD — append THIS scan to docs/signals/db-integrity-history.json via the DETERMINISTIC
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
      status: "NEW"   payload_ref: "docs/signals/db-integrity-history.json"
    MANDATORY post-write read-back assert: confirm the new id is in .signal_queue.rows[];
    if absent → FAIL LOUD ([SIGNAL-ROW-ASSERT] FAIL) + BUG-channel Telegram. DRAIN-INJECTION-SAFE:
    never shell-interpolate any finding/value into a command line — use bound params / a SQL file.

  DEDUP (do NOT spam dev-team): before writing a signal, check the history file + the open
    .signal_queue rows — if the SAME table+class+defect is already NEW/READ (open) or was reported
    unchanged in the last scan, do NOT write a duplicate; note "already-open" in the history entry.

  ⚠ DETECTION-ONLY — NEVER RESOLVE, NEVER CLAIM A FIX (mandatory boundary):
    You ONLY ever write a NEW row, or leave an existing open row untouched. You MUST NOT flip
    any signal status to DONE / DONE-LIVE-VERIFIED / RESOLVED / SUPERSEDED / TRIAGED — resolving a
    signal is dev-team/qa's job AFTER a real fix ships. You MUST NOT write any value (released_at,
    status, _verified) into the live DB or claim an ops/dev action ("ops cleared it", "lock
    released", "fix deployed") you did NOT personally witness in THIS run's read-only output. If a
    prior-scan anomaly now READS clean live (e.g. a held lock now shows released_at set), RECORD that
    observation in the history (verdict + the raw value you read) and leave the open signal AS-IS for
    dev-team to close — do NOT self-close it, and NEVER invent the cause of the change. The DB access
    is `sqlite3 -readonly` ONLY; never drop -readonly, never UPDATE/INSERT/DELETE.
    (2026-06-20: a sweep self-marked its own stale-lock signal DONE-LIVE-VERIFIED with a fabricated
    "ops cleared, released 2026-06-14 16:00:01" claim — released_at==acquired_at, RestartCount=0/no
    restart, origin unexplained. A detection-only agent closing its own signal on an unwitnessed
    fix is a false-green that masks the unresolved root cause. RECORD-AND-LEAVE, never self-resolve.)

  ⚠ HISTORY MUST APPEND, NOT OVERWRITE (mandatory): docs/signals/db-integrity-history.json is a
    top-level JSON ARRAY of scan entries and is the durable trail. READ the existing array, APPEND
    exactly one new entry, keep the last 200, write once. NEVER emit a 1-element array that discards
    prior scans — that destroys the trail. Confirm post-write that `jq 'length'` GREW by 1 (or is
    capped at 200); if it dropped to 1, you OVERWROTE — FAIL LOUD and do not claim "entry #N appended".
    (2026-06-20: sweeps narrated "entry #16…#20, last 200 kept" while the file held a SINGLE entry —
    the LLM rewrote the whole file each tick instead of appending. State only what `jq length` proves.)

  The dev-team hourly cron (:07) drains the signal → PO triages → mints a fix task →
  dispatches the owning zone dev → root-cause permanent fix → qa → done_verified.
  You do not fix; you detect, record, and report.
  ```

---

## Run it

Paste the prompt block above into a `CronCreate` call (or ask the router to register it).
First run can be invoked once manually to seed `docs/signals/db-integrity-history.json` and
confirm the sidecar + signal write work before the cron takes over.

## Manage
`CronList` | `CronDelete <id>`

## Notes
- **Read-only DB access** (`sqlite3 -readonly`) — the sweep never mutates the DB; all fixes
  flow through dev-team. This honours the router/agent "detect ≠ fix" boundary.
- **Tune cadence** if the 30-min sweep strains the host (16GB cap, see host-memory-panic): a
  full-table outlier scan is heavier than aggregate checks — keep queries aggregate; drop to
  hourly (`15 * * * *`) if load climbs.
- **Deeper integration** (optional, later): the check battery could move into
  `docs/agents/system-auditor/flow/main.md` as a first-class `AUDIT_TIER=DATA` branch instead of
  living in this prompt — do that via the agent-flow owner if this proves load-bearing.
