# Sprint Goal

## Sprint 1297 — Critical System Reliability & BCTC Historical Backfill (2026-04-23)

**Goal:** Fix two critical blockers preventing historical BCTC backfill and ensuring robust agent knowledge handling.

**Scope:**

| Phase | Title | Owner | Duration | Status |
|-------|-------|-------|----------|--------|
| 1297a | Audit Phase II — Fail-Loud Protocol Injection (remaining 14 agents) | PM | 2–3h | Backlog |
| 1297b | BCTC Portal URL Discovery Fix (unblock historical backfill) | Developer | 4–6h | Backlog |
| 1297c | VPS Validation of BCTC Portal Fix | Ops | 1–2h | Backlog |

**Why:**
- **1297a**: Sprint 1296 added fail-loud protocol to 5 critical agents. Remaining 14 agents (qa.md, code-janitor.md, po.md, system-auditor.md, etc.) still lack it. All agents must handle knowledge file failures gracefully.
- **1297b**: Task 1289g identified broken BCTC portal URLs (HOSE returns 404, HNX/UPCOM PDFs non-discoverable). Script is sound, but endpoints need investigation. This is **blocking historical backfill** (37 stocks × 8 quarters).
- **1297c**: After URLs fixed, OPS validates on VPS (3 test stocks: VNM, BID, FPT Q4 2024) and executes full backfill.

**Success Metrics:**
- **1297a**: All 22 agent files (.claude/agents/*.md) have fail-loud protocol sections + reference to canonical .claude/knowledge/fail-loud-protocol.md
- **1297b**: vps-scripts/discover-bctc-urls-browser.py updated with correct portal endpoints, ≥2 of 3 test stocks return valid PDFs
- **1297c**: Full 37×8 historical backfill completes, DB has BCTC data for all quarters Q1 2023–Q4 2024

**Effort:** ~7–11h total (a + b + c)

**Priority:** HIGH (affects system reliability + unlocks market analysis depth)

**Status:** PLANNING (1297a ready to queue, 1297b ready to queue after 1297a, 1297c awaits 1297b completion)

---

> Completed sprints archived → `docs/archive/SPRINT_GOAL_ARCHIVE.md`
