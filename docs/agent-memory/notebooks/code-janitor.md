# Code Janitor Notebook

**Last updated:** 2026-05-14 (janitor-1912 artifact cleanup — shipped)

> Archive: docs/archive/notebooks/code-janitor-2026-05-21.md (pre-trim history)

## State summary

### Session 24 (2026-05-14 — janitor-1912 artifact cleanup)

**Scope:** Targeted cleanup task (janitor-1912) — remove stale Bun tests + verify Go tests.

**Task:** RF-1: Remove 2 TypeScript Bun test files from git tracking. RF-2: Verify alert-engine/server binary status.

| File | Action | Status |
|------|--------|--------|
| apps/stock-price/__tests__/unit/resolve-price-service.test.ts | git rm --cached | SHIPPED (commit b05624aa) |
| apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts | git rm --cached | SHIPPED (commit b05624aa) |
| apps/alert-engine/server | Binary on disk; never committed | N/A — not tracked |

**Test verification:**
- apps/stock-price: go test ./... → PASS (all tests)
- apps/alert-engine: go test ./... → PASS (all tests)

**Result:** DONE. Stale TypeScript artifacts removed from git. Go migration clean. Commit: b05624aa.

---

### Session 23 (2026-05-13 — CLEAN-c81 housekeeping)

**Scope:** XS cleanup task (CLEAN-c81): remove stale 1899a-gateway Todo row from docs/TASKS.md + prune 2 fully-merged worktree-agent branches.

**Result:** Housekeeping complete — no DRY scan executed (maintenance task, not code scan).

| Task | Status | Details |
|------|--------|---------|
| Remove stale 1899a-gateway Todo row | DONE | Line 33 removed; SHIPPED version (c80) retained at line 56 |
| Delete worktree-agent-a1578231ec1b3deec | DONE | Verified merged into main; deleted successfully |
| Delete worktree-agent-a63fd9e29f6856090 | DONE | Verified merged into main; deleted successfully |

**Commit:** `19e29700` — chore(clean-c81): remove stale 1899a-gateway Todo row + prune 2 merged worktree-agent branches

**Outcome:** TASKS.md cleaned (32→31 rows in Todo table); worktree-agent-* branches now only active spawns (aea30e4a8e1461810, aee580fe6c94df729 remain).

---

### Session 22 (2026-05-13 — Full codebase scan HEAD~30..HEAD)

**Scope:** Commits HEAD~30..HEAD (30 most recent); 5 DRY checks executed.

**Result:** CLEAN — 0 new violations in all 5 checks.

| Check | Result | Notes |
|-------|--------|-------|
| Classification maps | 0 findings | All ticker→sector mappings canonical in sectorPeers.ts, stockAliases.ts. CLEAN. |
| Ticker arrays | 0 new | JANITOR-034 (cascadeExecutor.ts LARGE_CAP_FALLBACK vs priceSourceRouter.ts MAJOR_CAPS) unchanged — already proposed. |
| Magic numbers / crons | 0 new | JANITOR-027 (MS_PER_DAY in 32 files) recurrent — already proposed multi-file refactoring. |
| Schema duplication | 0 findings | All DDL canonical in schema-*.ts. No production inline DDL. CLEAN. |
| Config drift | 0 findings | All ?? fallback patterns are safe defensive code (DI, optional defaults). CLEAN. |

**Backlog unchanged:** 9 items stable (JANITOR-011, -013, -017, -020, -027 plus meta-config -028 to -032, and -034).

**Quality:** Full — all 5 checks executed; no knowledge load failures.

---

### Session 21 (2026-05-13 — Full codebase scan + recent commits audit)

**Scope:** Commits HEAD~30..HEAD; 496 production TS files scanned; all 5 DRY checks executed.

**Result:** CLEAN — 0 new violations in all 5 checks.

| Check | Result | Notes |
|-------|--------|-------|
| Classification maps | 0 findings | All ticker→sector mappings canonical in sectorPeers.ts, stockAliases.ts. CLEAN. |
| Ticker arrays | 0 new | JANITOR-034 (cascadeExecutor.ts LARGE_CAP_FALLBACK vs priceSourceRouter.ts MAJOR_CAPS) unchanged — already proposed (pending domain design decision). |
| Magic numbers / crons | 0 new | JANITOR-027 (MS_PER_DAY in 24 files) recurrent — already proposed multi-file refactoring. |
| Schema duplication | 0 findings | All DDL canonical in schema-*.ts. Verified: alertMuteStore.ts, vnstockStore.ts, schedulerLockStore.ts (all reference schema.ts with comments). |
| Config drift | 0 findings | All ?? fallback patterns are defensive. No mismatches between code defaults and config values. |

