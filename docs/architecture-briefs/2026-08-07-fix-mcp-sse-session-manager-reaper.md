# mcp-server SSE Session Manager — Per-Connection Leak, No Reaper

**Task:** FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER | READY | zone: `apps/mcp-server`
**BUILD-STANDARD:** not-applicable (bug-fix, in-zone, no new primitives — same classification
as the sibling `FIX-MCP-MEMORY-CODE-LEAK` fix this row fast-follows)
**Author:** architect | **Date:** 2026-08-07
**Extends (does not duplicate):**
`docs/architecture-briefs/2026-08-05-fix-mcp-memory-code-leak-initdatabase-guard.md` (Finding 2
of that brief — flagged as an explicit fast-follow, not folded into that fix). This brief is the
promised follow-up design once (a) `FIX-MCP-MEMORY-CODE-LEAK` shipped+deployed and (b) the
`/health sessionCount` vs `MemPerc` correlation that brief specified was run.
**Scope:** Design only. No code changed.

---

## 0. Why this row is being opened now, not re-measured from scratch

Both gating preconditions this row set for itself are already satisfied and recorded on the
board row (`depends_satisfied_note`, `po_rawverify_20260807T0600Z`):

1. `FIX-MCP-MEMORY-CODE-LEAK` is **deployed** (image `sha256:115700a86e65`,
   `initDatabase()` WeakSet guard live — decisive fix-signature probe: bootstrap sweep
   `backfillOCFForWatchlist` = 1 occurrence since boot vs pre-fix ~52/10min).
2. The `/health sessionCount` vs `MemPerc` correlation ran on that post-fix image, over a
   6h31m cold-started container, and ended in a **real, observed death**: `sessions` climbed
   871→873 across an 84s sample (~+86/h net), `MemPerc` 98.19–99.01% across 22 probes in 2
   windows, `VmHWM` still advancing at the cap (not a stable sawtooth), container died 6h36m
   after cold start with the fleet's already-root-caused clean-restart-that-isn't-clean
   signature (`OOMKilled=false`, `ExitCode=0`, 375ms Docker auto-restart — identical to
   `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP`).

This brief's job is therefore not to re-establish that the leak is real — that measurement is
done and terminal (a death, not a spot-sample) — but to turn the already-confirmed mechanism
into a scoped, testable code fix.

---

## 1. Brownfield read — confirmed mechanism (source-verified this pass)

**File:** `apps/mcp-server/src/interface/mcp/transport.ts` (139 lines, `SseSessionManager`)
**SDK:** `@modelcontextprotocol/sdk@1.29.0` — `SSEServerTransport` (`server/sse.js`,
`@deprecated` upstream in favor of `StreamableHTTPServerTransport`, noted for context, not
actioned — see § 6 Non-Goals) and `McpServer` (`server/mcp.js`).

### 1.1 The leak, read line-by-line

```
handleSse() {                                        // transport.ts:49-97
  const transport = new SSEServerTransport(endpoint, res);   // :54
  this.sessions.set(sessionId, transport);                   // :57  <- transport ONLY
  const heartbeatInterval = setInterval(..., 30_000);        // :65-79
  this.heartbeatIntervals.set(sessionId, heartbeatInterval);  // :81
  res.on("close", () => { /* delete transport + interval */ }); // :84-92
  const mcpServer = this.createServer();               // :95  <- bare local, never stored
  await mcpServer.connect(transport);                  // :96
}
```

Two `Map`s (`sessions: Map<string, SSEServerTransport>`, `heartbeatIntervals: Map<string,
Timer>`) are the only persistent state. **`mcpServer` (line 95) is never assigned to either
map and never `.close()`d anywhere in this file.** `McpServer.close()` (SDK, `mcp.js:53`)
cascades to `Server.close()` (`shared/protocol.js:500-502`) which does
`await this._transport?.close()`. Nothing in `transport.ts` ever calls it, so the tool
registration graph the SDK builds inside each `McpServer` (183 tools per current
`toolCount`) stays reachable for the process lifetime of every session that is never evicted.

### 1.2 Why the two existing eviction paths under-cover

There are exactly two live eviction paths today, both added by the 2026-05-17 partial fix
(commit `c52982af2`, task `1862c-F`, tested by
`apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`):

