## Task Report — ENV-ISOLATION Phase 1

**Sprint:** ENV-ISOLATION | **Tasks:** EI-P1-1 / EI-P1-2 / EI-P1-3
**QA cycle:** 164 | **Date:** 2026-05-31
**Verdict:** APPROVED

changed:
- docker-compose.yml (9eab754f) — APP_ENV=production added to 9 DB services + COORDINATION_DB_PATH on mcp-server
- scripts/purge-phantom-reports.ts (89e9b5b8) — APP_ENV guard + fail-loud path print
- scripts/run-bt7-backfill.ts (89e9b5b8) — DB_PATH from env + market.db guard + fail-loud
- docs/protocols/dev-environment.md (0c9bed2a) — dev session SOP, 241L

tests: no bun test suite for ops/scripts/docs tasks; guard behavior proven by live execution
tsc: N/A (no mcp-server code changes in P1)
ddd: PASS (no code changes — scripts are standalone, docs are prose)
security: PASS (no secrets, no process.env in production code)

---

### Deliberate-Violation RED Evidence (actual stdout captured)

**purge-phantom-reports.ts / APP_ENV=dev (guard trigger):**
```
[purge] APP_ENV=dev
[purge] DB_PATH (resolved)=/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db
[purge] REFUSED: APP_ENV="dev" is not "production". Pass --force-dev to override and run against a non-production datastore.
exit: 1
```

**purge-phantom-reports.ts / APP_ENV unset (production default — must NOT refuse):**
```
[purge] APP_ENV=production
[purge] DB_PATH (resolved)=.../data/market.db
[purge] deleted 0 phantom rows (created_at < 1000000)
exit: 0
```

**run-bt7-backfill.ts / DB_PATH=/tmp/nonexistent-dev.db (guard trigger):**
```
[run-bt7-backfill] APP_ENV=production
[run-bt7-backfill] DB_PATH (resolved)=/tmp/nonexistent-dev.db
[run-bt7-backfill] REFUSED: resolved DB path "/tmp/nonexistent-dev.db" does not end with "market.db". Looks like a dev/test datastore. Pass --force-dev to override.
exit: 1
```

**run-bt7-backfill.ts / --force-dev (WARNING path, no prod mutation):**
```
[run-bt7-backfill] WARNING: running against non-production DB "/tmp/nonexistent-dev.db" (--force-dev supplied).
[run-bt7-backfill] Opening DB: /tmp/nonexistent-dev.db
[run-bt7-backfill] FATAL: SQLiteError: unable to open database file
exit: 1 (no write — DB doesn't exist; WARNING shown, no silent pass-through)
```

---

### Compose Verification

`docker compose config` exit: 0 (parses clean)

APP_ENV=production in rendered config (grep result):
- mcp-server: YES
- pdf-extractor: YES
- rag-service: YES
- technical-analysis: YES
- macro-indicators: YES
- kinh-dich-service: YES
- news-fetch: YES
- stock-price: YES
- alert-engine: YES

Services correctly excluded (no DB): api-gateway=NO / frontend=NO / flaresolverr=NO

COORDINATION_DB_PATH: /app/data/coordination.db present on mcp-server in rendered config.

---

### Zero-Regression Check

- HCM-DISAMBIG-extraction.test.ts: 0-diff vs HEAD (clean)
- PDF-Extract-Kit subtree: pristine (git status empty)
- Each commit scoped to declared files only (verified via git diff --name-only per commit hash)
- All 3 commits on main branch

---

### SOP Coverage (EI-P1-3)

docs/protocols/dev-environment.md covers all required items per SPRINT_GOAL acceptance:
- Start dev stack (§2): docker compose down → up with override → verify APP_ENV=dev + DB_PATH
- Seed dev DB (§3): .dump financial_reports + pdf_extracted_text | sqlite3 market.dev.db
- Promote BCTC to prod (§4): manual, FK parent-before-child order (financial_reports → bctc_refined_units → bctc_table_rows), BEGIN/COMMIT transaction
- LanceDB (§5): lancedb.dev directory, cp -r seeding note
- Restore production (§6)
- RISK-5 volume deletion warning (§7): prominent CRITICAL block

---

### Non-Blocking Notes (pre-existing, out of EI-P1 scope)

1. alert-engine in docker-compose.yml is missing `DB_PATH=/app/data/market.db` (the architecture brief §2.1 documents it reads market.db for price thresholds via this env var). Pre-existing omission; EI-P1-1 scope was adding APP_ENV to the named 9 services — done. Not a P1 blocker.
2. scripts/run-bt7-backfill.ts line 20 still has a hardcoded absolute import path for the bctcBatchTableBackfillJob module. Pre-existing; EI-P1-2 only scoped the DB_PATH string fix.

Both are follow-up candidates, not P1 blockers.
