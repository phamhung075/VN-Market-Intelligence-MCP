# BA Spec — FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE

**Agent:** ba · **Date:** 2026-08-08 · **Task:** FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE (P3, plan_only, supervised)
**Blockers for PO:** ONE (§4 Q1) — a publish-block risk-tolerance call, not a technical question.

---

## 0. Duplication check (mandatory per dispatch instruction)

`FIX-USDVND-THRESHOLD-SSOT` (backlog[], owner=po) exists and is **still open/undecided** — PO's own `po_saturation_evidence_20260725T1625` annotation explicitly states *"po did not choose among these [a/b/c redesign options]"*. That row owns a **different, broader** question: unifying the *production signal-computation constant* across `apps/macro-indicators` (Go, 25000/23000 bull-bear band) and `apps/mcp-server` (TS, 25500), **and** whether a fixed absolute VND level is even the right shape long-term (relative/z-score vs. policy-anchor vs. delete-the-branches). **Not duplicated here.** This spec answers a narrower, resolvable-now question instead: *what number should the TNB audit docs and CHEF's own narrative cite as "the" FX carry/resistance threshold*, so a deterministic citation-gate has something unambiguous to assert against. §1 explains why these are legitimately separable and flags the coupling risk (NFR-4) rather than ignoring it.

---

## 1. PREREQUISITE — SSOT Reconciliation (evidence-based, not asserted)

### 1a. Full site survey (live-verified this cycle)

