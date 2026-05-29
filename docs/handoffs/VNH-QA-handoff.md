---
sprint: VNH-SECTOR-FIX
task_id: VNH-QA
title: QA Gate — VNH sector fix acceptance
zone: apps/mcp-server/src/infrastructure/db/seedWatchlist.ts + live market.db
size: S
priority: HIGH
owner: qa
depends_on: ["VNH-IMPL", "VNH-DEPLOY"]
blocks: ["VNH-EXIT"]
executed_at: 2026-05-29T17:30Z
verdict: APPROVED
---

## [QA] Review Record — VNH-SECTOR-FIX

### Check 1 — Unit Tests (3 files)

```
bun test VNH-sector-fix.test.ts 1787-gvr-sector-fix.test.ts 1343a-watchlist-restore.test.ts
```

Result: 24 pass / 0 fail (367 expect() calls, 52ms)
Files: VNH-sector-fix, 1787-gvr-sector-fix, 1343a-watchlist-restore
Status: GREEN

Note: DGC failure (1031) pre-existing / unrelated — not in scope, not counted.

### Check 2 — TypeScript

```
bun tsc --noEmit
```

Result: exit 0, 0 errors
Status: GREEN

### Check 3 — Anti-False-Green Proof

Injected `domain: "bogus_sector"` at seedWatchlist.ts:87 (VNH entry).

tsc output:
```
src/infrastructure/db/seedWatchlist.ts(87,37): error TS2322: Type '"bogus_sector"' is not assignable to type 'DomainType'.
error: "tsc" exited with code 2
```

Type guard is LIVE — bogus domain values are rejected at compile time.

Revert: `git checkout apps/mcp-server/src/infrastructure/db/seedWatchlist.ts`
Post-revert git status: clean (rien à valider, la copie de travail est propre)
Status: GUARD PROVEN — NOT a false-green

### Check 4 — Live Bootstrap (get_cycle_bootstrap agent=news-scout)

Called via SSE MCP protocol to localhost:4004 (vn-market server, 146 tools, healthy).

Relevant line in market_context output:
```
VNH    [HNX] agriculture    800 (-11.11%)  (as of 2026-05-29 08:59)
```

VNH is under `agriculture` — NOT `real_estate`.
Status: PASS — live DB row confirmed correct post-deploy

### Summary

| Check | Result |
|---|---|
| Unit tests (3 files, 24 cases) | GREEN |
| tsc --noEmit | 0 errors |
| Anti-false-green (bogus_sector injection) | GUARD LIVE |
| Live bootstrap VNH sector | agriculture (PASS) |

Verdict: APPROVED

Done bar met:
- seed corrected (seedWatchlist.ts:87 domain="agriculture")
- market.db row corrected in running container (confirmed by live bootstrap)
- mcp-server rebuilt (ops-verified, healthy, 146 tools)
- get_cycle_bootstrap(news-scout) shows VNH [HNX] agriculture
