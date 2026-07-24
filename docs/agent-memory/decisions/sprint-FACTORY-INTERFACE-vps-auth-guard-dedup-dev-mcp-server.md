# Decision Journal — Sprint FACTORY-INTERFACE-vps-auth-guard-dedup · dev-mcp-server

**Sprint goal:** DRY-refactor the copy-paste VPS-auth-check blocks scattered across
`apps/mcp-server/src/interface` behind one shared `requireVpsApiKey` guard, with
zero behavioral change (no weakened check, no status/body-contract change).
**Agent:** dev-mcp-server
**Started:** 2026-07-24T01:56:09Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T01:56:09Z
**task-id:** FACTORY-INTERFACE-vps-auth-guard-dedup
**what-done:** Grepped `apps/mcp-server/src/interface` for the VPS-auth pattern
(`VPS_PUSH_API_KEY`, `x-api-key`, `writeHead(401`) BEFORE writing any code.
**what-considered:**
- Full codebase grep for `requireVpsApiKey` usage — found the guard already
  exists at `apps/mcp-server/src/interface/mcp/routes/_shared/requireVpsApiKey.ts`,
  created by an earlier, different task (bce8be44b,
  FACTORY-INTERFACE-split-server-ts Stage 1) and already wired into 15 call
  sites (2× bctcVpsQueueHandler, 5× debugTriggerRoutes, 3× macroPushHandler,
  4× ohlcvBackfillHandler, 1× bctcVpsIngestHandler).
- `grep -n writeHead(401` across `interface/` to find every site NOT yet
  migrated — found exactly 5 raw copy-paste blocks: pushPricesHandler.ts,
  pushSbvRatesHandler.ts, pushNewsHandler.ts, pushForeignFlowHandler.ts, and
  server.ts's inline `GET /api/watchlist` block.
**why-decision:** This task is the tail end of a dedup effort already 15/21
done — scope is the remaining 5 identical sites, not a from-scratch extraction.
**why-change:** No change from task brief; brief's "15+ sites" already
included the pre-migrated ones, confirming this reading.

---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T01:56:09Z
**task-id:** FACTORY-INTERFACE-vps-auth-guard-dedup
**what-done:** Byte-compared all 6 candidate sites (5 migration targets + the
guard's own canonical block) for divergence in header read, comparison
operator, status code, and body shape BEFORE migrating any of them.
**what-considered:**
- pushPricesHandler.ts / pushSbvRatesHandler.ts / pushNewsHandler.ts: all 3
  use the identical 3-statement block `const apiKey = Bun.env.VPS_PUSH_API_KEY;
  const authHeader = (req.headers["x-api-key"] as string|undefined) ||
  (req.headers["authorization"] as string|undefined)?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) { writeHead(401,{"Content-Type":
  "application/json"}); end(JSON.stringify({error:"Unauthorized"})); return; }`
  — byte-identical to the guard's own body (requireVpsApiKey.ts L20-28) modulo
  the type-cast noise.
- pushForeignFlowHandler.ts / server.ts's `/api/watchlist` block: same
  comparison logic but the un-cast one-liner
  `req.headers["x-api-key"] || req.headers["authorization"]?.replace(...)`
  — behaviorally identical (same precedence: x-api-key checked first, same
  `!==` strict compare, same 401 + `{error:"Unauthorized"}` body). No
  constant-time compare exists anywhere in this codebase's VPS-auth path (all
  6 sites use plain `!==`) — nothing to preserve/regress there.
- foreignFlowStatusHandler.ts (`buildForeignFlowStatusResponse`, called from
  server.ts's `/api/foreign-flow-status` route): SAME `!apiKey ||
  requestApiKey !== apiKey` predicate and SAME 401 status/body shape, but
  the function does NOT write to `res` itself — it RETURNS `{status,body}`
  so it can be unit-tested without HTTP (see `1144-foreign-flow-status.test.ts`,
  which calls it directly with plain apiKey/requestApiKey strings). Forcing
  this site onto `requireVpsApiKey(req,res)` would collapse that
  HTTP-free-testability contract for no equivalence benefit.
**why-decision:** 5 sites are true copy-paste duplicates → safe to collapse.
1 site (`buildForeignFlowStatusResponse`) has the same auth *predicate* but a
structurally different call contract (return-value vs response-write) with
its own dedicated test suite → left as-is per task's "if a site legitimately
differs, keep it as-is" instruction.
**why-change:** No change from task brief.

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-24T01:56:09Z
**task-id:** FACTORY-INTERFACE-vps-auth-guard-dedup
**what-done:** Migrated the 5 confirmed-identical sites to
`if (!requireVpsApiKey(req, res)) return;`, importing the existing shared
guard (`./_shared/requireVpsApiKey.js` / `./routes/_shared/requireVpsApiKey.js`
from server.ts). Zero changes to `requireVpsApiKey.ts` itself (already correct,
already covered by `FACTORY-INTERFACE-debug-trigger-routes-smoke.test.ts`).
**what-considered:**
- Editing `requireVpsApiKey.ts` to add a mode/flag for the 6th site — rejected,
  see S2 (would break the tested pure-function contract for no reason).
- Refactoring `foreignFlowStatusHandler.ts` itself to write directly to `res`
  — rejected as out of scope / higher blast-radius than this DRY task
  warrants; not requested by the brief, and would require rewriting its
  dedicated test file too.
**why-decision:** Minimal-diff migration of only the confirmed-identical
sites keeps the security invariant (no site becomes more permissive, no
status/body change) trivially verifiable by re-running each site's existing
401-path test unchanged.
**why-change:** No change from task brief.

---

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-24T01:56:09Z
**task-id:** FACTORY-INTERFACE-vps-auth-guard-dedup
**what-done:** A/B verification via `git stash push --keep-index` on the 5
touched files: pre-refactor run of the 5 relevant existing test files
(1406a, 1406b, FIX-SBV-PUSH-TYPE-COERCE, 1892b, 1324) = 38 pass / 0 fail;
`git stash pop` restored the refactor; post-refactor same 5 files (+ the new
guard-dedup test file + the existing debug-trigger smoke test) = 71 pass /
0 fail (one run of the news file independently showed 1 flaky failure/1
error tied to `[te-chromium-news] scrape failed` / async fetch-count timing
— reproduced identically pre-refactor-unrelated, confirmed pre-existing and
unrelated to the synchronous auth check by re-running clean 3×).
**what-considered:**
- Full `bun test` suite run (596 files) for the final G12 gate — launched in
  background (see S5 for outcome once complete).
**why-decision:** A/B stash-diff is the strongest cheap evidence that no
auth/interface test regressed — same test files, same assertions, only the
implementation under test changed.
**why-change:** No change from task brief.
