# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

> Sprints 133–162: `docs/archive/sprints-133-162.md`
> Sprints 163–176: `docs/archive/sprints-163-176.md`
> Sprints 177–189: `docs/archive/sprints-177-181.md` / `sprints-182-189.md`
> Sprints 190–240: `docs/archive/sprints-190-220.md` / `sprints-221-230.md` / `sprints-231-239.md` / `sprints-240-240.md`
> Sprints 1269–1294: `docs/archive/sprints-1269-1277.md` / `1278-1282.md` / `1282-1289.md` / `1290-1290.md` / `1291-1294.md`
> **Sprint 1289f/1295/1296 details + Sprint 1297/1299 task details archived:** `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1296 — COMPLETE (1296a Done, 1296b impl in 1296) — details: `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1297: Critical System Reliability & BCTC Historical Backfill — IN PROGRESS

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1297a | Audit Phase II — Fail-Loud Protocol Injection (16 agents) | docs | Done | none | 2–3 |
| 1297b | BCTC Portal URL Discovery Fix | vps-scripts | Todo | none | 4–6 |
| 1297c | VPS Validation of BCTC Portal Fix | ops | Backlog | 1297b | 1–2 |

**Status:** 1297a Done (98ab4bd0). 1297b queued for Developer. 1297c blocked on 1297b.
Details → `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1298: IMF Sentiment Classifier — Test Completion (5–7h total) — Todo

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1298a | RED: verify imf-indicators.test + write imf-classifier.test (AC-2 deep) | tests | Done | none | 2–3 |
| 1298b | GREEN: write imf-fetcher.test (AC-4) + imf-integration.test (AC-5/6/7/8) | tests | Done | 1298a | 3–4 |

**Goal:** Complete test coverage for all 8 ACs. All 8 FRs already implemented in sprint 1296. Test-only sprint.

### 1298a — RED phase
context: `docs/handoffs/TASK_1298a.md`
branch: `task/1298a-red-tests`
verify: `src/__tests__/1296b-imf-indicators.test.ts` all green
create: `src/__tests__/1296b-imf-classifier.test.ts` (AC-2: banking≈0.45, export≈0.35, stale<0.60, contraction<-0.3, multi-weighted, all-stale→imf_neutral)
AC: both test files green, `bun tsc --noEmit` clean

### 1298b — GREEN phase
context: `docs/handoffs/TASK_1298b.md`
branch: `task/1298b-green-imf-integration-tests` (TBD)
depends: 1298a merged
create: `src/__tests__/1296b-imf-fetcher.test.ts` (AC-4: HTTP mock, DB roundtrip, circuit breaker fallback)
create: `src/__tests__/1296b-imf-integration.test.ts` (AC-5: cascade rules len=11 | AC-6: conviction weight | AC-7: scheduler shape | AC-8: MCP tool shape)
AC: all 3 new test files pass, full suite ≥6508, `bun tsc --noEmit` clean, launchctl restart verified

---

## Sprint 1299: MCP Tool Context Optimization — PLANNING

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1299a | Tool Index + Reference Docs | docs/ba | Todo | none | 2–3 |
| 1299b | Skill-Gated Loading (code + bootstrap) | interface/tests | Todo | 1299a | 3–4 |
| 1299c | Session Memory Cache (cron + tracking) | infra/application | Todo | 1299b | 2–3 |

**Goal:** Reduce default MCP tool context 65k→<30k tokens. Details → `docs/archive/TASK_DETAILS_ARCHIVE.md`

---

## Sprint 1300: Telegram Message Factory (Centralized Truncation Architecture) — BACKLOG

| ID | Title | Layer | Status | Depends | Hours |
|----|-------|-------|--------|---------|-------|
| 1300a (RED) | Create TelegramMessageFactory service + migrate briefing jobs | infra/application | Review | none | 3–4 |
| 1300b (GREEN) | Migrate storage-layer functions to factory + full regression | domain/application | Backlog | 1300a | 2–3 |

**Root Cause:** 7 truncation bugs scattered across codebase — no centralized message formatting.

**Storage-Layer Issues (pre-DB insertion):**
- `runPredictionImpactChain.ts:113` — signal reasoning (500 chars) ⚠️ CRITICAL
- `newsNormalizer.ts:854` — news summary (500 chars) ⚠️ MEDIUM
- `policyImpactMapper.ts:233` — policy summary (80 chars) ⚠️ LOW

**User-Facing Issues (in briefings):**
- `morningBriefingJob.ts:123` — alert message (60 chars) ⚠️ CRITICAL
- `eveningSummaryJob.ts:203` — alert message (80 chars) ⚠️ CRITICAL
- `eveningSummaryJob.ts:211` — story title (80 chars) ⚠️ CRITICAL
- `franceSummaryJob.ts:406` — alert message (100 chars) ⚠️ CRITICAL

**Solution: TelegramMessageFactory Service**
```typescript
class TelegramMessageFactory {
  // Singleton service for all Telegram message formatting
  static formatAlertMessage(msg: string): string { /* smart truncation */ }
  static formatStoryTitle(title: string): string { /* smart truncation */ }
  static formatSignalReasoning(reasoning: string): string { /* smart truncation */ }
  // ... one method per message type, enforces consistent rules
}
```

**Benefits:**
- Enforce dynamic length calculation globally (no hard-coded limits)
- Word-break detection (truncate at space, not mid-word)
- Diacritics handling (Vietnamese characters)
- Easy to maintain and enhance
- All 7 bugs fixed in one place

---

## Backlog

| ID | Title | Priority | Notes |
|----|----|----------|-------|
| 1286 | Update IMPLEMENTATION_STATUS.md | LOW | Add sprint 240+ entries |

---
