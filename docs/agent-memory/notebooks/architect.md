# Architect — Notebook

**Last updated:** 2026-05-12 19:14 UTC | **Sprint:** 1876a-A6

## Last session summary (1876a-A6)

Task: Brownfield scan for seeding 7 high-vol watchlist tickers (NVL/DPM/REE/VNH/KBC/MWG/TCH)
at alert_drop_pct=-9.0. Root cause: SEED GAP — 7 tickers absent from `WATCHLIST_SEED` array
entirely, never inserted. `migrateWatchlistThresholds()` operates via UPDATE, requires rows to
exist first. Decision (a): add 7 entries to `WATCHLIST_SEED` in `seedWatchlist.ts`. On next
container restart, `seedWatchlist()` inserts them at default -3, then `migrateWatchlistThresholds()`
immediately UPDATEs to -9.0. Fully idempotent — safe on prod (31 standard rows -7.0 untouched).
7 ACs defined. No schema change, no Drizzle migration, no new tests needed (existing 9-test
suite covers 25+7 scenario). Single file edit: `seedWatchlist.ts`. Handoff: `docs/handoffs/TASK_1876a-A6.md`.

---

## Previous session summary (1876a-A5)

Brownfield scan: `migrateWatchlistThresholds(db)` exists at `seedWatchlist.ts:193-220`, is
idempotent, and IS ALREADY WIRED inside `schema.ts::initDatabase()` at line 217. No `migrateDb.ts`
and no `migrations/` directory — only execution path is container startup. Root cause confirmed:
mcp-server container was not restarted after 1869b merged. DECISION (a) exec-only. No code change.
Existing test coverage in `1869b-seed-watchlist-thresholds.test.ts` (9 tests). Executor: ops.
Handoff: `docs/handoffs/TASK_1876a-A5.md`.

---

## Previous session summary (1896c)

Persistent Docker events logging design brief. Recommended Option 4 (launchd plist + newsyslog
rotation). Plist at `~/Library/LaunchAgents/com.vn-market.docker-events.plist`, KeepAlive.Crashed=true,
ThrottleInterval=15s, log `/usr/local/var/log/docker-events.log`, newsyslog 50MB/daily, 30-day
retention. Source-controlled copies in `launchd/`. No domain code change, no Docker rebuild.
Brief: `docs/architecture-briefs/2026-05-12-persistent-docker-events-logging.md`.

---

## Known patterns / preferences

- Phase-gate approach for SPRINT-L refactors: always split Phase 1 (design + top-N files) and
  Phase 2+ (remaining files). Single-phase SPRINT-L refactors routinely cause merge conflicts.
- Coupling analysis via graph: use graph tool to identify highest-coupling nodes before refactors.
- `domain/repositories/` is the clean boundary between domain and infrastructure. Repository
  interfaces in domain, SQLite implementations in `infrastructure/db/repositories/`. Canonical
  ports-and-adapters pattern.
- Default-param injection: `constructor(private repo: IRepo = new SqliteRepo())`. Production
  uses SQLite default; tests inject in-memory mocks.
- DDD layer audit before design: `grep -r "from.*infrastructure" src/domain/`. Never add domain
  task without confirming design keeps domain clean.
- SPRINT-M tasks single-phase. SPRINT-L always requires Architect design document appended to
  handoff before developer starts.
- `server.ts` bootstrap: all new MCP tools must be added to registration list. Single wiring point.
- `initDatabase()` is the migration runner. Container restart = migration execution. Established
  pattern — no standalone migration CLI exists.

## Carry-over for next session

- ARCH-1884 brief written: Hybrid decision. Calculators in mcp-server domain; BTN detectors in
  new forensic-analysis service (port 5007). Sprint 1887 (Virtual Capital) lands on forensic-analysis.
- 1878b `compute_accruals` spec written. Spec: `docs/specs/1878b-compute-accruals.md`.
- Phase 5 merge gate still not exercised (6 cycles dormant) — flag if not exercised by c55.
- `docs/architecture/global.md` is Architecture SSOT (read before any system-level design).