| Path | Trigger | What it evicts | Does it call `mcpServer.close()`? |
|---|---|---|---|
| `res.on("close")` (transport.ts:84-92) | TCP-level "close" event on the response socket | `sessions` map entry, heartbeat interval | **No** |
| heartbeat write failure (transport.ts:65-79) | `res.write(": keep-alive\n\n")` **throws synchronously** | `sessions` map entry, heartbeat interval | **No** |

Both paths are already incomplete (neither touches `mcpServer` — this is the row's core
finding, and it applies equally to both, not just to the missing-reaper half). But the second
gap compounds it: **Node's `ServerResponse.write()` does not throw synchronously on a broken
pipe** for the common "peer vanished without a clean FIN" case (a killed/timed-out cowork agent,
a dropped Cloudflare Tunnel hop, a proxy that resets silently) — the write buffers and the
stream later emits an async `'error'` event, which nothing here listens for. So in practice the
write-failure branch only fires for the narrower case of an already-fully-torn-down socket, and
`res.on("close")` is the only branch doing real work — confirmed by the live measurement in
§0: ~78% of sessions in the observed window *did* get reaped (`res.on("close")` firing on
clean disconnects), the residual ~22% (873/4018) never did.

**Independent corroboration that `/sse` sessions are typically single-exchange, high-frequency,
and NOT reliably closed by the client:** `apps/mcp-server/src/infrastructure/telemetry/
perCallCounterStore.ts:9` (unrelated feature, written for a different reason —
`TSU-DEV-U1`, per-call tool telemetry) states in its own header: *"the gateway dials a new SSE
connection per-call and drops it."* This repo's own `CLAUDE.md` mandates every agent reach
`vn-market` tools through `mcp__gateway__call_tool` — i.e. the dominant call volume against
this server is exactly this per-call-dial-and-drop shape, not long-lived multi-call sessions.
That "drops it" (no clean FIN from the gateway's side) is precisely the shape that never
reliably fires `res.on("close")` and never throws synchronously on `res.write()` either — the
architecture is structurally exposed to this leak on its highest-volume path, not an edge case.
(A second, lower-volume consumer class — direct `/sse` clients such as Claude Desktop, per the
CORS header explicitly allowing it — may hold longer sessions with natural idle gaps; the design
below must not penalize that class. See §2.2.)

### 1.3 `McpServer.close()` already does the right cascade — confirmed, not assumed

Read `shared/protocol.js:500-502` (installed SDK, not paraphrased):
```js
async close() {
    await this._transport?.close();
}
```
And `server/sse.js`'s `SSEServerTransport.close()`:
```js
async close() {
    this._sseResponse?.end();
    this._sseResponse = undefined;
    this.onclose?.();
}
```
So calling `mcpServer.close()` alone is sufficient — it closes the transport (ends the SSE
response stream) *and* releases the `McpServer`'s own tool-registration graph. The fix does not
need to call `transport.close()` separately; doing so would be redundant, not incorrect, but
adds no value.

### 1.4 Adjacent, corroborating signal (not new evidence, just consistent)

`apps/mcp-server/src/__tests__/081-bun-mcp-server.test.ts` (`afterAll`, pre-existing code,
unrelated task) already carries the comment *"open SSE connections can delay shutdown"* and
races `serverInstance.close()` against a 3s timeout for exactly that reason. This is the same
class of un-torn-down SSE state showing up as test-harness friction, independently of this
row's own investigation.

---

## 2. Design — the fix

**Files:**
- `apps/mcp-server/src/interface/mcp/transport.ts` (primary — all logic changes)
- `apps/mcp-server/src/interface/mcp/server.ts` (wire a `DELETE` route, ~10 lines)
- `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts` (extend — same
  class, same eviction-correctness dimension as the tests already there; see §4)
- `apps/mcp-server/src/__tests__/081-bun-mcp-server.test.ts` (extend — integration coverage
  for the new `DELETE` route on a real server instance, same harness already present)
- `docs/architecture/microservice/mcp-server/infrastructure.md` (doc update — new "SSE
  Session Manager" subsection under Telemetry/Infrastructure, since none currently describes
  this class beyond the raw file)

**DDD layer:** entirely `interface/mcp/` (protocol/transport adapter). No domain or
application code touches this. This is a self-contained interface-layer fix — **scan clean**
(§5).

### 2.1 Unify session state into one record, one eviction path

Today's two parallel `Map`s (`sessions`, `heartbeatIntervals`) plus two independently-written
inline cleanup blocks (heartbeat-catch, `res.on("close")`) are themselves the reason the
`mcpServer.close()` call went missing from *both* existing paths — there was no single place
that "eviction" happened. Fix: collapse to one `Map<string, SessionRecord>` and one `private
async evictSession()` method that every trigger path calls.

```ts
interface SessionRecord {
  transport: SSEServerTransport;
  mcpServer: McpServer;
  heartbeatInterval: ReturnType<typeof setInterval>;
  createdAt: number;       // epoch ms — max-age basis
  lastActivityAt: number;  // epoch ms — idle-timeout basis, bumped in handleMessage()
}

export class SseSessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly reaperInterval: ReturnType<typeof setInterval>;
  private readonly HEARTBEAT_INTERVAL: number;
  private readonly IDLE_TIMEOUT: number;
  private readonly MAX_AGE: number;

  constructor(
    private readonly createServer: McpServerFactory,
    private readonly log: Logger,
    private readonly pathPrefix: string = "",
    _heartbeatIntervalMs: number = 30_000,        // unchanged default
    _idleTimeoutMs: number = 15 * 60_000,          // NEW — see §2.2 for rationale
    _maxAgeMs: number = 4 * 60 * 60_000,           // NEW — see §2.2 for rationale
    _reaperIntervalMs: number = 60_000,            // NEW — sweep cadence
  ) {
    this.HEARTBEAT_INTERVAL = _heartbeatIntervalMs;
    this.IDLE_TIMEOUT = _idleTimeoutMs;
    this.MAX_AGE = _maxAgeMs;
    this.reaperInterval = setInterval(() => this.reapStaleSessions(), _reaperIntervalMs);
    this.reaperInterval.unref?.();  // don't hold the event loop open on the reaper alone
  }

  /** Single eviction path — every trigger (close/heartbeat-fail/idle/max-age/DELETE) calls this. */
  private async evictSession(sessionId: string, reason: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) return;                      // idempotent — safe from concurrent triggers
    this.sessions.delete(sessionId);
    clearInterval(record.heartbeatInterval);
    this.log.info("[SseSessionManager] Session evicted", { sessionId, reason });
    try {
      await record.mcpServer.close();          // cascades to transport.close() -> res.end()
    } catch (err) {
      this.log.warn("[SseSessionManager] mcpServer.close() failed during eviction (non-fatal)", {
        sessionId, reason, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private reapStaleSessions(): void {
    const now = Date.now();
    for (const [sessionId, record] of this.sessions) {
      const idleFor = now - record.lastActivityAt;
      const ageFor = now - record.createdAt;
      if (ageFor > this.MAX_AGE) {
        void this.evictSession(sessionId, "max_age");
      } else if (idleFor > this.IDLE_TIMEOUT) {
        void this.evictSession(sessionId, "idle_timeout");
      }
    }
  }

  async handleSse(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.log.info("[SseSessionManager] New SSE connection");
    const endpoint = `${this.pathPrefix}/messages`;
    const transport = new SSEServerTransport(endpoint, res);
    const sessionId = transport.sessionId;
    const mcpServer = this.createServer();
    const now = Date.now();

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(": keep-alive\n\n");
      } catch (err) {
        this.log.info("[SseSessionManager] Heartbeat write failed — client disconnected", {
          sessionId, error: err instanceof Error ? err.message : String(err),
        });
        void this.evictSession(sessionId, "heartbeat_write_failure");
      }
    }, this.HEARTBEAT_INTERVAL);

    this.sessions.set(sessionId, {
      transport, mcpServer, heartbeatInterval, createdAt: now, lastActivityAt: now,
    });

    res.on("close", () => {
      this.log.info("[SseSessionManager] Session closed", { sessionId });
      void this.evictSession(sessionId, "connection_closed");
    });

    await mcpServer.connect(transport);
  }

  async handleMessage(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "session_not_found", sessionId }));
      return;
    }
    record.lastActivityAt = Date.now();          // NEW — idle-timeout basis
    await record.transport.handlePostMessage(req, res);
  }

  /** Explicit client-initiated teardown — DELETE /sse?sessionId=<id> or DELETE /messages?sessionId=<id>. */
  async closeSession(sessionId: string): Promise<boolean> {
    const existed = this.sessions.has(sessionId);
    if (existed) await this.evictSession(sessionId, "client_delete");
    return existed;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Stop the reaper timer — graceful shutdown / test teardown. */
  stopReaper(): void {
    clearInterval(this.reaperInterval);
  }
}
```

Behavior preserved exactly for the two pre-existing paths (structured 404 shape, heartbeat
eviction, log messages) — `1862c-F`'s 5 existing tests must stay green unmodified in
observable behavior; only the internal representation changes (one `Map` of records instead of
two parallel `Map`s).

### 2.2 Threshold rationale (explicitly flagged as tunable, not asserted as final)

`IDLE_TIMEOUT=15min` / `MAX_AGE=4h` / reaper sweep every 60s are informed defaults, not derived
from a closed-form calculation — I'm flagging the reasoning so PO/dev can tune with evidence
rather than treat them as load-bearing magic numbers:

- The dominant traffic class (gateway per-call dial-and-drop, §1.2) needs only seconds of
  session lifetime — a 15-minute idle timeout is generous headroom for that class and will
  essentially never be the reason a *live* gateway-originated session gets evicted.
- The secondary class (direct `/sse` clients — Claude Desktop, per CORS `Access-Control-Allow-
  Origin: *` explicitly built for browser/desktop clients) may have real multi-minute human
  think-time gaps between tool calls within one working session — 15 minutes is chosen to be
  well above plausible think-time, not a guess at the floor.
- `MAX_AGE=4h` is a hard backstop independent of activity, sized so that even a session that
  dribbles just enough traffic to keep resetting the idle clock cannot accumulate past a bounded
  worst case — 873 leaked sessions × ~3.5MB (PO's own per-session estimate, §0) over 6.5h is the
  failure this exists to cap.
- All four values are constructor parameters (mirrors the pre-existing `_heartbeatIntervalMs`
  override already used for tests) — trivially tunable without a design change, and the exact
  same post-deploy `/health sessionCount` vs `MemPerc` correlation methodology PO already ran
  once (§0) is the right way to confirm/re-tune them empirically after this ships, not a priori
  static analysis. Recommend that follow-up correlation be re-run post-deploy, same as
  `FIX-MCP-MEMORY-CODE-LEAK`'s own post-deploy gate pattern.

### 2.3 `DELETE` handler (server.ts)

CORS already declares `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`
(`server.ts:418`) with no route implementing `DELETE` — this was evidently anticipated. Add,
alongside the existing `GET /sse` / `POST /messages` blocks:

```ts
if (method === "DELETE" && (pathname === "/sse" || pathname === "/messages")) {
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing sessionId query param" }));
    return;
  }
  const closed = await sessions.closeSession(sessionId);
  res.writeHead(closed ? 200 : 404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ closed, sessionId }));
  return;
}
```

**This is defense-in-depth, not the primary fix.** The `gateway` MCP server that originates the
dominant traffic class is out-of-repo (not a zone in `docs/data/system-map.json` — confirmed;
the in-repo `apps/api-gateway/` is an unrelated Go service, no `/sse` client code found there)
— this fix cannot make that caller start sending clean `DELETE`s. The reaper (§2.1) is the
mechanism that actually bounds the leak regardless of caller behavior; `DELETE` only helps the
subset of *well-behaved* clients (e.g. a future in-repo consumer, or a client implementing the
MCP session-termination convention) that choose to use it.

### 2.4 Recommended, non-blocking hardening (flagged, not required for this fix's own AC)

`mcpServer.connect(transport)` (handleSse's last line) has no `try/catch`. If it throws, the
session record is already in the map (added before the `connect()` call, matching the ORIGINAL
code's own ordering — `sessions.set()` at transport.ts:57 also precedes `mcpServer.connect()`
at :96 today, so this is a **pre-existing** gap, not something this reorder introduces) but the
transport was never actually started. Today that session would sit until the idle reaper times
it out (bounded, not a regression); before this fix it would sit forever (unbounded). Wrapping
the `connect()` call in `try { ... } catch { await this.evictSession(sessionId, "connect_failed"); throw; }`
would close this pre-existing edge case immediately rather than waiting for the idle timeout.
Cheap, adjacent, low-risk — recommend dev-mcp-server include it, but not gating the fix on it
since it is not the mechanism §0's measured leak exercised.

**Explicitly NOT adopted:** wiring `transport.onclose` as an additional eviction trigger. The
SDK already fires it from inside `transport.close()`, which `evictSession()`'s own
`mcpServer.close()` call reaches — wiring it back to `evictSession()` would be a
self-re-entrant no-op (guarded harmlessly by the `if (!record) return` idempotency check, but
adds a code path with no behavior it doesn't already have). All eviction is proactive from the
5 explicit trigger sites (`res.on("close")`, heartbeat failure, idle reap, max-age reap,
`DELETE`) — no need for a 6th reactive one.

---

## 3. DDD layer assignment / ports+adapters

No new interfaces. `SseSessionManager` remains a single interface-layer class (protocol
adapter over `@modelcontextprotocol/sdk`'s `SSEServerTransport`/`McpServer`), consistent with
its existing role. `McpServerFactory` (the `createServer` constructor param, already
dependency-injected from `server.ts`'s `createMcpServerInstance`) is the existing seam — no
change to that contract. No domain or application layer touched; no new repository/service
interface needed. This is a pure bug-fix inside an existing adapter, not a new capability.

---

## 4. Test strategy

**Extend `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`** (same mock
scaffold — `mock.module()` for `SSEServerTransport`/`McpServer`, same `afterAll(mock.restore())`
discipline already documented in that file's header). The existing `MockMcpServer.close = mock(
async () => {})` is already present but currently never asserted against — extend the mock
factory helper to expose the created instance(s) so tests can assert on it directly.

New cases (numbering continues past the existing T1-T5):
- **T6** — `res.on("close")` firing calls `mcpServer.close()` (currently **zero** coverage of
  this path's `mcpServer` interaction at all — the existing suite only covers the
  heartbeat-failure path).
- **T7** — heartbeat-write-failure path (already covered for `sessionCount`, T3/T4) additionally
  asserts `mcpServer.close()` was called — extends T3, doesn't duplicate it.
- **T8** — idle reaper: inject small `_idleTimeoutMs`/`_reaperIntervalMs` (same override pattern
  T3 already uses for `_heartbeatIntervalMs`), assert a session with no `handleMessage()` calls
  is evicted and `mcpServer.close()` called.
- **T9** (negative control, pairs with T8) — a session that receives a `handleMessage()` call
  inside the idle window is NOT evicted — proves the `lastActivityAt` bump actually resets the
  clock, not just that the field exists.
- **T10** — max-age reaper evicts a session past `_maxAgeMs` **even with recent activity** —
  proves max-age is independent of the idle clock, not a duplicate check.
- **T11** — `closeSession()` (DELETE) evicts an existing session, returns `true`; returns
  `false` for an unknown `sessionId`; calls `mcpServer.close()`.
- **T12** — double-eviction idempotency: call `evictSession` via two different trigger paths
  in sequence (e.g. simulate `res.on("close")` firing after an idle-reap already evicted) —
  `mcpServer.close()` called exactly once, no throw.
- **Regression:** T1-T5 (existing) stay green with unchanged assertions.

**Extend `apps/mcp-server/src/__tests__/081-bun-mcp-server.test.ts`** (real server, real
`fetch()`, same harness already spinning up `createBunServer()`):
- **New** — `DELETE /sse?sessionId=<real-session-id>` (open a real `GET /sse` connection first
  to obtain a live `sessionId` from the `endpoint` SSE frame, same pattern the existing `GET
  /sse` test already uses) returns 200 `{closed:true,...}`; a second `DELETE` on the same id
  returns 404 `{closed:false,...}`.
- **New** — `DELETE /sse` with no `sessionId` query param returns 400 (mirrors the existing
  `POST /messages` no-`sessionId` 400 test already in this file).

**Regression backstop:** full `bun test` (not just the two files above) — mirrors the standing
CI/verify convention (`pnpm FIRST` / `subset≠full` lessons) and this exact zone's own recent
precedent (`FIX-MCP-MEMORY-CODE-LEAK`'s `dev_implementation_note` ran the full suite 3× before
shipping a much smaller change in the same file family). `stopReaper()` should be called in
`081-bun-mcp-server.test.ts`'s `afterAll` (or wired into `BunServerInstance.close()` if that
type exposes the `SseSessionManager` — check `server.ts`'s `BunServerInstance` shape before
deciding) so the new reaper timer doesn't itself become the reason `afterAll`'s existing 3s
close-race (§1.4) starts firing more often.

---

## 5. Risk flags

- **Security:** none new. No new external input surface beyond the `DELETE` route, which reads
  only a `sessionId` query param already validated the same way `POST /messages` validates it
  today (existence check → 400; unknown-id → 404 via the same `sessions` map lookup).
- **Memory/perf:** this fix *removes* an unbounded-growth path; the reaper's own footprint is a
  single `setInterval` (already `.unref()`d) sweeping a `Map` — O(active sessions) every 60s,
  negligible next to the workload it bounds.
- **DDD violations:** none — single interface-layer file, no cross-layer reach.
- **Production footgun (flagged for PM/dev, not blocking):** `SSEServerTransport` is
  `@deprecated` upstream in SDK 1.29.0 in favor of `StreamableHTTPServerTransport` (the same
  transport the `/mcp` path already uses, `server.ts:446-458`). This fix does not migrate off
  it — that would be a materially larger change (session-model rewrite, gateway-side coordination
  outside this repo's control) out of scope for a bug-fix-sized row. Worth a separate future
  BACKLOG entry if PO wants to retire `/sse` entirely rather than keep patching it; not raised
  as a blocking objection here.
- **Scan clean:** true ✓ (no domain/application files touched, no schema change, no new
  external dependency).

---

## 6. Non-Goals (explicit)

- Not migrating `/sse` off the deprecated `SSEServerTransport` (§5).
- Not changing the `gateway` MCP server's calling behavior (out-of-repo, out of this fix's
  zone — confirmed no `/sse`-dialing client code exists under `apps/api-gateway/`, which is an
  unrelated Go proxy service).
- Not adding a graceful-shutdown (`SIGTERM`/`SIGINT`) handler to `server.ts` — `grep` confirms
  none exists today for the whole Bun HTTP server, not just this class; a real but separate gap,
  flagged here for visibility, not fixed as part of this row.

---

## Decision — routing

Single zone (`apps/mcp-server`), single-file-primary change (+ two small extensions), no new
interface, no BA spec needed — matches this row's own `zone`/`priority: critical` and the
sibling fix's already-established direct-to-dev-* convention for this size/shape of row. **PM
decomposition skipped.**

## RETURN
DONE: Technical design complete. Confirmed the mechanism source-read in the board row's own
`po_rawverify_20260807T0600Z` (bare local `mcpServer`, never closed; both existing eviction
paths incomplete, not just the reaper being absent) and additionally corroborated it against
`McpServer.close()`'s actual SDK cascade behavior (`shared/protocol.js:500-502`,
`server/sse.js`), the `perCallCounterStore.ts` header's independent "gateway dials per-call and
drops it" documentation, and the `081-bun-mcp-server.test.ts` teardown comment. Design: collapse
two `Map`s + two duplicated inline cleanup blocks into one `SessionRecord` map + one
`evictSession()` method every trigger (close/heartbeat-fail/idle/max-age/`DELETE`) calls;
idle+max-age reaper with `lastActivityAt` bumped in `handleMessage()`; new `DELETE /sse|/messages`
route as defense-in-depth (not primary — the out-of-repo gateway caller can't be forced to use
it). Full design + rationale + test plan above; also stamped concise to the board row's own
`architect_review_note`.
ZONE: apps/mcp-server/
NEXT: dev-mcp-server | implement §2 (transport.ts primary, server.ts DELETE route), extend
tests per §4, update `docs/architecture/microservice/mcp-server/infrastructure.md` per §2
(new SSE Session Manager subsection), verify full suite stays green, then correlate `/health
sessionCount` vs `MemPerc` post-deploy (same methodology PO already ran once, §2.2) to confirm
the reaper actually closes the gap before closing this row.
PIPELINE: continue
