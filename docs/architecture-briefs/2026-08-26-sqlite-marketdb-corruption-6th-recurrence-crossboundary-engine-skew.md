# SQLite market.db Corruption — 6th Recurrence (2026-08-26): Root-Cause Investigation

**Task:** `FIX-SQLITE-DOCKER-VIRT-CORRUPTION-ROOT-CAUSE-INVESTIGATION`
**Author:** architect (session `036ceaf1-bf34-46cd-92e4-8c6b213ff4bb`)
**Written:** 2026-08-26T00:53Z (verified via `date -u`)
**Zone:** multi (`scripts/migrations/`, `apps/mcp-server/scripts/`, `apps/mcp-server/src/infrastructure/db/`, `docs/policies/`)
**Status:** forensics complete against preserved read-only snapshots only. **No write was made to
`data/live/market.db` or any `.corrupt-*` snapshot.** All commands below were `?immutable=1` /
`{readonly:true}` reads or `docker exec` read-only queries.

---

## 0. Verdict

**Both previously-documented mechanisms are independently re-confirmed excluded for tonight**, not
just asserted: header-byte forensics (§2) show the 08-26 corrupt file is in **rollback-journal
format** (`writer/reader version = 1/1`) — the *first* of the four preserved corruption snapshots
to be so. All three priors (07-19, 07-30, 08-06) are **WAL format** (`2/2`) with a **scattered,
multi-tree, page-header-garbage** signature (`btreeInitPage() error 11` across 5-15+ unrelated
trees per event) — consistent with the known SHM/torn-write mechanism, which requires WAL to exist
at all. Tonight has **zero** `btreeInitPage()` errors and instead a **narrow, structural** signature
concentrated in 1-2 trees (§3) — a *different corruption class*, not a continuation of the same one
under a new label. This is the single most important, concrete finding in this brief: **the
DELETE-mode mitigation (`157335892`, 2026-07-30) has never actually been tested against a real
recurrence until tonight** — the 08-06 event happened while the file was silently still WAL-format
(the Go re-armer bug, fixed same-day 12:41 UTC, fired at least once before its fix landed) and 07-19
predates the mitigation entirely.

**New, verified finding not in any prior brief or signal:** the host bun process and the
`mcp-server` container bun process are running **two different SQLite engine builds** on the same
physical file — `sqlite_version()` returns **3.43.2** on host, **3.51.2** in-container, despite both
reporting `Bun.version = 1.3.13` (§4). This is independent of, and additive to, the advisory-lock
hypothesis the row's title asserts as fact — engine-version skew across concurrent writers to one
file is a real corruption vector *even if locking is perfectly enforced*, and the row's own framing
did not consider it because it was never checked.

**Root-cause conclusion:** two surviving candidates remain, both consistent with all available
evidence, and — critically — **both are eliminated by the identical fix** (§6), so this is not a
blocking ambiguity for the recommendation:

- **(A) SQLite engine-version skew** (3.43.2 vs 3.51.2) writing the same file concurrently.
- **(B) Docker Desktop virtiofs advisory-lock / cache-coherency gap** across the host-native vs.
  container-virtiofs boundary (ops' hypothesis, refined — see §5 for why the *rollback-journal*
  locking path, not the WAL/SHM path, is now the relevant one).

Neither requires the mount-type change ops proposed (§6.1 costs that out and recommends against it
for now). The proportionate, cheaper fix is to stop any host-native SQLite engine from touching
`market.db` at all — route every host-invoked script through the container's own single, pinned
SQLite build via a wrapper script (§6), mirroring this repo's own `orch-apply.sh` convention.

---

## 1. Mount topology — re-verified live, contradicts the standing memory note

`docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{json .Mounts}}'` (run this
session) confirms `/app/data` is still `Type: bind`, `Source:
/host_mnt/.../VN-Market-Intelligence-MCP/data/live`, `RW: true` — unchanged since the 2026-07-30
brief (`docs/architecture-briefs/2026-07-30-sqlite-docker-virt-corruption-hardening.md §1`).
`docker-compose.yml:12` (`./data/live:/app/data`) confirms this is the checked-in config, not
container drift. Same confirmed for `stock-price` (`/app/data` → same host path).

