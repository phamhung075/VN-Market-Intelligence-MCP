# PO Notebook

**Cycle:** PEK-INTEGRATE spec-approval gate — 2026-05-26T20:49Z.
**Last update:** 2026-05-26T20:49:25Z
**Status:** PEK-BA spec APPROVED. PEK-DESIGN UNBLOCKED → architect. Files UNSTAGED — main terminal commits.

---

## 2026-05-26T20:49Z — PEK-BA spec-approval gate PASSED → architect

**Reviewed:** `docs/REQ_PEK-INTEGRATE.md` (10 reqs, 35 ACs, commit `22bc3d54`) vs `SPRINT_GOAL § PEK-INTEGRATE`. APPROVED.

**4 checks, all PASS (ground-truth-verified, not assumed):**
- **Decisions (a)-(d) still OPEN:** every decision-bearing req (1=a, 2=a+b, 3=c, 4=d) ends with an "Architect-deferred" block naming the open call. Decision (b) in-process vs on-demand worker (the biggest kernel-panic-risk var) is genuinely deferred — BA did NOT pre-answer RAM topology; each option requires its own RAM budget. "Blockers for PO" restates all 5 as architect-level.
- **Hard constraints → ACs:** CPU-only (AC-2a/2d), 8GB RSS-under-load (AC-2b/2c/4c), `/api` PULL unbroken (REQ-5 all), ZERO PDF-Extract-Kit edits git-diff-proof (AC-0a/0b/0c). Live-verified: `git -C apps/pdf-extractor/PDF-Extract-Kit diff` empty; clone has own `.git`; Dockerfile `COPY . .` + `.dockerignore` gap confirmed (the (c) target).
- **Scale-pilot done-bar:** direct market.db is arbiter (AC-7d, endpoint never gate), FPT Q4 2025 sentinels (AC-7e, report_id `e71f845d-...`, 4 values cross-verified vs closed BCTC-TABLE record), ops REBUILD (REQ-10), USER verbal G9. 6-cond bar = SPRINT_GOAL verbatim.
- **REQ-PEK-8 reuses LF-OVERLAY §3:** `bctc_page_zones`/`bctc_layout_units` + `POST /api/push-bctc-layout` confirmed present in `2026-05-26-bctc-layout-first-pipeline.md` §3.1/§3.2; AC-8d forbids duplicate tables. Reuse, not reinvent.

**Wrote:** `status: APPROVED` + gate rationale in REQ header; TASKS PEK-BA→DONE, PEK-DESIGN→TODO(UNBLOCKED), gate-record note in sprint Notes. All UNSTAGED.

**Dispatch:** NEXT = architect | run PEK-DESIGN (blueprint, brief ONLY → `docs/architecture-briefs/`).

---

## Carry-over
- Architect (PEK-DESIGN) must resolve (a)-(d) each with a RAM number; (b) topology is the kernel-panic-risk lever; reconcile PEK with BCTC-LAYOUT-FIRST (engine REPLACES vs WRAPS hand-built tiers); reuse LF-OVERLAY §3 for PEK layout bboxes; confirm `bctc_table_rows` zero-collision; if overlay-render needs mcp-server → zone flips to `multi`.
- DoD = scale-pilot bar: live clean rows via DIRECT market.db + 8GB/no-panic + pristine-repo-untouched git-diff + ops REBUILD + USER verbal G9. 5 prior false-greens — NOT-RUN ≠ green.
- BCTC-LAYOUT-FIRST LF-EXTRACT chain PAUSED — do not let both sessions edit pdf-extractor concurrently.
- Next PO hop after architect = none until PEK-QA returns → PEK-EXIT (independent live re-verify).
