# Decision Journal — Sprint FACTORY-INFRA-agentSignal-sql-binding · dev-mcp-server

**Sprint goal:** Replace string-interpolated SQL with bound placeholders in agentSignalStore READ paths (SQL-injection/correctness fix).
**Agent:** dev-mcp-server
**Started:** 2026-07-24T05:29:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T05:29:00Z
**task-id:** FACTORY-INFRA-agentSignal-sql-binding
**what-done:** Investigated `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` — enumerated every READ-path SQL query, classified each interpolation site as (a) caller-supplied value needing a bind, or (b) a small hardcoded/compile-time literal (safe, left as-is).
**what-considered:**
- Sites with caller-supplied values interpolated into SQL text: `getSignals()` hoursBackClause (`${Math.ceil(...)}` minutes), `getSignals()` signalTypeClause (manually `'`-escaped string), `getSignals()` mark-as-read `UPDATE...WHERE id IN (${ids.join(',')})`, `getSignalEffectiveness()` days offset (`${days} days`, unescaped), `getSignalEffectiveness()` fromAgent/signalType conditions (manually `'`-escaped strings).
- Sites left unchanged: `statusClause`/`recipientClause`/`validationColumns`/`agentClause`/`processedClause` etc. — each holds one of a small set of hardcoded literal strings selected by a boolean/enum branch, never raw user text; `getChainFindings`, `getChainFromRoot`, `getPriceAnomalySignals`, `getSignalsGroupedByCausalRoot`, `getOpenChainFindings` were already fully bound (`?`) — no change needed there.
**why-decision:** Task explicitly frames this as a security-invariant fix (not cosmetic) — converted every caller-supplied-value site to the codebase's existing bind idiom (`?` params; `datetime('now', ? || ' days'/' minutes')` per cronJobRunStore.ts/agentWorkLogStore.ts precedent; generated placeholder `IN (${ids.map(()=>'?').join(',')})` per coordinationStore.ts/seedWatchlist.ts precedent) rather than leaving manual-escape or unescaped interpolation, even where empirical probing showed some sites (fromAgent/signalType string fields, hoursBack numeric field) were not actually exploitable pre-fix — binding is strictly safer and matches sibling-store convention.
**why-change:** No change from task scope. One additional finding beyond the task's own examples: `getSignalEffectiveness()`'s `days` field was genuinely unescaped (unlike fromAgent/signalType which had `.replace(/'/g, "''")`) — empirically verified via scratchpad probe script that a crafted `days` value corrupted the WHERE clause pre-fix (silent malformed single-null-row result) vs. a clean empty result post-fix. This is the one site in this file that was a live injection footprint; documented in test file comments.

---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T05:29:00Z
**task-id:** FACTORY-INFRA-agentSignal-sql-binding
**what-done:** Converted 5 READ-path interpolation sites in `agentSignalStore.ts` to bound placeholders; no structural (dynamic column/table name) interpolation existed in this file — the only structural-shape site was the `IN (${ids})` id-list, made safe via the generated-placeholder pattern (count derived from array length, values bound).
**what-considered:** Sites converted (query → fix):
1. `getSignals()` hoursBackClause: `datetime('now', '-${Math.ceil(hoursBack*60)} minutes')` → `datetime('now', ? || ' minutes')`, param `-${Math.ceil(...)}` bound.
2. `getSignals()` signalTypeClause: `s.signal_type = '${signalType.replace(/'/g,"''")}'` → `s.signal_type = ?`, param bound.
3. `getSignals()` mark-as-read: `UPDATE ... WHERE id IN (${ids.join(',')})` (raw `db.exec`) → `db.prepare(...).run(...ids)` with `ids.map(()=>'?').join(',')` generated placeholders.
4. `getSignalEffectiveness()` days: `datetime('now', '-${days} days')` → `datetime('now', ? || ' days')`, param `-${days}` bound.
5. `getSignalEffectiveness()` fromAgent/signalType: `from_agent = '${x.replace(/'/g,"''")}'` / `signal_type = '${x.replace(/'/g,"''")}'` → `from_agent = ?` / `signal_type = ?`, params bound (params array order matches condition-array order, both built together).
**why-decision:** Idiom copied verbatim from sibling stores already in the codebase (cronJobRunStore.ts:141, agentWorkLogStore.ts:187 for the `? || ' days'/' minutes'` datetime pattern; coordinationStore.ts:509, seedWatchlist.ts:351/360 for the generated-placeholder IN-list pattern) — zero new pattern introduced, consistent with existing conventions.
**why-change:** No change from task scope.

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-24T05:29:00Z
**task-id:** FACTORY-INFRA-agentSignal-sql-binding
**what-done:** Added `src/__tests__/FACTORY-INFRA-agentSignal-sql-binding.test.ts` (9 tests) — special-char round-trip proofs for signal_type/fromAgent containing a single quote, injection-payload-does-not-bypass-filter proofs, table-survives-DROP-payload proofs, and the load-bearing differential proof for the `days` field (stacked `'; DROP TABLE...--` payload: empirically verified pre-fix corrupted results with a malformed null row, post-fix returns a clean empty array, table always intact).
**what-considered:**
- Ran the exact test payloads against the pre-fix code (git stash) via scratchpad probe scripts to confirm which sites were genuinely exploitable vs. already-safe-by-coincidence (fromAgent/signalType manual escaping was actually correct SQL-literal escaping for SQLite; hoursBack's `Math.ceil(x*60)` arithmetic coercion neutralized non-numeric strings to `NaN`) before writing assertions that would be vacuous.
- Full 26-file agentSignalStore-dependent regression suite (277 tests) — 0 fail, identical results for normal inputs.
**why-decision:** A test that passes identically on both pre-fix and post-fix code proves nothing about the fix — only the `days` field produced a genuine differential (pre-fix: malformed/wrong result; post-fix: clean empty result), so that is the test asserting the strongest claim (`.not.toThrow()` + `.toEqual([])`); the other tests assert correctness/round-trip behavior and injection-non-bypass, which is real regression coverage even though those specific sites weren't independently exploitable before.
**why-change:** No change from task scope.
