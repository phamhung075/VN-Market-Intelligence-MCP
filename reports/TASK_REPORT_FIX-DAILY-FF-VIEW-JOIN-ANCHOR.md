## Task Report FIX-DAILY-FF-VIEW-JOIN-ANCHOR

**Type:** Merge-gate signoff (CI-RED-29f92c5b unblocker) | **Dev commit:** d71f45949 | **Architect brief:** docs/architecture-briefs/2026-07-13-daily-ff-view-join-anchor.md (SHAPE=A)

### Scope
```
apps/mcp-server/src/infrastructure/db/schema-market-data.ts   | 30 ++++++++++++++++++++--
apps/mcp-server/src/__tests__/daily-foreign-flow-schema.test.ts | 22 ++++++++++------
docs/agent-memory/decisions/sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md | +9
docs/agent-memory/notebooks/dev-mcp-server.md                 | +12
docs/architecture/microservice/mcp-server/infrastructure.md   | +20/-1
```
Exactly 1 production file + 1 companion test file + 3 docs. `daily-foreign-flow-integration.test.ts` NOT touched (as instructed — its 2 RED-by-design assertions pass raw as a side effect).

### View SQL — byte-verified against brief
Read live `schema-market-data.ts:162-200` directly (not the diff hunk alone): `DROP VIEW IF EXISTS daily_ohlcv_with_flow;` followed by unconditional `CREATE VIEW daily_ohlcv_with_flow AS` — matches brief exactly: existing `LEFT JOIN` half unchanged, `UNION ALL` anti-join half over `daily_foreign_flow` (`WHERE o.code IS NULL`), 15 columns identical order both halves, price cols + `data_env` NULL on anti-join half, `updated_at = f.updated_at`. No deviation from the brief's prescribed SQL.

### Tests — RAW, independently re-run (not trusted from dev/router claims)
- Merge-gate pair: `bun test daily-foreign-flow-integration.test.ts daily-foreign-flow-schema.test.ts` → **20 pass / 0 fail / 85 expect()** — matches router's RAW number exactly.
- Companion R-1 assertion diff confirmed exact: `toBe(0)` → `toBe(1)`, added `expect(row.foreign_buy_vol).toBe(300)` + `expect(row.close).toBeNull()`, stale "anchored on daily_ohlcv, zero rows" comment replaced with anti-join-UNION-ALL explanation. Matches brief §"Regression requiring a companion test-assertion fix" verbatim (toBe(1) + foreign_buy_vol assertion + comment update, all three prescribed changes present).
- Isolation + consumer sweep (own selection, 9 files touching the view or its 5 Class-A consumers): `1518-get-foreign-flow-ohlcv-source.test.ts`, `MSG-1-market-foreign-flow.test.ts`, `1134-get-foreign-flow-tool.test.ts`, `1516-france-summary-foreign-flow.test.ts`, `1517-foreign-flow-alert-ohlcv-source.test.ts`, `1503-ohlcv-foreign-flow.test.ts`, `1133-foreign-flow-alert-job.test.ts`, `FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts`, `TASK-2004-daily-ff-class-b-probes.test.ts` → **79 pass / 0 fail / 170 expect()**.
- `bun tsc --noEmit` (apps/mcp-server) → **0 errors, exit 0**.
- Combined independent total: **99 pass / 0 fail** across 11 files. Did NOT re-run the full 1203-file suite (documented Bun-native tail-crash + LOCAL single-process resource exhaustion, non-tick-appropriate per dispatch instruction; CI ran the equivalent full suite green through 07-12 bcac7c399, first-red is 29f92c5be which is this same gate-freeze, not a prior regression).

### DDD / layering
- Sole production file: `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` — infrastructure/db layer only.
- Diff contains zero new/changed `import` lines (grep confirmed) — no new domain→infrastructure edge, no new ports/interfaces.
- Change is a SQL view-definition edit inside an existing `db.exec()` call — no new exported symbol, no new function signature.
- `git show --stat` confirms zero `domain/`, `application/`, or other production files touched.
- Verdict: **DDD PASS** — matches architect brief's own "zero domain-layer touch" claim, independently confirmed.

### Security
No new SQL string concatenation with user input (static schema DDL, same pattern as surrounding code); no `process.env`/secrets in the diff.

### Verdict
tests: 99 pass / 0 fail (RAW, independently run) | tsc: 0 errors | ddd: PASS | security: PASS

**APPROVED.**

### Blocking issues
None.

### Merge / push
CI-red freeze in effect — merge/push is PO-gated per dispatch instruction. QA did not merge, did not push, did not touch `orch-state.json` (.head/.task_board owned by router this chain).
