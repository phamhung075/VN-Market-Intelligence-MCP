# SQLite Docker-Virt Corruption — Root Cause + Hardening Design

**Task:** `SPIKE-SQLITE-DOCKER-VIRT-CORRUPTION-HARDENING`
**Author:** architect (plan_only, supervised)
**Written:** 2026-07-30
**Zone:** multi (`apps/mcp-server/`, `apps/stock-price/`, `apps/technical-analysis/`, `apps/macro-indicators/`, `docker-compose.yml`)
**Status:** design complete, no code written, no runtime mutation performed (one read-only `PRAGMA journal_mode` probe and read-only `ls`/`cat` against the live container — see §3)

---

## 0. Verdict

**Deliverable (a):** No single hypothesis explains all four occurrences. The evidence (git history + live code, §1) splits them: **3 of 4** occurrences (04-25, 07-19, 07-30) correlate with market.db sitting on a **macOS host bind-mount** — matching hypothesis (c), but *not* the "named-volume sync fault" framing the row's question used; the actual mechanism is the reverse (bind-mount virtualization, not the named volume, is the fault surface — see §2). **1 of 4** (07-13) happened while market.db was on a Docker **named volume**, where the bind-mount mechanism cannot apply — that occurrence is better explained by hypothesis (a), a concurrent-write race, and this SPIKE found a **live, currently-dormant instance of exactly that class** wired into production today (§3) that the sibling `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION` row did not catch.

**Deliverable (b):** Of the four options in the row, the two feasible/proportionate ones are **(3) a fast, targeted health-gate** (not a generic `integrity_check` — a cheap staleness probe on the exact symptom, §5.3) and **(4) backup-cadence hardening**, because the *existing* nightly backup has a zero-integrity-gate defect that plausibly destroyed the one recovery artifact that would have made 07-30 a simple swap instead of a lossy `.recover` salvage (§5.4). **(1) cross-container write-lock coordination** is not proportionate — market.db has exactly one writer container today (§2.3); the real multi-writer surface is intra-container (§3, §6.1) and is a code-discipline fix, not a distributed-lock system. **(2) WAL-checkpoint sync gate** is moot for market.db specifically (it is no longer WAL) but real for `coordination.db` (§4.2).

**AC-A/B/C/D are answered in §4.** The single highest-priority action from this brief is **§3** — not because it is the most complex, but because it is a live regression, already shipped, silently capable of undoing this morning's fix on the very next call.

---

## 1. The empirical timeline (git-verified, not inferred)

The row's own hypothesis framing treats "Docker named-volume sync fault" as one candidate. Reading `docker-compose.yml` history and `docker inspect` on the running containers shows the opposite: **named volume and bind mount have both been in production at different points, each explicitly chosen to fix a real, dated incident that the other configuration caused.**

