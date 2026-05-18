# Global Server Context Capture

**Captured:** 2026-05-18 (Europe / GMT+2 — Vietnam GMT+7)
**Repo:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP`
**Branch:** `main` (NO branches policy — all work on main)
**Capture purpose:** Snapshot of project state before user discussion. Read-only inventory.

---

## 1. WHAT THIS PROJECT IS

**VN Market Intelligence MCP** — real-time Vietnamese stock market intelligence platform.

- User: Investor living in France (GMT+1/+2), tracking VN market (GMT+7).
- Stack: TypeScript / Bun monorepo + Go (1.22) + Python — 11 Docker microservices.
- Interface: MCP protocol (Model Context Protocol), Telegram channels, Claude Desktop.
- AI: Two autonomous agent teams (Analysis / Cowork + Dev Team / CLI cron).

**Architecture in one picture:**
```
USER (France)
  ├── Reads MARKET Telegram channel (alerts, digests, EOD)
  ├── Asks via Claude Desktop → MCP server (vn-market, localhost:3000/sse)
  ├── ANALYSIS TEAM (9 Cowork agents — cloud, scheduled)
  │     → publishes to MARKET, reports bugs to BUG
  └── DEV TEAM (Claude Code CLI — local cron, hourly)
        → reads BUG, auto-fixes, pushes to main, posts to WORK
