# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 084 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1286 | fix(schema): add daily_ohlcv table to initDatabase() — SQLiteError unblocks 172/179/1081 | Dev | infrastructure | — | fix/1286-daily-ohlcv-schema | Review |
| 1287 | fix(cascade): R09/R11 rule drift in predictionCascadeMapper — war/conflict and inflation rules | Dev | domain | — | — | Todo |
| 1288 | fix(pollNews): PollNewsResult shape mismatch in test 102 | Dev | application | 1286 | — | Todo |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 1 Review.

## Sprint 083 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1285 | fix(cooldown): macro_deviation alerts bypass step E cooldown — sent 4x in 1h | Done |
| 1284 | schema.ts: replace process.env["DB_PATH"] fallback with Bun.env exclusively | Done |
| 1283 | Code janitor scan: post-082 clean-state audit (checks 1-5) | Done |

## Sprint 082 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1281 | Alert cooldown config drift: step E hardcodes 60 min vs config 30 min | Done |
| 1282 | Sector classification duplication: mcp.config.json referenceStocks vs SECTOR_PEERS | Done |
| 1283 | Code janitor scan: post-082 clean-state audit (checks 1-5) | Done |

## Sprint 081 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1266 | Fix: HUT false positive — Vietnamese word "hụt" triggering HUT ticker NER | Done |
| 1251–1265 | Domain bug batch (archived) | Done |

---

## Task Details (active tasks only — Done tasks archived)

### 1286 — fix(schema): add daily_ohlcv table to initDatabase()

**Symptom:** 30+ tests across suites 172, 179, 1081, 1124, and 1007 fail with `SQLiteError: no such table: daily_ohlcv`. These tests use `:memory:` DB via `initDatabase()`, which does not create `daily_ohlcv`. The table exists in the production DB (created by a migration at some point) but was never added to the baseline `CREATE TABLE IF NOT EXISTS` block in `schema.ts`.

**Fix:** Add `CREATE TABLE IF NOT EXISTS daily_ohlcv (...)` to `initDatabase()` in `src/infrastructure/db/schema.ts`. Schema must match what production queries expect (ticker, date, open, high, low, close, volume at minimum). Check existing callers of `daily_ohlcv` in the codebase to derive the correct column set.

**Also:** Clear the stale finding in `docs/data/code-janitor-known-findings.json` — the DomainTypeEnum finding was resolved in sprint 083 but the file was not updated.

**Test:** `src/__tests__/1286-daily-ohlcv-schema.test.ts`
- Verify `initDatabase()` creates `daily_ohlcv` table.
- Verify tests 172 and 179 pass after the fix (run as regression).

---

### 1287 — fix(cascade): R09/R11 rule drift in predictionCascadeMapper

**Symptom:** Test 165 fails on:
- R09: "war/conflict → aviation bearish, oil_gas bullish" — `predictionCascadeMapper` no longer produces an `oil_gas bullish` or `aviation bearish` match for war/conflict text.
- R11: "inflation → banking neutral, real_estate bearish" — banking neutral not produced.
- Multi-rule test: rich text with Fed + oil + inflation produces fewer than 3 results.

**Root cause:** Cascade rules in `predictionCascadeMapper.ts` or `cascadeEngine.ts` have drifted since task 165 was written. Rule keywords, domain mappings, or sentiment assignments have changed.

**Fix:** Align `predictionCascadeMapper` rules to restore R09 and R11 behaviour. Do NOT change test expectations — fix the rule logic to match the original contract. If the rules were intentionally changed, update the test with a comment explaining the new intent and adjust AC accordingly (but prefer fixing the logic).

**Test:** `src/__tests__/165-prediction-cascade-mapper.test.ts` — all ACs must pass.

---

### 1288 — fix(pollNews): PollNewsResult shape mismatch in test 102

**Symptom:** Test 102 fails on:
- `returns PollNewsResult with correct shape on empty fetch` — `result` does not match expected object shape.
- `inserts new items and returns correct counts` — inserted/duplicates/errors counts are wrong.
- `counts errors per failing source but continues other sources` — error count is wrong.

