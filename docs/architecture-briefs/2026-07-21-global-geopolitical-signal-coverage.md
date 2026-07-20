# GLOBAL / GEOPOLITICAL SIGNAL COVERAGE — CLOSING THE WAR/TRADE-WAR BLIND SPOT

**Date:** 2026-07-21
**Author:** agents-architect
**Status:** DESIGN COMPLETE — LANE A ready for immediate agent-father implementation; LANE B/C are PO backlog
**Slug:** global-geopolitical-signal-coverage
**Trigger:** market-analyst evidence-backed gap diagnosis, routed via router (session `c106f5a6-d54c-447e-8fa1-753d0ba94f3c`). Symptom: 2026-07-20 broad war/trade-war-driven VN selloff (44 up / 263 down, tickers -4% to -9.87%); zero cowork agent output cited the global/geopolitical cause.

---

## 0. Executive Summary

Root cause is **(b) — schema/flow gap, not missing data**: no signal category, tool field, or flow step anywhere in the 4 affected agents (news-scout, market-watcher, unified-agent CHEF, alert-commander) models "war / geopolitical conflict" as a first-class event. The proxies that exist (DXY, US10Y, Brent, Gold in `get_macro_snapshot`) only capture *derivative* FX/rate/commodity effects — never the causal event. One enum value (`event_type: "trade_war"`) already exists server-side and is fully accepted by the live Zod schema, but no flow document ever instructs news-scout *when* to use it — so it has sat unused.

This brief splits the fix into three lanes and, critically, **found that LANE A can ship a functionally complete (if lower-precision) pipeline today with zero code dependency**, by having news-scout self-classify war/geopolitical stories into the *already-live* `trade_war` enum value instead of waiting for a new one. LANE B (new `geopolitical_conflict` enum + domain tag + US-equity-index tool) is a precision/completeness upgrade, not a blocker.

