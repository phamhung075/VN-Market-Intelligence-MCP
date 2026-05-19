# Architecture Brief — Data Fusion Gap (chef synthesis failure)

**Date:** 2026-05-19 | **Author:** agents-architect | **Task:** 1951e
**Slug:** data-fusion-gap | **For:** agent-father (implement), po (read)

---

## §1 — Symptom Catalog

### What dishes look like today

Evidence from the most recent observable chef output is the unified-agent notebook entry at
`docs/agent-memory/notebooks/unified-agent.md` line 18 (2026-05-18T04:08Z cycle):

> "Pillars: M2=✗ (no SBV money-supply data in cycle) COC=✓ (carry -33bp) EPS=✓ (FPT P&L -8.6% proxy; BCTC Q1 still overdue) POL=✗ (no legal/crisis signals fired) → 2/4. No BUY/SELL/HOLD recommendation issued."

This is the MARKET dish output in machine-readable form. It lists ingredients independently: M2 absent, COC present, EPS present via proxy, POL absent. No sentence in the log connects these four into a causal chain (e.g. "COC tight → EPS under pressure → hold thesis on X weakens").

Evidence from TNB audit c74 (`docs/handoffs/tnb-audit-latest.md` line 78):

> "unified-agent (chef): NEEDS_ATTENTION (5/9). D=PMI sub-components absent, E=VIRA absent, F=2/4 (M2+POL missing). Architecture-layer gaps."

The TNB score 5/9 with 2 architecture-layer gaps flagged every single cycle (c72, c73, c74) means the methodology gaps are structural — not data-availability accidents.

Concrete example of the ingredient-list pattern vs a cooked synthesis:

**Ingredient-list (actual):** "Regime=TIGHTENING. VCB +2.37% anomaly detected. Kinh Dịch Khôn(2) THAN_TRONG. PE 14.1 PREMIUM +57%."

**What a cooked synthesis would say:** "VCB's +2.37% spike (volume 1018% of avg, SOE inflow) is a divergence signal under TIGHTENING: price rising while earnings quality is flagged (OCF anomalous, ROE below sector median) and Kinh Dịch Khôn(2) signals caution. The move is short-term flow-driven, not fundamental. Pillar check: COC headwind (carry -33bp FII outflow risk), EPS uncertain (BCTC Q1 overdue), M2 unknown. Conviction: LOW — watch only, do not chase."

The difference: the cooked version names the contradiction (price up while fundamentals weak), names the cause (SOE inflow, not fundamentals), assigns conviction, and names what is missing. The current dish does not.

---

## §2 — Root Cause Analysis (ranked)

### Cause 1 — Signal transport mismatch: gatherers emit to MCP DB, not to docs/signals/ (HIGH IMPACT)

`chef.md` Step 0 (`docs/.claude/flows/unified-agent/chef.md` lines 50–63) reads:
```
docs/signals/*.json with mtime within last 24h
- price_anomaly_* — from market-watcher
- news_impact_*   — from news-scout
- bctc_signal_*   — from financial-analyst
- fundamental_*   — from report-analyzer
```

