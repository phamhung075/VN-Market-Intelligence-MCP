# Severity-Override Surfacing Path

**Date:** 2026-07-03 | **Author:** agents-architect | **Status:** DESIGN — for agent-father/dev-mcp-server implementation
**Backlog task id (suggested):** `FEAT-SEVERITY-OVERRIDE-SURFACING`

## 1. Problem

PNJ (VN30 large-cap, NOT on the 34-ticker watchlist — `docs/data/system-map.json` `.project.watchlist`) had a diamond-certificate fraud prosecution today. news-scout detected it correctly (broad-news-scoped, ticker-resolution is exchange-wide, not watchlist-bound):

- c115: `legal_risk` PNJ prosecution, confidence=0.95
- c116: signal `#8371` posted `to_agent="alert-commander"`, ttl=360m, "1 PNJ prosecution routed to alert-commander"
- c117: suppressed by the 360m dedup TTL — no re-emit

Result: **zero persistent user-facing surfaces.** No `docs/analysis-briefs/PNJ.md`, no FB post mention, no notebook mention outside news-scout's own. Confirmed root cause is NOT a single broken gate — it's three independent scope leaks, verified by reading code/flows (not assumed):

| # | Location | Finding |
|---|---|---|
| A | `docs/agents/unified-agent/flow/chef.md` Step 0 GATHER | File-group ingestion enumerates only `price_anomaly_*`, `news_impact_*`, `bctc_signal_*`, `fundamental_*` (docs/signals/*.json files). `legal_risk`/`chain_catalyst`/`urgent_news` are bus-only (`post_agent_signal`, never written as files) — **CHEF's cluster step never sees them as a named input category**, regardless of ticker. This is an absence-of-ingestion bug, not just a watchlist filter. |
| B | `docs/agents/fb-market-poster/flow/main.md:232` | `"Legal risk: dated legal signals from legal_risk — relevant watchlist tickers, governance flags."` — explicit watchlist-only text. Confirmed gate. |
| C | `docs/data/system-map.json` channels.market.sender_rules.alert-commander | `"Event-only — position-danger (3-condition) or watchlist-opportunity (4-condition) ONLY."` — **omits** the CRITICAL override that actually exists in `docs/policies/alert-policy.md` and `docs/agents/alert-commander/flow/{stage-signals,cycle}.md` (`legal_risk` → CRITICAL, unconditional, no watchlist gate). This is documentation drift, and it is very likely the source of the router's "alert-commander is watchlist-scoped" read on this incident — alert-commander's Telegram fire is code-correct, but (i) it's a ≤140-char ephemeral ping easy to miss, (ii) `docs/agent-memory/notebooks/alert-commander.md` last entry is **2026-05-25** — 5+ weeks stale vs today, i.e. its cron-liveness is independently suspect. That is an ops/reliability question, **out of scope for this brief** — flagged as a dependency, not fixed here. |

Net effect: even a perfectly-designed CRITICAL override on alert-commander does not solve the actual complaint, because the complaint is about **durable, discoverable** surfaces (briefs/FB/daily narrative), and those have their own independent watchlist gates (A, B) that never reference alert-commander's override at all.

## 2. Design Decisions

### 2.1 Trigger predicate ("severity-override")

A signal is `SEVERITY_OVERRIDE=true` (bypasses watchlist scoping at every consumer) when ANY of:

1. `signal_type=legal_risk` AND `riskType ∈ {prosecution, asset_freeze}` — the 0.95-confidence tier per the deterministic table in `news-scout/flow/stage-signals.md` (Step 2). **Excludes** `tax_penalty`/`license_revocation` (0.85) and `investigation`/`litigation`/`anti_dumping` (0.70) — those stay watchlist-scoped. Rationale: confidence is a deterministic lookup from riskType, not an independent uncertainty measure, so gate on the tier directly; ~monthly cadence in practice (PC1/VPB 2026-05-21, PNJ 2026-07-03) — no flood risk.
2. `signal_type=price_anomaly` AND `move_sigma ≥ 4.0` AND `impact_score ≥ 6` — reuses the EXACT existing bar from alert-commander `stage-signals.md` § 3b (no new number invented). Currently low-incidence in practice because market-watcher (the sole `price_anomaly` emitter) only scans watchlist tickers — this clause is forward-compatible/defense-in-depth, not the PNJ fix.
3. `signal_type=chain_catalyst` — **already market-wide by construction** (`to_agent="all"`, broadcast, no per-ticker gate exists in alert-commander's Step 3c). No change needed; documented here so implementers don't add a redundant gate.
4. `signal_type=crisis_velocity` / `get_crisis_early_warning()` breach — **already CRITICAL-always** at alert-commander and inherently systemic/non-per-ticker. No change needed.

Only (1) and (2) carry a real per-ticker watchlist gate today; (3)/(4) are already compliant. This keeps the predicate tight — legal_risk top-tier only, no generic "any legal_risk" or "any low-confidence chain_catalyst" noise.

### 2.2 Primary surface: unified-agent (CHEF) daily-dish narrative, MARKET Telegram channel

Chosen over the 3 alternatives:
- **Alert-commander widened mandate** — NOT chosen as primary: the override already exists there on paper (see 1.C); what's missing is durability (≤140 chars, ephemeral) and its cron-liveness is independently in question (5+ week notebook gap). Making it "more primary" doesn't fix the actual complaint (no lasting record).
- **New dashboard row / new agent** — rejected per constraint: reuse an existing channel, don't invent a new agent.
- **CHEF (unified-agent)** — chosen: it is the canonical "market-wide narrative" surface by design (`system-map.json`: *"Chef — 3 guaranteed daily dishes... Narrative 2-4 paragraphs"*), fires 3x/day on a verified cron (Morning 05:23 / EOD 08:37 / Evening 19:37 UTC) independent of alert-commander's liveness question, writes to the same MARKET channel (`unified-agent` already an allowed sender), and gives room for the 2-3 sentences of context a "diamond-cert fraud prosecution" story needs (vs. a 140-char ping).

**Secondary echo (durability, not a second primary):** fb-market-poster's existing "Legal risk" bullet (`main.md:232`) — widen its ticker predicate only; no new section.

### 2.3 Owning agent + dedup

- **Detector/emitter: unchanged.** news-scout remains the sole `legal_risk` detector/poster. No new emit path.
- **Owner of the OR-predicate: a new shared skill**, `.claude/skills/severity-override-gate/SKILL.md`, computing `SEVERITY_OVERRIDE(signal)` per § 2.1 — wired into CHEF (primary), fb-market-poster (secondary), and used to correct the alert-commander/system-map doc drift. Mirrors the existing `claim-truth-gate` pattern (one skill, wired into 6 flows) — not a new agent, per constraint.
- **Cross-cycle dedup (avoid re-narrating the same event 3x/day):** first surfacing agent to narrate a given `signal_id` calls `record_signal_outcome(signal_id, "surfaced_marketwide", <agent>)`. Before adding the market-wide section, CHEF/fb-market-poster check whether that outcome already exists for the signal_id; if yes, either omit or reduce to a 1-line "still developing" carry-forward instead of a full retelling. Natural TTL (360m) bounds the window regardless.
- **360m suppression can hide a developing story (explicit risk, task-flagged):** news-scout's legal_risk dedup (`stage-signals.md` Step 1) suppresses ANY repeat `(stock_code, legal_risk)` within 360 min unconditionally — unlike the generic 180-min gate, which already has a "materially different direction" override exception (`stage-signals.md` line ~28). **Recommend extending the same escalation-exception pattern to the legal_risk gate**: if a later article resolves to a HIGHER riskType tier than the one that was suppressed (e.g. `investigation`→`prosecution`), do not suppress — post as an escalation with a `severity_escalated=true` marker so CHEF/fb-market-poster know to re-narrate even inside the TTL window. This is a small, additive change to news-scout's existing exception mechanism, not a new mechanism.

### 2.4 Watchlist decoupling

Every surfacing consumer's gate changes from:
```
if ticker ∈ watchlist(active=true) → surface
```
to:
```
if ticker ∈ watchlist(active=true) OR SEVERITY_OVERRIDE(signal) → surface
```
Routine content (regular ticker intelligence, routine legal_risk at 0.70/0.85 tier, routine price moves) is untouched — the OR-clause only ever adds signals that already pass the narrow § 2.1 predicate. No existing watchlist-scoped behavior is removed or widened beyond that.

## 3. Target agent-md changes (for agent-father / dev-mcp-server)

1. **New:** `.claude/skills/severity-override-gate/SKILL.md` — implements § 2.1 predicate as one shared check (input: signal row from `get_agent_signals`/`get_legal_risk_signals`; output: boolean + reason string).
2. **`docs/agents/unified-agent/flow/chef.md` Step 0 GATHER:** add a 5th input category — `legal_risk` (bus, via `get_legal_risk_signals()` or the `agent_signals` array already in `get_cycle_bootstrap`) filtered through `severity-override-gate`. Step 1 CLUSTER: add rule — a `SEVERITY_OVERRIDE=true` signal always qualifies as an "Extreme individual signal" cluster regardless of ticker/watchlist membership, and is exempt from the intraday-silent gate (i.e. it can force a dish even on an otherwise-silent intraday cycle). Narrative section: a short "Thị trường rộng" (market-wide) paragraph distinct from the per-watchlist-ticker sections.
3. **`docs/agents/fb-market-poster/flow/main.md:232`:** change `"relevant watchlist tickers"` → `"watchlist tickers, OR any signal where severity-override-gate returns true (non-watchlist high-severity legal_risk)"`. Add the `record_signal_outcome(..., "surfaced_marketwide", ...)` dedup check from § 2.3 before rendering.
4. **`docs/agents/news-scout/flow/stage-signals.md` Legal Risk Signal Dispatch, Step 1:** add the escalation-exception clause from § 2.3 (tier-upgrade bypasses the 360m suppression), mirroring the existing 180-min gate's "materially different direction" exception already in the same file.
5. **`docs/data/system-map.json` `.project.channels[market].sender_rules.alert-commander`:** correct the text to include the existing CRITICAL override (`legal_risk`/`verified_chain`/`crisis_velocity` always fire) — documentation-sync only, no behavior change. Owned by PM/system-auditor per the file's `_maintained_by`; agent-father should flag it to them rather than hand-edit outside contract.
6. **Separate, non-blocking flag for PO/ops (not part of this brief's fix):** `docs/agent-memory/notebooks/alert-commander.md` is 5+ weeks stale (last entry 2026-05-25) against today (2026-07-03) — verify the `*/15 2-8 * * 1-5` alert-commander cron is actually live before assuming its existing CRITICAL-override path is a working backstop.

## 4. Acceptance criteria

- AC1: A `legal_risk` signal with `riskType=prosecution` on a ticker NOT in `.project.watchlist` produces a market-wide section in the next CHEF dish (Morning/EOD/Evening) within one dish cycle of the signal's `created_at`.
- AC2: The same signal, if still within its 360m TTL at the next scheduled fb-market-poster run, appears in that day's FB post's "Legal risk" section, tagged as market-wide (not attributed to a watchlist ticker).
- AC3: A `legal_risk` signal at `riskType=investigation` (0.70 tier) on a non-watchlist ticker does NOT trigger the override path (noise guard negative test).
- AC4: A signal already surfaced market-wide by CHEF is not re-narrated verbatim by fb-market-poster or a later CHEF dish inside the same TTL window — dedup marker present.
- AC5: **PNJ #8371 replay** — given the exact news-scout evidence (c115/c116, `legal_risk` PNJ prosecution, confidence=0.95, ttl=360m), the redesigned flow produces: (a) CHEF's next dish (within the 360m window from 2026-07-03 c116) contains a market-wide PNJ paragraph; (b) that day's FB post contains a PNJ legal-risk line; (c) no duplicate/triple-fire across CHEF's 3 dishes for the same signal_id.
- AC6: chain_catalyst and crisis_velocity paths are verified unchanged (regression guard — § 2.1 items 3/4 require no code change, only a confirming test).

## 5. Dependencies / sequencing

Implement § 3.1 (shared skill) first, then wire CHEF (3.2) before fb-market-poster (3.3) — CHEF is primary. Item 3.4 (news-scout escalation exception) and 3.5 (system-map doc sync) are independent and can land in parallel. Item 6 (alert-commander cron liveness) should be raised as a separate PO-routed ops check, not bundled into this feature's DoD.
