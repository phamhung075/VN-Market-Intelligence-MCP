# PO triage 2026-07-20T05:26Z — chef-morning RAW-verify defect cluster.
# One-shot backlog mint + zone repair + mitigation signal. Applied via scripts/orch-apply.sh.
# Retained per dev-standards.md § Script Persistence (audit trail of the transform actually applied).

def NOW: "2026-07-20T05:26:06Z";
def SRC: "router RAW-verify of chef-morning 2026-07-20 dish (docs/data/unified-agent-synthesis-2026-07-20-morning.json); PO triage 2026-07-20T05:26Z";

# --- 1. Repair missing zone on the pre-existing frozen-macro-value owner row.
#        zone was "" / absent -> dev-team Step 3 rejects any batch carrying it.
.task_board.backlog |= map(
  if .id == "FIX-COMMODITY-WTI-DELTA-CORRUPT" and ((.zone // "") == "")
  then .zone = "apps/mcp-server/"
     | .note = ((.note // "") + " [PO 2026-07-20] zone was missing (batch-reject risk) -> apps/mcp-server/. SCOPE EXTENSION: usdVnd is frozen byte-identical at 26110 from 2026-07-17 evening through 2026-07-20T05:22Z (~57h, 10+ chef cycles) while gold and oil move in the same snapshots — same frozen-value class as I10 wti_crude_usd stuck $95.5. The I8 'oil/gold/usdVnd deltas null' item is confirmed still live (prevFetchedAt:null at 05:22Z). See FIX-USDVND-FROZEN-26110 for the FX-specific fetcher probe.")
  else . end
)

# --- 2. Mint triage rows.
| .task_board.backlog += [
  {
    id: "FIX-CHEF-L6-GOLD-FALSE-PREDICATE",
    title: "chef.md L6 gold check emits a literal that asserts its own precondition — 5 published dishes carry a numerically false 'gold >$4,300 active' claim",
    owner: "po",
    status: "BACKLOG",
    zone: "docs/agents/",
    type: "FIX",
    priority: "high",
    size: "S",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "ROOT CAUSE: docs/agents/unified-agent/flow/chef.md:307-309. Line 307 states the guard 'If gold price is >$4,300 AND gold is cited as a safe-haven/phase-override signal'; line 309 gives a verbatim copy-paste block whose text is 'gold >$4,300 active'. The guard condition and the emitted payload are THE SAME STRING, so an unevaluated guard is invisible in the output — the dish reads as though the threshold were tested. GROUND TRUTH: get_macro_snapshot 2026-07-20T05:22:14Z goldUsd=4022 (is_estimate=false, source_tier=1); 4022 is not >4300. The tool's own gold threshold is $2200. UNSOURCED: '4300' appears in NO file except chef.md — docs/standards/tnb-methodology-valuation.md, the doc chef.md cites for Layer 6, contains zero occurrences of 'gold' or '4300'. RECURRING (5x): 07-13 evening (4006.4), 07-17 intraday, 07-18 evening (4018.8), 07-19 evening (4018.8), 07-20 morning (4022) — none above 4300; 07-18 and 07-19 are self-contradicting, asserting '>$4,300 active' and 'nearing the 4100-4300 zone' in the same token. NOT incapacity: 07-13 morning and 07-14 evening evaluated it correctly ('gold $4,068 <$4,300 threshold — no drift check needed'). IRONY / CLASS: the check was itself AUTO-CURE c98 by tran-ngoc-bau to fix F-GOLD-THRESHOLD-BREACH — the cure shipped a false-claim generator. FIX: parameterize the template so a real value must be computed to fill it, exactly like the sibling c111 single-pillar template at chef.md:323 which interpolates <ticker> and <pillars_aligned_count>; and source or delete the $4,300 constant. AC: emitted token contains the live gold price and the comparison result; a dish with gold<threshold emits no active-drift token; audit the other AUTO-CURE literals in Step 6 for the same shape."
  },
  {
    id: "SPIKE-CTG-FALSE-PRESENCE-BLINDSPOT",
    title: "SPIKE: claim-truth-gate is directional — it catches false ABSENCE claims but passes false PRESENCE predicates; the gold >$4,300 token cleared a gate that nominally covers unified-agent/CHEF",
    owner: "po",
    status: "BACKLOG",
    zone: ".claude/skills/",
    type: "SPIKE",
    priority: "high",
    size: "M",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "QUESTION: why did a numerically falsifiable claim reach a published artifact through a gate that lists unified-agent/CHEF in scope? .claude/skills/claim-truth-gate/SKILL.md defines CCATO as 'an agent asserts absence/unavailability of a dimension its own authorized tool would populate, while the tool returns non-null data'. That predicate is ONE-DIRECTIONAL. 'gold >$4,300 active' asserts PRESENCE of a condition; the tool returns non-null gold=4022 which FALSIFIES it, but no absence-claim was made, so the negation lexicon never matches and the gate returns PASS. The gate is structurally incapable of catching this class. SCOPE: quantify how much published narrative is asserted-presence vs asserted-absence — if the former dominates, gate coverage is far lower than the 6-flow wiring implies. NOT the same as UC-CCA-P4 (which extends the EXISTING predicate to un-gated publishers; this is a NEW predicate for already-gated ones). Consider a numeric-comparison verifier: extract '<metric> <op> <literal>' patterns from post_body, re-probe the metric, evaluate. DELIVERABLE: findings doc + recommendation on whether to extend claim-tool-map.json or add a second engine. Timebox 120m. DEPENDS-AWARE: FIX-CHEF-L6-GOLD-FALSE-PREDICATE fixes the one instance; this asks whether the class is unbounded."
  },
  {
    id: "FIX-USDVND-FROZEN-26110",
    title: "usdVnd frozen byte-identical at 26110 for ~57h across 10+ cycles while labelled source_tier=1 / is_estimate=false — probe whether the FX leg of the Yahoo fetch is dead",
    owner: "po",
    status: "BACKLOG",
    zone: "apps/mcp-server/",
    type: "FIX",
    priority: "high",
    size: "M",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "EVIDENCE: usdVnd=26110 identical in every unified-agent cycle from 2026-07-17 evening (19:50Z) through live get_macro_snapshot 2026-07-20T05:22:14Z — ~57h, 10+ cycles. It DID move before that (07-16 26070 -> 07-17 morning 26060 -> 07-17 07:13 26090 -> 26110, then flat). Gold and oil move within the SAME snapshots over the same window (gold 4011.7/4030.2/4022; oil 90.24/90.38/90.28), so this is not a whole-snapshot freeze — it is FX-specific. LABEL vs BEHAVIOR: usdVnd_is_estimate=false, usdVnd_source_tier=1 (fresh, tier-1) while the value never moves. Note the snapshot ALSO carries top-level dataSource='estimate' and source_tier=4, directly contradicting the per-field tier-1 label — that label contradiction is already owned by FDA-7 and FU-MACRO-SNAPSHOT-TIER-WORSTOF; do not re-mint. PROBE: apps/mcp-server/src/infrastructure/fetchers/yahooFinance.ts:282,304 fetches SYMBOLS.usdVnd and falls back to 0 on rejection. Yahoo 'USDVND=X' is a thin/illiquid synthetic quote and may legitimately not tick — DISTINGUISH: (a) upstream genuinely static, (b) fetch failing and a cached/last-known value being served with a fresh label, (c) a fixture path (note fixtureUSDVnd=24500.0 exists in apps/macro-indicators/pkg/application/usecases.go — value does NOT match 26110, so that fixture is likely NOT the source; rule it out explicitly rather than assume). AC: name which of (a)/(b)/(c) holds with a raw upstream probe; if (b) or (c), the freshness label must degrade. DEDUP: the null-delta half (prevFetchedAt/usdVndDelta/goldUsdDelta/oilUsdDelta all null) is already owned by FIX-COMMODITY-WTI-DELTA-CORRUPT item I8 — this row is the frozen-VALUE half only."
  },
  {
    id: "FIX-USDVND-THRESHOLD-SSOT",
    title: "USD/VND threshold has three live values — 25000 (Go classifier), 25500 (mcp-server macroTools + cascade), 26500 (agent narrative, no code source); pick one SSOT",
    owner: "po",
    status: "BACKLOG",
    zone: "multi",
    type: "FIX",
    priority: "medium",
    size: "M",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "CONFIRMED IN CODE, three planes: (1) 25000 — apps/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier/macro_usdvnd_direction_classifier.go:34 BearishThreshold=25000.0, drives the get_macro_snapshot usdvnd signal string 'exceeds 25000 threshold'. (2) 25500 — apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:117-120 currencySignal, AND apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts (8+ rules keyed on the label 'usdVnd>25500'). (3) 26500 — asserted as 'resistance' in unified-agent-synthesis-2026-07-20-morning.json vn_macro_layer; grep finds NO code or doc source, so it is agent-invented. A 4th value appears in the 07-19 notebook entry ('26110 > 25500'). IMPACT: at the live rate 26110 all three currently agree on direction, which is exactly why this has stayed invisible — the divergence only bites between 25000 and 26500. AC: one named constant, both zones read it, the narrative layer cites it rather than inventing one; add a test asserting Go and TS agree. NOTE the agent-facing half — 'USD/VND 26110 (+0.4% vs threshold)' in the 07-20 notebook — is UNSOURCED PRECISION: usdVndDelta is null and prevFetchedAt is null in the live payload, so no delta exists to quote. Covered by FIX-USDVND-FROZEN-26110 + FIX-COMMODITY-WTI-DELTA-CORRUPT I8; the narrative rule ('never quote a delta the payload does not carry') belongs here."
  },
  {
    id: "SPIKE-KD-HEXAGRAM-MINUTE-INSTABILITY",
    title: "SPIKE: market hexagram flipped 15->16->15 within ~6 minutes on a static macro base, and its USD/VND axis reads exactly 0.00 — is the KD reading stable enough to publish?",
    owner: "po",
    status: "BACKLOG",
    zone: "apps/mcp-server/",
    type: "SPIKE",
    priority: "medium",
    size: "M",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "PROVENANCE — this row EXONERATES the agent, it is not a fabrication finding. Router saw a divergence (agent recorded 'que 15 Khiem, tieu cuc, 48%' at 05:17; router probed 05:20:15Z and 05:20:57Z and got 'Du (16) THUAN LOI 50%') and correctly withheld judgement. PO probed get_market_hexagram twice more, 05:22Z and 05:23Z: BOTH returned 'Que 15 Khiem, THUAN LOI, TIEU CUC, 52%'. Sequence is therefore Khiem(05:17) -> Du(05:20) -> Khiem(05:22,05:23). The tool IS time-varying at minute granularity, the agent's hexagram number, name and TIEU CUC signal are all corroborated by independent probe, and only the confidence drifted 48->52. NO fabrication row filed; the known KD-confab prior class does NOT apply here. THE ACTUAL QUESTION: a market-regime indicator that flips its headline hexagram inside ~3 minutes, and whose confidence wanders 48/50/52, while gold/oil/usdVnd are byte-static in the same window, is unstable on a base that is not moving. Only vnIndex is live (1754.38, delta -33.07). Also: the published hao vector is [-0.93, 0.00, 1.00, -1.00, 0.03, -1.00] where axis 2 is USD/VND and reads EXACTLY 0.00 — consistent with the frozen FX feed and null delta neutralizing that axis, i.e. FIX-USDVND-FROZEN-26110 propagates INTO the hexagram. DELIVERABLE: identify what varies between calls (changing-line 'Hao bien: 4' derivation? vnIndex tick? time seed?), decide whether a stability window or hysteresis is needed before this is published to MARKET, and confirm/refute the 0.00-axis coupling. Timebox 120m. DEPENDS: FIX-USDVND-FROZEN-26110."
  },
  {
    id: "CLEAN-CHEF-SYNTHESIS-TEXT-CORRUPTION",
    title: "Language-boundary breach in the published 07-20 morning synthesis: French and nonsense tokens inside causal_chains (one-off, not recurring)",
    owner: "po",
    status: "BACKLOG",
    zone: "docs/agents/",
    type: "CLEAN",
    priority: "medium",
    size: "S",
    created_at: NOW,
    created_by: "po",
    source: SRC,
    note: "docs/data/unified-agent-synthesis-2026-07-20-morning.json causal_chains[0] contains French 'malgre' plus non-words 'chubb', 'ce vao', 'bieng', 'ticuc', and bare 'to' where an arrow was intended. Violates the plain-Vietnamese output policy (feedback_market_report_plain_vietnamese, feedback_language_boundary). SCOPE — MEASURED, NOT ASSUMED: grep across ALL docs/data/unified-agent-synthesis-*.json returns exactly ONE file with these tokens, so this is a one-off generation defect, NOT a recurring class; priority is medium on that basis. The separate 'queh' for 'que' in the notebook is plain diacritic-stripping and appears in other cycles too — cosmetic, distinct from this garble. UNVERIFIED, DO NOT OVERCLAIM: causal_chains lives in the internal synthesis artifact. Whether this text reached the MARKET Telegram message was NOT verified — the MARKET post is composed as separate plain-VI prose. Establish user-visible impact before treating this as a public-facing incident. AC: a cheap lint on the synthesis JSON narrative fields (non-VN/non-EN token detector) so the next occurrence is caught at write time rather than by a router spot-check."
  }
]

# --- 3. Mitigation signal: stop the false gold token re-firing on the next chef cycle.
| .signal_queue.rows += [
  {
    id: "po-20260720T052606",
    ts: NOW,
    from: "po",
    to: "unified-agent",
    type: "methodology-flag",
    summary: "STOP pasting the literal gold >$4,300 L6 token — false in 5 dishes; compute the comparison from live gold instead",
    severity: "HIGH",
    status: "NEW",
    payload_ref: "docs/signals/po-20260720T052606Z.json"
  }
]

| ._updated_at = NOW
| ._updated_by = "po"
