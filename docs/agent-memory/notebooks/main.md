# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-17T00:45Z (c147 — 1927a PMI fix + gateway DNS signals)

## c147 (2026-05-17T00:07Z → 2026-05-17T00:45Z, ~38min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | HEAD.lock (753s, 0B, no pid) | Removed |
| 0a drain-signals | 3 signals: alert-commander/news-scout/report-analyzer — all gateway DNS fail | Processed → routed-to-po |
| 1 PO triage | No new Telegram reports. Signals = 1 root cause (1928a) | 1927a shipped + 1928a created |
| 1927a | PMI always null: (1) idleTimeout 10s kills /macro/external (2) no PMI extraction | Fixed both |
| Tests | 8/8 GREEN (1924a+PMI), tsc 0 errors | PASS |
| Docker | Builds running in background (stalled by Docker DNS deadlock) | Pending |
| 1928a | F1 USER: Docker Desktop restart + add extra_hosts to mcp-gateway | Created Todo |

### c147 key state

| Item | State |
|------|-------|
| 1927a manufacturing PMI fix | ✅ Committed `8d4716b7` — idleTimeout 120s + parsePmiFromText |
| Docker builds (macro-indicators + mcp-server) | ⚠️ Pending — Docker CLI hung (DNS deadlock) |
| mcp-gateway DNS (host.docker.internal) | 🔴 FAIL — virtiofs socket deadlock, F1 USER needed |
| Cowork agents (alert-commander, news-scout, report-analyzer) | 🔴 Blocked since 00:02 UTC |
| bond_maturity | ⚠️ Still 0 — cron fires 02:30 UTC (~1.75h from now) |
| alert_engine_records | ⚠️ Still 0 — observation cycle 3/5 |
| agent_signals | 53 (growing) |
| LanceDB | Regenerating via news cycles |
| Fleet | 11/11 healthy (local), mcp-gateway DNS broken |

### 1927a root cause (c147)

Two issues compounded:
1. `Bun.serve` default `idleTimeout=10s` killed `/macro/external` HTTP response at 10s while TE scraper runs for 65s → mcp-server saw "Remote end closed connection" → `extData` null → PMI never received. Fix: `idleTimeout: 120` in `apps/macro-indicators/src/index.ts`.
2. `macroIndicatorRefreshJob.ts` only extracted CPI from external response via `parseCpiFromExternal`. No equivalent for PMI. Fix: added `parsePmiFromText()` + `parsePmiFromExternal()`, wired into upsert.

### 1928a: mcp-gateway DNS recurring deadlock

Pattern: `host.docker.internal` DNS in mcp-gateway fails every 3-5h → all cowork agents blocked.
Root cause: Docker Desktop virtiofs socket forwarding deadlock (filesystem-event.sock context deadline exceeded).
Previous fixes: `pkill -9 Docker` + `open -a Docker` at c132 (02:21 UTC) and 05:48 UTC.
Current state: deadlocked again at 00:02 UTC (c147 start).
Structural fix needed: add `extra_hosts: host-gateway` to mcp-gateway container to bypass DNS entirely.
Requires: (1) Docker Desktop restart (F1 USER), (2) inspect mcp-gateway launch config, (3) add extra_hosts.

### c148 carry-forward

1. **1928a**: F1 USER Docker Desktop restart → find mcp-gateway compose/run config → add extra_hosts
2. **1927a Docker rebuild**: After Docker restart, `docker-compose up -d --build macro-indicators mcp-server`
3. **1922f-bond-maturity**: Cron fires 02:30 UTC. Verify ≥1 row after tick.
4. **1922i-alert-engine-records**: Cycle 3/5 observation.
5. **LanceDB**: Monitor growth of rag_entries.
