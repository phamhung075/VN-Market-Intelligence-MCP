# market.db Journal Mode Policy

**Load when:** touching any SQLite connection code against `market.db`, diagnosing
`SQLITE_CORRUPT`/`SQLITE_READONLY` on market.db, adding a new market.db reader/writer in any
service, reviewing a DSN string or `PRAGMA` call.

---

## The Policy (settled, not open)

| | |
|---|---|
| **journal_mode** | `DELETE` |
| **synchronous** | `FULL` |
| **Sole owner** | `apps/mcp-server/src/infrastructure/db/schema.ts` (`getDb()`) — the ONLY place in this repo permitted to set market.db's `journal_mode`/`synchronous` pragmas |
| **Every other consumer** | opens `mode=ro`, with **NO** `journal_mode` token of any kind in its DSN/PRAGMA calls — not `WAL`, not `DELETE`, not anything. Read-only connections never need to assert a mode; asserting one is itself the defect class this policy exists to close. |

`journal_mode` is a **persistent property of the SQLite file**, not of a connection. Any code
path anywhere in the fleet that issues `PRAGMA journal_mode=<x>` (TS/JS) or opens a DSN
containing `_journal_mode=<x>` (Go) changes it for every subsequent opener, until the next
process that re-asserts it — there is no "just this connection" scope. This is why "sole owner"
is a hard constraint, not a style preference: a single stray PRAGMA anywhere in the fleet is
sufficient to undo the fix.

This question is **settled**, not open. Do not re-derive it, do not "just go back to WAL" when
debugging an `SQLITE_READONLY`/empty-result symptom (see `e370f5f51` below for exactly that
mistake), and do not treat a future corruption as evidence the policy is wrong — check for a
violator first (Enforcement, below).

---

## WHY — macOS Docker-Virt Torn `-shm` Write

Docker Desktop for Mac's bind-mount path crosses the macOS↔Linux-VM boundary through the
file-sharing virtualization layer (VirtioFS). VirtioFS's well-documented weak points are exactly
the primitives SQLite's **WAL mode** depends on: `mmap()`-backed shared-memory index files
(`-shm`) and `fcntl` byte-range advisory locks. A container stop/restart can torn-write the `-shm`
file mid-flight under this layer, corrupting the WAL state machine — the next write hits
`SQLITE_CORRUPT` (errno 11, "database disk image is malformed").

**`DELETE` mode has no `-shm`/`-wal` files at all** — removing WAL removes the specific mechanism
the virtualization layer corrupts. `synchronous=FULL` is paired with it because rollback-journal +
`fsync` semantics over VirtioFS are also imperfect; `FULL` ensures every COMMIT actually hits disk
before returning. This is a targeted fix for the evidenced mechanism, not a generic hardening
gesture — see the full analysis in
`docs/architecture-briefs/2026-07-30-sqlite-docker-virt-corruption-hardening.md` §2.

### 5 documented corruptions

| # | Date | Mount type | Resolution |
|---|---|---|---|
| 1 | 2026-04-25 | host bind-mount → **switched to named volume** (`ffa045e81`) | Root cause diagnosed correctly: VirtioFS torn `-shm` write |
| 2 | 2026-07-13 | named volume (bind-mount mechanism cannot apply — a *different* mechanism, concurrent-write race) | Recovered from 04:30Z backup |
| 3 | 2026-07-19 | host bind-mount (reverted 2026-07-15 `5ba622eca` after a VM rebuild wiped the named volume) | Self-resolved |
| 4 | 2026-07-30 | host bind-mount | **This policy's fix shipped**: `journal_mode=DELETE` + `synchronous=FULL`, commit `157335892` |
| 5 | 2026-08-06 | host bind-mount | **WAL re-armed 14h after #4's fix** by `e370f5f51` (2026-07-31 02:45, ~16h after `157335892`) — see Enforcement |

Occurrence #5 is the direct trigger for this document and for
`FIX-MARKETDB-JOURNALMODE-GUARD-SHIPPED-BUT-NEVER-ARMED`. Full incident record:
`docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md`.

---

## Durability Trade-Off (why bind-mount, not named volume)

Both mount types have each caused a real, catastrophic failure at different points in this
repo's history — this is a genuine trade-off, not an oversight:

- **Host bind-mount** (current, `./data/live:/app/data`) — **survives** a Docker Desktop /
  hypervisor VM rebuild (the DB is a real file on the Mac host disk). **Exposed** to the
  VirtioFS `-shm` torn-write corruption class above.
- **Docker named volume** (used 2026-04-25 → 2026-07-15) — lives entirely inside the Docker VM's
  own virtual disk, so SQLite's WAL primitives behave exactly as on native Linux — **not**
  exposed to the VirtioFS corruption class. **Does not survive** a VM rebuild: a hypervisor crash
  on 2026-07-15 destroyed the named volume and wiped all live data; only a host-disk backup
  survived (see `feedback_vm_rebuild_destroys_named_volumes_restore_then_launch`).

