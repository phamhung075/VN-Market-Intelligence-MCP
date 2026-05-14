# Sprint 1910 — `get_ism_subcomponents` (FRED) + `get_fed_liquidity_spread` Package Registration

**Sprint:** 1910
**Status:** PO-AUTHORED (awaiting BA decomposition)
**Priority:** HIGH (TNB c50 priorities #2 + #3 — D-step compliance for 3 agents)
**Owner (suggested):** dev-mcp-server (new tool) + agent-md-editor (package registrations) — BA confirms split
**Zone:** `apps/mcp-server/src/infrastructure/fetchers/` + `apps/mcp-server/src/interface/mcp/tools/macro/` + `.claude/tools/package/` + `agentBootstrap.ts`
**Date:** 2026-05-14
**Source proposal:** `docs/handoffs/tnb-data-equip-proposal-2026-05-14.md` §B3 + §C2 + §B4 + §C3
**Reference (analog FRED tool):** Sprint 1879 — `get_fed_liquidity_spread` (`docs/specs/1879-effr-iorb-ba-spec.md`), already SHIPPED — reuse its FRED-fetcher pattern.
**Methodology epigraph (bottom-up):** `docs/standards/tnb-methodology.md` L4-6 — *"do we understand the business behind the ticker?"*

---

## 1. Objective

Two methodology Layer 2 (D-step) gaps closed in one fast-follow sprint, both in the same `apps/mcp-server` macro zone, both leveraging existing FRED infrastructure:

1. **NEW TOOL `get_ism_subcomponents`** — extend FRED fetcher to pull ISM Manufacturing PMI sub-series (new orders, employment, prices paid, backlog) so news-scout / unified-agent / financial-analyst can detect the leading-vs-lagging divergence that composite PMI obscures.
2. **PACKAGE REGISTRATION of existing `get_fed_liquidity_spread`** — three flow/package file edits to add the already-built EFFR–IORB tool to financial-analyst, news-scout, and unified-agent packages. Zero build, immediate D-step unblock.

**Completion (per `feedback_ship_completion.md`):** sprint ships when (a) `get_ism_subcomponents` is registered in tool-registry + cron-wired (monthly, first business day) + manifest-listed in the 3 consumer agents' SKILL_MANIFESTs, (b) `get_fed_liquidity_spread` appears in 3 agent package docs, and (c) at least one cycle log from each of news-scout, unified-agent, financial-analyst shows the new tools being **called** (not skipped) in a real cycle.

---

## 2. Bottom-up philosophy alignment (mandatory section)

Per the tnb-methodology epigraph:

- **"Khách hàng là ai" (who are the customers) — covered by `get_ism_subcomponents`:** For export-linked VN tickers (FPT US tech clients, HPG steel exports, GAS industrial customers), US ISM new orders = the upstream demand signal for Vietnamese-exported inputs/services. New-orders contracting while composite PMI sits at 50 = US customer demand weakening even as the headline looks stable. This directly informs *"are FPT's US clients still buying?"*
- **"Hệ thống vận hành có tốt không" (are operations good) — covered by `get_ism_subcomponents`:** Prices-paid sub-index maps to input-cost pressure for VN manufacturers (HPG steel inputs, GAS energy). Tells us about the operating-cost trajectory at the business level, not just at the macro headline.
- **"Chi phí vốn" at the business level — covered by `get_fed_liquidity_spread` package reg:** EFFR–IORB spread < 10 bps signals reserve scarcity → USD funding cost rise → VND interbank tightening → SBV defensive intervention → bank NIM compression. For VCB / ACB / MBB the spread is a leading indicator of NIM compression *at the individual bank level*. Exposing this tool to financial-analyst is exactly *"understanding how this bank actually makes money."*

Both tools strengthen the bottom-up question by replacing macro headlines (composite PMI, headline Fed rate) with the leading sub-signals that actually transmit to specific business outcomes.

---

## 3. Scope (BA to decompose into sub-tasks)

### 3.1 `get_ism_subcomponents` — NEW MCP tool (Sprint 1910a, suggested)

In-scope:
- FRED CSV fetcher additions to `apps/mcp-server/src/infrastructure/fetchers/fredApi.ts` (or sibling) for ISM Manufacturing sub-series. **Series IDs to be confirmed by BA at spec time** — proposal cites `ISM/MAN_NHW`, `ISM/MAN_EMPV`, `ISM/MAN_PPV`, but the canonical FRED IDs (e.g. `NAPMNOI` for new orders, `NAPMEI` for employment, `NAPMPRI` for prices paid, `NAPMBI` for backlog) should be verified during BA investigation. BA spec must enumerate the exact series IDs used.
- Persistence: extend existing `tracked_indicators` or `fred_series_daily` schema (whichever 1879a settled on — BA reads `1879-effr-iorb-ba-spec.md` to pick the correct table).
- Domain function: pure-function regime classifier returning `"EXPANDING" | "CONTRACTING" | "MIXED"` based on new-orders vs prices-paid divergence rule (BA defines exact threshold logic; suggest `new_orders > 50 && prices_paid < new_orders` = EXPANDING, etc.).
- Tool handler: `apps/mcp-server/src/interface/mcp/tools/macro/getIsmSubcomponentsTool.ts`.
- Signature: `get_ism_subcomponents() → { source_tier: 1, new_orders: number, employment: number, prices_paid: number, backlog: number, fetchedAt: string, regime_signal: "EXPANDING" | "CONTRACTING" | "MIXED" }`.
- Cron: monthly, first business day (ISM release schedule). Wire into existing `macroIndicatorRefreshJob` family (per 1879 pattern) — do NOT create a new orphan cron.
- Tests: unit (pure regime classifier) + integration (FRED fetch happy path + missing-series fallback) + contract test (source_tier=1 invariant).

Out of scope:
- ISM Services PMI sub-components (separate sprint if needed).
- Composite PMI replacement — `get_macro_snapshot` keeps composite, this tool adds sub-detail.

### 3.2 `get_fed_liquidity_spread` package registration (Sprint 1910b, suggested — XS effort)

In-scope:
- Add the tool to `.claude/tools/package/financial-analyst.md` (Layer 2 / D-step section).
- Add the tool to `.claude/tools/package/news-scout.md` (US monetary chain section).
- Add the tool to `.claude/tools/package/unified-agent.md` (Pillar 2 / COC section).
- Add the tool to `financial_analyst`, `news_scout`, `unified_agent` SKILL_MANIFESTs in `agentBootstrap.ts` if not already present.
- Mirror in `docs/SKILL_MANIFEST.md`.
- Verify auto-cure 3-cycle evidence rule per proposal §C3 caveat — if D-step has been a documented carry gap for 3+ cycles in financial-analyst notebooks (proposal asserts this is true, BA verifies), this ships in 1910 directly. If only 1-2 cycles documented, this becomes 1910b-pending and waits.

Out of scope:
- Code changes — tool already exists per Sprint 1879 ship state.

### 3.3 Validation gate

- One cycle each of news-scout, unified-agent, financial-analyst shows tool calls hitting `get_ism_subcomponents` and `get_fed_liquidity_spread`. Notebook entries confirming the D-step status flipped from "carry" / "skip" to "passed" are the acceptance signals.

---

## 4. Acceptance criteria (PO sign-off gate)

- AC-1: `get_ism_subcomponents` registered, tool-registry pointer updated, FRED series IDs documented in BA spec.
- AC-2: Cron wired into existing macro refresh job (no orphan cron created); monthly first-business-day schedule confirmed in `cron-registry`.
- AC-3: `get_ism_subcomponents` regime_signal logic unit-tested with at least 4 fixture cases (EXPANDING / CONTRACTING / MIXED / boundary).
- AC-4: `get_fed_liquidity_spread` appears in financial-analyst.md, news-scout.md, unified-agent.md package docs + relevant SKILL_MANIFESTs.
- AC-5: One cycle log from each of news-scout, unified-agent, financial-analyst shows D-step transitioned from "carry / skip" to "passed" via the new tool calls — captured in respective agent notebooks.
- AC-6: tsc 0 errors, full test suite still green, deploy commit recorded, container fleet healthy post-deploy.
- AC-7: `/graphify docs --update --no-viz` run post-merge per `feedback_dev_doc_graphify.md`.

---

## 5. Recurring-bug-rule check (PO compliance)

Per `feedback_recurring_bug_escalation.md`:

- `get_ism_subcomponents` — NEW tool, 0 prior commits on ISM-related modules (verified via `git log --oneline -- '*ism*' '*ISM*'`). Recurring-bug rule does not apply.
- `get_fed_liquidity_spread` package registration — flow/package file edits only, no code module touched. Recurring-bug rule does not apply.

**No architect block raised. Sprint proceeds straight to BA decomposition.**

---

## 6. Dependencies + risk

- Hard dep: FRED public CSV endpoint reachable. Already proven by Sprint 1879 (`fredApi.ts` shipped).
- Hard dep: existing `macroIndicatorRefreshJob` cron pattern. BA reads 1879a section 3.3 for the persistence-table decision precedent.
- Soft dep: ISM FRED series ID accuracy. BA must validate series IDs at spec time (proposal's IDs are best-guess; FRED canonical IDs may differ). If proposal IDs are wrong, BA documents the corrected IDs in the BA spec.
- Risk (low): if ISM publishes sub-series with delay vs composite PMI, monthly cron may need a re-run window. BA defines the retry policy.
- Risk (low) on §3.2: auto-cure 3-cycle evidence may not yet be hit. If BA finds <3 cycles of documented D-step carry, package-reg portion becomes 1910b-pending and ships only after 3rd cycle. Tool-build (§3.1) proceeds regardless.

---

## 7. Hand-off

- **Next step:** BA reads this spec + `docs/handoffs/tnb-data-equip-proposal-2026-05-14.md` §B3/§C2/§B4/§C3 + analog spec `1879-effr-iorb-ba-spec.md`, then decomposes into sub-tasks (suggested: 1910a-ism-tool + 1910b-effr-package-reg, but BA owns the call) and writes BA spec.
- **PO sign-off:** against AC-1 through AC-7. Per `feedback_ship_completion.md`, PO will not sign off until D-step **executes** (not just "tool exists") in real cycles for all three consumer agents.
