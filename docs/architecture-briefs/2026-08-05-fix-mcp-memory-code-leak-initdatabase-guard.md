# mcp-server Memory Leak — initDatabase() Identity Guard + SSE Session Fast-Follow

**Task:** FIX-MCP-MEMORY-CODE-LEAK | BACKLOG→in_progress (Supervised-Lane Sweep claim,
2026-08-05T16:56Z) | zone: `apps/mcp-server/`
**BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives — same classification
as the prior recon)
**Author:** architect | **Date:** 2026-08-05T17:20Z
**Extends (does not duplicate):** `docs/architecture-briefs/2026-07-02-mcp-mem-sawtooth-recon.md`
(Phase-0 recon — cap-bump to 3GiB + rebuild-to-HEAD both already shipped and confirmed live
via `po_corroboration_20260729_0550`; this brief picks up exactly where that recon's own
decision matrix left off: remedy (i), the `initDatabase()` guard, deferred pending confirmation
the sawtooth persisted post-rebuild — it has, repeatedly, for 5 weeks).
**Scope:** Design only. No code changed, no container restart/rebuild executed (user-gated).

---

## Why this row is being re-opened now, not re-recon'd from scratch

The 07-02 recon already source-verified the dominant allocation hotspot and produced an
explicit, ranked decision matrix: ship the cheap mitigations (cap bump, rebuild) first,
observe, then ship the root-cause code fix (`initDatabase()` guard) if the sawtooth persists.
Both cheap mitigations shipped (`FIX-MCP-MEM-CAP-BUMP-REBUILD` → `done_verified`, 3GiB cap
confirmed live in every corroboration since). The sawtooth has persisted through six further
corroboration cycles (07-19, 07-21×2, 07-22 escalation, 07-23, 07-29×2) — including one
**genuine, non-FP tripwire trip** (07-29T05:41Z, `verify-a30-mcp-memory-reclamation.sh`
verdict=ESCALATE, "peak >97%", container down 113s later) that falsifies the "always benign
GC-sawtooth" reading several earlier corroborations on this row settled on. This is exactly
the persistence the 07-02 recon predicted and used to gate the next step:

> "cap bump + rebuild now ... → observe for 24-48h → if sawtooth persists (expected, per source
> evidence) → dev-mcp-server ships the `initDatabase()` guard"

