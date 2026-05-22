# Metrics — Cross-Cutting

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## Maturity Scale (same across all tiers)

- **L0** = current broken state  
- **L1** = minimal compliance (started)  
- **L2** = target baseline  
- **L3** = strong  
- **L4** = excellent (full automation)

---

## X-1 — Known Bug Count (by tier)

**What it measures:** Total open bugs, classified by which tier structurally resolves them.

**Measurement procedure:**
1. Read `docs/agent-memory/notebooks/architect.md` carry-over section for open bugs.
2. Read `docs/signals/DASHBOARD.md` ops section for active anomalies.
3. Read recent BUG channel entries from system-auditor notebook.
4. Parse `git log --since=<sprint-start> --grep="fix\|bug" --oneline` for recurring fix patterns.
5. For each bug: assign tier (primitive/module/microservice/cross-cutting) and target phase.
6. Update this count after every sprint completion.

Current baseline (2026-05-22):
| Bug ID | Description | Tier | Phase resolves |
|---|---|---|---|
| BUG-A21 | `vnstockFundamentalsRefresh` CRASHED (4d stale) | Microservice/infra | Phase 4 S-4 deployment health gate |
| BUG-A21b | `vnstockTradingStatsRefresh` CRASHED (4d stale) | Microservice/infra | Phase 4 S-4 |
| BUG-A21c | `dailyDashboardJob` ENOENT `/docs/data/project-stats.json` (5d) | Cross-cutting (path hardcode) | Phase 0 baseline fix + P-2 port-driven at L2 makes hardcoded paths impossible |
| BUG-1971 | SQLite Scan order in GetHistory — close=0 bug (fixed 2026-05-22) | Primitive (ta-* or stock-price) | Phase 2 extraction; port-driven score at L2 isolates DB interaction |
| BUG-1972 | VnDirect OHLCV null-coercion (fixed 2026-05-22) | Primitive (stock-price adapter) | Phase 2; P-2 at L2 pushes null handling to adapter, not primitive |
| BUG-1942c | HPG `get_cash_flow` all-zeros — multi-key fallback missing | Module (financial-reports) | Phase 3 module rebuild; M-2 primitive composition forces explicit fallback |
| BUG-BCTC-1 | `TasksMax=512` + `MemoryMax=512M` systemd service limit too low | Microservice infra | Phase 4 S-4 deployment health |
| BUG-JANITOR | `projectRoot()` anti-pattern causing ENOENT in 2 jobs | Cross-cutting | Phase 0 or Phase 4; P-2 port-driven makes env/path reads go through config port |
| BUG-1185 | `BaoDauTu` RSS returns 200 but 0 items (parsing issue) | Microservice (news-fetch) | Phase 4 — not in scope of this refactor's core phases |
| BUG-BCTC-PARSE | `bctcReparseJob` success rate 84.2% (sporadic failures) | Module (financial-reports) | Phase 3 M-2/M-4 scenario coverage forces explicit error path coverage |

| Level | Definition |
|---|---|
| L0 | No bug tracking by tier; bugs appear in notebooks only |
| L1 | Bugs inventoried and assigned to tiers; count tracked in this doc |
| L2 | Each bug has a target phase; count per tier published in master dashboard |
| L3 | Each fixed bug has a metric that proves it cannot recur (e.g., "P-2 at L2 resolves BUG-A21c") |
| L4 | Bug count per tier auto-computed from git log; displayed on master dashboard |

**Owner:** Architect maintains; system-auditor feeds BUG channel; PM tracks phase assignment.  
**When measured:** Phase 0 baseline; after each sprint.

---

## X-2 — Tech Debt Count

**What it measures:** Deferred architectural items that are tracked but not yet scheduled.

**Measurement procedure:**
1. Any item marked as carry-over in architect notebook = 1 debt item.
2. Items tagged `WARN-*` in system-auditor that are not bugs = debt items.
3. Items from this brief's open-questions section that are not decided = debt items.
4. Each debt item: owner + target phase + what metric improvement retires it.