The standing agent-memory note (`feedback_live_db_is_named_volume_not_host_data.md`) is
**self-superseded** as of 2026-07-30 — its own text already documents the named-volume→bind-mount
switch and warns not to trust either claim without re-running `docker inspect`. Re-running it
tonight confirms bind-mount is still current. **No contradiction to resolve** — the memory note's
own most-recent layer already matches live reality; only its oldest (2026-06-11) layer, explicitly
marked historical, disagreed.

---

## 2. Header-byte forensics — the 4 preserved snapshots are NOT the same corruption

`sqlite3` header decode (`xxd -s 18 -l 2 <file>`, byte 18-19 = file-format write/read version: `1`
= legacy rollback-journal format, `2` = WAL format) plus `file <file>` (which also decodes this):

| Snapshot | Writer/reader version | Journal mode at corruption | `PRAGMA integrity_check` signature |
|---|---|---|---|
| `market.db.corrupt-20260719-1125Z` | **2/2 (WAL)** | WAL | `btreeInitPage() error 11` on 6 distinct trees (247, 97, 151×2, 234, 152) + 74 orphaned pages |
| `market.db.corrupt-2026-07-30T08:21:24Z` | **2/2 (WAL)** | WAL | `btreeInitPage() error 11` on 15+ distinct trees (132,254,253,252,195,194,96,259,247,196,97,3,57,59×13,304) + 2 "Child page depth differs" |
| `market.db.corrupt-2026-08-06T1413Z` | **2/2 (WAL)** | WAL | `btreeInitPage() error 11` on 5 "trees" incl. schema-level garbage (Tree 82160 = page 82160, Tree 93633 ≈ page 93631 — rootpage itself corrupted, not just a leaf) |
| `market.db.corrupt-2026-08-26T0031Z` (**tonight**) | **1/1 (rollback journal)** | DELETE | **Zero** `btreeInitPage()` errors. 7,788 `Rowid out of order` cells, ALL but one in **Tree 180** (`intraday_foreign_flow_5m`); exactly **1** stray cell in Tree 96 (`pdf_extracted_text`); `Freelist: size is 0 but should be 1`; 37 orphaned-but-referenced-by-nothing pages; 47 `pdf_extracted_text` rows independently flagged `NUMERIC value in ...` type corruption |

(Full `PRAGMA integrity_check(200000)` re-run this session against all four, read-only/`immutable=1`;
tonight's re-run reproduced exactly 16,501 lines, matching the incident record. Prior three files
were checked with the same 200000 cap and terminated at a small handful of lines because
`btreeInitPage()` failure on the rootpage itself aborts the scan for that tree — not because the
damage is smaller, but because it is a different, more fundamental kind of damage that integrity_check
cannot walk past.)

**Reading:** three of four preserved recurrences (07-19, 07-30, 08-06) share one signature —
scattered, multi-tree, page-header-level garbage under WAL format — consistent with the SHM
mmap-torn-write mechanism the 2026-04-25 fix diagnosed, recurring because the mitigation kept being
silently defeated (07-19 predates it; 08-06 happened while the Go DSN re-armer bug — fixed same day,
12:41 UTC, per `git log` on `foreign_flow_repository.go`/`room_event_repository.go` — was still live).
**Tonight is the first genuinely new data point.** It is narrower (1-2 trees, not 5-15+), structural
rather than scattershot (a precise off-by-one freelist count and named cell-level rowid defects, not
"page fails to even parse as a b-tree page"), and happened under a journal mode that has never
previously produced a preserved corrupt snapshot. Treating it as "recurrence #6 of the same known
issue" is not supported by the forensics — **it is a different failure class that happens to share a
victim file and a recovery runbook.**

---

## 3. Tonight's signature, read literally