| Date (host-local, commit) | Mount type for `/app/data` | Event |
|---|---|---|
| — (pre-2026-04-25) | host bind-mount (`./data:/app/data`) | baseline |
| **2026-04-25 15:53 `ffa045e81`** | → **named volume** `market_data` | *"task(1336): switch Docker data bind-mount to named volume to fix SQLite corruption… Root cause: macOS Virtualization.VirtualMachine holds fd on market.db-shm during container stop → torn SHM write → SQLite 'malformed disk image'. Named volumes live entirely inside the Docker VM filesystem, eliminating the virtualisation boundary crossing."* — this is **occurrence 1's own fix commit**, ~1h20m after the row's stated 04-25T~14:30Z corruption time. |
| 2026-04-25 → 2026-07-15 (~81 days, named volume) | named volume | **Occurrence 2 (2026-07-13T15:42-17:51Z) happens here** — while `/app/data` is a named volume. The bind-mount/VirtioFS mechanism from `ffa045e81` **cannot** be the cause of this one; it had already been eliminated by construction. |
| **2026-07-15 17:21 `5ba622eca`** | → **host bind-mount** `./data/live:/app/data` | *"fix(infra): bind-mount market data to host disk instead of Docker named volume… VM rebuild after hypervisor crash destroyed the named market_data volume and wiped all live data (only a host-disk backup survived)."* This commit message **does not mention corruption or `ffa045e81`** — it silently re-opens the exact vulnerability the 04-25 fix had closed, to solve a different, also-real, also-catastrophic problem (see `feedback_vm_rebuild_destroys_named_volumes_restore_then_launch` memory). |
| 2026-07-15 → present (bind-mount) | bind-mount | **Occurrence 3 (2026-07-19, self-resolved)** and **Occurrence 4 (2026-07-30, this row's trigger)** both happen here — 4 and 15 days after the revert. |
| **2026-07-30 10:26 `157335892`** | bind-mount (unchanged) | `journal_mode=DELETE` mitigation ships for market.db only (`schema.ts:115-118`). Confirmed live right now via read-only probe (§3): `journal_mode=delete`, no `-wal`/`-shm`. |

`docker inspect $(docker ps -q -f name=mcp-server)` today confirms the current state directly: `/app/data` is `bind /host_mnt/Users/admin/.../data/live -> /app/data` — the `/host_mnt/` prefix is Docker Desktop for Mac's canonical marker for a host-path bind mount surfaced inside the Linux VM. Only `pek_model_cache` and `bctc-page-images` are true named volumes today; `market_data` no longer exists as a compose stanza.

**Reading:** three of four occurrences (75%) correlate with the bind-mount configuration and zero correlate with a genuine "named-volume sync fault" (the row's phrase) — the one occurrence during the named-volume window (07-13) is evidence *against* mount type being the sole variable, not for it. Both configurations are load-bearing for a real, already-experienced catastrophic failure mode (SHM torn-write corruption vs. total named-volume wipe on VM rebuild), and nobody has yet designed a single answer that closes both. That is the actual shape of the design problem — not "pick the right one of four candidate mechanisms."

---

## 2. Correcting the three candidate hypotheses

### 2.1 (c) "Docker named-volume sync fault" → should be read as "bind-mount virtualization fault"

Docker Desktop for Mac's bind-mount path (`./data/live` → `/app/data`) crosses the macOS↔Linux-VM boundary through the file-sharing virtualization layer (VirtioFS on current Docker Desktop; the legacy grpc-FUSE/osxfs backends were deprecated years earlier and this host's `settings-store.json` carries no override, so VirtioFS is the effective default on Docker Desktop 4.76.0). VirtioFS's well-documented weak points are exactly the primitives SQLite's WAL mode depends on: `mmap()`-backed shared-memory index files (`-shm`) and `fcntl` byte-range advisory locks. A named volume never crosses that boundary — its data lives on the VM's own virtual disk (ext4), so the same SQLite primitives behave exactly as on native Linux. This is precisely what `ffa045e81`'s author (correctly) diagnosed on 04-25, independent of this SPIKE.

Named volumes are **not** a "sync fault" source; if anything they are the *more* POSIX-correct backend. The tradeoff is durability against a different failure class entirely (§2.4).

### 2.2 (a) Concurrent exec-write race — real, but not where the row's note suspected it

The row's forensic note suspected a peer *container* (`dev-team BOUNDED-1` exec-writing during the 07-13 window). Code review shows market.db has **exactly one writer container today** — `mcp-server` — every other container that opens market.db does so either through an explicit `mode=ro` URI (pdf-extractor's Python stdlib `sqlite3`, correctly) or a Go connection (see §2.3, §6.1 for how faithfully "read-only" that actually is). There is no cross-container exec-write path into market.db in the current fleet.

The real concurrent-write surface is **intra-container**: multiple independent `bun:sqlite` connections opened *inside the mcp-server process* against the same file, bypassing the `getDb()` singleton (`schema.ts:76-121`) that owns `journal_mode`. `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION` (REVIEW today) already found and fixed one instance of this shape (`bctcEvalBackfillRunner.ts`) and flagged 4 more in `scripts/migrations/*.ts` (repo root) it did not fix (zone boundary). §6.1 below extends that finding: there is a **second, larger, entirely unaudited directory** (`apps/mcp-server/scripts/` and `apps/mcp-server/scripts/migrations/`, 21 files) with the same `new Database(DB_PATH)` shape, none of which was in that row's AC-2 sweep.

### 2.3 (b) WAL-checkpoint timing vulnerability

Not applicable to market.db post-`157335892` (DELETE mode has no checkpoint to race). It **is** applicable to `coordination.db`, which is still WAL — see §4.2/§5.2.

### 2.4 The tension the row's question doesn't surface: durability vs. corruption-resistance are in conflict, and nobody has resolved it