```

---

## 2. INFRASTRUCTURE — LIVE STATE

### Docker (12 containers — all healthy as of capture)
| Container | Status |
|---|---|
| mcp-server (port 3000) | Up 6h ✓ healthy |
| technical-analysis (5003) | Up 21h ✓ |
| macro-indicators (5004) | Up 22h ✓ |
| news-fetch (5008) | Up 22h ✓ |
| stock-price (5010 ext / 5000 int) | Up 23h ✓ |
| api-gateway (4000) | Up 23h ✓ |
| mcp-gateway | Up 28h ✓ |
| flaresolverr | Up 30h ✓ |
| kinh-dich-service (5005) | Up 30h ✓ |
| rag-service (5002) | Up 30h ✓ |
| alert-engine (5006) | Up 30h ✓ |
| pdf-extractor (5001) | Up 30h ✓ |

### External infrastructure
- **VPS:** Vinahost Vietnam — 125.212.251.27:8765
  - 7 proxy routes for geo-blocked VN sources (SSC iboard, BCTC, foreign-flow, SBV, news, muasamcong, BCTC push).
  - Auth: `X-API-Key` header.
- **Databases (6):** SQLite × 5 + LanceDB × 1, all in shared Docker volume `market_data`.
  - `market.db`, `stock_price.db`, `alert_engine.db`, `pdf_extractor.db`, `rag_service.db`, `lancedb/`.

### Telegram channels (3 — hard-routed, never mix)
- **MARKET** (`TELEGRAM_MARKET_CHAT_ID`) — user-facing only: alerts, digests, EOD. Senders: alert-commander, digest-predict, market-watcher.
- **WORK** (`TELEGRAM_WORK_CHAT_ID`) — agent cycle status, heartbeats. All senders.
- **BUG** (`TELEGRAM_BUG_CHAT_ID`) — errors. Check `get_recent_fixes(limit=20)` before sending; skip duplicates.

---

## 3. STATS (SSOT: `docs/data/project-stats.json`)

| Metric | Value |
|---|---|
| MCP tool count | **142** |
| Scheduler file count | 64 |
| Cron job count | **76** |
| Knowledge files | 25 |
| Dev agents | 17 |
| Analysis (cowork) agents | 9 |
| Microservice zones | 9 |
| Total tasks done (lifetime) | 561 |
| Test baseline (pass / fail) | 9277 / 34 |
| Last successful cycle | 2026-05-18T07:22Z |
| MCP endpoint health | healthy ✓ |

---

## 4. AGENT FLEET (40 agent definitions in `.claude/agents/`)

### Dev-core (8)
`po`, `pm`, `ba`, `architect`, `developer`, `fixer`, `qa`, `agent-father`,
`agents-architect`, `code-janitor`, `cowork-refactory-expert`, `idea-forge`,
`system-auditor`, `claude-manager-helper`, `tran-ngoc-bau`, `semble-search`.

### Dev-zone specialists (11)
One per microservice + mainserver-crawls + vps-crawls:
`dev-mcp-server`, `dev-api-gateway`, `dev-stock-price`, `dev-technical-analysis`,
`dev-macro-indicators`, `dev-kinh-dich`, `dev-alert-engine`, `dev-pdf-extractor`,
`dev-rag-service`, `dev-frontend`, `dev-mainserver-crawls`, `dev-vps-crawls`.

### Cowork / Analysis (9)
`alert-commander`, `digest-predict`, `financial-analyst`, `market-analyst`,
`market-watcher`, `news-scout`, `qa-responder`, `report-analyzer`, `unified-agent`.

### Ops (3)
`ops`, `ops-mainserver-fetch`, `ops-vps-fetch`.

---

## 5. CURRENT SPRINT STATE — Sprint 1948 (QUEUED, GATE-BLOCKED)

**Theme:** Closed-loop auto-improvement Phase 1 — shadow-mode detect + WORK Telegram + `improve_check_log` writes (no auto-dispatch).

**Status:** All 4 tasks BLOCKED until `post-1945-verdict-resolution-scored-pct` gate clears **2026-05-20T07:22Z**.

### Tasks queued
| ID | Size | Zone | Title |
|---|---|---|---|
| 1948a | S | apps/mcp-server | `improve_check_log` schema + `improveCheckStore.ts` |
| 1948b | S | apps/mcp-server | `degradationRules.ts` domain (pure) |
| 1948c | M | apps/mcp-server | `selfImproveOrchestratorJob.ts` scheduler entry |
| OBSERVE-1948d | — | ops | 7-day shadow-mode verification |

### Detection logic (SPIKE-1947 design, committed `b55ea5c8`)
- 7d vs 30d `accuracy_rate` delta ≥ 10pp **OR** baseline < 40% with ≥ 10 samples per signal_type.
- Hypothesis: rule-table `degradationRules.ts` (Phase 1-2); LLM agent optional Phase 3.
- Safety: cooldown 7d/signal_type, WIP ≤ 2, kill-switch env var, freeze-on-worsening.

### Previous sprint
- **Sprint 1947 — DONE** 2026-05-18T09:09Z. SPIKE-1947 architect-committed. Closed-loop auto-improvement DESIGN delivered (Phase 1-2-3 rollout plan).

---

## 6. ACTIVE OBSERVE GATES (6)

| Gate | Date | What it watches |
|---|---|---|
| post-1944-financial-reports-q1-2026 | 2026-05-18T12:00Z (today) | Q1 BCTC ingestion |
| post-1942-fa-verify | 2026-05-19 ~23Z | FA reports ≥ 20/30 BCTC analyses |
| **post-1945-verdict-resolution-scored-pct** | **2026-05-20T07:22Z** | scored_pct ≥ 60% + unknowns_30d drop ≥ 100 — **PHASE-1 GATE for Sprint 1948** |
| post-1945-bug-storm-silence | 2026-05-20T07:22Z | Zero new `[bug] verdictResolutionJob` 48h |
| 1941b-signal-outcomes-seed-window | 2026-05-25 | ≥30 resolved rows across ≥3 signal types |
| 1922g-pharma-events-source-verify | 2026-06-01 | `pharma_events` row count after `davPharmacyJob` tick |

---

## 7. KNOWN BLOCKERS (USER-ACTION required)

1. **1907a-digest-predict-silence (CRITICAL)** — `vn-market` MCP added to `claude_desktop_config.json`. **User must restart Claude Desktop** so scheduled cowork tasks pick up vn-market MCP access. Digest-predict silent ~8d.
2. **1897b-carry (URGENT-F1)** — Docker `.git/` exclusion for VirtioFS structural fix. Drives recurring headlock incidents. Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`.

---

## 8. RECENT SIGNAL TRAFFIC

### Live signal in `docs/signals/`
- `tnb-2026-05-18T20:00:00Z.json` — to PO. Type: audit-handoff.
  - Summary: TNB c71 audit — **Overall: NEEDS_ATTENTION** (BCTC FAIL, Docker?, digest 7d silence).
  - Payload: `docs/handoffs/tnb-audit-latest.md`.

### Signal dashboard (`docs/signals/DASHBOARD.md`)
- 1 NEW row to PO (the TNB handoff above).
- All other agent inboxes empty.

### Cycle pulse (last commits)
Heavy notebook-commit traffic, no code commits since `159b0888 fix(1945/bctc): reparse pipeline gap`. Pipeline is idle by design (gate-block).

