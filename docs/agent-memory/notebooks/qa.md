# QA — Notebook

## c252 · 2026-05-22T09:15Z

**Sprint:** 1968d | **Tasks:** P01+P02 Wave 1 | **Session:** c252 — CHANGES_REQUESTED (both)

```
date: 2026-05-22
outcome: CHANGES_REQUESTED (P01 + P02)
commit reviewed: d2ca7c4f
zone: .claude/ only — smart-skip (no .ts changes)
smart_skip: YES
round: 1
```

| Check | P01 | P02 |
|-------|-----|-----|
| Zone: zero apps/ touch | PASS | PASS |
| Skill file size: ≤80L | PASS (77L) | PASS (69L) |
| AC-1 skill exists + anchor convention | PASS (with caveat — see issues) | PASS |
| AC-2 qa flow Step 0c | PASS | N/A |
| AC-3 developer flow Step 0c | PASS | FAIL (stale OVERWRITE comment at line 122) |
| AC-4 backward compat / blank-state Write | PASS (algorithm correct) | PASS |
| AC-5 no apps/ / ≤200L bound | PASS | PASS |
| Smoke test math verified | PASS (7.6%=628/8234) | PASS (3-cycle sim 47L≤200L) |
| HANDOFF_DELTA in all RETURN blocks | PASS | N/A |

**Blocking issues:**

P01 — `.claude/skills/handoff-delta-read/SKILL.md:11,22,48` — anchor format contradiction (no-space prose/JSON vs space code-block examples; grep pattern does not match examples; fallback detection broken for space-format).

P02 — `.claude/flows/developer/main.md:122` — stale "(OVERWRITE ... never append)" comment contradicts new section-overwrite pattern.

Signal: docs/signals/qa-1968d-wave1-changes.json emitted. Reports at reports/TASK_REPORT_1968d-P01.md + reports/TASK_REPORT_1968d-P02.md. Wave 2 gate BLOCKED.

## c251 · 2026-05-22

**Sprint:** 1971 | **Task:** STOCKPRICE-SCAN-ORDER-MISMATCH | **Session:** c251 — APPROVED

```
date: 2026-05-22
outcome: APPROVED
commit reviewed: bc515ab2
zone: apps/stock-price/ — Go service, fetchers.go + fetchers_test.go
smart_skip: NO — Go code change; full go test ./... required
round: 1
```

| Check | Result |
|-------|--------|
| AC-1: SEV-1 root cause confirmed — Scan order transposed vs SELECT (Low/High/Close/Open) since 1912c | PASS |
| AC-2: Fix at fetchers.go:239 — reordered to &c.Date,&c.Open,&c.High,&c.Low,&c.Close,&c.Volume matching SELECT | PASS |
| AC-3: TestSQLiteRepo_GetHistory_OHLCFieldParity — asymmetric seed, all 6 fields asserted individually | PASS |
| Go suite: pkg/application 7/7 | PASS |
| Go suite: pkg/domain PASS | PASS |
| Go suite: pkg/infrastructure 8/8 (incl. new OHLCFieldParity) | PASS |
| Go suite: pkg/interface/http 11/11 | PASS |
| DDD: domain/ zero infra imports | PASS |
| Security: no hardcoded secrets, parameterized SQL, no process.env | PASS |
| BCTC freeze NFR-3: zero BCTC files touched | PASS |
| Zone isolation: apps/stock-price/ only; mcp-server + .claude untouched | PASS |

Blocking: 0. Signal: docs/signals/qa-1971-done.json emitted. TASK_REPORT at reports/TASK_REPORT_1971.md.

## Carry-over

- Ops agent: `docker-compose build mcp-server && docker-compose up -d mcp-server` — deploy 1945d fixes
- Ops agent (from c188): `docker-compose build mcp-server && docker-compose up -d mcp-server` then `seedWatchlist` + verify PLX row in live DB
- Ops agent (from Sprint 1949): `docker-compose up -d mcp-server` — activate new cron schedule
- 1965c soak window closes 2026-05-23T18:00Z — emit soak result signal after that
- 1968c-P02 AC-7 mock failure tests: deferred to future hardening task
- 1968c-P01 AC-6 live verification: deferred (non-blocking; static analysis PASS)
- 1968d Wave 2 (P03 zone-caveman-dict): BLOCKED on P01+P02 APPROVED

## c253 · 2026-05-22T11:00Z

**Sprint:** 1968d | **Tasks:** P01+P02 Wave 1 | **Session:** c253 — APPROVED (both)

```
date: 2026-05-22
outcome: APPROVED (P01 + P02)
commits reviewed: b637bd8b + 05b7b40f
zone: .claude/ only — smart-skip (no .ts changes)
smart_skip: YES
round: 2
```

| Check | P01 | P02 |
|-------|-----|-----|
| `grep "##§"` = 0 | PASS | N/A |
| All `§` refs use `## §` (WITH space) | PASS | N/A |
| grep pattern `^## §[0-9]` correct | PASS | N/A |
| Fallback rule uses `## §` | PASS | N/A |
| `grep "OVERWRITE"` = 0 | N/A | PASS |
| Line 122 section-overwrite comment | N/A | PASS |
| Delta-read dogfood (2nd cycle) | PASS — [Fixer] only | N/A |
| agent-father c252 section-overwrite | N/A | PASS |
| Zone: zero apps/ | PASS | PASS |

**Blocking issues:** 0 (both tasks)

Signal: docs/signals/qa-1968d-wave1-approved.json emitted. Wave 2 (P03) gate UNBLOCKED. Reports at reports/TASK_REPORT_1968d-P01.md + reports/TASK_REPORT_1968d-P02.md (Round 2 appended).

**anchor_out:** `## §qa-round-2` (last anchor in both handoff files after this cycle)