- Named volume: resistant to the WAL/SHM virtualization corruption class; **destroyed wholesale** by a Docker Desktop VM rebuild/hypervisor crash (already happened once, per `5ba622eca`'s own commit message and `feedback_vm_rebuild_destroys_named_volumes_restore_then_launch`).
- Host bind-mount: **survives** a VM rebuild (real Mac-disk file); exposed to the WAL/SHM virtualization corruption class.

`journal_mode=DELETE` is actually a reasonable resolution of this tension for market.db specifically — it keeps the VM-rebuild-durable bind-mount *and* removes WAL's mmap'd `-shm` dependency, the specific mechanism `ffa045e81` diagnosed. It does not eliminate all bind-mount risk (rollback-journal + `fsync` semantics over VirtioFS are also imperfect, which is exactly why `synchronous=FULL` was paired with it), but it is targeted at the dominant, evidenced mechanism rather than a generic hardening gesture. This reasoning should be made explicit in the fix's own commit trail — it currently isn't (`157335892`'s comment cites the SHM mechanism but not the mount-type history in §1), so the next engineer who hits `SQLITE_READONLY` regressions (§4.C) and is tempted to "just go back to WAL" has no record of why that reopens a worse, already-experienced failure mode.

---

## 3. Live landmine — a second, unaudited WAL re-armer, wired into production today

`FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION`'s sweep was TypeScript-only (`apps/mcp-server/` + repo-root `scripts/`). It never looked at the Go services. Two of them do the same thing, more actively:

- `apps/stock-price/pkg/infrastructure/foreign_flow_repository.go:36-37`
- `apps/stock-price/pkg/infrastructure/room_event_repository.go:29-30`

Both build their DSN as:
```go
// Note: readonly mode (mode=ro) conflicts with WAL journal mode creation.
// Use immutable=1 for truly readonly access, or skip mode=ro for test scenarios.
// For production: market.db is expected to have WAL already enabled.
dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", r.dbPath)
db, err := sql.Open("sqlite3", dsn)   // mattn/go-sqlite3 (CGO) — no mode=ro
```
`r.dbPath` is wired from `DB_PATH` (`/app/data/market.db`) at `apps/stock-price/cmd/server/main.go:31,45-46`, called live from `ForeignAccumService` (`pkg/domain/foreign_accum_service.go`) via `ForeignAccumUseCase`, both composed at `cmd/server/wire.go:38-46` — this is production wiring, not a test fixture.

**The comment is not incidental — it is a documented, deliberate design decision that is now wrong.** The developer who wrote it discovered that `mode=ro` prevents `_journal_mode=WAL` from taking effect (correct — SQLite cannot change journal mode on a read-only-opened connection) and **removed `mode=ro` specifically so the WAL pragma would succeed**, on the explicit assumption *"market.db is expected to have WAL already enabled."* That assumption held from `ffa045e81` (2026-04-25) until `157335892` (2026-07-30 10:26) — essentially the entire life of this code. It is false as of this morning.

Because `journal_mode` is a persistent property of the file (not the connection — the same fact the sibling FIX row already established for `bctcEvalBackfillRunner`), the **first live call** to either of these two functions after `157335892` will silently flip market.db from `delete` back to `wal`, recreating `-wal`/`-shm`, on a database that is still sitting on the exact bind-mounted virtualization layer diagnosed as the corruption mechanism in §1. mcp-server's own `getDb()` singleton (`schema.ts:83-96`) only re-asserts `PRAGMA journal_mode = DELETE` when it detects the file's **inode** changed — a pragma-only mode flip does not change the inode, so the long-lived server connection will not self-heal; market.db would stay in WAL mode, silently, until the next mcp-server container restart.

**Verified, read-only, right now** (no write issued — a bare `PRAGMA journal_mode` with no assigned value is a pure read):
```
$ docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e "... db.query('PRAGMA journal_mode').get() ..."
journal_mode(readonly-probe)= {"journal_mode":"delete"}
```
and `ls -la /app/data/market.db*` inside the container shows no live `-wal`/`-shm` pair (only historical `.corrupt-*`/`.backup` snapshots). So **this has not fired yet** — it is dormant, not active — but it is armed. `docker ps` shows `vn-market-intelligence-mcp-stock-price-1` is a live, running container today; nothing in this brief exercised its foreign-flow/room-event endpoints (out of the read-only diagnostic scope an architect should touch), so absence of a live `-wal` file right now is not evidence the code path is unreachable — only that it has not been hit in this observation window.

**This is the single most actionable, time-sensitive finding in this brief.** It should route to `dev-mcp-server`-equivalent (Go zone owner) as its own P0 FIX row, sibling to `FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION`, not folded into it (different language, different zone, that row is already in REVIEW). Fix shape: drop `_journal_mode=WAL` from both DSNs (the DB no longer needs a per-connection mode assertion — it is DELETE by the sole owner in `schema.ts`), keep `_busy_timeout=5000`, and add `mode=ro` now that there is no longer a reason to omit it (DELETE mode does not have the "mode=ro conflicts with WAL creation" problem the original comment describes — that conflict was specific to *wanting to force WAL*).

---

## 4. AC-A through AC-D

### AC-A — must specifically survive tree-3 (`sqlite_sequence`) corruption, not generic page damage

`journal_mode=DELETE` + `synchronous=FULL` is mechanism-appropriate here, not merely page-general: the diagnosed root cause (`ffa045e81`, corroborated by PO's 2026-07-30 forensic triage) is a **torn write of the WAL shared-memory index** during container stop, a mechanism that requires WAL mode to exist at all (`-shm` is WAL-only). Removing WAL removes the *specific* torn-SHM-write class category-wide — it is not a page-address-specific patch, so it is not "tuned to tree 3 and blind elsewhere." That said, it is **untested against the tree-3 failure mode specifically** — no regression test exists that (a) forces a torn write on `-shm` under WAL and (b) proves DELETE mode doesn't reproduce it, nor one that (c) simulates high AUTOINCREMENT write pressure across many tables and asserts `sqlite_sequence` integrity survives a simulated container-stop-mid-write. That test does not exist today and building it (mocking a torn virtualized-FS write deterministically) is itself a nontrivial infrastructure-test design problem, better scoped as its own follow-up than absorbed into this SPIKE's plan-only deliverable — flagging, not designing, per the row's own boundary.

### AC-B — DELETE-vs-WAL decision per remaining DB, on evidence

| DB | Owner(s) | Concurrency shape | Mount | Verdict |
|---|---|---|---|---|
| `coordination.db` | mcp-server only (`coordinationStore.ts`) | Single-container, but **high-frequency**: task_claim/heartbeat/release from every agent session, cron overlap guard — this is the busiest write path in the fleet by call-count, not by row-count. Already has its own dedicated corruption-recurrence history (`TASK_1989`/`FIX-COORD-WAL-CHECKPOINT-POST-MIGRATION`) and a startup `wal_checkpoint(TRUNCATE)` (`coordinationStore.ts:91-97`) purpose-built for WAL. | Same bind-mount, same container, same virt layer as market.db (`ls` today: `506KB→556KB -wal` growing, `-shm` mtime tracking live, per PO's 07-30 note). | **Do not blanket-convert.** This is the one DB in the fleet where the row's own caution ("do NOT blanket-convert a high-frequency lock store without measuring lock contention") is correct as written — `synchronous=FULL` on every `task_claim`/`heartbeat` write would lengthen the lock window on the system's own cross-session mutex, and a stuck mutex has *worse* blast radius (silent double-dispatch fleet-wide) than the SHM corruption it would avoid. **Recommendation: measure lock-hold duration under DELETE in a non-prod fixture first** (the row's own AC-B instruction), not swap live. If DELETE is adopted, the existing `wal_checkpoint(TRUNCATE)` call at `coordinationStore.ts:96` becomes dead code for this file and should be removed in the same change (mirrors what happened to market.db's own WAL-era `checkWalFileSize`/`runForcedTruncateCheckpoint` cron, §5.2 — leaving it silently inert is how the stock-price landmine in §3 happened: an assumption baked into code that nothing re-verifies). |
| `alert_engine.db` | alert-engine only (Go, mattn/go-sqlite3, `SetMaxOpenConns(1)` — genuinely single-writer, single-connection) | Low: one process, one connection, explicit `_busy_timeout=5000`. `market.db` field in alert-engine's own `ServiceConfig.DBPath` is loaded but **never opened anywhere in the Go code** — dead config, not a live cross-DB writer. | Same bind-mount. | **Lower priority than coordination.db.** The single-connection, single-writer shape is structurally the safest concurrency profile in the fleet — this is not the DB that produced any of the 4 documented incidents, and there is no code-level evidence of contention. Worth a DELETE-mode conversion eventually for defense-in-depth (same bind-mount exposure), but not urgent. |
| `macro_indicators.db` | macro-indicators only (Go, modernc.org/sqlite pure-Go, `SetMaxOpenConns(1)`) | Same shape as alert_engine.db — single-writer, `PRAGMA journal_mode=WAL` set explicitly at open (`repository_vmt_omo_daily.go:77`). | Same bind-mount. | Same verdict as alert_engine.db — structurally low-risk, not urgent, candidate for eventual parity conversion. |

None of these three sit anywhere near market.db's contention profile. **coordination.db is the one that matters** and it is the one still fully exposed to the identical bind-mount/WAL/SHM mechanism that caused 3 of 4 market.db incidents, with a strictly worse failure mode if it corrupts (fleet-wide silent double-dispatch vs. one DB's data loss). This should be the next row after §3, ranked above the alert_engine.db/macro_indicators.db pair.

### AC-C — quantify the SQLITE_READONLY/BUSY regression before calling the mitigation proportionate

Static analysis (this SPIKE, plan-only — no load-generation performed; that step is explicitly ops/dev execution territory per architect's own boundary) narrows *who* is exposed and *how badly*, which is the prerequisite for whoever runs the live measurement:

| Reader | Driver | `mode=ro`? | `_busy_timeout`? | Exposure |
|---|---|---|---|---|
| `pdf-extractor` (`main.py:71`, `ocr_text_source.py:77`) | Python stdlib `sqlite3` | Yes, both call sites | n/a (Python doesn't retry) | Correctly read-only; a `SQLITE_READONLY` hot-journal collision would surface as a hard error on `/page-text`, uncaught by any retry — lowest exposure count (2 call sites) but zero resilience if it fires. |
| `macro-indicators` — 3 of 4 openers (`repositories_carry_yield.go:45`, `adapters_vmt_sjc_fx.go:95`, `parsers_vmt_sbv_policy_rates.go:322`) | modernc.org/sqlite (pure Go) | Yes | **No** | `mode=ro` correctly prevents these from becoming WAL re-armers (unlike §3), but the missing `_busy_timeout` means a hot-rollback-journal collision fails immediately rather than retrying — every DELETE-mode write transaction on market.db now creates a transient `-journal` file that a concurrently-opening reader can observe as "hot," which is a strictly bigger window than WAL's mmap'd, always-consistent snapshot. |
| `macro-indicators` — 4th opener (`cache_vmt_nso.go:88`) | modernc.org/sqlite | **No** (`file:%s`, bare) | No | Opens read-write despite being a cache reader; not itself a WAL re-armer (no `_journal_mode` param), but has no OS-level enforcement of its read-only intent. |
| `technical-analysis` (`main.go:168`, `repositories.go:47`, `ohlcv_repository.go:43`, `multi_ticker_ohlcv_repository.go:68`) | modernc.org/sqlite | **No, anywhere** | No | `DB_READONLY=true` is set in `docker-compose.yml:184` but **is never read by any Go code in this service** — grep-confirmed zero matches for `DB_READONLY` in `apps/`. Every one of these 4 call sites opens market.db read-write with no timeout. Widest exposure surface by call-site count. |
| `stock-price` Tier-3/history (`fetchers.go:241,304`) | mattn/go-sqlite3 (CGO) | Yes | Yes, 5000ms | Best-configured reader in the fleet — `mode=ro` + `_busy_timeout=5000`; the `_journal_mode=WAL` in the same DSN is inert under `mode=ro` (cannot change mode without write access) so this pair, unlike §3's pair, is not a re-armer — just stale/misleading documentation. |
| `stock-price` foreign-flow/room-event (§3) | mattn/go-sqlite3 (CGO) | **No — deliberately removed** | Yes, 5000ms | The live landmine (§3). Not a `SQLITE_READONLY` *victim* — the opposite: an active re-armer that *creates* the exposure for every other reader in this table. |

`DB_READONLY=true` is set as an env var on **4 services** (`technical-analysis`, `macro-indicators`, `kinh-dich-service`, `news-fetch`) in `docker-compose.yml` and is **consumed by none of them** (grep-confirmed zero matches anywhere under `apps/`). It documents an intent that no code enforces. This is a second, independent scope gap from §3, lower urgency (mislabeling, not active corruption risk by itself) but relevant to "is the mitigation proportionate" — the honest answer is the fleet's actual read-only discipline is inconsistent enough that a clean quantified BUSY/READONLY rate needs to be measured **per-service**, not as one fleet-wide number, because the failure modes differ (no-op mismatch vs. missing retry vs. active re-arm). **Recommended measurement procedure for whoever executes it** (ops or the Go zone owner, not this session): drive each of the 5 readers above against a live market.db under a sustained `getDb()` write burst (the existing BCTC batch backfill jobs are a natural, already-scheduled burst generator), sample HTTP 5xx / Go `err` rates per service over a 30-60 min window, and specifically watch `technical-analysis` (no `mode=ro`, no timeout — the worst-configured) and `macro-indicators`'s 3 timeout-less readers. This gives the proportionality answer the row asks for; this brief's contribution is narrowing where to look and why, not the number itself.

### AC-D — residual rowid reuse after `sqlite_sequence` reset (22 of 66 AUTOINCREMENT tables retained their high-water mark; 44 did not)

Two distinct risk classes, not one:

1. **Internal, cross-table references inside market.db itself.** `agent_signals.alert_id` is a soft FK into `alerts.id` (both AUTOINCREMENT). An existing audit job, `checkOrphanAgentSignalsAlertId.ts` (`apps/mcp-server/src/scheduler/news-analysis/audit-checks/`), already monitors this relationship — but only for the **dangling** case (`LEFT JOIN alerts a ON a.id = s.alert_id WHERE ... a.id IS NULL`). Rowid reuse produces the **opposite, undetectable** failure: an `agent_signals` row whose `alert_id` used to point at alert X now silently resolves to a *different, valid* alert Y that reused X's old id post-recovery. The existing check cannot see this — it would report 0 orphans on a table full of silently-misattributed correlations. This is the single most concrete, checkable AC-D finding: **the existing regression tripwire for this exact relationship class has a blind spot that this incident's own recovery mechanism (sqlite_sequence reset) can trigger.** Recommend a companion check (or an extension of the existing one) that also validates `agent_signals.created_at >= alerts.created_at` for the joined row (a signal cannot legitimately reference an alert created after it) as a cheap, no-schema-change proxy for "does this FK still point at a plausible target" — this doesn't need this SPIKE's plan-only session to design further; it's a small, self-contained follow-up.
2. **External consumers.** No evidence found of a system outside market.db persisting a rowid from one of the 44 reset-affected AUTOINCREMENT tables as a stable reference — `alert_engine.db` does not store a market.db alert id (grep-confirmed, no `market_alert_id`/similar column), and the Telegram/dashboard output paths checked (`taAlertScanJob.ts`, `alertOutcomeJob.ts`, `bbAlertScanJob.ts`, `alertStore.ts`) construct outbound messages from row *content*, not from embedding the numeric id as a durable link. This is not an exhaustive 44-table audit (out of scope for a plan-only architecture pass — see §7 for the bounded follow-up procedure), but the highest-plausibility candidates (`alerts`, `system_logs`, `cron_job_runs`, `agent_signals`) show no external-reference pattern on inspection.

---

## 5. Hardening-option feasibility (the row's four options)

### 5.1 Option 1 — per-transaction cross-container write-lock coordination

**Not proportionate.** §2.2/§2.3 establish market.db has one writer container; the actual multi-writer surface is intra-process (§3, §6.1), which a distributed cross-container lock does nothing to fix — two `bun:sqlite`/Go connections inside the *same* fleet both racing the *same* file is a code-discipline problem (one owner, `getDb()`), not a coordination-protocol problem. Building `coordination.db`-style lock arbitration around SQLite writes would also recursively depend on `coordination.db` itself staying healthy, which (AC-B) is the DB with the most similar exposure to market.db today — a poor foundation to add more load onto without first hardening it.

### 5.2 Option 2 — WAL-checkpoint synchronization gate before peer exec-writes

Moot for market.db (no longer WAL). Real for `coordination.db`, which already has one home-grown instance of this idea: `coordinationStore.ts:91-97`'s startup `wal_checkpoint(TRUNCATE)` (guards against the "WAL-ghost" migration-visibility class, `TASK_1989`) and mcp-server's own `walCheckpointJob` (`schedulerJobTable.ts:1092-1114`, every 30 min, `runForcedTruncateCheckpoint` + `checkWalFileSize` + off-hours `backupDatabase`) — **written for market.db when it was still WAL, and never re-scoped.** `runForcedTruncateCheckpoint` (`checkpoint.ts:284-324`) is defensively coded (`log=-1`/`checkpointed=-1` when `journal_mode != WAL` is treated as a graceful no-op) so it does not silently misbehave post-DELETE-conversion — but it still does an unconditional `BEGIN IMMEDIATE; COMMIT` against market.db every 30 minutes for a checkpoint that is now always a no-op, needlessly forcing a write-lock boundary (and blocking readers during it, worse under DELETE than it was under WAL) for zero benefit. **Cheap, low-risk cleanup: gate this job on `journal_mode`, and retarget its `backupDatabase`/`checkWalFileSize`/`runForcedTruncateCheckpoint` triad explicitly at `coordination.db`**, which is the DB that actually still needs it and does not currently have an equivalent scheduled checkpoint+backup cadence of its own (only the one-time startup checkpoint).

### 5.3 Option 3 — periodic `PRAGMA integrity_check` health gate with alert-on-FAIL

**Already exists, and the row's framing (a new gate) undersells what's needed.** `runIntegrityCheckJob`/`runIntegrityCheck` (`integrityCheckJob.ts`, `checkpoint.ts:198-258`) already run weekly (Sunday 02:00 UTC, `forceRun=true`) plus on a WAL≥40MB trigger, and already send a Telegram WORK alert on FAIL. A full `PRAGMA integrity_check` against a 400MB DB is not cheap (full page scan), which is exactly why it's weekly, not sub-hourly — "tighten the cadence" runs straight into that cost, and even a daily cadence would still have left the 07-30 fault (a 4.5h silent window) undetected by this specific mechanism; every one of the 4 incidents was actually first noticed through *other*, faster channels (freshness monitors on individual tables), not this job.

**The higher-leverage design is a different, much cheaper probe that targets the observed symptom directly rather than inferring it from full-DB structural integrity:** the tree-3 failure mode's signature (per PO's own forensic proof) is that a universally-write-heavy AUTOINCREMENT table stops advancing while everything else keeps working. `cron_job_runs` already receives a row on **every single scheduled job execution** (dozens per hour, from `jobRunRepo.wrapRun`) — it is already, incidentally, a write-canary; nothing currently *alerts* on it going stale. A `SELECT MAX(created_at) FROM cron_job_runs` compared against wall-clock, on a 5-10 minute cadence, is a `O(log n)` indexed lookup (not a page scan), needs zero schema change, and would have caught the 07-30 corruption within one polling interval instead of the ~4h it actually took multiple orthogonal freshness signals to converge on a diagnosis. Recommend this as a companion to (not a replacement for) the existing weekly `integrity_check` — the weekly job proves structural correctness; the new probe proves the specific "is anything able to INSERT into an AUTOINCREMENT table" liveness property this incident class actually breaks.

### 5.4 Option 4 — backup-cadence tightening / replication

**The existing backup has a defect that plausibly made 07-30 worse than it needed to be, and this is where "tightening cadence" is under-scoping the actual gap.** `backupDatabase()` (`checkpoint.ts:93-103`) runs during the same 30-min cron, gated to the 03:00-05:00 UTC off-hours window, and does an **unconditional** `Bun.write(dst, src)` — copying the live file over the *single* rotating `.backup` file with **zero integrity gate**. Occurrence 4's onset window (`~03:30-08:34Z`, per the row) **overlaps this exact backup window**. Consistent with that: occurrence 2 (07-13, outside the 3-5am window) recovered by a simple *"DB swap from 04:30Z backup (integrity_check=ok)"*; occurrence 4 (07-30, inside the window) needed a `.recover` salvage from the corrupt file itself, whose **first attempt was itself a secondary data-loss event** (caught by RAW-verify, per the row's own recovery-chain note) — the pattern is consistent with the last good `.backup` having been overwritten by an already-corrupting live file before anyone noticed. This is not provable retroactively without forensics on deleted backup generations, so it is stated as a plausible, evidence-consistent contributor, not a proven fact — but it is independently a real defect regardless of whether it fired this time: **a backup rotation with no pre-copy integrity check and only one generation is a hazard by design.** Minimum viable fix: (1) run a cheap check (even just "can I open it and `SELECT 1`", not a full `integrity_check`) before overwriting the rotating backup, skip-and-alert if it fails; (2) keep at least 2-3 generations (`market.db.backup.0/1/2`) instead of one, so a single bad backup cycle doesn't erase the last known-good copy. Full continuous replication (e.g. litestream-style WAL shipping) is not proportionate here — market.db is now DELETE mode by design (§2.4), which is specifically incompatible with WAL-shipping replication tools; pursuing that would reopen the WAL-vs-DELETE tension this brief is trying to resolve, not extend it.

---

## 6. Peripheral findings (flagged, not folded into this row's scope)

### 6.1 The FIX row's AC-2 sweep missed a second, larger script directory

`FIX-SQLITE-JOURNALMODE-WAL-REARM-DEFEATS-DELETE-MITIGATION`'s review_note enumerates the repo-root `scripts/migrations/*.ts` (4 unfixed) and states it checked "~90 test files + 4 smoke-task-lock*.ts" — but never looked at `apps/mcp-server/scripts/` and `apps/mcp-server/scripts/migrations/`, a **separate directory with the same naming pattern**. Grep confirms **21 files** there with `new Database(DB_PATH...)` shapes bypassing `getDb()`, e.g. `apps/mcp-server/scripts/migrations/backfill-signals-db.ts:181`, `repair-ohlcv-scale-corruption.ts`, `trigger-ohlcv-backfill-queue.ts`, `create-signals-db.ts`. None of the sampled ones set `journal_mode` explicitly (so none are WAL re-armers like §3 or the already-fixed `bctcEvalBackfillRunner`), but each is an independent connection/lock-state-machine surface against a file the singleton also holds open — the intra-container concurrent-write-race class from §2.2. Several are already `{readonly: true}` (lower risk); a full classification of all 21 is the natural extension of that FIX row's own AC-2, not new work for this SPIKE.

### 6.2 `news-fetch`'s own write path looks structurally broken, unrelated to this SPIKE

`apps/news-fetch/cmd/server/main.go:46,60` opens `market.db` writable (`store.Open(dbPath)`, no `mode=ro`) and its `internal/store/sqlite.go` docstring says it *"writes raw news items into the shared rag_analyses table."* But `docker-compose.yml:390` mounts `./data/live:/app/data:ro` for this **one** service — a read-only bind mount. `store.Open` would fail its `CREATE TABLE IF NOT EXISTS` migration (or, if the table already exists so no DDL write is needed, its later `INSERT OR IGNORE` calls) against a read-only filesystem, and `main.go:59-62` treats any `store.Open` error as fatal (`os.Exit(1)`). Whether this manifests as a crash-loop or a silently-failing insert path was not verified live (out of this SPIKE's scope and would need a container-log read this session did not spend budget on) — flagged for its own ticket, not this one; it is not a corruption vector (a `:ro` bind mount fails loudly/EROFS, it does not corrupt), just a likely-dead ingestion path.

---

## 7. Recommendations, priority-ordered

1. **§3 — stop the stock-price WAL re-armer.** New P0 FIX row, Go zone, sibling to the TS one already in REVIEW. Highest urgency: it is live, wired, dormant-not-inert, and would silently undo `157335892` on first invocation.
2. **AC-B — coordination.db.** Measure lock-hold duration under DELETE in a fixture (not live) before converting; it is the next-most-exposed DB and has the worst blast radius if it corrupts (fleet-wide mutex failure).
3. **§5.3 — cron_job_runs staleness probe**, 5-10 min cadence, alert-on-stale. Cheap, targets the actual observed symptom, would have cut the 07-30 detection window from ~4h to ~10min.
4. **§5.4 — backup integrity-gate + multi-generation rotation.** Small, self-contained, addresses a real defect independent of whether it fired this time.
5. **§6.1 — extend AC-2's sweep** to `apps/mcp-server/scripts/**` (21 files, classify write-capability, no WAL-setters found so lower urgency than #1).
6. **§5.2 — gate `walCheckpointJob` on `journal_mode`**, retarget its backup/checkpoint triad at coordination.db. Housekeeping, not urgent.
7. **AC-C — commission the live BUSY/READONLY measurement** using the per-reader exposure table in §4 as a starting scope; this is ops/dev execution, not a further architect deliverable.
8. **§6.2 — news-fetch mount/write contract**, separate ticket, not corruption-related.

---

## 8. Not addressed / explicitly out of scope

- No code was written or modified. No container was restarted, no DB file was written to, no PRAGMA that changes state was issued — the two live touches this session made were a read-only `ls`/`cat` (§3) and a read-only `PRAGMA journal_mode` with no assignment (§3), consistent with PO's own read-only forensic precedent on this row.
- AC-A's proposed regression test (torn-SHM-write simulation under WAL, proving DELETE mode doesn't reproduce it) is named but not designed — nontrivial test-infrastructure problem, belongs with whoever implements §7 item 1/2.
- AC-D's external-consumer check (§4) is a targeted, not exhaustive, pass over the 44 reset-affected tables — a full audit is a bounded follow-up, not this brief's job.
- The live BUSY/READONLY rate (AC-C) is scoped, not measured — measurement requires load generation against a live service, which is ops/dev execution territory per architect's own charter (`not_my_job: Infrastructure diagnosis`).
- `apps/mcp-server/scripts/` 21-file classification (§6.1) is enumerated, not individually audited file-by-file.
- `news-fetch` (§6.2) mount contract is flagged, not root-caused — no container logs were read this session.

**Build standard:** `not-applicable` (multi-service hardening SPIKE in existing zones; no new service, no new primitive).