---

## 9. ARCHITECTURE / DESIGN INVARIANTS

### Modular monolith (Sprints 209-220 COMPLETE 2026-04-20)
- 10-module subfolder structure, schema decomposed into 8 slices.
- Barrel `index.ts` per module. ~57% agent token reduction. 5,922 tests passing baseline.

### Microservices migration (COMPLETE 2026-04-25)
- 9-service Docker architecture deployed and operational.
- Old launchctl server decommissioned. Restart via `docker-compose` only.
- All 112+ tools working identically (now 142).

### DDD pattern enforcement
- Layers: `domain/`, `application/`, `infrastructure/`, `interface/`.
- Testing tiers: unit (mocked) → integration (real deps in Docker) → e2e (full stack).
- Ports pattern (dependency injection).

### Zone enforcement (2026-05-12 refactor across ~66 files)
- Closed-loop zone routing — each microservice has a `dev-<zone>` specialist.
- 120-line split policy. Brief: `docs/architecture-briefs/2026-05-12-dev-zone-enforcement-and-split-policy.md`.

### Two-team architecture
- Analysis (cowork) + Dev (CLI cron). Auto-fix loop. 3 Telegram destinations.

### Alert split
- Server = speed (stop-loss instant).
- Commander = intelligence (verified chains, multi-source).

### Token economy
- 3-tier compression: ULTRA (~75% reduction default) / FULL / LITE.
- Skill: `.claude/skills/token-economy/SKILL.md`.

### Communication mode defaults
- **Caveman + token-economy** for all in-session comms.
- Commits: `docs/policies/commit-convention.md`.
- NO branches — all work on `main`.

---

## 10. SSOT POINTERS (don't hardcode — query these)

| Domain | SSOT |
|---|---|
| Services / agents / zones / channels / sources / watchlist | `docs/data/system-map.json` |
| Tool / cron / test / sprint counts | `docs/data/project-stats.json` |
| Stock classification + tickers | `docs/data/stock-classification.json` |
| Alert thresholds | `mcp.config.json → alertPolicy` |
| Knowledge DAG | `docs/references/tree-map.md` |
| Agent intent routing | `.claude/skills/dispatch/SKILL.md` |
| Pipeline status | `docs/pipeline-state.json` |
| Signal bus | `docs/signals/` + `docs/signals/DASHBOARD.md` |

---

## 11. WATCHLIST (30 active tickers, 10 sectors)

Banking: VCB, BID, SHB, EIB · Real estate: VHM, VIC, KBC, HUT, DIG, DXG, KDH, PDR, NVL, VRE
Tech/IT: FPT · Steel: HPG · F&B/Retail: MSN, FRT, KDC, SAB · Agri: VNM, DPM, DBC
Securities: SSI, VIX, VND, VCI · Chemicals: DGC · Aviation: VJC · Utilities: GEX
Oil & Gas: BSR, PLX · Industrial: DAG

(Inactive: VEA — removed sprint-054.)

---

## 12. CURRENT MAIN-TERMINAL ROLE

Per `CLAUDE.md` — main terminal = **router only**. Never implement directly. Always delegate.

**Before spawning any agent (mandatory):**
1. Read `.claude/skills/dispatch/SKILL.md` dispatch table.
2. Match intent → correct agent type.
3. Spawn that agent with `run .claude/flows/<agent>/main.md`.

**Never** guess agent type. **Never** spawn `general-purpose`/`claude` for dev intents. **Never** run a flow file directly — spawn the agent to run it.

When unsure → spawn `po` (knows what to do next).

---

## 13. WHAT'S MOST RELEVANT RIGHT NOW

1. **Sprint 1948 is gate-blocked until 2026-05-20T07:22Z** — no dev dispatch valid before that.
2. **TNB c71 audit is sitting in PO's signal queue** (`docs/signals/tnb-2026-05-18T20:00:00Z.json`) — Overall verdict NEEDS_ATTENTION, three findings (BCTC FAIL, Docker?, 7d digest silence).
3. **Digest-predict has been silent ~8d** because Claude Desktop has not been restarted after MCP config update (1907a — USER-ACTION).
4. **Headlock incidents recurring** because Docker `.git/` is not excluded from VirtioFS (1897b — USER-ACTION).
5. **All Docker services healthy.** No infrastructure fire right now.

---

**End of capture. Ready for user direction.**