Actual inspection of `docs/signals/processed/` shows only `price_anomaly_*` files are physically written there. No `news_impact_*`, `bctc_signal_*`, or `fundamental_*` files exist. The financial-analyst notebook (line 42–43) confirms its signals are posted via `post_agent_signal()` MCP call to the alert-commander DB (signal IDs #3350, #3351, #3352). news-scout similarly writes `urgent_news` and `chain_catalyst` via MCP to the DB (IDs #3496–#3500 per `docs/agent-memory/notebooks/news-scout.md` line 5).

The chef's `get_agent_signals(hours=24)` call (chef.md line 62) CAN retrieve signals from the DB, but the Step 0 file-read loop for `bctc_signal_*` and `fundamental_*` finds nothing because those signal types are not materialized as files. The chef has two inputs: file-based (only price_anomaly works) and MCP-based (get_agent_signals returns all). This dual-path is never reconciled in the flow.

**Why it produces the symptom:** the CLUSTER step (Step 1) groups signals by ticker. If only price_anomaly file-based signals are consistently loaded, and news/BCTC signals arrive via a separate MCP path that may or may not have been called first, the cluster may miss the news+BCTC signals entirely, reducing multi-source convergence to single-source observation.

### Cause 2 — No cross-source canonical event model (HIGH IMPACT)

The price_anomaly schema (`docs/signals/processed/price_anomaly_20260519-0459.json`) has fields: `stock_code`, `move_pct`, `move_sigma`, `confidence`, `context.reason`, `context.sector_impact`. The financial-analyst fundamental_validation signal (inferred from notebook lines 42–43: "signal #3350 fundamental_validation VCB posted") has fields from the BCTC domain: EY_SPREAD, PE, ROE, earnings_quality_warn, pillar counts.

There is no canonical event model that maps these into a shared structure. No file named `event-model.md` exists anywhere in docs/. No skill in `.claude/skills/` defines "when you have price_anomaly + fundamental_validation for the same ticker, merge them as follows."

**Why it produces the symptom:** the chef receives structurally incompatible signal objects for the same ticker (VCB). Each has its own fields. Nothing in chef.md instructs: "join on ticker, then build a single ticker narrative from merged fields." Step 1 CLUSTER groups signals by ticker (chef.md lines 69–79) but that is just a count gate (≥2 distinct types). Passing the gate does not produce a merged object — it produces a list of signals. That list then flows through Steps 2–6 as separate items, so the dish ends up with separate paragraphs per signal type.

### Cause 3 — Causal chain step is prescribed but not enforced in WRITE DISH (MEDIUM IMPACT)

`docs/standards/market-analysis.md` lines 5–14 defines the 4-level cascade:
```
Level 1 (global macro) → Level 2 (VN macro) → Level 3 (sector) → Level 4 (ticker)
```

`chef.md` Step 3 (lines 108–120) encodes the US→VN carry/FII transmission. Step 4 (lines 122–138) requires all 4 pillars per ticker. These steps DEFINE what the chef should compute.

But Step 7 WRITE DISH (lines 168–188) specifies:
```
1. Regime context
2. Sector/ticker thesis — qualifying clusters, pillar alignment, convergence evidence cited
3. Kinh Dịch overlay
4. Action signal or watch
```

The WRITE DISH structure does not mandate a "causal chain sentence" connecting Level 1 → 2 → 3 → 4. Paragraph 2 asks for "clusters + pillar alignment" but does not require the agent to write "because Level 1 event X caused Level 2 outcome Y, which propagated to sector Z, ticker W is now in state Q." The specification is structural (list what you found per paragraph) not causal (explain how A caused B caused C).

**Why it produces the symptom:** an agent executing Step 7 correctly per spec will produce a structurally valid dish — regime paragraph, sector paragraph, Kinh Dịch paragraph, action paragraph — that reads exactly like the "ingredient list" the user describes. The spec does not require a single sentence showing the propagation chain.

### Cause 4 — Conviction formula is undefined for cross-source cases (MEDIUM IMPACT)

chef.md Step 4 (line 136) says: "All 4 aligned → high conviction. 2-3 aligned → medium conviction. <2 aligned → low conviction." But there is no formula for what happens when signals disagree across sources. Example for VCB: price_anomaly says "Buy on dip" (`docs/signals/processed/price_anomaly_20260518T1637.json` line 17), financial-analyst says "FAIR with earnings_quality_warn + PE PREMIUM not supported by ROE" (financial-analyst notebook lines 7–9). These contradict. The chef has no rule to arbitrate: price signal says buy, fundamental signal says valuation stretched.

The `market-analysis.md` impact scoring (lines 17–21) is an _input scoring_ framework, not a cross-source arbitration formula. There is no "when price signal and fundamental signal conflict → do X" decision rule in any flow, policy, or standard file.

**Why it produces the symptom:** when conviction formula is undefined for contradictions, the agent defaults to listing both signals independently (each in its own paragraph), which is precisely the ingredient-list output.

### Cause 5 — TNB D+E data gaps structurally block two of the six layers (LOWER IMPACT, DATA-SIDE)

TNB consistently flags (tnb-audit-latest.md lines 33 and 80): D=PMI sub-components absent, E=VIRA absent. These are architecture-layer gaps. PMI sub-components require a VPS scraper not yet built. VIRA is policy-blocked (only top-level available). These affect Layers 2 and 3 of the TNB 6-layer walk — the US/VN economic stack depth. When Layer 2 is shallow (no PMI sub-components) and Layer 3 is shallow (no VIRA detail), the macro→sector link in the causal cascade (market-analysis.md Level 1→2→3) cannot be fully populated.

**Why it produces the symptom:** a 6-layer walk with two layers structurally impoverished produces a partial narrative. The chef labels the gaps correctly (M2=✗, POL=✗) but cannot fill them, so the dish has structural holes that prevent causal chain completion.

---

## §3 — Promised vs Actual Cook Step

### What chef.md says

`chef.md` line 188: "No atom lists. No bullet-point ticker dumps. Every MARKET message is a narrative dish."

`chef.md` Step 7 (line 168): "2–4 narrative paragraphs in Vietnamese with full diacritics."

`chef.md` Step 1 (lines 71–79): convergence rule — ≥2 distinct signal types for same ticker = cluster qualifies. The spec implies that multi-source convergence on a ticker should produce a richer narrative.

`chef.md` Step 3 (line 120): "US → VN via carry/FII flow chain. If US tightening → FII net-sell pressure on VN → document the transmission."

### What the dishes show

From unified-agent notebook (line 18): "Pillars: M2=✗ COC=✓ EPS=✓ POL=✗ → 2/4." This is a pillar checklist, not a narrative. The corresponding MARKET message (not directly visible in logs but the notebook summary is a faithful abstract) would contain the regime context, a ticker block, and a Kinh Dịch line — but these are three separate observations, not a connected causal story.

The convergence rule passes a cluster when ≥2 signals exist, but nothing in Steps 2–6 mandates that the agent build a causal sentence LINKING those signals before writing the dish. Steps 2–6 are sequential passes (data discipline check, stack reads, pillar check, Kinh Dịch, gap catalogue) — each adds a column to the analysis table, but no step says "now write one sentence that connects these columns."

**The gap:** the chef executes six passes (Layers 1–6) and then writes four paragraphs. The six passes are analytic (check, verify, map, overlay, gap-scan) but never synthesizing (derive conclusion from the combination). Step 6 "gap catalogue" scans for what is missing but does not require the agent to produce a single integrative claim. The dish is the concatenation of six analytic outputs, not a synthesis.

---

## §4 — Fix Candidates (ranked by impact / effort)

### Fix A — Add a mandatory synthesis pass between Step 6 and Step 7 (HIGHEST IMPACT / LOW EFFORT)

**File to change:** `.claude/flows/unified-agent/chef.md` — insert a new step between Step 6 and Step 7.

**What it does:** force a named "SYNTHESIZE" step that requires the agent to write exactly ONE causal chain sentence per qualifying cluster before starting paragraph 2 of the dish. Template:

```
SYNTHESIZE — for each qualifying ticker cluster:
Write: "[Global event X] → [VN macro impact Y] → [sector effect Z] → [ticker W: price/valuation/flow state Q]"
This sentence MUST appear verbatim in paragraph 2 of the dish.
If the chain cannot be completed due to missing data, write the chain with explicit gaps:
"[Global: Brent $110 sustained] → [VN: oil_gas sector tailwind] → [PLX/GAS: +6.99%/+4.03%] → [Fundamental: no Q1 BCTC, Kinh Dịch bearish reversal signal] — conviction LOW, watch only."
```

This is one instruction change, no new agents, no new infrastructure. It turns the structural concatenation into a required causal sentence.

### Fix B — Materialize news and BCTC signals as file-drops in docs/signals/ (HIGHEST IMPACT / MEDIUM EFFORT)

**Files to change:**
- `.claude/flows/news-scout/` — add a Step N that writes `docs/signals/news_impact_<timestamp>.json` after each signal batch
- `.claude/flows/financial-analyst/` — add a Step N that writes `docs/signals/bctc_signal_<timestamp>.json` after each fundamental_validation

**Schema:** each file must carry `{ schema, ticker, signal_type, source_tier, key_fields: {...}, generated_at }` where `key_fields` is a normalized projection of the domain payload.

**Why needed:** chef.md Step 0 names these four file patterns as inputs. Only price_anomaly actually exists as files. Until news and BCTC are also materialized as files, the chef's file-read path is effectively single-source (market-watcher only) for the CLUSTER step.

**Alternative (lower effort):** remove the file-read pattern from Step 0 entirely and rely solely on `get_agent_signals(hours=24)` for all signal types. This concentrates gathering in one MCP call instead of mixing file + MCP paths. Simpler but requires verifying that get_agent_signals returns all signal types with enough context for Step 1 CLUSTER.

### Fix C — Define a canonical cross-source merger rule in a new standard (MEDIUM IMPACT / MEDIUM EFFORT)

**File to create:** `docs/standards/signal-fusion-rules.md` (new, ~60 lines)

**What it contains:**
- Canonical join key: `ticker` + `generated_at within 24h window`
- Conflict arbitration: when price_anomaly direction contradicts fundamental_validation valuation → label "divergence" and set conviction to LOW regardless of other factors
- Conviction formula for multi-source clusters: base on weakest-confidence signal (conservative), adjusted up only when all sources agree on direction
- Template sentence structure for the SYNTHESIZE step (Fix A above)

Reference this standard from chef.md Step 0 (knowledge lazy-load) and the new SYNTHESIZE step.

### Fix D — Upgrade WRITE DISH Step 7 to require explicit per-claim sourcing (MEDIUM IMPACT / LOW EFFORT)

**File to change:** `.claude/flows/unified-agent/chef.md` lines 168–188.

Add to paragraph 2 specification: "For each claim in the sector/ticker thesis paragraph, cite the signal ID or source tier. Example: 'VCB tăng +2.37% (price_anomaly_20260519-0459, Tier 2) trong bối cảnh định giá căng thẳng (fundamental_validation #3350, PE 14.1 vs median 9.0, Tier 3).' Claims without source citations are a flow violation."

This forces explicit multi-source weaving at the writing step and makes the dish auditable by TNB.

### Fix E — Add VCB (and any ticker with ≥2 signal types) as a mandatory fusion example in chef.md (LOW IMPACT / LOW EFFORT)

**File to change:** `.claude/flows/unified-agent/chef.md` — add a reference example in Step 7 commentary.

Show a worked example for VCB: price_anomaly + fundamental_validation + news_impact → what the synthesized paragraph looks like. This reduces hallucination risk where the agent reverts to bullet-list format when uncertain.

---

## §5 — What I Cannot Determine

1. **Whether chef actually reads `get_agent_signals` reliably.** The tool is listed in chef.md Step 0 (line 62) but no signal file in docs/signals/processed/ from financial-analyst or news-scout appears as a file — it is unknown whether the MCP call succeeds and whether its payload is rich enough for Step 1 CLUSTER. This requires live MCP observation or log evidence that TNB does not currently have (MCP unavailable in Claude Code, 20th cycle).

2. **Whether the MARKET dish text actually matches the notebook abstract.** The unified-agent notebook logs a pillar tally and cluster count, but the actual Vietnamese MARKET message sent via `send_telegram` is not preserved in docs/. Without reading the Telegram MARKET channel output, I cannot quote from a real dish. All symptom evidence is inferred from the notebook abstract and TNB audit scores.

3. **Whether fix B (file materialization) is feasible without changing agent-father's gating.** The news-scout and financial-analyst flows are not in scope for this brief. If those flows have constraints preventing file writes (tool package gaps — per the 1951b brief, financial-analyst package is severely incomplete), fix B depends on the 1951b agent-father actions landing first.

4. **Whether the conf=0.50 default on all signals (TNB finding #5 — tnb-audit-latest.md line 29) affects the chef's conviction scoring.** If `get_agent_signals` returns signals all at conf=0.50, the pillar alignment score in Step 4 will always compute as "medium conviction" regardless of actual evidence strength. The TNB-critic-gate brief (queued, not yet implemented) addresses this upstream; until it lands, fix A's SYNTHESIZE step should treat conf=0.50 signals as "uncertain source" and label them explicitly.

---

**Signal:** `docs/signals/agents-architect-1951e-data-fusion-brief.json`
**Next:** agent-father implements Fix A (SYNTHESIZE step) + Fix D (sourcing requirement in Step 7) as minimal viable improvement.
Fix B and Fix C are sprint-level tasks for po to scope.
