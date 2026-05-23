# PO Notebook

**Cycle:** c282 cycle-60 (Fleet pilot-3 stock-price — charter + SSOT authored, SI-1 landed)
**Last update:** 2026-05-23T22:09:44Z
**Status:** SI-1 schema landed → pilot-3 (stock-price) chartered. Charter + status SSOT authored, charter-only (no impl). Dispatch signal emitted naming PM → dev-stock-price Phase 0. WIP=2: stock-price is ACTIVE pilot #1.

---

## This cycle (cycle-60) — pilot-3 stock-price chartered

Authored from SI-1 fleet schema + macro v2.0 template, per ratification Decision 5 step 3. All service facts via jq on `system-map.json` (NOT hardcoded): port 5000 internal / 5010 external, zone `apps/stock-price/`, specialist `dev-stock-price`, runtime `go1.22+cgo`.

1. **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` — cloned macro v2.0; 12 G-goals across 3 tracks (A Trust G1-5, B Dashboard G6-9, C AI-Fixability G10-12). Go G4 = depguard (NO SI-3 dependency). 3-panel dashboard (G6) file:// zero-network. Honest-red contract (G8). G9 Path B Playwright Day-0 default. §4.5 matrix derivation = Speed(G10+G11) / Trust(G8+G9) / Scale(all-12 + sprintCount≤6).
2. **SSOT:** `docs/data/pilot-status-stock-price.json` — instantiated from SI-1 schema. 12 goals TBD, goalsEarned=0, status ACTIVE, phase 0, language Go locked, anchor TBD, decisionMatrix present-but-empty (TBD). JSON validated (jq).
3. **Refactor targets (charter §Refactor Targets; dev confirms Phase 0):** primitives = price-quote-normalizer, tier-fallback-selector, ohlcv-aggregator, price-staleness-classifier, exchange-code-router (3-5, stdlib Fence-A). Module = `pkg/module/price_resolution/` (Fence-B, injected TierFetcher port). Infra (Fence-C, cmd/server/main.go only) = Tier1/2/3 fetchers + CGO SQLite repo.
4. **L-CGO (NEW lesson, stock-price-specific):** `mattn/go-sqlite3` (CGO) MUST NOT leak into primitive/module/sandbox. Sandbox builds & runs under `CGO_ENABLED=0`. Flagged R-CGO as Phase-0 binding gate (analog macro R-1 / alert-engine Telegram-creds).
5. **Signal emitted:** `docs/signals/po-pilot3-stock-price-chartered-20260523T220944Z.json` → next dispatch PM → dev-stock-price Phase 0.

---

## Carry-over (next cycle)

- **NEXT:** main router spawns `pm` (`.claude/flows/pm/main.md`) → opens stock-price Phase 0; pm forwards to architect/system-auditor (brownfield + R-CGO confirm), agent-father (dev-stock-price flow G12 DoD + fences), bug-inventory entry, phase-1 task plan. Exit gate = 6 deliverables + architect verification signal.
- **WIP=2:** stock-price ACTIVE #1. kinh-dich (pilot 4) opens ONLY after SI-3 lands AND stock-price clears Phase 0. Do NOT author kinh-dich charter yet.
- **Deferred triggers:** SI-2 (fleet dashboard index `docs/dashboards/index.html`) — owner = dev-stock-price at G6 (first fleet pilot to hit G6; ratification Decision 3 corrected owner from kinh-dich to stock-price). SI-5 (dev-news-fetch) pre-pilot-6. SI-4 (Python fence) pre-pilot-7.
- **PO self-dispatch (after SI-3):** author kinh-dich charter transcribing SI-3 G4 AC verbatim.
- **Do NOT touch:** frozen `pilot-status.json` (TA), closed `pilot-status-macro-indicators.json`, DORMANT `apps/technical-analysis/**` + `apps/macro-indicators/**`, `apps/stock-price/**` source (charter-only this cycle).