Current baseline tech debt items:
| Debt ID | Description | Owner | Target phase |
|---|---|---|---|
| DEBT-001 | WARN-1..5 task_id format auto-fixable items (from 1962 audit) | code-janitor | Phase 0 clean-up |
| DEBT-002 | `registerAgentSignalTools` in news-analysis barrel (cross-cutting concern) | dev-mcp-server | Phase 3 module split |
| DEBT-003 | `backtesting` duplicate registrar risk (registerBacktestTools vs registerBacktestQueryTools) | dev-mcp-server | Phase 1 pilot CONTRACT |
| DEBT-004 | `registerDataFreshnessTools` + `registerMarketContextTools` spanning multiple domains | dev-mcp-server | Phase 3 market-data split |
| DEBT-005 | `domain/services/vpsHealthPoller.ts` + `resilientFetcher.ts` inside domain layer | dev-mcp-server | Phase 2 primitive extraction |
| DEBT-006 | `BaoDauTu` RSS parsing (returns 0 items) — INVESTIGATE status since task 1185 | dev-mainserver-crawls | Out of scope for this refactor |
| DEBT-007 | `NullCalendarAdapter` in macro-indicators (wontfix since 90c448f2) | dev-macro-indicators | Phase 3 if macro-core module built |

| Level | Definition |
|---|---|
| L0 | Debt items in notebooks only; not counted or tracked |
| L1 | Debt items inventoried in this doc with owner |
| L2 | Each debt has target phase and retirement condition |
| L3 | Debt count trend tracked per sprint (going up or down); published in master dashboard |
| L4 | Debt items auto-extracted from git carry-over notes; count displayed on master dashboard |

**Owner:** Architect inventories; PM tracks.  
**When measured:** Phase 0 baseline; monthly.

---

## X-3 — Documentation Freshness

**What it measures:** Whether key architecture documents are updated within one sprint of any relevant code change.

**Measurement procedure:**
1. For each document in the freshness list: `git log -1 --format="%ai" -- <file>` → last modified.
2. For each related source directory: `git log -1 --format="%ai" -- <dir>` → last source change.
3. If source is newer than doc by >7 days → stale flag.

Documents in freshness scope:
| Document | Related source | Stale threshold |
|---|---|---|
| `docs/ARCHITECTURE.md` | `apps/*/src/` | 14 days |
| `docs/architecture-briefs/2026-05-22-deep-module-ddd-with-dashboards.md` | `packages/primitives/` + `packages/modules/` | 7 days after any phase completion |
| Per-primitive `contract.md` | `packages/primitives/<name>/src/` | Same commit |
| Per-module `contract.md` | `packages/modules/<name>/src/` | Same commit |
| `docs/references/tree-map.md` | Any new file/folder | 7 days |

| Level | Definition |
|---|---|
| L0 | No freshness tracking; docs routinely stale |
| L1 | Key docs updated manually after major changes |
| L2 | `ARCHITECTURE.md` and all contract.md files updated within 7 days of source change |
| L3 | Architect reviews freshness at each sprint start; stale items added to sprint backlog |
| L4 | CI freshness check on every PR touching source; stale doc = PR comment warning |

**Owner:** Architect checks; developer updates contract.md in same commit.  
**When measured:** Sprint start (Architect notebook); continuously at L4.

---

## X-4 — Sandbox Uptime

**What it measures:** Whether the master dashboard renders correctly and all scenario JSONs execute without error.

**Measurement procedure:**
1. Run `bun run dashboard` from `apps/mcp-server/` (after Phase 5 sandbox-kit is built).
2. Exit code 0 = pass; non-zero = fail.
3. Count dashboards that fail to render (broken JSON, missing scenario, render error).
4. Count dashboards with "Coverage data unavailable" banners (tests not run).
5. Target: master dashboard renders in <30 seconds.

| Level | Definition |
|---|---|
| L0 | No dashboard exists |
| L1 | sandbox-kit built; some dashboards render |
| L2 | All dashboards render without error; master index shows all cards |
| L3 | All coverage banners show ≥80% (no red "WARNING" banners visible to user) |
| L4 | `bun run dashboard` is a required CI step; broken dashboard blocks PR merge; render time <30s |

**Owner:** QA runs sandbox; system-auditor monitors at L4.  
**When measured:** Phase 5 pilot (L2 first); Phase 6 (L3/L4); nightly at L4.

---

## Summary Table

| Metric | L2 is... | L4 enforcement |
|---|---|---|
| X-1 Bug Count by Tier | Each bug has phase + retirement condition | Auto-extracted from git log |
| X-2 Tech Debt Count | Each debt has owner + retirement condition | Auto-extracted from notebooks |
| X-3 Documentation Freshness | All contract.md + ARCHITECTURE.md updated within 7d | CI freshness check |
| X-4 Sandbox Uptime | All dashboards render; master index complete | CI: broken dashboard blocks PR |

---

## Metric Totals (for reference)

- Primitive-tier metrics: 7 (P-1 through P-7)
- Module-tier metrics: 7 (M-1 through M-7)
- Microservice-tier metrics: 6 (S-1 through S-6)
- Cross-cutting metrics: 4 (X-1 through X-4)
- **Total: 24 auditable metrics**