A second, non-obvious finding corrects the shape of R4 (alert-commander's no-ticker carve-out): the field alert-commander's existing notes call "affected_stocks" is **never actually surfaced** to alert-commander in its current tool-call path (`get_agent_signals` returns a human-text summary that echoes only the top-level `stock_code` argument — `finding_data.affected_stocks` is schema-required non-empty, `min(1)`, and is silently discarded by `formatSignalLines`). The carve-out must key off the **top-level `stock_code` being omitted**, not `affected_stocks` being empty (which per schema can never happen). See §2, item A3, for the full correction — this changes the literal condition text agent-father must implement.

---

## 1. Prior-Art Check (mandatory, run before minting)

```bash
grep -ril "geopolitical\|trade.war\|global.conflict\|war.signal" docs/architecture-briefs/ docs/handoffs/ docs/improvement-proposals/
# → 4 hits, all incidental substring matches unrelated to this topic
#   (2026-06-08-ci-bun-test-mass-failure.md, TASK_1805b-{1,3,4}.md — "global" as a generic word, no geopolitical-signal content)
jq -r '.task_board.backlog[]?.id' docs/data/orch/orch-state.json | grep -i "geopolit\|war\|global"
# → ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD, FIX-GAP-STALENESS-DETECTOR-CALENDAR-AWARE — unrelated (generic "global" substring)
ls docs/policies/ | grep -i source   # → no file (confirms R9's premise)
```

**Verdict: FRESH.** No existing brief, backlog row, or policy doc covers this. No fold-vs-fresh conflict.

---

## 2. LANE A — Doc-Layer (agent-father implements NOW, zero code dependency)

All six items below are **fail-soft**: they reference `event_type` values (`trade_war` already live; `geopolitical_conflict` pending LANE B) and new fields that either already validate against the live Zod schema or degrade to an explicit gap token. No item in this lane requires LANE B to land first to be safely merged — but item A1's *real-world value* depends on LANE C (R8) confirming the Reuters ingestion path is actually live (see §4).

### A1 — news-scout: dedicated international news slice (closes R1)

**File:** `docs/agents/news-scout/flow/stage-fetch.md`
**Section:** "**1. Fetch news**" (current lines 5-11, file is 25L total)

**Correction to task framing:** `sources` and `limit` are **already live parameters** on `fetch_and_analyze` (confirmed in `docs/agents/tools/list/fetch_and_analyze.md` and `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts:141-144`, `z.array(z.enum(["cafef","vnexpress","reuters","vneconomy"])).default([...])`). **Zero code change needed** — this is 100% LANE A, not "if fetch-param-change-needed" as hedged in the task brief.

**Design refinement over the raw "add a second call" framing:** rather than adding a second call that still lets Reuters compete inside the shared 20-item pool of call 1 (and risks re-fetching duplicate items, silently `INSERT OR IGNORE`'d but still costing a 15s fetch + context tokens), **remove `reuters` from the first call's source list** and give it a dedicated call. This means cafef/vnexpress/vneconomy also gain effective slots (no longer sharing with reuters), not just Reuters gaining a floor.

**Edit spec (replace lines 5-11):**
```diff
 **1. Fetch news**

-call_tool(server="vn-market", tool="fetch_and_analyze", arguments={})
+call_tool(server="vn-market", tool="fetch_and_analyze", arguments={"sources": ["cafef", "vnexpress", "vneconomy"], "limit": 20})

 Returns: `fetched_articles[]`, `impact_by_ticker`, `alerts[]`
 Filter duplicates → extract title/source/published_date/content.
+
+**1a. Fetch news — dedicated international slice (NEW)**
+
+```
+call_tool(server="vn-market", tool="fetch_and_analyze", arguments={"sources": ["reuters"], "limit": 10})
+```
+
+Rationale: Reuters previously competed for a slice of the shared 20-item domestic-weighted pool and was diluted to ~0 effective items across 12 sampled cycles (2026-07-18→07-20, the drop window). A dedicated call guarantees up to 10 international items per cycle, independent of domestic volume — at zero cost to the domestic pool (cafef/vnexpress/vneconomy keep the full 20-item budget, no longer sharing with reuters).
+Non-fatal: if this call errors or returns empty (network/feed unavailable — see LANE C R8), log and continue. Do not block Stage 1 on it.
+Merge `fetched_articles[]` from both calls before Stage 2 (sentiment). Cross-call duplicates are already handled server-side (`INSERT OR IGNORE` on `source_url + published_at`).
```

No renumbering needed downstream — the existing "1b. Historical context" section stays `1b.` (sits after `1a.`, before `2.`).

**DoD:** next 3 live news-scout cycles show a non-empty `1a.` call in the tool-call log, regardless of domestic item count.

---

### A2 — news-scout: Geopolitical/War Signal Dispatch block (closes R3 doc-part)

**File:** `docs/agents/news-scout/flow/stage-signals.md`
**Section:** insert as a new block, positioned after the existing "T-41 / Fake-FDI detector" block ends (current line 138) and before the `---` separator at line 140, mirroring the structure of "Legal Risk Signal Dispatch" (lines 54-121). File is currently 200L with a stale size-justification comment (`154L`, line 1) — **agent-father must bump this comment** to reflect the new total (~200L + ~35L new block ≈ 235L; the existing justification text — "3 distinct signal schemas... non-factorizable" — already covers a 4th schema being added the same way, no need to re-argue, just update the number).

**No server-side detector exists yet** (that's LANE B, §3 B2) — this block instructs the LLM to self-apply a keyword pattern-match while reading fetched article text, exactly as it already does for the (undocumented, judgment-only) `trade_war`/`macro`/`crisis` classifications today. This is a pure reading-comprehension trigger — always available, no tool dependency.

**Edit spec (insert new block):**
```markdown
### Geopolitical / War Signal Dispatch (NEW)

Geopolitical conflict / war / trade-war event detected in article (global or VN-relevant) →

**Trigger condition:**
Article text (title or body) matches ANY of the WAR_GEOPOLITICAL_KEYWORDS: `war`, `chiến tranh`, `xung đột`, `trade war`, `chiến tranh thương mại`, `tariff`, `thuế quan`, `sanctions`, `cấm vận`, `military strike`, `tấn công quân sự` — AND the story carries plausible VN-market relevance (global equity index move, commodity/FX shock, or explicit VN trade/export mention). Filter out pure domestic-politics stories with no plausible market linkage.

> Interim, doc-only detection: manual keyword self-check by the agent while reading fetched article text — no server-side detector exists yet (tracked LANE B code work, see `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md` §3 B2). This trigger is always available regardless of tool/server state.

**Step 1 — Dedup check:** reuse the existing Inter-cycle dedup gate + Cross-sibling dedup gate at the top of this file (`SELF_SIGNALS_CACHE` / `SIBLING_WINDOW_CACHE`, keyed on `event_type` + title normalization) — no new dedup mechanism needed, this trigger only adds a classification rule on top of the existing gate.

**Step 2 — Classify `event_type` (interim mapping, pending LANE B enum extension):**

| Story shape | `event_type` (today) | Note |
|---|---|---|
| Explicit trade/tariff/sanctions angle | `trade_war` | Ships today — already a valid server-accepted enum value (`ChainCatalystFindingDataSchema`), zero code dependency |
| Pure military/conflict event, no explicit trade angle | `macro` | Interim catch-all only — append `[geopolitical:war — awaiting dedicated event_type]` to `payload.detail` so the semantic gap is honest, not silently mis-tagged |

Once LANE B ships a dedicated `geopolitical_conflict` enum value, both branches switch to it in a follow-up doc edit (not part of this brief — tracked as a LANE A follow-up gated on LANE B, see §4).

**Step 3 — Post signal:** use the existing `chain_catalyst` template below ("Crisis / macro catalyst"). For a genuine market-wide event (no single company affected):
- `finding_data.affected_stocks` is schema-required non-empty (`min(1)`) — populate with the watchlist tickers most exposed to global risk-off (high-beta / high-FII-ownership names), NOT an empty array (the schema will reject an empty array).
- **Omit the top-level `stock_code` argument entirely** — this is the field alert-commander's downstream routing actually reads for its per-ticker gate (see §2 A3's field-precision correction). Do not conflate this with `finding_data.affected_stocks`.
```

**DoD:** a live news-scout cycle during a war/trade-war news window posts a `chain_catalyst` with `event_type=trade_war` (or `macro` + gap-tagged detail) and no top-level `stock_code`.

---

### A3 — alert-commander: no-ticker gate carve-out for market-wide geopolitical events (closes R4)

**File:** `docs/agents/alert-commander/flow/stage-signals.md`
**Section:** append as a new paragraph after the existing "Extension (alert-commander, discovered live 2026-07-17)" note (current last line, 74) — same append-only pattern as the two prior clarification/extension notes in this file (2026-07-13, 2026-07-17). File is currently 74L, short, no size pressure.

**Field-precision correction (read before implementing):** the existing 2026-07-13/07-17 notes say `affected_stocks` "may be absent from the text summary." Traced to source: `get_agent_signals`'s text renderer (`formatSignalLines` in `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts:142-160`) echoes only `title`, `detail`, `impact_score`, and the top-level `stockCode` (rendered as `[TICKER]`) — it **never reads `finding_data` at all**. Meanwhile `ChainCatalystFindingDataSchema.affected_stocks` is `z.array(z.string()).min(1)` — **schema-required non-empty**, so it can never literally be "absent." What alert-commander's existing notes are actually observing is the absence of the `[TICKER]` bracket in the rendered line, which is driven by the **optional top-level `stock_code`** argument (`z.string().optional()` per `agentSignalTools.ts:192`) being omitted at post time. The existing suppression behavior is coded correctly (it already checks for the missing bracket) — only the *name* used in the doc notes is imprecise. The new carve-out below must use the correct field name so it isn't miswired against `finding_data.affected_stocks` (which is always non-empty and would make the carve-out condition permanently false if implemented literally).

**Edit spec (append):**
```markdown
> **Carve-out (agents-architect brief 2026-07-21, GLOBAL-GEOPOLITICAL-SIGNAL-COVERAGE): market-wide geopolitical advisory.** The no-ticker suppression above (2026-07-13/07-17 clarifications) assumes a per-ticker-only routing model (`position-danger` / `watchlist-opportunity` are both inherently single-stock gates per `docs/policies/alert-policy.md`). It does not fit a genuinely market-wide event. When a `chain_catalyst` signal has `event_type` in `[trade_war, geopolitical_conflict*, macro]` AND the **top-level `stock_code` argument was omitted** by the poster (not `finding_data.affected_stocks`, which the schema requires non-empty and which this text-rendering path never surfaces — see field-precision note above) AND `direction=bearish` AND `confidence` ≥ the Step 3 regime threshold → route to **MARKET as a market-wide advisory**, distinct from a per-ticker CRITICAL alert:
> - Message format: same ≤140-char urgent format as any MARKET post (`docs/policies/alert-policy.md`), framed as a market-wide caveat (e.g. "[VN thị trường] Rủi ro địa chính trị/thương mại lan rộng — <1-line summary>. Theo dõi danh mục.") — do NOT imply a specific stock is in danger.
> - Does NOT bypass the regime-threshold confidence gate (Step 3) — only the per-ticker requirement.
> - Symmetric: a bullish market-wide `chain_catalyst` under the same conditions routes to MARKET as a market-wide opportunity note, same format constraint (mirrors the existing 2026-07-17 symmetric-suppression precedent, now symmetric-carve-out).
> - `*` `geopolitical_conflict` is a LANE B (code) enum value — until it ships, no signal will ever carry it and this clause is a no-op for that value specifically. `trade_war`/`macro` already work today (LANE A, zero code dependency, see §2 A2).
```

**DoD:** replay of the 2026-07-20 selloff scenario (bearish, no-ticker, war/trade_war-tagged, confidence ≥ regime threshold) — with A2 posting the signal — produces a MARKET advisory instead of the observed "no firing condition met" WORK-only suppression.

---

### A4 — unified-agent CHEF: US-stack 4th element + L2_OK gate extension (closes R5)

**File:** `docs/agents/unified-agent/flow/chef.md` (812L, already size-justified for exactly this kind of incremental extension — no comment update needed, edits are additive lines inside existing justified blocks)

**Edit 1 — Step 3 "US stack" (current lines 192-197):**
```diff
 ## Step 3 — LAYER 2+3 (US/VN economic stacks)

 **US stack:**
 - Manufacturing PMI (above/below 50 + direction)
 - Consumer sentiment (trend)
 - Fed rate + EFFR-IORB spread (tightening/easing posture)
+- Global risk sentiment / geopolitical event flag (NEW) — from news-scout `chain_catalyst` signals with `event_type` in `[trade_war, geopolitical_conflict*, macro]` carrying a war/geopolitical marker in `payload.detail` (see `docs/agents/news-scout/flow/stage-signals.md` § Geopolitical/War Signal Dispatch). If ≥1 such signal is open on the bus this cycle (`get_open_chain_findings` or bootstrap signal cache), cite it explicitly: event summary + direction + confidence. If none present, satisfy this element with an explicit gap token `[gap:geopolitical_event_absent]` — absence of war/geopolitical signals is a valid, common state, not a failure. `*` `geopolitical_conflict` is LANE B; `trade_war`/`macro`-tagged war items already flow today.
```

**Edit 2 — Step 7.5 sub-check (a), `L2_OK` (current lines 547-550), plus its preceding MINIMUM FLOOR comment (lines 536-546) needs a 3rd bullet added listing the new accepted element:**
```diff
 L2_OK = (US PMI value cited in Step 3 with a numeric data point)
         OR (EFFR-IORB spread cited in Step 3 with a numeric value)
+        OR (a global risk sentiment / geopolitical event cited in Step 3, per the NEW 4th US-stack element — event summary + direction/confidence)
         OR (at least one explicit gap token was written for L2,
-            e.g. [gap:macro_health_missing] or [gap:US_macro_unavailable])
+            e.g. [gap:macro_health_missing], [gap:US_macro_unavailable], or [gap:geopolitical_event_absent])
```
Also add one bullet to the comment block above (lines 538-540 pattern) documenting the new 3rd accepted concrete element, consistent with the existing "MINIMUM FLOOR" AutoCure-comment style used for the other two.

**DoD:** replay of a 2026-07-20-style cycle with an open `trade_war`-tagged `chain_catalyst` on the bus — CHEF's dish cites it in Step 3 and `L2_OK` evaluates true without needing a PMI/EFFR-IORB gap token. The causal-chain sentence in Step 6.5 should read something closer to "war/trade-war selloff → VND carry pressure → ..." instead of the observed "[gap: no US macro signal in cycle] → VND carry pressure...".

---

### A5 — unified-agent CHEF: 5th convergence rule (closes R6)

**File:** `docs/agents/unified-agent/flow/chef.md`, Step 1 CLUSTER convergence-rule table (current lines 147-154)

**Edit spec (add a 5th table row):**
```diff
 | Rule | Definition |
 |---|---|
 | Ticker convergence | ≥2 distinct signal types for the same ticker in same 24h window (e.g. price_anomaly + news_impact for ACB) |
 | Sector convergence | ≥3 signals (any type) targeting tickers in the same sector in same 24h window |
 | Macro-micro contradiction | A macro signal contradicts the micro signal for a watchlist ticker (e.g. TIGHTENING regime + active BUY alert on VCB) |
 | Extreme individual signal | Any signal with `severity=CRITICAL` OR any TA reading outside 2-sigma (RSI < 15 or > 85) — **CHEF may only apply the RSI sub-clause when `get_technical_indicators` was called THIS cycle and returned a numeric RSI value; absent that call, apply `severity=CRITICAL` criterion only** |
+| Geopolitical/war convergence (NEW) | Any signal with `event_type` in `[geopolitical_conflict*, trade_war, war]` qualifies as a cluster regardless of ticker/sector count — a single war/trade-war `chain_catalyst` is sufficient to trigger Steps 2-8 even with 0 other signals converging. `*` `geopolitical_conflict` is LANE B; `trade_war` already qualifies today with zero code dependency. |
```

**Effect worth noting:** this changes the intraday silent-exit behavior (Step 1: "if `$DISH_TYPE == intraday` AND 0 clusters qualify → SILENT exit"). Today, a lone war/trade_war signal with no other ticker/sector convergence yet would silently exit an intraday dish. After this edit, that same signal alone forces a full layer walk — useful for the case where geopolitical news breaks before price impact broadens across the watchlist (the 2026-07-20 case itself likely already qualified via ticker/sector convergence from the broad selloff, per the diagnosis's L2-gap evidence — but this rule closes the earlier-warning gap for the next event).

**DoD:** a synthetic intraday cycle with exactly 1 `trade_war`-tagged `chain_catalyst` and 0 other qualifying signals proceeds past Step 1 instead of silent-exiting.

---

### A6 — new policy doc: Data Sources & Coverage (closes R9)

**File (NEW):** `docs/policies/data-sources-coverage.md`

No file with this scope exists (`ls docs/policies/ | grep -i source` → empty). This is a doc-layer create, in-zone for agent-father (`docs/agents/` + `.claude/skills/` + `.claude/agents/` per commit-boundary table is agent-father's declared zone — `docs/policies/` sits alongside these as agent-father's established doc-maintenance surface; confirm zone fit at commit time, RULE 2).

**Full content spec (agent-father: create verbatim, adjust only if a factory-rule lint objects):**
```markdown
# Data Sources & Coverage Policy

**Load when:** adding/removing a news/macro data source, auditing signal-category coverage, diagnosing a "missing signal category" gap.

## In-Scope International/Geopolitical Coverage

| Category | Source(s) | Ingestion path | Status |
|---|---|---|---|
| VN domestic news | CafeF, VnExpress, VnEconomy | `fetch_and_analyze` (news-scout Stage 1) | LIVE |
| International news | Reuters (RSS-proxied via `news-fetch` microservice → Google News RSS) | `fetch_and_analyze(sources=["reuters"])` (news-scout Stage 1a) | LIVE — reachability tracked, see LANE C |
| Geopolitical conflict / war / trade-war events | Detected within the above news sources via WAR_GEOPOLITICAL_KEYWORDS pattern-match | news-scout Stage 3 § Geopolitical/War Signal Dispatch → `chain_catalyst` (`event_type: trade_war\|macro` interim, `geopolitical_conflict` pending code) | LANE A live 2026-07-21; LANE B enum pending |
| US equity indices (S&P 500 / Nasdaq / VIX) | Not yet sourced | none — no MCP tool exposes these today | GAP — tracked LANE B, PO backlog |
| FX/rate/commodity derivative proxies (DXY, US10Y, Brent, Gold) | Yahoo Finance | `get_macro_snapshot` | LIVE |

## Out-of-Scope (explicit, to prevent scope creep)

- Company-specific foreign filings/press releases — BCTC Analyst's zone, separate pipeline
- Social media sentiment — not sourced anywhere in this system today
- Non-VN-relevant global news with no plausible market linkage (e.g. pure domestic US politics with no trade/market angle) — filtered by the "plausible VN-market relevance" clause in news-scout's Geopolitical/War Signal Dispatch trigger condition

## Ownership

- Source additions/removals: `dev-mainserver-crawls` (international) / `dev-vps-crawls` (VN geo-blocked) implement; `ops-mainserver-fetch` / `ops-vps-fetch` recon first — see `docs/references/agent-roster.md` § Crawl Pipeline Agents
- Coverage-category definitions (this file): agent-father maintains; agents-architect proposes changes via architecture brief

## Revision History

- 2026-07-21: initial version — authored in response to `docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md` (2026-07-20 war/trade-war selloff, zero global coverage in any cowork agent output).
```

**DoD:** file exists, ≤50L, passes any factory doc-lint agent-father applies.

---

## 3. LANE B — Code-Layer (PO backlog → dev-team, DDD-scoped)

### B1 — News normalization: `geopolitical` domain tag (closes R2)

**Files:**
- `apps/mcp-server/bctc-schema.ts` — `DomainType` union (line 25-45). **This is a root-level SHARED schema also consumed by the BCTC extraction pipeline**, not news-only — adding `'geopolitical'` here is additive (union member append) but the change is repo-wide-visible. `Record<DomainType, string[]>` sites (e.g. `DOMAIN_KEYWORD_MAP` below) get a **compiler-enforced exhaustiveness check** — TypeScript will error until every such map includes the new key. This is a safety net, not extra work to hunt manually.
- `apps/mcp-server/src/domain/services/newsNormalizer.ts` — `DOMAIN_KEYWORD_MAP` (starts line 147, `Record<DomainType, string[]>`): add `geopolitical: [war/chiến tranh/xung đột/tariff/thuế quan/sanctions/cấm vận keyword list]`. Also update the Vietnamese display-label map (~line 830) for the new domain.

**DDD layer:** pure domain service, zero I/O (`newsNormalizer.ts` header explicitly states "must not import from application/ or infrastructure/"). Isolated, low-risk.
**Depends on:** none. Can ship independently of B2.
**Owner:** dev-mcp-server.

### B2 — `geopolitical_conflict` event_type enum + detector (closes R3 code-part)

**Files:**
- `apps/mcp-server/src/domain/signals/signalTypes.ts` — `ChainCatalystFindingDataSchema.event_type` `z.enum([...])` (line 91-98) and the matching TS union comment on `ChainCatalystFindingData.event_type` (line 28-35): add `"geopolitical_conflict"`.
- **New file** `apps/mcp-server/src/domain/services/geopoliticalRiskDetector.ts` — pure domain service mirroring `legalRiskDetector.ts` exactly (zero imports from `infrastructure/`/`application/`, no I/O, no async; regex `PatternEntry[]` array, e.g. `{ pattern: /chiến tranh/i, ... }`, `{ pattern: /trade war/i, ... }`, `{ pattern: /tariff/i, ... }`, mirroring the existing `LEGAL_PATTERNS` structure at `legalRiskDetector.ts:60-75`). Returns a `GeopoliticalRiskSignal` (analogous to `LegalRiskSignal`).

**Open scope decision for PO/dev-team at implementation time:** unlike `legal_risk` (which has a dedicated MCP tool `get_legal_risk_signals`, per `legalRiskTools.ts`), `trade_war`/`macro`/`crisis` chain_catalyst classifications have **no** dedicated server-side detector tool today — news-scout self-classifies via LLM judgment. Recommend shipping the domain-service detector (above) WITHOUT a new MCP tool wrapper initially, matching the existing pattern for the other `chain_catalyst` event types — a `get_geopolitical_risk_signals` tool can be added later if server-side corroboration proves necessary (e.g. cross-checking the LLM's self-classification).

**DDD layer:** pure domain service (new file) + schema enum extension. Isolated.
**Depends on:** none for the enum value; detector-tool scope is PO's call.
**Owner:** dev-mcp-server.

**Batching recommendation:** B1 + B2 both touch `apps/mcp-server/src/domain/` news/signal classification surface, same reviewer context, similar effort (small, additive, no I/O) — bundle into ONE backlog row.

### B3 — Alert-commander code changes for R4

**None.** The carve-out (§2 A3) routes on fields that already exist (`event_type`, `stock_code`, `direction`, `finding_data.confidence`) — pure doc/routing-logic change, zero server code required.

### B4 — US equity index / VIX tool (closes R7)

**Files:**
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` — extend the existing Yahoo Finance fetch (already pulling Brent/Gold/DXY/US10Y per `docs/agents/tools/list/get_macro_snapshot.md`) to add `^GSPC` (S&P 500), `^IXIC` (Nasdaq), `^VIX` symbols. Confirmed via live tool doc + code trace: **no existing tool surfaces these today**.
- `docs/agents/tools/list/get_macro_snapshot.md` — tool doc update (same task, standard dev-team practice for a tool-signature change).

**DDD layer:** infrastructure-layer addition (Yahoo Finance HTTP client, already-proven — same client used for existing symbols) + macro domain formatting. Bounded extension of an existing tool, not a new microservice.
**Depends on:** none to build. **Gates** a LANE A follow-up: once this ships, `docs/agents/market-watcher/flow/cycle.md` Step 0b (regime-extraction skill) and/or Step 2 should be extended with a new `US_EQUITY_SIGNAL` variable mirroring the existing `DXY_SIGNAL`/`US10Y_SIGNAL` pattern (cycle.md lines 34-35, 86-87) — that downstream doc wiring is **explicitly out of scope for this brief** (unlike R1/R4/R5/R6, which are fail-soft-safe to ship now, this one is genuinely blocked on the tool existing first) and should be a follow-up architecture-brief/agent-father task once B4 lands.
**Owner:** dev-mcp-server.

---

## 4. LANE C — Ops Verification (closes R8)

**Target:** confirm `fetch_and_analyze(sources=["reuters"])`'s underlying HTTP path is actually live in production, not silently degrading.

**Code trace (done by this brief, not a probe — establishing WHAT to verify):**
```
apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts:200-201
  NEWS_FETCH_BASE = Bun.env['NEWS_FETCH_URL'] ?? 'http://news-fetch:5008'
  fetch(`${NEWS_FETCH_BASE}/reuters/headlines`, ...)
docker-compose.yml:284,374-376 — `news-fetch` service IS registered, mcp-server has `NEWS_URL=http://news-fetch:5008` wired.
```
So the wiring exists in config. But `docs/agent-memory/notebooks/dev-mainserver-crawls.md` (last updated 2026-06-08, **43 days stale** relative to today) carries this unresolved carry-over:
> "news-fetch microservice pending ops: Routes wired (c79). Still needs: 1899a-gateway (Tier 4) + ops docker-compose provisioning (>=2GB RAM). news-fetch container flag remains open."

This is a real, unresolved, dated flag — not resolved by anything read in this brief's research.

**Probe (ops, single attempt, not run by this brief):**
```bash
docker ps --filter name=news-fetch          # confirm container up + healthy
curl -sS http://news-fetch:5008/health       # or via gateway if not directly reachable from probe context
curl -sS "http://news-fetch:5008/reuters/headlines?maxItems=5"   # confirm non-empty articles[], error:null
```

**Material dependency (not just "nice to verify"):** if `news-fetch` is down/unhealthy, A1 (§2) ships correctly as a doc change but **delivers zero real value** every cycle — the dedicated international call will silently return empty, and news-scout will have nothing to feed A2's Geopolitical/War Signal Dispatch trigger. Recommend this probe run same-day as LANE A ships, not deferred.

---

## 5. Sequencing / Ordering Constraint

The task framing assumed R4/R5/R6 doc changes reference `event_type` values that would be **no-ops** until R2/R3 code lands. This brief found a stronger result: **`trade_war` is already a live, server-accepted enum value** (`ChainCatalystFindingDataSchema`, confirmed in `apps/mcp-server/src/domain/signals/signalTypes.ts:91-98`) that no flow document has ever instructed news-scout to use for war/geopolitical stories. Because A2 (§2) wires news-scout to tag genuine war/trade-war stories with `event_type=trade_war` **today**, and A3/A4/A5 (§2) all include `trade_war` in their condition lists, **the LANE A pipeline is functionally live end-to-end the moment it ships** — not merely contract-defined-but-dormant. LANE B (`geopolitical_conflict` enum, §3 B2) sharpens precision (distinguishing pure-military events from trade-specific ones) but is not required for the pipeline to close the diagnosed gap.

Ordering:
1. **A1-A6 (LANE A)** — no ordering dependency between them; can all ship in one agent-father pass.
2. **LANE C (ops probe)** — run same-day as A1, to confirm A1/A2 deliver real value, not just a correct-but-empty doc change.
3. **B1, B2 (LANE B)** — independent of each other and of A1-A6; bundle into one backlog row (§3 batching recommendation).
4. **B4 (LANE B)** — independent to build; gates a *future* LANE A follow-up (market-watcher `US_EQUITY_SIGNAL` wiring), not part of this brief.
5. Once B2 ships, a small **follow-up doc edit** (not this brief) switches A2's/A3's/A4's/A5's interim `trade_war`/`macro` values to the new `geopolitical_conflict` value where semantically more precise.

---

## 6. Implementation Route

| Item | File(s) | Zone | Owner | Depends on | Urgency |
|---|---|---|---|---|---|
| A1 | `docs/agents/news-scout/flow/stage-fetch.md` | `docs/agents/news-scout/` | **agent-father** | none | ship now |
| A2 | `docs/agents/news-scout/flow/stage-signals.md` (+ bump stale size-justification comment) | `docs/agents/news-scout/` | **agent-father** | none | ship now |
| A3 | `docs/agents/alert-commander/flow/stage-signals.md` | `docs/agents/alert-commander/` | **agent-father** | none | ship now |
| A4 | `docs/agents/unified-agent/flow/chef.md` (Step 3 + Step 7.5) | `docs/agents/unified-agent/` | **agent-father** | none | ship now |
| A5 | `docs/agents/unified-agent/flow/chef.md` (Step 1) | `docs/agents/unified-agent/` | **agent-father** | none | ship now |
| A6 | `docs/policies/data-sources-coverage.md` (new) | `docs/policies/` | **agent-father** | none | ship now |
| LANE C | `apps/news-fetch` container + `docker-compose.yml` (probe only) | ops | **ops** (PO dispatches) | none | same day as LANE A |
| B1+B2 (bundle) | `apps/mcp-server/bctc-schema.ts`, `newsNormalizer.ts`, `signalTypes.ts`, new `geopoliticalRiskDetector.ts` | `apps/mcp-server/src/domain/` | **dev-mcp-server** | none | PO backlog, normal priority |
| B4 | `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts`, `docs/agents/tools/list/get_macro_snapshot.md` | `apps/mcp-server/` | **dev-mcp-server** | none to build; gates future market-watcher doc wiring | PO backlog, normal priority |

**Line-budget guardrails for agent-father:**
- `docs/agents/news-scout/flow/stage-fetch.md`: 25L → ~35L after A1. Safe.
- `docs/agents/news-scout/flow/stage-signals.md`: 200L (stale `154L` comment) → ~235L after A2. **Update the size-justification comment number**, do not split (existing "non-factorizable schema" justification already covers a 4th schema block).
- `docs/agents/alert-commander/flow/stage-signals.md`: 74L → ~92L after A3. Safe, no comment needed.
- `docs/agents/unified-agent/flow/chef.md`: 812L, already size-justified as a monolith for exactly this reason (incremental additions to existing justified blocks). A4+A5 add ~15L combined. No comment update needed.
- `docs/policies/data-sources-coverage.md`: new, ~40L. Safe.

---

## 7. Verification Gate (for agent-father / whoever implements — test design)

1. **A1:** grep news-scout's next 3 cycle logs for the `1a.` tool-call — confirm `sources: ["reuters"]` present as a distinct call, not merged into the domestic call.
2. **A2:** synthetic article containing "trade war" or "tariff" + a VN-market-relevant clause → news-scout posts `chain_catalyst` with `event_type=trade_war`, no top-level `stock_code`, `finding_data.affected_stocks` populated with ≥1 watchlist ticker (schema `min(1)` satisfied).
3. **A3:** replay the exact 2026-07-20 condition (bearish, `trade_war`, no `stock_code`, confidence ≥ regime threshold) through alert-commander Step 3c — confirm output is a MARKET market-wide advisory, not WORK-suppressed.
4. **A4:** cycle with an open `trade_war`-tagged signal and no PMI/EFFR-IORB data — confirm `L2_OK=true` via the new 3rd OR-branch, `QUALITY_VERDICT` not forced to `degraded` on account of L2 alone.
5. **A5:** synthetic intraday cycle, exactly 1 `trade_war` signal, 0 other convergence — confirm Steps 2-8 execute (no silent exit).
6. **A6:** file exists, renders correctly, no dangling references.
7. **LANE C:** `docker ps` + `curl` probe results logged; if unhealthy, escalate as a BUG-channel finding referencing this brief (not this brief's job to escalate — PO/ops call).
8. **B1/B2:** `bun test` full suite green (compiler exhaustiveness catches any `Record<DomainType,...>` site missed); new `geopoliticalRiskDetector.test.ts` mirrors `legalRiskDetector`'s test structure (pattern-match unit tests, no I/O).
9. **B4:** `get_macro_snapshot()` live call returns `^GSPC`/`^IXIC`/`^VIX` values in the `[COMMODITY PRICES]`-equivalent section (or a new section), degrades gracefully (independent try/catch, matching the existing per-source isolation pattern) if Yahoo Finance is unreachable.

---

## 8. Files Read / Commands Run (citation)

- `docs/agents/agents-architect/init.md`, `flow/main.md`, `handlers.md` (full)
- `docs/protocols/fail-loud-protocol.md`, `docs/policies/commit-convention.md`, `.claude/skills/commit-boundary/SKILL.md` (full)
- `docs/agent-memory/notebooks/agents-architect.md`, `docs/references/agent-roster.md` (full)
- `docs/agents/news-scout/flow/stage-fetch.md`, `stage-signals.md` (full)
- `docs/agents/alert-commander/flow/stage-signals.md` (full)
- `docs/agents/market-watcher/flow/cycle.md` (full)
- `docs/agents/unified-agent/flow/chef.md` (targeted: lines 143-273, 510-630)
- `docs/agents/tools/list/fetch_and_analyze.md`, `get_macro_snapshot.md` (full)
- `docs/policies/alert-policy.md` (full)
- `docs/agent-memory/notebooks/dev-mainserver-crawls.md` (full)
- `apps/mcp-server/bctc-schema.ts` (DomainType union, lines 20-45)
- `apps/mcp-server/src/domain/services/newsNormalizer.ts` (grep + targeted read, DOMAIN_KEYWORD_MAP)
- `apps/mcp-server/src/domain/signals/signalTypes.ts` (lines 1-140, ChainCatalystFindingDataSchema)
- `apps/mcp-server/src/domain/services/legalRiskDetector.ts`, `policyImpactMapper.ts` (grep + targeted read)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` (grep: sources/limit/reuters/NEWS_FETCH_BASE)
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts` (lines 130-170, formatSignalLines + stock_code handling)
- `docker-compose.yml` (grep: news-fetch)
- `docs/data/system-map.json` (watchlist count = 34)
- Prior-art greps against `docs/architecture-briefs/`, `docs/handoffs/`, `docs/improvement-proposals/`, `orch-state.json` backlog ids

```bash
grep -n "event_type\|z.enum" apps/mcp-server/src/domain/signals/signalTypes.ts
grep -n "affected_stocks\|affected_sectors" apps/mcp-server/src/domain/signals/signalTypes.ts
grep -n "stock_code\|stockCode" apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts
grep -n "reuters\|NEWS_FETCH_BASE" apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts
grep -n "news-fetch" docker-compose.yml
jq '[.project.watchlist[]?.ticker] | length' docs/data/system-map.json   # -> 34
```

---

## RETURN

DONE: Brief authored — LANE A (6 items: A1-A6) is a fully-specified, zero-code-dependency doc-layer fix that functionally closes the war/trade-war blind spot TODAY by reusing the already-live `event_type=trade_war` enum value; LANE B (3 items: B1/B2 bundle + B4) is precision/completeness code work for PO backlog; LANE C (R8) is an ops probe with a concrete, dated, unresolved carry-over flag. One field-precision correction folded into A3 (no-ticker carve-out must key off top-level `stock_code`, not `finding_data.affected_stocks` — the latter is schema-required non-empty and never surfaces to alert-commander's text-rendering path).

ZONE: multi — `docs/agents/news-scout/`, `docs/agents/alert-commander/`, `docs/agents/unified-agent/`, `docs/policies/` (agent-father) + `apps/mcp-server/src/domain/` (dev-mcp-server, PO backlog) + `apps/news-fetch` (ops probe, PO dispatches)

FOLD-VS-FRESH: FRESH — no prior architecture brief, backlog row, or policy doc covers geopolitical/war signal coverage (§1).

NEXT: **agent-father** — implement LANE A items A1-A6 per the exact edit specs in §2 (six files: `docs/agents/news-scout/flow/stage-fetch.md`, `docs/agents/news-scout/flow/stage-signals.md`, `docs/agents/alert-commander/flow/stage-signals.md`, `docs/agents/unified-agent/flow/chef.md` ×2 edits, new `docs/policies/data-sources-coverage.md`).

PO-BACKLOG NOTE (LANE B/C — PM to mint via cascade, not this brief's job to mint task_board rows):
- Suggested BACKLOG row 1: `FEAT-NEWS-GEOPOLITICAL-CLASSIFICATION` — bundles B1+B2 (§3), zone `apps/mcp-server/src/domain/`, owner dev-mcp-server, normal priority, no dependency.
- Suggested BACKLOG row 2: `FEAT-MACRO-US-EQUITY-INDEX-TOOL` — B4 (§3), zone `apps/mcp-server/`, owner dev-mcp-server, normal priority, gates a future market-watcher doc-wiring follow-up (not this brief).
- LANE C (R8): ops probe of `news-fetch` container health + live Reuters reachability — dated unresolved carry-over in `docs/agent-memory/notebooks/dev-mainserver-crawls.md` (2026-06-08, 43 days stale). Recommend same-day probe — A1/A2's real-world value depends on this being green (§4).

HANDOFF: docs/architecture-briefs/2026-07-21-global-geopolitical-signal-coverage.md
PIPELINE: continue