**Features audited:** 1 recent code change (alertOutcomeScorer.ts, Task 1847d-B) — CLEAN. No duplication introduced.

**Backlog unchanged:** 9 items (JANITOR-011, -013, -017, -020, -027 plus 4 meta-config -028 to -032, and -034).

**Quality:** Full — all 5 checks executed; no knowledge load failures.

---

### Session 20 (2026-05-13 — Full codebase scan + commit 7cf276cf audit)

**Scope:** Commits HEAD~20..HEAD; feature commit 7cf276cf (list_unresolved_reports MCP tool) + full codebase DRY check.

**Result:** CLEAN — 0 new violations in all 5 checks.

| Check | Result | Notes |
|-------|--------|-------|
| Classification maps | 0 findings | All in canonical sources (sectorPeers.ts, stockAliases.ts). CLEAN. |
| Ticker arrays | 0 new | JANITOR-034 (cascadeExecutor.ts LARGE_CAP_FALLBACK vs priceSourceRouter.ts MAJOR_CAPS) unchanged — already proposed (pending domain design decision). |
| Magic numbers / crons | 0 new | JANITOR-027 (MS_PER_DAY in 21 files) recurrent — already proposed multi-file refactoring. |
| Schema duplication | 0 findings | All DDL canonical in schema.ts. Verified: alertMuteStore.ts, vnstockStore.ts (both reference schema.ts with comments). |
| Config drift | 0 findings | All ?? fallback patterns are defensive (env vars with localhost defaults). No mismatches. |

**Feature audit (7cf276cf):** telegramReportTools.ts — 4 new MCP tools (read_telegram_reports, process_telegram_report, claim_telegram_report, list_unresolved_reports, expire_monitoring_reports). All follow tool-layer pattern (DB I/O in interface, CRUD in store). No duplication introduced. Clean.

**Backlog unchanged:** 9 items (JANITOR-011, -013, -017, -020, -027 plus 4 meta-config -028 to -032, and -034).

**Quality:** Full — all 5 checks executed; no knowledge load failures.

---

## Open backlog

| ID | Description | Blocker |
|----|-------------|---------|
| JANITOR-034 | Overlapping large-cap ticker lists (cascadeExecutor.ts vs priceSourceRouter.ts) | Domain design decision |
| JANITOR-028 | Dev MCP Server agent .md: remove "112 tools" from lines 4, 13 | Requires agent-father approval |
| JANITOR-029 | Cloudflare ops flow: remove "Full 112 tools available" from lines 13, 29 | Requires ops/developer approval |
| JANITOR-030 | Agent Models README: replace "All 13 agents" (lines 15, 28) with unquantified wording | Requires agent-father approval |
| JANITOR-031 | Agent Roster: fix line 5 "7 agents" → "8 agents" (line 102 is correct) | Requires agent-father approval |
| JANITOR-032 | Alert Commander: max_alerts_per_day duplicates alert-policy.md threshold | Requires agent-father approval |
| JANITOR-011 | Puppeteer launch config dup in tradingEconomicsChromium.ts | No test coverage on affected paths |
| JANITOR-013 | SignalTypeEnum re-lists SignalType union (two-file change) | Two-file change |
| JANITOR-017 | BROWSER_UA string in 18 source files (18-file fan-out) | 18-file fan-out across 3 layers |
| JANITOR-020 | MACRO_CODES + section-builder logic parallel impl in marketContextBuilder.ts vs marketContextTools.ts | Two-file change; marketContextTools.ts must delegate to domain builder |

### Managed (monitored by tests)

| ID | Description |
|----|-------------|
| mcp.config.json:referenceStocks | Duplicate of SECTOR_PEERS — guarded by 1252 + 1282 tests |

## Notes for next scan

- CLEAN-c81: Housekeeping completed 2026-05-13 (stale 1899a-gateway Todo row removed + 2 merged worktree-agent branches pruned). No DRY violations found. Backlog stable at 9 items.
- Next scheduled DRY scan: 2026-05-13 or on developer commit to signal-related/DRY-sensitive files.