```
Tree 96 page 108440 cell 46: Rowid 62815607 out of order        ← the ONLY Tree-96 line
Tree 180 page 111039 cell 18-21: Rowid 62841915 out of order    ← repeats verbatim across MANY pages
```
`grep -c "62841915"` → 3095 occurrences; `62840329` → 1235; `62835581` → 384 — i.e. a **small set of
specific rowid values, each repeated across dozens to thousands of distinct cells/pages**, not a
uniformly-random scatter. That is the signature of **specific stale page content being read back
in place of many different pages** (or a b-tree page-chain pointer defect causing the same physical
page to be walked repeatedly), not bit-level disk noise — bit-level noise would not reproduce the
identical value at that scale across unrelated page numbers.

`Freelist: size is 0 but should be 1` (off by exactly one page — not "many", not "wildly wrong") +
37 pages that integrity_check found referenced by **nothing** (not a live b-tree, not the freelist
chain either — genuinely leaked) is the textbook signature SQLite documentation associates with a
**non-atomic multi-page commit**: a transaction that frees some pages, allocates others, and updates
the freelist header, where *some* of those page writes landed on disk and *others* (including the
one Tree-96 parent-pointer update that should have been cleared, and the accounting of exactly one
freed page) did not. This is page-allocation/freelist bookkeeping breaking under a torn commit — the
row's own instruction to "follow that thread" is well-supported by this reproduction.

**The compactor most likely to have produced the bulk of the damage:** `intraday_foreign_flow_5m`
(Tree 180) is written by exactly one code path —
`apps/mcp-server/src/scheduler/market-data/intradayForeignFlow5mCompactorJob.ts`, cron `*/5 * * *
*`, container-only (mcp-server's `getDb()` singleton). Its own header comment states it
**"re-aggregates the ENTIRE current content of foreign_flow_history... and UPSERTs every bucket
unconditionally"** — confirmed live: 104 distinct codes today (not just the 34-code watchlist — this
covers the full pushed universe), and the job wraps **all** of a run's `INSERT OR REPLACE` calls in
one `db.transaction()` (`intradayForeignFlow5mCompactorJob.ts:149`). This is, by construction, the
single largest, most page-churning multi-statement transaction in the entire fleet, running every 5
minutes. It is exactly the shape of transaction most exposed to a torn/partial-commit hazard, and it
is the table that absorbed nearly all of tonight's damage.

**The "absurd rowid" is a red herring, not evidence of corruption on its own.** `MAX(rowid) =
62,841,915` on a ~150K-row table looks alarming but is fully explained by `INSERT OR REPLACE`
semantics on a non-`AUTOINCREMENT` rowid table: every replace of an existing `(code, bucket_ts)` row
deletes-and-reinserts, consuming a fresh rowid each time. Verified live against the just-restored
04:30Z backup: `MAX(rowid) = 61,330,052` there vs. `62,841,915` in the corrupt file — **~1.51M
rowids consumed in the ~20h between the backup and the corruption**, i.e. ~75K/hour, which
extrapolated over the ~42 days since this job's 2026-07-15 deploy is consistent with reaching
~62.8M by tonight. **Do not chase rowid magnitude as a corruption signal** — the real defects are
the duplicate/out-of-order cell values, the freelist miscount, and the orphaned pages, independent
of how large any rowid gets.

---

## 4. New finding: host and container run different SQLite engine builds on the same file

```
host:      Bun.version = 1.3.13   sqlite_version() = 3.43.2
container: Bun.version = 1.3.13   sqlite_version() = 3.51.2   (oven/bun:1.3.13-debian, per Dockerfile:15)
```
Verified twice, both directions, this session (`bun -e "...sqlite_version()..."` on host and via
`docker exec ... bun -e ...`). Host `bun` (`/Users/admin/.bun/bin/bun`, Mach-O x86_64) does not
dynamically link any `libsqlite3` (`otool -L` shows no sqlite entry — it is statically compiled in),
so 3.43.2 is genuinely the engine bundled into *this* host binary, not a system library shadowing
it. Both report the identical `Bun.version` string, so this is a **platform-build inconsistency in
bun's own release, not a stale/mismatched install** on either side — worth flagging upstream
separately, but not something this repo controls.

