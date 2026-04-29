# Sprint Goal

## Sprint 1416 — BCTC confidence failures + HPG disk-scan skip (2026-04-29)

**Status:** CLOSED — VCB/FPT confidence restored, HPG disk-scan fixed. 8076 tests pass.

---

## Sprint 1419 — Test baseline audit (2026-04-29)

**Status:** CLOSED — 25 pre-existing failures resolved, 0 fail, 8076 pass.

---

## Sprint 1420 — QQ1 double-prefix fix + housekeeping (2026-04-29)

**Status:** CLOSED — QQ1 guard added at 2 sites (sort_key + period_type). 8090 tests pass.

---

## Sprint 1422 — VCB bank-format BCTC parser (2026-04-29)

**Status:** CLOSED — BA brownfield check confirmed VCB total_assets already resolved by 1415b+1416a. DB: total_assets=2,441,928,945 (Q4) + 2,109,260,616 (Q1), validation_status=passed. No implementation needed. 8090 tests pass.

---

## Hotfix: bctc-parser2 — 3 critical BCTC parser bugs (2026-04-29)

**Status:** IN REVIEW — code complete in worktree-agent-a1e01646, awaiting QA merge

**Bugs fixed:**
- DIG/SHB ticker case mismatch in scanDiskForStrandedPdfs (CRITICAL)
- FPT unit multiplier producing quadrillion-scale revenue (CRITICAL)
- DGC/BSR phantom confidence when all 3 core fields are zero (HIGH)

**Branch:** worktree-agent-a1e01646
**Tests:** 7 new tests in hotfix-bctc-parser2.test.ts

---

## Sprint 1423 — Báu Methodology Phase 1: Global Macro Inputs (2026-04-29)

**Status:** CLOSED — All 5 tasks merged (1423a ^TNX, 1423b FRED, 1423c carry signal, 1423d Thien Thoi block, 1423e macro calendar tests). 8198 pass, 1 pre-existing fail.

**Goal:** Implement the "Thien Thoi" (global macro) layer of the Trần Ngọc Báu
top-down framework. Wire US 10Y Yield, Fed Funds Rate, and Carry Trade Signal
into the system. Surface all global inputs in `get_macro_snapshot`. Add a
Macro Calendar tool. Zero new infrastructure required.

**Tasks:**
- 1423a — Add US 10Y Yield (^TNX) to Yahoo Finance fetcher + schema column
- 1423b — FRED API fetcher for Fed Funds Rate → tracked_indicators
- 1423c — Carry Trade Signal domain service (VND deposit rate - Fed Funds)
- 1423d — Extend get_macro_snapshot with [Global Macro Inputs — Thien Thoi] section
- 1423e — get_macro_calendar tool (static GSO/SBV/PMI event calendar, 60d window)

**Acceptance:** All 5 tools functional, us10y_yield + fed_funds_rate in DB,
carry regime label visible in macro snapshot. 8090+ tests pass.

**Handoff:** docs/handoffs/TASK_methodology_bau.md

---

## Sprint 1425 — Housekeeping: stats sync + ghost dirs + DRY constant (2026-04-29)

**Status:** CLOSED

**Goal:** Close 4 known-issues from system-auditor: sync diverged project-stats.json to registry SSoTs, remove hardcoded file counts from docs-organization.md, delete ghost dirs and corrupt DB backup waste (~281MB), and extract duplicated VN_INDEX_FRESHNESS_MS constant.

**Tasks:**
- 1425a — Sync project-stats.json toolCount=113 + schedulerFileCount=44 to match registries
- 1425b — Replace hardcoded REQ/TECH file counts in docs-organization.md with SSOT pointer
- 1425c — Delete ghost dirs docs/agent-memory/{modules,manifests,issues,patterns}/ + corrupt DB backups + .fuse_hidden* artifacts
- JANITOR-010 — Extract VN_INDEX_FRESHNESS_MS=25 * MS_PER_HOUR to timeConstants.ts (2 callers)

**Acceptance:** project-stats.json toolCount matches tool-registry.json. docs-organization.md has no hardcoded counts. Ghost dirs gone. ~281MB freed. timeConstants.ts exports VN_INDEX_FRESHNESS_MS. 8198+ tests pass.