**Root cause:** `pollNews()` return type (`PollNewsResult`) has drifted from what test 102 expects. Either the interface gained/lost fields, or the counting logic changed.

**Fix:** Align `pollNews()` return shape and counting to satisfy the test 102 contract. Depends on 1286 (DB must initialize correctly first).

**Test:** `src/__tests__/102-job-news-poll.test.ts` — all ACs must pass.

---

### 1285 — fix(cooldown): macro_deviation alerts bypass step E cooldown

**Symptom:** `macro_deviation` alert for the same condition (-2σ, VN30 derivatives expiry) fires to Telegram 4 times within 1 hour (12:13, 12:29, 12:46, 13:16). Cooldown should suppress repeats within 30 min.

**Root cause — two separate gaps, both must be fixed:**

1. **Cooldown history query excludes suppressed-and-skipped alerts (step E, line ~807–815).**
   The history SQL is:
   ```sql
   SELECT ... FROM alerts WHERE notified_telegram = 1 AND triggered_at > datetime('now', '-2 hours')
   ```
   When an alert is *suppressed* by cooldown, step E calls `markAlertNotified(alert.id)` (sets `notified_telegram = 1`) and then `continue`s — so the suppressed alert IS marked. However for a macro alert that *successfully sends*, it is also marked `notified_telegram = 1`. The problem is that step E only prepends a just-sent alert into `recentAlertHistory` in-memory **after** `sent > 0`, but NOT when the send is skipped due to `sent === 0` (i.e. `defaultSendAlerts` returned 0 because `notifyTelegramAlert` failed silently). When Telegram send fails, `markAlertNotified` is not called and `recentAlertHistory` is not updated — so the next cycle finds the same unnotified alert again, bypasses cooldown (because history is empty for that stock), and sends it again.

2. **Cooldown history mapping extracts `stocks` as a single string, but macro alerts store `actionCode = "MACRO"` — this is correct. The real break is that `recentAlertHistory` is built from `notified_telegram = 1` rows only (line 808). A macro alert that fires and succeeds IS marked. But the in-cycle in-memory append (line 851–856) appends `stocks: alert.actionCode` ("MACRO") — this part works. The actual failure path is: `defaultSendAlerts` calls `notifyTelegramAlert(alert)` which returns `true`, `markAlertNotified` is called, BUT the `ALERT_WINDOW_MS` is 24 hours — meaning the SAME macro alert row (same deterministic `id = macro-{date}-{name}-{level}`) is deduped by `INSERT OR IGNORE` in step A2.5, so it is only stored ONCE. Yet step E's `readUnnotifiedAlerts` uses `notified_telegram = 0` — once the first send marks it `notified_telegram = 1`, it should not reappear. Contradiction: user sees 4 sends for same condition.**

   **Actual root cause (confirmed by tracing the deterministic id):** The macro alert id is `macro-{today}-{dev.name}-{dev.level}`. Step A2.5 runs on every 15-min cycle. `INSERT OR IGNORE` means if the row already exists (from cycle 1, now `notified_telegram = 1`), the insert is silently skipped — the existing row with `notified_telegram = 1` remains. So the second cycle's step E query `WHERE notified_telegram = 0` should NOT find it. This means a different condition is producing the repeat: `dev.name` or `dev.level` changes between cycles (e.g. a different macro stat crosses the threshold each time), producing a *new* unique id each cycle. The cooldown check then faces `stocks: "MACRO"` + `signalTypes: "macro_deviation"` — and the in-memory `recentAlertHistory` snapshot IS populated from `notified_telegram = 1` rows. But there is **one more gap**: the `recentAlertHistory` SQL window is `-2 hours`, while the cooldown window is `cooldownMinutes` (30 min from config). The `-2 hours` window is wide enough. So the suppression should work — **unless `shouldSuppressAlert` receives `stocks: ["MACRO"]` but `recentAlertHistory` entries have `stocks: "MACRO"` and the comparison is strict-equality which should match.**

   **True root cause (after full trace):** Step E's `recentAlertHistory` builder (lines 806–815) maps `r.affected_actions_json ? JSON.parse(r.affected_actions_json)?.[0]?.code ?? ""`. For macro alerts, `storeAlerts` writes `JSON.stringify([{ code: alert.actionCode }])` = `[{"code":"MACRO"}]`. So `stocks` = `"MACRO"`. In `shouldSuppressAlert`, `recent.stocks !== stock` compares `"MACRO" !== "MACRO"` = false → passes through to check signal overlap. The signal type is `"macro_deviation"`. This SHOULD suppress. **The real break is that `recentAlertHistory` is loaded BEFORE the loop and only queries `notified_telegram = 1` rows — but when a previous cycle's macro alert send fails silently (Telegram 429 or network error), `markAlertNotified` is never called, so `notified_telegram` stays 0. The next cycle finds it again as an unnotified alert AND does not find it in `recentAlertHistory` (because it is still `notified_telegram = 0`). This is the missing path: silently-failed sends do not populate the cooldown history.**

