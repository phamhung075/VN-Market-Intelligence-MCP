---
sprint: P2-G
branch: task/p2-g-ae-g5b-g5c-audit
size: S
zone: apps/alert-engine
depends_on: [P2-F]
blocks: [P2-H]
---

## TLDR

QA verifies G5b/G5c: zero direct alert-engine domain imports in mcp-server handlers (HTTP-only integration), and zero `TODO.*migrat` markers in alert-engine zone post-deprecation. Read-only audit + signal emit (no code changes).

## [PM] Planning Context

- **Zone:** apps/alert-engine (audit scope only; mcp-server scanned for cross-imports)
- **Acceptance Criteria:**
  - [x] AC-1: Zero direct alert-engine domain imports in mcp-server (`grep -rn "vn-market-intelligence/alert-engine|apps/alert-engine/pkg" apps/mcp-server/src/ --include="*.ts"` returns 0)
  - [x] AC-2: HTTP client confirmed at correct port (`grep -n "5006|alert-engine|alertEngine" apps/mcp-server/src/infrastructure/microservices/clients.ts` returns ≥1)
  - [x] AC-3: Zero `TODO.*migrat` in alert-engine zone (`grep -rn "TODO.*migrat" apps/alert-engine/ --include="*.go"` returns 0)
  - [x] AC-4: Zero `TODO.*migrat` in deprecated path (`grep -rn "TODO.*migrat" apps/alert-engine/pkg/domain/_deprecated/ 2>/dev/null` returns 0)
  - [x] AC-5: G5 evidence compiled (TASK_P2-G-ae-g5b-g5c-audit.md handoff updated + signal emitted)

- **Files to read first:**
  - `apps/mcp-server/src/infrastructure/microservices/clients.ts` (lines around 28 for alertEngine HTTP client declaration)
  - `apps/alert-engine/` recursively for TODO markers
  - `apps/alert-engine/pkg/domain/_deprecated/` for migration debt

- **Files to create:** none (audit only)

- **Files to modify:** none (audit only; handoff doc + signal emit)

- **Dependencies:** P2-F DONE (G5a deprecation move complete; safe to audit for TODO-migrat)