That gate has been satisfied for weeks; the row simply had no dispatch path (plan_only+
supervised withheld it from every auto-pickup lane until today's Supervised-Lane Sweep). This
brief (1) re-verifies the 07-02 finding is still live and unfixed, (2) sizes it precisely
enough to hand straight to dev-mcp-server, and (3) adds one independently-discovered second
mechanism that the 07-02 recon's own log sample touched but did not attribute a leak to.

---

## Finding 1 (re-verified, unfixed, now the primary fix) — `initDatabase()` no-guard

**Live-reconfirmed at HEAD**, `apps/mcp-server/src/infrastructure/db/schema.ts:156-219`:
`initDatabase()` still has no already-initialized guard. Call-site count has **grown** since
the 07-02 recon (68 → **117** occurrences across **73** files, `grep -rc` today) — the leak
surface is widening as new tool handlers are added, not shrinking. Every one of those 117
bare `await initDatabase()` calls (no `dbArg`) resolves through `getDb()`'s singleton and
re-runs, on every single MCP tool invocation:

- 10 domain-slice DDL sweeps (`initMarketDataTables` … `initAgmPlanTables`, ~3300 lines of
  `CREATE TABLE/INDEX IF NOT EXISTS` across `schema-*.ts` — cheap per-statement but still
  parsed/executed every call, not zero-cost).
- A watchlist-seed existence check (cheap, one `COUNT(*)` query, correctly gated).
- **Three backfill calls that run unconditionally on every non-test call, confirmed by the
  file's own header comment** (`seedWatchlist.ts:15`: *"schema.ts runs seedWatchlist()
  unconditionally on every non-test DB init"*) — `backfillBctcQ4`, `backfillBctcQ1_2026`,
  `backfillBctcHistorical`. Read `backfillBctcHistorical` (`seedWatchlist.ts:282-308`)
  directly: it `db.prepare()`s a fresh `INSERT OR IGNORE ... SELECT w.code FROM watchlist`
  statement and `.run()`s it 8 times (one per trailing quarter) **every single call** — a
  fresh statement compile + an 8×N-row scan/insert pass against the full watchlist, per tool
  invocation, not per process lifetime.

`getDb()` four lines above already has the correct idiom (`if (_db) return _db;` at
`schema.ts:98`) — `initDatabase()` is the one sibling in the same file that never adopted it.

### Why this is the sawtooth's shape, and why a fix here is expected to close most of the gap

The 07-02 recon's own live log sample (`docker logs --since 2m`, ordinary load) showed
concurrent "New SSE connection" / "tool registered" bursts correlating with the mem-growth
rate, not wall-clock time — i.e. an allocation cost proportional to **request volume**, which
this exact call shape (117 sites × full DDL/backfill sweep, on every call) is. This explains
both halves of the observed pattern: the **rapid rise** (bursts of concurrent tool calls each
independently re-running the ~3300-line sweep) and the **GC-recoverable fall** (the objects
this allocates — prepared statements, result rows, the DDL string literals — are genuinely
garbage once each call returns; nothing here is retained past the call, hence "sawtooth," not
monotonic growth, in the common case).

---

## Design — the fix (single file, mirrors an existing in-file idiom)

**File:** `apps/mcp-server/src/infrastructure/db/schema.ts`
**Change:** guard `initDatabase()`'s body on the identity of the resolved `db` object, not a
bare module-level boolean.

```ts
const _initializedDbs = new WeakSet<Database>();

export async function initDatabase(dbArg?: import("bun:sqlite").Database): Promise<void> {
  const db = dbArg ?? getDb();
  if (_initializedDbs.has(db)) return;      // <-- new guard, first line after resolving db
  _initializedDbs.add(db);

  // ...unchanged body below...
}
```

**Why identity-keyed, not a bare boolean (load-bearing — a naive guard is a real regression
risk here):** `initDatabase()` is called two structurally different ways across the codebase,
confirmed by direct grep, not assumed:
- **Production (117 call sites, zero exceptions found):** bare `await initDatabase()`, no
  `dbArg` — always resolves through `getDb()`'s own singleton (`_db`), so within one process
  lifetime this is always the *same* object. A bare boolean and an identity-keyed WeakSet
  behave identically here — guard fires once, exactly the fix needed.
- **Tests (confirmed live, ~15+ files, e.g. `SPRINT-HPG-QUEUE-URL-FIX.test.ts`,
  `FIX-BCTC-D2-ENSURE-SHELL-ROW.test.ts`, `1345a-reuters-fallback.test.ts`,
  `FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH.test.ts`, …):** call `initDatabase(db)` /
  `initDatabase(testDb)` with an **explicit, freshly-constructed `Database` instance per
  test/`beforeEach`** — a different object reference every time, often many times within one
  `bun test` process. A bare module boolean would make the SECOND test anywhere in the whole
  suite silently skip all DDL against its own fresh `:memory:` database (no tables created →
  every query in that test fails), a suite-wide false-red regression, not a narrow one.
  Identity-keying on the actual `db` object closes this: a genuinely new `Database` instance
  is not in the `WeakSet` yet, so it still gets fully initialized; only a *repeat* call against
  an *already-seen* object (the production singleton, or a test reusing its own `testDb` across
  multiple `initDatabase(testDb)` calls in the same test — the exact case
  `002-db-schema.test.ts` already asserts is safe: *"initDatabase() can be called
  twice/a third time without crashing"*) short-circuits. `WeakSet` (not `Set`) so a
  test-created `Database` object can still be garbage-collected after its test scope ends —
  this guard must never itself become a second, smaller leak.
- No `isTestEnv`/env-var branching needed in the guard — it is pure object-identity
  memoization, orthogonal to the existing `isTestEnv` gate further down the function body
  (which controls the watchlist-seed/backfill block specifically and is untouched by this
  change).

**Risk:** Low. Single file, ~4 added lines, one new module-level `WeakSet`, mirrors the
existing `getDb()` singleton-guard idiom in the same file (same author intent, just corrected
to handle the `dbArg` dual-input shape `getDb()` itself doesn't have to deal with). No schema
change, no migration, no API surface change — every call site is unchanged. Idempotent DB
*effect* is unchanged (every one of those 117 call sites still gets a fully-initialized DB
exactly once per underlying connection); only the redundant *re-execution* is removed.

**Test strategy:**
- Extend `apps/mcp-server/src/__tests__/002-db-schema.test.ts` (already exercises the
  "call twice/three times" idempotency contract) with an assertion that a *second* call
  against the *same* `db` does not re-run the backfill (e.g. spy/count on
  `backfillBctcHistorical` via a test-only export, or assert `bctc_vps_queue` row count is
  unchanged after a 2nd/3rd call — cheaper, no new export needed).
- Add a regression case that TWO *different* fresh `:memory:` `Database` instances passed as
  `dbArg` **both** get fully initialized (guards against a future accidental swap back to a
  bare boolean) — this is the one behavior a naive fix could silently break, so it must be the
  one behavior the test suite explicitly locks in.
- Full existing suite (dozens of files listed above) is the regression backstop for "did this
  guard break any test's fresh-DB assumption" — must stay green unmodified.

---

## Finding 2 (new this pass, NOT in the 07-02 recon — flag for a fast-follow, do not fold into this fix)

**A second, structurally different leak mechanism exists on the SSE transport path, and it is
the higher-volume path in production.**

`docs/architecture/microservice/mcp-server.md:95`: *"Cowork agents access tools via SSE
(`/sse` endpoint). CLI cron agents access tools via StreamableHTTP (`/mcp` endpoint —
stateless, no session dependency)."* — i.e. the entire live agent fleet reached through
`mcp__gateway__call_tool` (this repo's own mandated tool-call path, `CLAUDE.md` § MCP Tools)
is on the `/sse` path, not the low-volume `/mcp` path.

`apps/mcp-server/src/interface/mcp/transport.ts` (`SseSessionManager.handleSse()`): every
`GET /sse` connection allocates a **brand-new `McpServer` instance** (`this.createServer()`
→ `createMcpServerInstance()`, the same ~146/166-tool-file registry `initDatabase()`'s sibling
finding also touches) **plus** a 30s-interval heartbeat timer, both stored in two unbounded
`Map`s (`sessions`, `heartbeatIntervals`) keyed by `sessionId`. The **only** cleanup path is
`res.on("close", …)` (fires on a genuine TCP-level close) or the heartbeat's own
`res.write()` throwing (fires only if the write itself errors — a partial mitigation already
shipped 2026-05-17, commit `c52982af2`, "heartbeat eviction for dead SSE sessions"). There is
no idle/max-age reaper independent of either signal, and no `DELETE` handler for `/sse` or
`/messages` (`server.ts` — CORS explicitly allows the `DELETE` method, but no route implements
it).

Compare to the sibling `/mcp` path (`server.ts:446-457`), which carries an explicit comment
*"Explicit cleanup prevents memory leak on long-running servers"* with a `try/finally` that
unconditionally calls `reqTransport.close()` / `reqMcp.close()` — i.e. this exact leak shape
has already been identified and fixed once, on the low-volume path only.

`apps/mcp-server/src/infrastructure/telemetry/perCallCounterStore.ts`'s own header comment
(unrelated feature, independent corroboration) describes the actual gateway calling pattern in
its own words: *"the gateway dials a new SSE connection per-call and drops it; the SSE
handshake / sessionId path in server.ts never fires [for sessionToolCache]."* A connection
that is dialed once, used for one exchange, and never explicitly closed by either side is
exactly the shape that never triggers `res.on("close")` — the TCP socket simply idles until
some other layer (OS-level, or eventual write failure) eventually notices, which may be a long
time or never within a container's uptime.

**Why this is a plausible second, distinct mechanism (not just a restatement of Finding 1):**
Finding 1's allocations are provably GC-reclaimable (nothing outlives the call) — it produces
sawtooth *shape* but not unbounded floor-creep. This finding's allocations (Map entries + live
`setInterval` closures + an un-closed `McpServer` instance, all still strongly referenced) are
**not** GC-reclaimable until the Map entry is deleted — a genuinely retained, monotonically-
growing leak, which is the better fit for the parts of this row's own history that don't match
"benign GC-sawtooth": the ratcheting sawtooth *floor* (`po_corroboration_20260721_1537`: "band
crept up ~6pt this session"), and the one genuine `>97%-no-reclaim` tripwire trip
(`po_corroboration_20260729_0550`). A pre-existing, zero-cost verification hook already
exists to test this empirically without any code change: `GET /health` returns
`sessions: sessions.sessionCount` (`server.ts:494`) — sampling this alongside `docker stats`
MemPerc over several hours (same "in-container instrumentation before a speculative code
change" standing constraint this row's own `po_corroboration_20260729_0550` field already
requires) would directly confirm or refute a monotonically-growing session count.

**Explicitly NOT folded into this fix's scope:** larger, structurally different change
(session-eviction policy / possibly avoiding a full tool-registry rebuild per SSE connection —
mirrors the 07-02 recon's own Step 3(ii), which it also explicitly deferred), needs its own
empirical confirmation step first (the `/health` `sessionCount` correlation above) before any
code is written, and touches session-lifecycle semantics the `/mcp` path's fix does not.
Recommend PO mint a follow-up row (`apps/mcp-server`, plan_only — same "instrument before
fixing" posture this row's own history establishes) once Finding 1 ships and the sawtooth's
floor-creep behavior post-fix can be re-observed to see how much of it Finding 2 still
accounts for.

---

## Decision — routing

Single file (`schema.ts`), single function, ~4 added lines, no new primitives, matches this
row's own already-set `next_agent: dev-mcp-server` / `owner: dev-mcp-server` (PO triage
2026-07-29T05:50Z). No BA spec, no multi-zone split, no new interface — **PM decomposition
skipped**, same direct-to-dev-* convention used for FIX rows this size elsewhere in this
sprint's own history. `supervised`/`plan_only` flags carried through unchanged (dev-team's own
SLS claim payload: "preserved — do not clear").

---

## RETURN

DONE: Design complete. Re-verified the 07-02 recon's `initDatabase()` finding is still live
and unfixed at HEAD (call-site count grew 68→117); sized the fix to a single-file
identity-keyed `WeakSet` guard (NOT a bare boolean — a boolean would silently break ~15+ test
files that pass fresh per-test `Database` instances as `dbArg`); found and documented a second,
structurally distinct, higher-volume leak mechanism on the `/sse` transport path (unbounded
session/heartbeat Map + un-closed per-connection `McpServer`, cleanup gated on a TCP-close
signal the documented gateway calling pattern does not reliably produce) — flagged as an
explicit fast-follow, not folded into this fix. Findings written to
`docs/architecture-briefs/2026-08-05-fix-mcp-memory-code-leak-initdatabase-guard.md` and to
the board row's own `architect_review_note`.
ZONE: apps/mcp-server/
NEXT: dev-mcp-server | implement the `WeakSet<Database>` identity guard in
`initDatabase()` (schema.ts:156) per the code block above, extend `002-db-schema.test.ts` per
the Test Strategy section, verify full existing suite stays green
PIPELINE: continue
