# mcp-server Memory Sawtooth — Phase-0 Recon

**Task:** FIX-MCP-MEMORY-CODE-LEAK | SPRINT-M (BACKLOG→ready, promoted 2026-07-02T17:57Z) | zone: `apps/mcp-server/`
**BUILD-STANDARD:** not-applicable (bug-fix/perf investigation, in-zone, no new primitives)
**Author:** architect | **Date:** 2026-07-02T18:17Z
**Scope:** Phase-0 recon ONLY. No container swap/restart/exec executed (all user-gated per hard constraint). No code changed.

---

## PO Diagnosis (authoritative, taken as given)

Rapid sawtooth slamming a tight 2GB cap — not a slow monotonic leak. 60%→99.67% in ~1h,
GC reclaims ~800MiB without restart, back to cap in ~26min. Recurring A-30 escalation
(06-19, 06-20 CRITICAL 99.99%, 07-02). Plausible root of `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN`
(49% unclean restarts — RestartCount=3 corroborated live, OOMKilled=false for the current
uptime window but ragged-edge-of-cap OOM-kill risk is real given (c) below).

---

## (a) Is the running image == HEAD build?

**NO — running image is 6 commits stale, but this does NOT explain the memory pattern.**

RAW evidence:
```
docker inspect vn-market-intelligence-mcp-mcp-server-1 --format 'Image={{.Image}} Created={{.Created}}'
→ Image=sha256:33fea3ba... Created=2026-07-01T22:27:13Z   (container StartedAt=2026-07-02T10:15:34Z)

git log --format='%H %cI %s' -- apps/mcp-server/   (commits AFTER 2026-07-01T22:27:13Z)
→ a1689b0e 2026-07-02T08:49:45Z  fix(mcp-server/test): cronStatusHandler zero-arg default
→ 126a94d2 2026-07-02T08:34:15Z  fix(mcp-server/cron-status): compose volume mount + regression test
→ 85267b62 2026-07-02T08:09:05Z  feat(mcp-server/DASH-CRON-RECHECK-TABLE): cron-status backend
→ 2c7fb5b0 2026-07-02T04:34:07Z  fix(mcp-server/bctc): B02a/TCTDHN bank-form classifier
→ d9280133 2026-07-02T00:11:09Z  fix(mcp-server/bctc): enricher last_attempt stamping
```
(f9e6f40 touched orch schema only, not mcp-server runtime code.)

**Cross-checked the diff of each of these 6 commits against the memory-relevant surface**
(`schema.ts`, `server.ts`, any `schema-*.ts` DB-init file): **zero overlap**. The only
`server.ts` touch (85267b62) added a 4-line route registration for `GET /api/cron-status` —
unrelated to the per-request `McpServer`/DB-init path (see (c)). None of the 6 commits are
memory fixes.

**Conclusion:** rebuild-to-HEAD is owed for hygiene (6 commits of BCTC/cron-status fixes
sitting undeployed) but per-repo precedent
([[feedback_mcp_server_stale_image_mem_leak_rebuild_fixes]]: 2026-06-26 rebuild reset memory
but a genuine code-level creep resumed at the same slope within 3.5h) plus the code-verified
(c) finding below — **a fresh-from-HEAD rebuild is very likely to still slam whatever cap
it's given.** Do not treat the rebuild as the fix; treat it as owed hygiene, done independently.

---

## (b) Is the 2GB cap simply too tight for the working set?

**Cap is tight; there is ample host headroom to widen it.**