- **Knowledge needed:** 
  - `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md` §P2-G (this handoff's source of truth)
  - G5b scope: NARROW — HTTP integration only, no direct domain imports
  - G5c scope: zero migration TODO markers post-deprecation

---

## G5b/G5c Background (from Phase-2 Plan §P2-G)

Per brownfield scan, alert-engine G5b scope is NARROW — the MCP server's HTTP client `clients.ts` already declares `alertEngine: Bun.env.ALERT_ENGINE_URL ?? 'http://localhost:5006'` (line 28). The alert-engine is called via HTTP in production (cron scheduler dispatches to the Go service at port 5006). The MCP Telegram tools (`telegramTools.ts`) call the mcp-server's own Telegram infrastructure directly — they do NOT import alert-engine domain logic. No direct domain import from any mcp-server tool handler into alert-engine Go packages exists (confirmed: the mcp-server and alert-engine are separate Docker containers; no cross-service Go import is possible). G5b confirmation is therefore a grep-only audit proving zero direct cross-service domain imports. G5c clears TODO migration debt.

---

## Acceptance Criteria — Detailed

### AC-1: Zero direct alert-engine domain imports in mcp-server

**Command:**
```bash
grep -rn "vn-market-intelligence/alert-engine|apps/alert-engine/pkg" \
  apps/mcp-server/src/ --include="*.ts"
```

**Expected:** 0 matches. No TypeScript file may cross-import a Go package path.

**Evidence:** Paste grep output (should be empty) to section below.

### AC-2: HTTP client confirmed at correct port

**Command:**
```bash
grep -n "5006|alert-engine|alertEngine" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```

**Expected:** ≥1 match showing `5006` or `alertEngine` (confirming HTTP integration address is declared).

**Evidence:** Paste grep output (should show line with 5006 and/or alertEngine variable) below.

### AC-3: Zero `TODO.*migrat` markers in alert-engine zone (G5c)

**Command:**
```bash
grep -rn "TODO.*migrat" apps/alert-engine/ --include="*.go"
```

**Expected:** 0 matches.

**Evidence:** Paste grep output (should be empty) below.

### AC-4: Zero `TODO.*migrat` in deprecated path

**Command:**
```bash
grep -rn "TODO.*migrat" apps/alert-engine/pkg/domain/_deprecated/ 2>/dev/null
```

**Expected:** 0 matches (deprecated code is legacy; no migration TODOs required there).

**Evidence:** Paste grep output (should be empty) below.

### AC-5: G5 evidence compiled

QA writes G5 grade evidence to this handoff doc and emits signal:
- `g5a_deprecated_path: apps/alert-engine/pkg/domain/_deprecated/services_v1.go` ✓ (from P2-F)
- `g5b_zero_direct_domain_imports: YES`
- `g5b_http_client_present: YES (port 5006 in clients.ts)`
- `g5b_scope: NARROW (HTTP client declared; no tool handler imports alert-engine Go pkg)`
- `g5c_zero_todo_migrat: YES`
- `g5_ready_to_grade: YES`

QA emits `docs/signals/qa-ae-P2-G-g5-evidence-done-<UTC>.json`.

---

## Evidence Section

### AC-1 Evidence — Zero direct alert-engine domain imports

```
[no output — grep returned 0 matches]
grep exit code: 1 (no match = zero lines)
```

**Verdict:** PASS — 0 matches. mcp-server contains zero TypeScript files importing alert-engine Go packages directly.

---

### AC-2 Evidence — HTTP client at port 5006

```
13: *   - alert-engine (5006): alert dedup + cooldown + Telegram
28:  alertEngine: Bun.env.ALERT_ENGINE_URL ?? 'http://localhost:5006',
```

**Verdict:** PASS — 2 matches. Line 13 (JSDoc comment) and line 28 (`alertEngine: Bun.env.ALERT_ENGINE_URL ?? 'http://localhost:5006'`) confirm the HTTP client is declared at the correct port.

---

### AC-3 Evidence — Zero TODO.*migrat in alert-engine/

```
[no output — grep returned 0 matches]
grep exit code: 1 (no match = zero lines)
```

**Verdict:** PASS — 0 matches. No migration TODOs remain in the alert-engine zone.

---

### AC-4 Evidence — Zero TODO.*migrat in _deprecated/

```
[no output — grep returned 0 matches]
grep exit code: 1 (no match = zero lines)
_deprecated/ contains: services_v1.go, services_v1_test.go (no migration TODOs)
```

**Verdict:** PASS — 0 matches. Deprecated code is clean.

---

### AC-5 Summary — G5 Evidence Compiled

**G5a (P2-F):** G5a complete — services.go moved to _deprecated/services_v1.go, evaluate.go rewired to alert_pipeline module. All 7 ACs PASS. (from P2-F)

**G5b (P2-G AC-1,2):** CONFIRMED. AC-1: 0 direct domain imports in mcp-server (exit 1 = zero matches). AC-2: alertEngine HTTP client at `http://localhost:5006` declared in clients.ts:28.

**G5c (P2-G AC-3,4):** CONFIRMED. AC-3: 0 TODO.*migrat in alert-engine/*.go (exit 1). AC-4: 0 TODO.*migrat in _deprecated/ (exit 1).

**G5 Ready to Grade:** YES

| Field | Value |
|---|---|
| g5a_deprecated_path | apps/alert-engine/pkg/domain/_deprecated/services_v1.go |
| g5b_zero_direct_domain_imports | YES (AC-1: 0 matches) |
| g5b_http_client_present | YES (clients.ts:28 — port 5006) |
| g5b_scope | NARROW (HTTP client declared; no tool handler imports alert-engine Go pkg) |
| g5c_zero_todo_migrat | YES (AC-3: 0 matches, AC-4: 0 matches) |
| g5_ready_to_grade | YES |

**NOTE:** g5_ready_to_grade=YES means evidence complete — G5 stays EARNED-PENDING. PO flips G5 only at Phase-3 terminal 12/12 close.

---

## [QA] Review Record — P2-G

**Date:** 2026-05-24T07:35:23Z
**QA Agent:** qa
**Task:** P2-G — G5b/G5c audit (alert-engine brownfield deprecation integration regression check)
**Verdict:** PASS

| AC | Command | Result | Verdict |
|---|---|---|---|
| AC-1 | `grep -rn "vn-market-intelligence/alert-engine\|apps/alert-engine/pkg" apps/mcp-server/src/ --include="*.ts"` | 0 matches (exit 1) | PASS |
| AC-2 | `grep -n "5006\|alert-engine\|alertEngine" apps/mcp-server/src/infrastructure/microservices/clients.ts` | 2 matches (lines 13, 28) | PASS |
| AC-3 | `grep -rn "TODO.*migrat" apps/alert-engine/ --include="*.go"` | 0 matches (exit 1) | PASS |
| AC-4 | `grep -rn "TODO.*migrat" apps/alert-engine/pkg/domain/_deprecated/ 2>/dev/null` | 0 matches (exit 1) | PASS |
| AC-5 | Evidence table compiled + signal emitted | g5_ready_to_grade=YES | PASS |

**anchor_intact:** debba8eaff0724d1fb32fc9d28640201cc32d1cc (merge-base --is-ancestor exit 0 confirmed)
**foreign_paths_staged:** 0 (staging discipline enforced — only own paths staged)
**ssot_not_mutated:** goalsEarned/decisionMatrix untouched; G5 stays EARNED-PENDING
**signal:** docs/signals/qa-ae-P2-G-g5-evidence-done-20260524T073523Z.json

---

## Commit Instruction

No commit required by this task. QA emits signal only. PM receives signal and marks task DONE in SSOT + sequences P2-H.

**G-goal posture:** NO goal flips. G5 evidence complete but PO flips G5 only at 12/12 terminal Phase-3 close. §4.5 SSOT untouched.

---

**Next actor:** pm (mark P2-G DONE, sequence P2-H)
