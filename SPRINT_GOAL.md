# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Current Sprint — 083 (ACTIVE)

**Goal:** Code janitor scan (post-082 clean state) + schema.ts env-access consistency fix.

**Scope:**
- IN: Task 1283 — run full janitor scan (checks 1-5) against post-082 codebase; record findings or confirm clean
- IN: Task 1284 — fix `process.env["DB_PATH"]` dual-check in `schema.ts` to use `Bun.env` exclusively (non-blocking issue surfaced by 1282 QA review)
- OUT: VPS SSH tasks (1218, 1248), new features, cascade rule changes

**Success metric:** Janitor scan shows 0 new findings OR new findings are logged as tasks. `schema.ts` uses `Bun.env` only — no `process.env` fallback in production paths.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 082 | Config drift fix — alert cooldown config-driven + sector classification dedup | COMPLETE 2026-04-15 |
| 081 | Domain bug batch — cascade/classification fixes, NER fixes (1251, 1266) | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
| 079 | Data pipeline integrity — VPS price push + BCTC extraction | COMPLETE 2026-04-14 |
| 078 | Evening summary empty-content fallback (1192) + bug dedup (1215) | COMPLETE 2026-04-14 |
| 077 | Trading Economics RSS fallback chain (1191) | COMPLETE |
| 076 | Pipeline watchdog job | COMPLETE |