**Fix approach:**

Two-part fix in `intelligenceCycleJob.ts` step E:

1. **Broaden the cooldown history query** (lines 806–815) to include BOTH `notified_telegram = 1` (confirmed sent) AND `notified_telegram = 0` rows that are older than the alert window overlap (i.e. already attempted once). Simpler alternative: change the WHERE clause to remove the `notified_telegram = 1` filter — include all alerts triggered in the last N hours regardless of notification status. The cooldown should fire if the alert *exists in DB* within the window, regardless of whether Telegram delivery was confirmed.

   ```sql
   SELECT affected_actions_json, signals_json, triggered_at
   FROM alerts
   WHERE triggered_at > datetime('now', '-2 hours')
   ```
   (Remove `AND notified_telegram = 1`)

2. **Add in-memory history append for send failures too.** When `sent === 0` (Telegram send failed), still append to `recentAlertHistory` with current timestamp so within-cycle siblings are suppressed. Currently the append only happens inside `if (sent > 0)`.

**Test:** `src/__tests__/1285-macro-cooldown.test.ts`
- Verify that a macro_deviation alert with `notified_telegram = 0` already in history (simulating a failed first send) causes `shouldSuppressAlert` to return true on the second cycle.
- Verify that a successful send followed by the same macro alert in the next cycle is suppressed.
- Verify that two different macro indicators crossing threshold in the same cycle are NOT suppressed against each other (different signal name in id, but same signal type — acceptable to suppress by type).

---

### 1283 — Code janitor scan (post-082)

**Problem:** Both findings from the 2026-04-15 janitor scan (1281, 1282) have been resolved. The `code-janitor-known-findings.json` has been cleared. A fresh scan is needed to confirm the codebase is clean or surface any new drift.

**Fix:** Run all 5 janitor checks against the current main branch. Record results in `docs/data/code-janitor-known-findings.json`. If new findings: create tasks. If clean: commit the empty findings file.

**Test:** `src/__tests__/1283-janitor-scan.test.ts` — verify canonical sources match their consumers (spot-check checks 1, 2, 5).

---

### 1284 — schema.ts: Bun.env migration

**Problem:** `src/infrastructure/db/schema.ts` lines 64 and 550 use `process.env["DB_PATH"] ?? Bun.env["DB_PATH"]`. In production (Bun runtime), `process.env` is a compatibility shim — `Bun.env` is canonical. The dual-check pattern was flagged as non-blocking in the 1282 QA review.

**Fix:** Replace `process.env["DB_PATH"] ?? Bun.env["DB_PATH"]` with `Bun.env["DB_PATH"]` at both sites. The `process.env` fallback is only needed in test environments where Bun injects `process.env` from `beforeAll` — replace with `Bun.env` and update test setup to use `Bun.env` injection instead.

**Test:** `src/__tests__/1284-schema-bun-env.test.ts` — verify `initDatabase()` path resolution uses `Bun.env["DB_PATH"]`.