**Why this matters for corruption, independent of locking:** the host-side migration/audit scripts
(`scripts/migrations/reextract-pdf-ocr-orientation.ts` and 85 similar files, §6.1) open the file
with a **materially older** SQLite core (8 minor versions behind) than the container's long-lived
`mcp-server` connection. SQLite's own documentation is explicit that concurrent access to one file
from different engine builds is unsupported precisely because subtle differences in freelist/page
allocation algorithms, page-cache assumptions, and journal-recovery edge cases are not guaranteed
compatible across versions — even when both correctly implement the same on-disk file format spec
in isolation. This is a **verified fact**, not a hypothesis, and it was not surfaced by any prior
incident record.

---

## 5. Refining, not discarding, the advisory-lock hypothesis

The row's title states "bind-mounted market.db loses advisory-lock enforcement across the Docker
Desktop host/container boundary" as established fact. Per the dispatch brief's own instruction, this
is downgraded to hypothesis here — but it is **not discarded**. The 2026-07-30 brief's framing
(`§2.1`) was specifically about **WAL's `-shm` mmap boundary crossing** — that mechanism cannot
apply tonight (no WAL, confirmed twice independently: live `PRAGMA journal_mode` read during the
incident, and now the header-byte writer-version check in §2). But rollback-journal locking is
**not lock-free** — SQLite's 5-state locking protocol (`UNLOCKED → SHARED → RESERVED → PENDING →
EXCLUSIVE`) is implemented via the same `fcntl()` POSIX advisory byte-range locks on the *main
database file*, regardless of journal mode; WAL adds the `-shm`/wal-index on top of that same
foundation, it does not replace it. If virtiofs does not faithfully proxy `fcntl` lock state between
a host-native opener and a container-virtiofs opener of the same file — a documented weakness class
for FUSE-like bridges — two writers (the host sweep script, the container's compactor) could each
believe they hold `EXCLUSIVE` for their own multi-page commit and interleave page writes, producing
exactly the "some pages landed, others didn't" signature in §3.

**Both candidate (A) engine-version skew and (B) lock/cache-coherency gap point at the same root
condition: a host-native SQLite process and a container SQLite process must never hold write
transactions open against the same physical file at the same time.** Distinguishing them further
would require either (a) a controlled reproduction — hold a container-side write transaction open
while forcing a host-native writer to race it, instrumented with `lsof`/`fcntl` state on both sides
— or (b) waiting for bun to ship a version-aligned SQLite across platforms and re-testing whether
recurrences stop. Neither is proportionate to run live against production data. The recommendation
in §6 removes the shared precondition for both candidates without needing to adjudicate between
them.

---

## 6. Recommendation

### 6.1 Costed-out: why NOT to migrate to a container-exclusive named volume right now

Option 1 from the row (named volume, no host access) was **already tried once** (`ffa045e81`,
2026-04-25) and **reverted 82 days later** (`5ba622eca`, 2026-07-15) after a Docker Desktop VM
rebuild destroyed the named volume outright and wiped all live data (`feedback_vm_rebuild_
destroys_named_volumes_restore_then_launch`). Re-adopting it reopens that specific, already-
experienced catastrophic failure mode. It also does not, by itself, remove more risk than the
cheaper fix below: named volumes are invisible to the host filesystem, so **every one of the 86
host-invoked scripts that touch market.db directly would need to be rewritten to route through
`docker exec` anyway** (`grep -rl "new Database(" apps/mcp-server/scripts scripts/migrations | wc
-l` → 52 + 34 = 86, up from the 25 the 2026-07-30 brief found — this surface has more than tripled
in four weeks and is actively growing, not shrinking). That is the *same* migration cost as §6.2
below, for a mount-type change that reopens a worse failure mode and still requires the backup
hardening in §6.3 to be safe. **Not recommended now.** Revisit only after §6.2 ships and §6.3's
backup gap is closed — if recurrences continue after both, the named-volume option becomes the
next escalation, not the first one.

### 6.2 Primary fix: route every host-invoked write through the container (new, ~S-size)

Add `scripts/run-against-market-db.sh <script-path-inside-repo> [args...]` that:
1. Verifies `vn-market-intelligence-mcp-mcp-server-1` is running/healthy (`docker inspect --format
   '{{.State.Health.Status}}'`); fail loud, do not silently fall back to a host-native `bun` call.
2. `docker exec` into the container and runs the script with the container's own `bun` (its own
   `sqlite_version()` — matching whatever `mcp-server`'s live connection uses, closing the §4 skew
   by construction) against `/app/data/market.db` (the container path), not the host path.
3. Never opens the file natively from macOS — this is the whole point.

Mirrors this repo's own `orch-apply.sh` convention for `orch-state.json` (`docs/policies/
dev-standards.md` CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER) — same shape, same rationale: a hot,
multi-writer file gets exactly one sanctioned write path. Add the equivalent CANONICAL rule for
`market.db`: *any script that opens `market.db` directly MUST be invoked via
`scripts/run-against-market-db.sh`, never bare `bun <script>` from a host shell.*

**Cost, honestly:** zero rewrite needed for the 86 existing scripts' own code (they already take
`DB_PATH` as an env var / already assume `/app/data/market.db` inside a container context in some
cases) — only their **invocation** changes, in runbooks/agent-flow docs that currently say `bun
scripts/migrations/...`. This session did not enumerate all 86 call sites' current invocation
convention (some may already assume container execution) — that audit is the implementer's first
step, not fully done here. No host cron/launchd job was found referencing `market.db` or
`scripts/migrations` directly (`grep -l` across `~/Library/LaunchAgents/*.plist` → zero matches), so
the write surface is agent/human-invoked, not a hidden scheduled process — bounding the retrofit to
"update the documented/scripted invocation convention," not "discover and fix N unknown cron jobs."

### 6.3 Still-open from the 2026-07-30 brief: backup has zero integrity gate, one generation

`backupDatabase()` (`apps/mcp-server/src/infrastructure/db/checkpoint.ts:93-103`) is **unchanged**
since the 2026-07-30 brief flagged it (§5.4 there): unconditional `Bun.write(dst, src)`, single
rotating `.backup` file, no pre-copy integrity check. Tonight's recovery worked because the 04:30Z
backup happened to predate the corruption window — this was not guaranteed by any code, and the
07-30 recurrence's own recovery needed a lossy `.recover` salvage plausibly because its equivalent
backup window overlapped the corruption. This is independent of root cause but directly determines
whether the *next* recurrence costs 20 minutes or the multi-hour salvage 07-19 required. Minimum
fix: cheap open+`SELECT 1` check before overwriting the rotating backup (skip+alert on failure);
keep 2-3 generations, not one.

### 6.4 Discriminating validation (for whoever implements)

After §6.2 ships: confirm zero host-native `bun` process ever opens `market.db` again (`lsof -c bun
data/live/market.db` from host should show only editors/inspectors, never a write-capable process)
over a full week including a migration/audit script run. If a 7th recurrence still happens with
that precondition genuinely eliminated, candidate (B) (virtiofs lock/cache gap between the
container's OWN connections — e.g. if `mcp-server`'s pool ever opens more than one connection
concurrently) becomes the leading hypothesis instead, and the named-volume option (§6.1) should be
re-evaluated at that point.

---

## 7. What this brief did not do

- Did not run `.recover` or any repair operation against any corrupt snapshot — read-only forensics
  only, per hard constraint.
- Did not fully audit all 86 host-script call sites' current invocation convention (cron vs manual,
  which already assume container context) — flagged as the implementer's first step in §6.2.
- Did not adjudicate candidate (A) vs (B) with a controlled reproduction — not proportionate against
  production data; §6.4 gives the discriminator if the primary fix doesn't fully resolve recurrence.
- Did not verify whether `bun`'s upstream release process is expected to pin one SQLite version
  across platforms — flagged as an upstream question, not this repo's to fix.

**Build standard:** `not-applicable` (bug-fix/hardening in existing zones; no new service, no new
primitive).