`journal_mode=DELETE` on the bind-mount is a **resolution of this tension, not a dodge of it**:
it keeps the VM-rebuild-durable bind-mount *and* removes WAL's `-shm` dependency, the specific
mechanism that caused 3 of the 4 pre-fix corruptions. It does not eliminate all bind-mount risk
(rollback-journal/`fsync` over VirtioFS is still imperfect — hence `synchronous=FULL`), but it is
targeted at the dominant, evidenced mechanism.

**This trade-off reasoning was previously undocumented** — `157335892`'s own commit message cites
the SHM mechanism but not this mount-type history, which is exactly the gap that let the next
engineer who hit `SQLITE_READONLY` (see below) reach for "just go back to WAL" with no record of
why that reopens a worse, already-experienced failure mode. This document is that record.

---

## How The Policy Broke — `e370f5f51` (the cautionary example)

2026-07-31 02:45 (~16h after the `157335892` fix): a stock-price DSN change
(`fix(stock-price): drop mode=ro from DSN to fix /price/history empty-array bug`) dropped
`mode=ro` from `file:%s?mode=ro&_journal_mode=WAL&_busy_timeout=5000`, keeping
`_journal_mode=WAL`. The removed code's own comment explains the (now-false) assumption:

> `// For production: market.db is expected to have WAL already enabled.`

That assumption was true from `ffa045e81` (2026-04-25) until `157335892` (2026-07-30) — the
entire life of that code — and became false the moment `157335892` landed. Because
`journal_mode` is a file property, the **first live call** through that DSN silently flipped
market.db back to WAL, recreating `-wal`/`-shm` on the exact bind-mounted, virtualization-exposed
file this policy exists to protect. mcp-server's own `getDb()` singleton only re-asserts
`journal_mode=DELETE` when it detects the file's **inode changed** — a pragma-only mode flip does
not change the inode, so the running server does not self-heal. market.db silently stayed in WAL
mode until the next container restart, and corruption #5 followed 6 days later.

**This is precisely why the policy has ONE sole owner**: any second opener that asserts a
journal_mode is a live threat, regardless of good intentions or a locally-correct-looking fix.

---

## Related, Explicitly Out-of-Scope Decision: `coordination.db`

`coordination.db` (task-lock system, `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`)
is a **separate file** on the same bind-mount and is legitimately `journal_mode=WAL` today — this
is a **different, already-reasoned-through** policy question, not a silent exception to the rule
above. Per `docs/architecture-briefs/2026-07-30-sqlite-docker-virt-corruption-hardening.md` §4.2
Verdict Table: coordination.db is the busiest write path in the fleet (task_claim/heartbeat/
release from every agent session) and `synchronous=FULL` on every write would lengthen the
cross-session mutex's lock window — a stuck mutex has *worse* blast radius (silent fleet-wide
double-dispatch) than the corruption it would avoid. **Recommendation: measure lock-hold duration
under DELETE in a non-prod fixture first**, not blanket-convert. This measurement is tracked as a
separate, lower-priority follow-up — not a blocker for, or a precedent against, this document's
market.db policy.

`alert_engine.db` (alert-engine, single-connection/single-writer) and `macro_indicators.db`
(macro-indicators, single-connection/single-writer, `repository_vmt_omo_daily.go:77`) are also
separate files, also legitimately WAL, also out of scope here — same brief, §4.4.

---

## Enforcement — Two Complementary Guards (neither substitutes for the other)

| Guard | What it catches | What it CANNOT catch |
|---|---|---|
| **Runtime** — `scripts/audits/verify-market-db-journal-mode.sh`, armed via the `*/15 * * * *` `market-db-journal-guard` standalone cron (`.claude/commands/crons/cron-market-db-journal-guard.md`) | THAT the live container's market.db is currently in a non-DELETE mode or has a live `-wal`/`-shm` pair — asserts the running system's actual on-disk state, not source | WHICH code path caused it |
| **Source** — `scripts/audits/verify-market-db-journal-source-guard.sh`, wired into CI (`.github/workflows/ci.yml` job `verify-market-db-journal-source-guard`) | Any tracked source file outside `schema.ts` that sets journal_mode against market.db (TS/JS `PRAGMA journal_mode =` proximity to a market.db path token; Go `_journal_mode=` DSN token) | A runtime-only PRAGMA issued outside tracked source (e.g. an ad-hoc `docker exec bun -e`) |

Both guards existing and being wired is the direct fix for the gap that let this policy go
unenforced: the runtime guard (`scripts/audits/verify-market-db-journal-mode.sh`) shipped
2026-07-30 with the original fix but had **zero call sites** until 2026-08-06 — no cron, no CI, no
agent flow doc, no auditor probe — so it sat silently correct-but-unread while `e370f5f51`
re-armed WAL 14h later and the resulting corruption took 6 more days to surface. An unarmed guard
and no policy is equivalent to no guard at all.

---

## Referenced From

`docs/ARCHITECTURE.md` § Database isolation.

## Related Documents

- `docs/architecture-briefs/2026-07-30-sqlite-docker-virt-corruption-hardening.md` — full root-cause analysis, §2 (mechanism), §2.4 (durability trade-off), §4 (AC-A/B/C/D verdicts, per-DB table)
- `docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md` — corruption #5 incident record
- `feedback_vm_rebuild_destroys_named_volumes_restore_then_launch` (memory) — named-volume durability failure mode