RAW evidence:
```
docker info --format 'MemTotal={{.MemTotal}}'  →  8325066752 bytes (7.75 GiB Docker VM budget)
docker stats --no-stream (all 13 running containers, summed)  →  ~3.38 GiB used (43.6%)
                                                                   →  4.37 GiB free
docker stats --no-stream mcp-server (2 samples, 30s apart)  →  99.44% → 99.98% of 2GiB (LIVE, mid-recon)
```
mcp-server is already the single largest consumer in the fleet (next is rag-service at
97.49%/768MiB — also tight, but out of this task's zone). Every other service (10 of 13)
sits under 20% of its own cap. Configured `deploy.resources.limits.memory` across the
compose fleet sums to 11.25GiB (`docker compose config`) but that is nominal ceiling, not
reserved — actual live usage is 3.38GiB. **Bumping mcp-server from 2GiB→3GiB leaves 3.37GiB
free even under a hypothetical simultaneous full-fleet peak.**

**Recommended cap: 3GiB** (was 2GiB). Rationale: current sawtooth amplitude is ~800MiB–1GiB
per cycle around a ~1.2GiB floor; a 3GiB ceiling gives the working set room to breathe
without GC being forced to fight the wall every cycle (explains part of the observed 108%
CPU — GC running hard right at the boundary), while still leaving a 2x safety margin below
the 7.75GiB host budget. Do NOT jump straight to 4GiB+ — over-provisioning the cap on an
architecturally unbounded per-request re-init pattern (see (c)) just delays the same wall.

**File + exact line to change** (both prod and dev compose carry an independent `2g`):
- `docker-compose.yml:71` — `memory: 2g` under `mcp-server: → deploy.resources.limits` (prod, currently running)
- `docker-compose.dev.yml:34` — `memory: 2g` under the dev-override `mcp-server:` block (keep parity)

---

## (c) Would a fresh-from-HEAD image at an adequate cap still slam the cap?

**Yes — found the concrete allocation hotspot via source read, not guesswork. Design below; NOT implemented this pass (hard constraint).**

### The finding

Live `docker logs --since 2m` during this recon (mid-session, ordinary agent load) showed,
every few seconds:
```
[SseSessionManager] New SSE connection           (7x / 2min)
Sequential Market Analysis tool registered        (21x / 2min — 3 back-to-back within 100ms at times)
[backfillOCFForWatchlist] updated operating_cash_flow for 31 tickers (watchlist sweep)  (8x / 2min)
```
Traced both to source:

1. **`createMcpServerInstance()`** (`apps/mcp-server/src/interface/mcp/server.ts:334-374`) is
   called **fresh for every single `/mcp` POST request** (`server.ts:481`, inside
   `handleRequest`) — a `new McpServer(...)` plus `fns.forEach((fn) => fn(server))` re-registers
   the **entire ~146-tool registry** (or skills subset) from scratch on every request. This is
   an intentional, documented tradeoff (`FIX-MCP-500-SYMBOL-TO-STRING` comment: avoids a
   Bun-JIT Symbol-to-string corruption bug in the stateful/hono-bridged transport) — not a
   mistake, but it is expensive and stacks with #2.

2. **`initDatabase()`** (`apps/mcp-server/src/infrastructure/db/schema.ts:148`) has **no
   already-initialized guard** — unlike its own sibling `getDb()` four lines above it, which
   does have one (`if (_db) return _db;`). `initDatabase()` unconditionally re-runs, on every
   call: 10 domain-slice DDL inits (`initMarketDataTables`, `initFinancialReportsTables`, …
   — ~3300 lines of `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` across
   `schema-*.ts`), `backfillOCFForWatchlist` (reads `stock-classification.json` off disk +
   bulk `UPDATE`), `seedWatchlist`, `backfillBctcQ4`, `backfillBctcQ1_2026`,
   `backfillBctcHistorical` (bulk `INSERT OR IGNORE` across the 30-ticker watchlist × 8
   quarters), plus a `PRAGMA table_info` + conditional `ALTER TABLE` scan
   (`migrateForeignFlowColumns`). **Confirmed 68 call-sites** of `await initDatabase()`
   inside MCP tool-handler bodies (verified `grep -c` across `apps/mcp-server/src`, excluding
   tests) — e.g. `alerts.ts:328` is literally the first executable line of `get_alerts`'s
   handler body. Every one of those 68 tool invocations re-runs the full sweep above.

Both are pre-existing in HEAD (untouched by the 6 pending commits in (a)), so a rebuild will
carry this pattern forward unchanged.

### Why this plausibly IS the sawtooth signature (not a hypothesis needing a profiler to originate — needs one to confirm magnitude)

High-frequency alloc bursts (fresh `McpServer`/tool-closure graph + hundreds of `db.exec()`
statement compiles + bulk UPSERT result sets, on every concurrent tool call from the agent
fleet) followed by GC reclaiming them matches exactly: sawtooth shape (not monotonic),
GC-recoverable (not a hard leak), and correlates with concurrent agent load (multiple
"tool registered" bursts within 100ms in the log sample = multiple simultaneous requests,
each doing this independently) — consistent with PO's "60→99.67→59% in ~1h" read.

### Profiling design (for dev-mcp-server to execute in a follow-up FIX task — NOT run this pass)

**Step 1 — cheapest, zero code change, confirms/refutes correlation before touching a profiler:**
Correlate existing `docker logs` request-rate (count of `New SSE connection` /
`tool registered` / `initDatabase`-triggering log lines per minute) against the
`docker stats` mem-trace over the same window. If mem-growth-rate tracks request-rate
(not wall-clock time), that's strong confirmation without any instrumentation.

**Step 2 — heap snapshot diff, only if Step 1 is inconclusive:**
Bun uses JavaScriptCore, not V8 — no `--inspect` V8 heap-snapshot flow. Use
`bun --inspect=0.0.0.0:<port>` to open the JSC Inspector protocol (connect via Safari Web
Inspector or `bun:jsc`'s `generateHeapSnapshot()` called from a debug-only local script) on
a **separate, non-production Bun process** (e.g. `docker-compose.dev.yml` instance, never the
live container this pass) — take one snapshot at idle, drive N synthetic sequential `/mcp`
tool calls, take a second snapshot, diff retained-size by constructor. Expect the dominant
retained-size growth to be `Statement`/prepared-statement objects (from repeated
`db.exec()`/`db.prepare()` in the DDL sweep) and the tool-registration `Map`/closure graph
from `createMcpServerInstance()`.

**Step 3 — fix candidates (ranked, cheapest first; NOT implemented this pass):**
- (i) Module-level `let _dbInitialized = false` guard around the body of `initDatabase()`,
  mirroring the existing `getDb()` singleton-guard pattern in the same file — makes the
  ~3300-line DDL/backfill sweep run exactly once per process lifetime instead of on every
  one of 68 tool calls. Lowest risk, single-file change, matches an existing in-file idiom.
- (ii) Cache/reuse the tool-registration graph across requests in
  `createMcpServerInstance()` instead of rebuilding per `/mcp` POST — bigger architectural
  change; MUST preserve the Bun-JIT Symbol-corruption workaround (i.e. keep the transport
  per-request even if the tool-registration objects are reused/cloned cheaply).

---

## Decision Matrix — cheapest sufficient remedy first

| Remedy | Cost | Fixes sawtooth? | Recommendation |
|---|---|---|---|
| **Rebuild to HEAD** (`docker compose build mcp-server` + user-gated swap) | Cheap (build already allowed; swap user-gated) | No — 6 pending commits don't touch memory-relevant code (verified (a)) | DO — owed hygiene (6 commits of fixes undeployed), but set expectation: sawtooth will very likely persist post-rebuild |
| **Cap bump 2GiB→3GiB** (`docker-compose.yml:71` + `docker-compose.dev.yml:34`) | Trivial (1-line config, host has 4.37GiB free) | Reduces OOM-kill risk / GC-at-wall pressure; does NOT address root allocation rate | DO — immediate, low-risk mitigation; pairs with rebuild in the same user-gated swap |
| **Code fix: `initDatabase()` init-guard** (Step 3(i) above) | Small (single-file, mirrors existing pattern) | Yes — removes the dominant confirmed re-init cost on 68 call-sites | Root-cause fix — scope as the FIX-MCP-MEMORY-CODE-LEAK dev task after (a)+(b) ship |
| **Code fix: per-request McpServer rebuild** (Step 3(ii) above) | Larger (must preserve Bun-JIT workaround) | Contributes but secondary to (i) | Defer to a follow-up if (i) alone doesn't close the gap — verify with Step 1/2 profiling after (i) ships |

**Cheapest-sufficient-first ordering: cap bump + rebuild now (both user-gated, both cheap) →
observe for 24-48h → if sawtooth persists (expected, per source evidence) → dev-mcp-server
ships the `initDatabase()` guard (i) → re-observe → escalate to (ii) only if still needed.**

---

## User-Gate Commands (recommend only — NOT executed this pass)

```bash
# 1. Rebuild image to HEAD (safe single-service build; does not touch running container)
docker compose build mcp-server

# 2. Edit cap (2g -> 3g) in BOTH files before the swap:
#    docker-compose.yml:71            memory: 2g  ->  memory: 3g
#    docker-compose.dev.yml:34        memory: 2g  ->  memory: 3g   (parity, dev override)

# 3. Swap (USER-GATED — never --no-deps down; single-service recreate only):
docker compose up -d --no-deps mcp-server

# 4. Post-verify RAW (per feedback_mcp_server_stale_image_mem_leak_rebuild_fixes precedent):
docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.Image}} {{.Created}}'   # new image ID
docker stats --no-stream vn-market-intelligence-mcp-mcp-server-1                             # mem dropped to low baseline
# then re-sample docker stats over the next several hours to see if the sawtooth recurs
# against the new 3GiB cap (expected per (c): yes, at a higher absolute ceiling).
```

---

## RETURN

DONE: Phase-0 recon complete — findings (a) stale-but-irrelevant image, (b) cap-too-tight
with 4.37GiB host headroom, (c) code-verified allocation hotspot (`initDatabase()` no-guard
at 68 call-sites + per-request `McpServer` rebuild) — written to
`docs/architecture-briefs/2026-07-02-mcp-mem-sawtooth-recon.md`.
ZONE: apps/mcp-server/
NEXT: pm | two tracks — (1) user-gated config-only swap (cap bump + rebuild-to-HEAD, commands
above) can ship immediately, no dev task needed; (2) decompose FIX-MCP-MEMORY-CODE-LEAK into
a dev-mcp-server task for the `initDatabase()` init-guard (Step 3(i)) once (1) ships and the
sawtooth is confirmed to persist (expected).
PIPELINE: continue