| Site | Cites | Basis |
|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:118` `currencySignal()` | **25500** | Live code, read this cycle: `if (usdVnd > 25500)` |
| `apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts` (8 cascade-rule sites: L111-134, L209-238) | **25500** | Live code, read this cycle: every `label: "usdVnd>25500"` / `ctx.usdVndMarket > 25500` |
| `docs/standards/market-analysis.md:54,66` | **25,500** | Doc, consistent with the code above |
| `apps/macro-indicators/pkg/primitive/macro_usdvnd_direction_classifier.go:34,37` | **25000** (Bearish) / 23000 (Bullish) | Separate Go microservice — feeds `get_macro_snapshot()`'s raw narrative string (`"USDVND at 26130 exceeds 25000 threshold"`, tnb c118 live capture 2026-07-24) — owned by `FIX-USDVND-THRESHOLD-SSOT`, not reconciled here |
| `docs/standards/tnb-methodology-layers.md:12` (Layer 1) | 25500 | Consistent with code |
| `docs/standards/tnb-methodology-layers.md:21` (Layer 3) | **26500** ("break") | **No code source anywhere in the repo** — confirmed by `FIX-USDVND-THRESHOLD-SSOT`'s own grep (2026-07-20) and re-confirmed this cycle |
| `docs/agents/tran-ngoc-bau/flow/main.md:85` (Layer 1) | 25500 | Inherits tnb-methodology-layers.md L12 verbatim |
| `docs/agents/tran-ngoc-bau/flow/main.md:87` (Layer 3) | **26500** | Inherits tnb-methodology-layers.md L21 verbatim — same unsourced value |
| `docs/agents/tran-ngoc-bau/flow/audit-methodology.md:12` (row B, explicitly labeled "Layer 1.2") | **26500** | **Self-contradicts its own cited source** — Layer 1.2 (per tnb-methodology-layers.md's own Layer-1 definition) is 25500; this row copied the Layer-3 value instead |
| `docs/agents/unified-agent/flow/chef-dish.md:52` (Step 2, Layer 1 crossing-check) | "25,500 or 26,500" | Mixes the correct value with the unsourced one |
| `docs/agents/unified-agent/flow/chef-dish.md:69` (Step 3, Layer 3 "level") | **26,500** | Unsourced value, cited as authoritative |
| `docs/agents/unified-agent/flow/chef-dish.md:371` (Block A worked example) | **26,500** | Unsourced value baked into the MARKET-message *template example* — plausible drift vector: the model imitates this exact sentence shape |
| `docs/agents/unified-agent/flow/chef-dish.md:467-469` (Step 7.5 sub-check c comment) | **26,500** | Unsourced value, gates `QUALITY_VERDICT` |

**Prior art already surfaced this exact 3-way (now 4-way, counting the Go service) split**: `docs/handoffs/tnb-audit-supplementary-2026-07-24.md` § "USD/VND canonical threshold is 3-way inconsistent" (tnb c118, 2026-07-24) and `docs/agent-memory/notebooks/tran-ngoc-bau.md` (4th+ occurrence, still `PERSISTING` as of c124, 2026-08-07). This spec is the reconciliation that finding explicitly requested ("This needs one canonical value chosen by PO/architect across code + docs... Recommend minting a ticket to reconcile" — the ticket it recommended is this one).

### 1b. Reconciled SSOT (for TNB-doc / CHEF-narrative citation purposes)

**25,500 VND.**

Rationale:
1. It is the **only** candidate with live, multi-site production code backing that CHEF's own upstream pipeline actually sits on top of (`macroTools.ts` + 8 `macroAdjustments.ts` cascade rules, both `apps/mcp-server` — the same service CHEF's `MACRO_HEALTH`/cascade context derives from).
2. It already matches `market-analysis.md`, the doc `chef-dish.md` Step 6's own gap-catalogue explicitly points to.
3. It is **already** what `tnb-methodology-layers.md` Layer 1 and `main.md` Layer 1 correctly cite — reconciliation is a matter of fixing the outlier citations (Layer 3 in both docs, `audit-methodology.md`'s Layer-1.2 mislabel, and `chef-dish.md`'s four 26,500 sites), not inventing a new number.
4. 26,500 has **zero code source anywhere in this repository** — structurally the same defect class as the already-diagnosed "25,000 narrative drift toward a historically-familiar round number" (tnb c112) that opened this whole task family: a number with no computational basis that propagated purely through doc-copy inheritance (tnb-methodology-layers.md → main.md → chef-dish.md) until it looked authoritative.
5. **Explicitly out of scope, not silently resolved:** the Go microservice's 25000/23000 band and the redesign-shape question (relative vs. absolute threshold) stay with `FIX-USDVND-THRESHOLD-SSOT` — see NFR-4 for the coupling risk this creates.

### 1c. Required edits (exact, for whoever executes — BA is not authorized to make these; see §6)

| File:Line | Before | After |
|---|---|---|
| `docs/standards/tnb-methodology-layers.md:21` | `Variables: USD/VND (26500 break), CPI, FX reserves.` | `Variables: USD/VND (25500 break), CPI, FX reserves.` |
| `docs/agents/tran-ngoc-bau/flow/main.md:87` | `VN macro stack (USD/VND vs 26500, CPI trend, FX reserves via VIRA)` | `VN macro stack (USD/VND vs 25500, CPI trend, FX reserves via VIRA)` |
| `docs/agents/tran-ngoc-bau/flow/audit-methodology.md:12` | `USD/VND ↔ 26500` | `USD/VND ↔ 25500` |
| `docs/agents/unified-agent/flow/chef-dish.md:52` | `USD/VND crossing 25,500 or 26,500 resistance` | `USD/VND crossing 25,500 threshold` |
| `docs/agents/unified-agent/flow/chef-dish.md:69` | `USD/VND vs 26,500 level (carry posture) — source: MACRO_HEALTH.fx` | `USD/VND vs 25,500 level (carry posture) — source: MACRO_HEALTH.fx` |
| `docs/agents/unified-agent/flow/chef-dish.md:371` | `"Theo dõi mức kháng cự 26,500 VND/USD trong phiên ngày mai"` | `"Theo dõi mức kháng cự 25,500 VND/USD trong phiên ngày mai"` |
| `docs/agents/unified-agent/flow/chef-dish.md:467-469` | `...USD/VND vs 26,500 (source: MACRO_HEALTH.fx)...` | `...USD/VND vs 25,500 (source: MACRO_HEALTH.fx)...` |

**Not this spec's edit to make** — `docs/agents/tran-ngoc-bau/flow/main.md:85` and `tnb-methodology-layers.md:12` (both already correctly 25500) are unchanged.

---

## 2. Deterministic Gate Design (the actual FIX — "not more prose")

### 2a. Why doc reconciliation alone is insufficient

The live evidence contains **two independent failure modes**, not one:

| Example (from `unified-agent-synthesis-2026-07-24-eod.json`, RAW-read this cycle) | Failure mode |
|---|---|
| `vn_macro_layer`: *"USD/VND 26,130 exceeds 26,500 carry threshold"* | Cited threshold (26,500) is the wrong/unsourced number — §1 fixes this **and** the claim is arithmetically false regardless: 26,130 is NOT > 26,500 |
| `us_macro_layer`: *"Gold $4,052.50 signals risk-off via threshold breach above $2,200"* | Cited threshold ($2,200) diverges from CHEF's own already-correct SSOT ($4,300, `chef-dish.md` Step 6, AUTO-CURE c98) — **pure narrative drift, unrelated to any doc bug** (chef-dish.md never said $2,200 anywhere) |
| `known_gaps[0]`: *"gold $4,052.50 near $4,300 threshold"* | Correct — cites the right value, uses a non-crossing comparator ("near"). Must NOT be flagged (negative-control case) |

Row 2 proves doc reconciliation (§1) does not, by itself, stop the model from drifting to a number that was **never in any doc** — the same mechanism tnb c112 already diagnosed for "25,000" also produced "$2,200" for gold, live, in a doc that was already correct. A deterministic **post-generation numeric check** is therefore load-bearing independent of §1, exactly as the row's own note says ("NOT more prose").

### 2b. Two sub-checks (metric-agnostic mechanism, per-metric data)

1. **SSOT-value citation check** — extract `(metric, cited_threshold)` pairs from the narrative; look up `metric` in a canonical registry; FAIL if `cited_threshold != registry_value`.
   - Catches the gold $2,200 example (row 2 above) even though its comparator claim is arithmetically self-consistent.
2. **Comparator-arithmetic check** — extract `(metric, observed_value, comparator, threshold_value)` triples; FAIL if the comparator claim does not arithmetically hold (e.g. `exceeds` requires `observed > threshold`).
   - Catches the USD/VND 26,130-vs-26,500 example even where the cited threshold matches SSOT.

Both checks are needed — neither alone catches both real examples (validated against all 3 rows above, including the negative control).

### 2c. Proposed registry (illustrative shape for architect — BA does not create this file, per boundary_rules)

`docs/data/macro-threshold-registry.json` (mirrors `docs/data/claim-tool-map.json`'s SSOT-data-file pattern — zero hardcode in the script):

```json
{
  "version": "1",
  "_meta": {
    "purpose": "SSOT for the macro-threshold numeric-literal gate. Metric-agnostic script reads ALL thresholds + comparator lexicon from this file at runtime.",
    "coupled_task": "FIX-USDVND-THRESHOLD-SSOT (backlog, still undecided) — if that row changes the production usd_vnd constant or its shape (absolute vs relative), this entry's value/shape must be updated in the SAME change, or this registry silently re-diverges from the code it is supposed to mirror."
  },
  "crossing_comparators": { "en": ["exceeds", "above", "breach above", "crossed", "broke above"], "vi": ["vượt", "vượt mốc", "phá vỡ", "trên"] },
  "neutral_comparators":  { "en": ["vs", "near", "level"], "vi": ["so với", "gần", "mức"] },
  "metrics": {
    "usd_vnd": { "unit": "VND", "value": 25500, "comparator": "gt", "source": "apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:118 + macroAdjustments.ts (8 cascade rules)" },
    "gold_usd": { "unit": "USD/oz", "value": 4300, "comparator": "gt", "source": "docs/agents/unified-agent/flow/chef-dish.md Step 6, AUTO-CURE c98" }
  }
}
```

Scope today: `usd_vnd` + `gold_usd` (both live-evidenced). `oil`/others are named in the row's "metric-agnostic" ask but have no evidenced live drift instance yet and no established SSOT value anywhere in the repo — adding them is a pure data-file addition later, not a script change (NFR-1), and should not block this fix.

### 2d. Gate placement — RECOMMENDATION (the row's "pick or recommend one" ask)

**Primary: publish-path check, styled after the existing `claim-truth-gate` / Rule AF-3 pattern — new Rule AF-4 in `chef-dish.md` Step 6.7, run on both Block A and Block B composed text before their respective `send_telegram` calls.**

**Secondary (defense-in-depth, not a substitute): also validate the Step 7.6 persisted JSON's `tnb_synthesis.us_macro_layer` / `vn_macro_layer` / `known_gaps[]` fields against the same registry after JSON composition.**

Why primary must be pre-publish, not JSON-only: `chef-dish.md`'s own step order sends both Telegram messages in **Step 7**, then runs the quality gate in **Step 7.5** and persists the JSON in **Step 7.6** — i.e. Step 7's `send_telegram` calls fire *before* the JSON that a "post-generation output lint" would inspect even exists. A JSON-only check would run structurally too late to prevent the stated harm ("ships wrong FX data to MARKET output") — it could only flag/correct the *stored record* after publication. The secondary check is still worth doing because Step 7.6 extracts `tnb_synthesis.*` as an independently-composed "excerpt" (Step 7.6 Implementation rules), not guaranteed byte-identical to Block A/B, and because the JSON feeds frontend/downstream consumers per its own docstring.

This is not an either/or per the row's framing — it is both candidates, ordered by which one actually blocks the harm.

### 2e. Self-correct / exit-code contract

Reuse the established shape (claim-truth-gate / Rule AF-3), for consistency with the one CHEF flow-readers already know:
- `0` PASS → proceed.
- `1` FAIL → `[FAIL] metric=... cited=... canonical=... claim="..."` on stdout; self-correct: rewrite using the registry's canonical value, re-run; 2nd-pass FAIL → see Blocker Q1 (§4) for whether CHEF publishes an honest-gap version or hard-blocks.
- `2` config-error → fail-loud to `bug` channel, do not treat as PASS.
- Signal on FAIL: new type (e.g. `macro_threshold_drift`) appended to `.signal_queue.rows[]` via `scripts/orch-apply.sh`, `to:"po"` — same delivery mechanism `narrative_contradiction` already uses, do not invent a second delivery path.

---

## 3. Functional Requirements + DDD Layer Mapping

| ID | Requirement | DDD Layer | Notes |
|---|---|---|---|
| FR-1 | Execute the 7 doc edits in §1c, reconciling all TNB/CHEF reference docs to 25,500 for the USD/VND carry/resistance threshold. | **Interface** (documentation-as-contract) | BA cannot execute — `chef-dish.md`/`main.md`/`tnb-methodology-layers.md`/`audit-methodology.md` are all flow/knowledge files, explicitly forbidden to BA (`boundary_rules.forbidden_outputs`). Route to `agent-father` (flow/doc-file edit authority). |
| FR-2 | Create `docs/data/macro-threshold-registry.json` (schema in §2c) as the SSOT the new gate script reads. | **Infrastructure** (new data store) | New file, no existing owner — architect assigns. |
| FR-3 | New deterministic check with the two sub-checks in §2b, dispatching purely off the registry file (no per-metric branches hardcoded in the script — NFR-1). | **Application** (orchestration: extract claims → registry lookup → arithmetic eval → PASS/FAIL/self-correct) | New mechanism — NOT an extension of `claim-truth-gate`'s CCATO/absence-claim engine (different claim shape: numeric-literal, not absence). Sibling skill, e.g. `.claude/skills/macro-threshold-gate/SKILL.md` + `scripts/macro-threshold-gate.sh`, mirroring `claim-truth-gate`'s invocation-contract shape for consistency, not its internals. |
| FR-4 | Wire the new check as Rule AF-4 in `chef-dish.md` Step 6.7, run on Block A + Block B text before Step 7's `send_telegram` calls (primary placement, §2d). | **Interface** (flow-doc wiring) | Route to `agent-father` (same reason as FR-1). |
| FR-5 | Secondary post-write validation of Step 7.6's `tnb_synthesis.*`/`known_gaps[]` against the same registry (defense-in-depth, §2d). | **Infrastructure/Application** | Can run inside Step 7.6 itself or as an independent script tran-ngoc-bau's audit flow also invokes — architect's call. |
| FR-6 | Self-correct protocol on FAIL (§2e): rewrite offending sentence with the canonical value, re-run, escalate per Blocker Q1's ruling on persistent 2nd-pass FAIL. | **Application** | Mirrors the already-ratified `claim-truth-gate` self-correct protocol. |
| FR-7 | Signal emission on FAIL: `macro_threshold_drift` row to `.signal_queue.rows[]` via `scripts/orch-apply.sh`, `to:"po"`, carrying metric/cited/canonical/dish-reference. | **Infrastructure** | Reuse the existing `narrative_contradiction` delivery mechanism — do not build a second signal path. |

---

## 4. Non-Functional Requirements + Blocker

- **NFR-1 (metric-agnostic, zero script hardcode):** adding `oil`/other metrics later must be a pure `macro-threshold-registry.json` addition — no script/skill-doc change. Same discipline `claim-tool-map.json` already enforces for CCATO.
- **NFR-2 (bilingual comparator lexicon in data, not code):** crossing vs. neutral comparators (§2c) must live in the registry file, matching `claim-tool-map.json`'s `negation_lexicon` precedent.
- **NFR-3 (no false-positive on the proven-correct case):** "near"/"gần"/"vs"/"so với" must NOT trigger the arithmetic sub-check — validated in §2a row 3 (the negative control) and needed because `chef-dish.md` Step 3's own template text legitimately uses "vs" for a neutral level-citation, not a breach claim.
- **NFR-4 (coupling risk, explicit not silent):** if `FIX-USDVND-THRESHOLD-SSOT` later changes the production `usd_vnd` constant or its shape (e.g. to a relative/z-score threshold per its own PO note's options a/b/c), the registry entry here + the §1c doc edits must be revisited in the same change, or this fix silently re-diverges from the code it mirrors. Flagged in the registry's own `_meta.coupled_task` (§2c) so it isn't lost.
- **NFR-5 (separator normalization):** the extraction regex must accept BOTH VN dot-thousands (`26.500`, live-observed in `get_unreviewed_market_messages` id=1016, "kháng cự 26.500") and comma-thousands (`26,500`) and bare (`26500`) forms as the same numeric value — do not build the extractor against only one convention.

**Blocker Q1 (only PO can answer):** should a persistent 2nd-pass FAIL ever let CHEF publish anyway (honest-gap text, same override pattern claim-truth-gate already gives real-time agents), or does the recurring-harm history here (4th+ occurrence, "ships wrong FX data to MARKET output" per the row itself) justify a stricter hard-block that CHEF's other gates don't currently have? **BA's recommendation:** default to the existing ratified contract — CHEF is already a "no override" agent under `claim-truth-gate` (persistent FAIL blocks the write entirely); apply the identical policy here for consistency rather than inventing a second risk posture for the same agent. PO only needs to confirm or veto this default.

---

## 5. Edge Cases

- **EC-1 (historical mention, not a live claim):** a dish citing "tỷ giá đã có lúc chạm mốc 25,000 hồi 2023" (VND's real 2023 media milestone, the root-cause anchor tnb c112 named) in explicitly past/historical framing must not be flagged as live drift. No temporal-context guard exists yet in this design — flagged as an open risk for architect, not resolved here.
- **EC-2 (unregistered metric):** a metric not yet in the registry (oil, DXY, …) cited with a threshold number must NOT silently PASS as "verified" — that would be a false green. Gate should emit an explicit `metric_not_in_registry` note, not a clean PASS.
- **EC-3 (same-doc, two different numbers, one matches SSOT):** exactly the gold $2,200-vs-$4,300 case (§2a). Gate must name which specific citation(s) mismatch in its `[FAIL] ...` line, not just flag "the document" generically.
- **EC-4 (comparator ambiguity):** "vs"/"so với" must resolve to `neutral_comparators`, never `crossing_comparators` — see NFR-3.
- **EC-5 (thousand-separator variance):** live-evidenced both forms in the corpus this cycle (`26.500` and `26,500`) — see NFR-5.

---

## 6. File-by-File Plan (concrete, for architect/agent-father/developer)

**Doc reconciliation (agent-father — flow/knowledge-file edit authority; §1c exact text):**
- `docs/standards/tnb-methodology-layers.md:21`
- `docs/agents/tran-ngoc-bau/flow/main.md:87`
- `docs/agents/tran-ngoc-bau/flow/audit-methodology.md:12`
- `docs/agents/unified-agent/flow/chef-dish.md:52,69,371,467-469`

**New infrastructure (architect designs, developer implements):**
- `docs/data/macro-threshold-registry.json` (new, schema §2c)
- `.claude/skills/macro-threshold-gate/SKILL.md` (new, mirrors `claim-truth-gate/SKILL.md`'s invocation-contract shape)
- `scripts/macro-threshold-gate.sh` (new, mirrors `scripts/narrative-truth-gate.sh`'s exit-code/signal-emission conventions)
- `docs/agents/unified-agent/flow/chef-dish.md` Step 6.7 — new Rule AF-4 (agent-father, same file already listed above for FR-1's edits — one combined edit pass, not two)

**Read for context, no change:**
- `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts:118`, `apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts` — confirm 25,500 stays the reference; do not touch (owned by `FIX-USDVND-THRESHOLD-SSOT` if it ever changes).
- `docs/handoffs/tnb-audit-supplementary-2026-07-24.md`, `docs/agent-memory/notebooks/tran-ngoc-bau.md` — prior-art evidence trail this spec resolves.

---

## 7. Verification Gate Mapping

Board `verification_gate`: *"A subsequent chef dish cites the reconciled canonical FX threshold value verbatim AND the deterministic gate flags/corrects an injected off-canon value; done_verified requires the '25,000' drift variant absent from MARKET output across a full audit cycle."*

| Requirement | Satisfied by |
|---|---|
| Subsequent dish cites 25,500 verbatim | §1c doc edits (FR-1/FR-4) — CHEF's instructions no longer contain 26,500 anywhere |
| Gate flags/corrects an injected off-canon value | FR-3 + FR-6 (SSOT-value check + self-correct), testable by injecting a synthetic "USD/VND ... exceeds 26,500" or "gold ... above $2,200" string and confirming FAIL + rewrite, mirroring `scripts/test-narrative-truth-gate.sh`'s DoD-harness pattern |
| "25,000" drift variant absent across a full audit cycle | tran-ngoc-bau's existing weekly audit (already tracking this as a Findings-Table row, 4th+ occurrence) — first cycle with FR-1+FR-3 both live should show the row drop off or resolve |

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-RELIABILITY-ba.md`, task_id `FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE`.

## RETURN
```
DONE: BA spec complete — SSOT reconciled to 25,500 (evidence-based, code-anchored, does not duplicate/preempt
      FIX-USDVND-THRESHOLD-SSOT's still-open production-constant-unification question), two-sub-check
      deterministic gate designed (SSOT-value + comparator-arithmetic), placement recommended (primary:
      pre-publish Step 6.7 Rule AF-4, styled after claim-truth-gate; secondary: Step 7.6 JSON post-write).
NEXT: architect | technical design for FR-2/FR-3/FR-5 (registry + script + skill), then fan out:
      agent-father executes FR-1/FR-4 (flow/doc edits — BA has no edit authority on these files),
      developer implements the script per architect's design.
HANDOFF: docs/handoffs/FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE-BA-spec.md
BLOCKER: Q1 (§4) — publish-block policy on persistent 2nd-pass FAIL. BA recommendation given; needs PO confirm/veto.
PIPELINE: continue
```
