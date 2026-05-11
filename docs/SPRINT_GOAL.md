## Sprints 1878–1881 + ARCH-1884 — ACTIVE

**Status:** Active | **Scheduled:** 2026-05-11 | **Theme:** TNB methodology infrastructure foundations

# Goal

## Vision
Stand up the missing data and tool surface that the TNB methodology layers (Cash-Flow Reality, Liquidity, Regime, Source-Tier) require, so forensic analysis sprints (1885, 1886) and the deferred Virtual Capital sprint (1887) have ground truth to compute against.

## In-Flight Sprints
- **1878** — OCF column migration (`schema-financial-reports.ts`) + vnstock cash-flow sync wiring + `compute_accruals(ticker, quarters)` MCP tool. Layer 7.
- **1879** — EFFR–IORB FRED fetcher (`apps/macro-indicators`) + `get_fed_liquidity_spread()` MCP tool. Layer 2.D.
- **1880** — `get_investment_clock_phase()` + `get_pyramid_tier(asset_class)` MCP tools (pure functions over existing macro snapshot). Layer 8.
- **1881** — Source-tier `1|2|3` tag retrofit on ~15 macro/news tool outputs. Layer 9.
- **ARCH-1884** — Architect brief: forensic-analysis host (new microservice vs extend financial-reports). Output → `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md`. Parallel to 1878.

## Queued Behind
- **1882** — VIRA scraper deploy + `get_vira_snapshot()`.
- **1883** — PMI sub-components fetcher upgrade.

## Blocked
- **1885** — Beneish M-Score + Piotroski F-Score (needs ARCH-1884 + 1878).
- **1886** — BTN detectors phase 1: Cookie Jar + Big Bath (needs ARCH-1884 + 1885).

## Deferred
- **1887** — Virtual Capital / related-party graph detector. Separate architect brief required first (see Deferred table in TASKS.md).

## Scope
IN: schema migration, FRED fetcher, 5 new MCP tools, source-tier metadata retrofit, 1 architect brief.
OUT: forensic score computation (1885), BTN detectors (1886), graph analysis (1887), any UI/Cowork agent changes, BCTC reparse work.

## Success Metric
- 1878a: `operating_cash_flow` column present in `financial_reports` schema; vnstock cash-flow sync writes verified end-to-end.
- 1878b: `compute_accruals(ticker, quarters)` returns numeric series for VCB and FPT non-null.
- 1879a/b: EFFR + IORB ingested; `get_fed_liquidity_spread()` returns spread + 30d trend.
- 1880a/b: `get_investment_clock_phase()` returns enum from {Recovery, Overheat, Stagflation, Reflation}; `get_pyramid_tier()` returns valid tier.
- 1881a: ~15 macro/news tool outputs carry `source_tier ∈ {1,2,3}`.
- ARCH-1884: brief committed at `docs/architecture-briefs/2026-05-12-forensic-analysis-host.md` with explicit host pick + rationale.

---

## Sprint 1888 — BACKLOG (renumbered from 1878 SSOT)

**Status:** Backlog | **Scheduled:** TBD post 1878–1881

# Sprint 1888 Goal

## Vision
Eliminate all SSOT conflicts across agent definitions, knowledge files, and registry data so every count and reference resolves to a single authoritative source.

## Scope
11 SSOT anomalies — hardcoded tool/agent/scheduler counts in agent definitions and flows, stale tool-registry.json, agent-roster self-contradiction, wrong session_log paths, inlined task size rules, orphaned AGENT_STARTUP.md reference, undocumented microservice agents. (Originally numbered 1878a–k; renumbered to 1888a–k when 1878 was reassigned to the methodology-infra OCF sprint on 2026-05-11.)

## Success Metric
- Zero hardcoded tool/agent/scheduler counts in agent .md or flow .md files.
- tool-registry.json toolCount matches project-stats.json (132).
- agent-roster.md analysis team count consistent.
- analysisAgentCount in project-stats.json matches agent-roster.md.
- session_log paths resolve to real filenames.
- No orphaned file references.

---

## Sprint 1862 — ACTIVE (carry)

**Status:** Active (4 carry tasks: 1862c-D/E/F/G) | **Last touched:** 2026-05-11

Stabilize data pipeline reliability (vnstock + RSS), eliminate signal noise (dedup), and correct stale system metadata. TNB audit cycles 21-22. **Carry items:** 1862c-D/E (ops-gated, Cloudflare config), 1862c-F (rebuild-gated), 1862c-G (observation-gated post D+E).

---

## Sprint 1860 — DONE

**Status:** DONE | **Closed:** 2026-05-09

BUG channel hygiene: 3 root causes making BUG channel unusable (old messages never deleted, monitoring reports accumulate forever, identical reports filed every cycle). 5 tasks: 2 FIX (recurring bugs) + 3 SPRINT-S.

---

## Sprint 1858 — DONE

**Status:** DONE | **Closed:** 2026-05-08

2 FIX: pollNews all-dark cooldown 4h->24h (1858a) + logVpsPush silent failure fixed with safeLogVpsPush wrapper (1858c).

---

## Historical

Full history: `docs/TASKS_ARCHIVE.md` (Sprints 1777–1848)

---
