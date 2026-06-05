# REQ — Hardcoded / Fake-Data Contamination Audit (operator-requested 2026-06-05)

> **Durable brief — survives /compact.** Operator instruction: "deeper analyse all service for identity hardcode value on code, i dont want data is contamine by fake data, you need deeper read file by file for this, fan out sub agent for identity (max 3)" + "when read file, if any problem is find, make to task for dev team take it later."

## Goal
Find every place where a **hardcoded / fixture / mock / placeholder / fabricated value** can be **served as if it were live data** — contaminating real market/financial output. This is the systemic anti-pattern from the DSI sprint (fail-soft → hardcoded fixture → stamp fetched_at=now → drop is_estimate → fake served as live). See memory: `project_data_serve_integrity` (LESSON 1/2/3), `feedback_router_verify_raw_not_badges`, `feedback_derived_column_fix_needs_reflow`.

## Method (operator-mandated)
- **Read file-by-file** — NOT a shallow grep. Each agent opens the data-relevant source files in its slice and reads the logic.
- **Fan out MAX 3 sub-agents** (parallel), one per slice below.
- Agents are **READ-ONLY**: they do NOT mutate any file and do NOT write orch-state (avoid concurrent-write race — known hazard). They return STRUCTURED findings.
- **Router** batch-creates one dev-team backlog task per finding (or grouped per file) into `docs/data/orch/orch-state.json .task_board.backlog[]` — "make to task for dev team take it later."

## What counts as a finding (contamination risk)
1. Hardcoded numeric **data** constant (rate / price / yield / ratio / index / count) that should come from a live source — e.g. `carryFixtureFedFundsRate=5.33`, `earningYield=8.2`.
2. Fixture / mock / sample / demo / placeholder data returned on a **fallback / catch path** WITHOUT provenance (`is_estimate` / `source_tier` / seed flag).
3. Fabrication defaults: `?? <number>` / `|| <number>` / `value || fakeDefault` that invent a data value when the real one is missing (the `?? 0` / `?? 1` class).
4. `fetched_at = now` / fresh-stamping applied to **non-fresh** (cached/fixture/estimate) data.
5. Seed / static / demo values served without a `is_seed_data` / `static_seed` banner.
6. `TODO/FIXME/placeholder/dummy/fake/mock/sample/stub` markers on a path that serves data to a consumer.

## EXCLUDE (not findings)
- Test files (`*.test.*`, `*_test.go`, `__tests__/`, `sandbox/traces/`), fixtures used ONLY by tests.
- Vendored / third-party libs (esp. `apps/pdf-extractor/**` PDF-Extract-Kit / model code — audit ONLY our own Python source under pdf-extractor app logic, e.g. extraction/serve glue).
- Legitimate constants: timeouts, ports, retry counts, enum/threshold **business rules** (e.g. confidence cutoffs), UI copy, colors.
- `node_modules`, `dist`, `build`, generated code.

## Finding schema (each agent returns a JSON array)
```
{ "service": "mcp-server", "file": "apps/.../x.ts", "line": 123,
  "snippet": "const fed = data?.fed ?? 5.33;",
  "hardcoded_value": "5.33",
  "why_contamination": "fabricates fed funds rate when live missing; served via get_macro_snapshot with no is_estimate",
  "severity": "HIGH|MED|LOW",
  "fix_direction": "fail-loud or carry-forward w/ source_tier+is_estimate; never ?? <number>" }
```
Severity: HIGH = served to a live consumer (MARKET/FB/dashboard/tool output) as real; MED = served but behind an estimate flag that could be bypassed; LOW = internal/dev-only or already provenance-guarded but smelly.

## 3-way slice (balanced by risk + size)
**Slice A — `apps/mcp-server` (TS serve layer, ~619 files).** Highest risk: tools format & serve values. Focus `src/interface/mcp/tools/**` (macro, market-data, bctc, profile, news, technical, kinhdich), `src/infrastructure/**` data adapters (yahooFinance, fred, vps clients), `src/domain/**`, `src/application/**` usecases. One dedicated agent.

**Slice B — Go data-compute services (~124 files).** `apps/macro-indicators` (FX/commodity/carry/yield — KNOWN fixture history, handlers_carry/handlers_yield), `apps/stock-price`, `apps/technical-analysis`, `apps/kinh-dich-service`. These compute/serve numeric data.

**Slice C — remaining serve/consume surfaces (~143 files our-source).** `apps/alert-engine`, `apps/news-fetch`, `apps/api-gateway`, `apps/rag-service`, `apps/pdf-extractor` (OUR python source only — exclude PEK vendor), and `apps/frontend` (display fabrication: the `extractionConfidence ?? 1→?? 0` class, any hardcoded sample rows).

## Output → dev-team tasks
Router collects all 3 finding arrays, dedups, and creates backlog tasks under a new sprint `FAKE-DATA-AUDIT` (or appends FU-* items), each with file:line + value + fix_direction + severity. NO fixes applied in this pass — "take it later." HIGH-severity items flagged for priority.

## Status
- [ ] Awaiting /compact (operator: "compact first").
- [ ] After compact: launch 3 parallel read-only audit agents (Slices A/B/C).
- [ ] Collect findings → create dev-team backlog tasks.
- [ ] Report summary (counts by severity/service) to operator + WORK.
