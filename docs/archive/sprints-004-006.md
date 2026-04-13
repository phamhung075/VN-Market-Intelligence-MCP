# Archive — Sprints 004–006 (Foundation)

Historical foundation sprints. Task detail sheets preserved for reference.

---

## Sprint 004 — DONE (historical)

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 021 | RSS base fetcher + CafeF news | infra | Done |
| 082 | Watchlist MCP tools (add/remove/get/update) | interface | Done |
| 063 | Signal detector (price + news + report) | domain | Done |
| 064 | Multi-signal alert generator | domain | Done |
| 086 | Alert MCP tools (get_alerts, briefing, history) | interface | Done |

---

## Sprint 005 — COMPLETE (historical)

### Wave 1

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | interface | Done |

### Wave 2

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 026 | HOSE market data fetcher (VnDirect primary, CafeF fallback) | infrastructure | Done |
| 102 | News polling job (every 30 min) | interface/scheduler | Done |
| 104 | SSC nightly report check (20:00 GMT+7) | interface/scheduler | Done |

### Wave 3

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | interface/scheduler | Done |

### Wave 4

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 101 | Morning briefing job (08:00 GMT+7) | interface/scheduler | Done |

---

## Sprint 006 — COMPLETE (historical)

| # | Title | Layer | Status |
|---|-------|-------|--------|
| 027 | HNX + UPCOM market data fetcher | infrastructure | Done |
| 065 | Historical pattern matcher | application | Done |
| 084 | Market MCP tools (get_market_snapshot, get_patterns) | interface | Done |
