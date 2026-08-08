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

---

## [Architect] Gate Placement Blueprint

**Zone:** `docs/agents/unified-agent/flow/` (agent-father — flow/knowledge-file edit authority) + `cross-service/` = `scripts/`, `.claude/skills/`, `docs/data/*.json` (developer, per `zone-detect` SKILL.md `scripts/` → `developer`). Multi-zone — PM to split into 2 subtasks.

**BUILD-STANDARD: not-applicable** — bug-fix-shaped deterministic-gate addition mirroring an already-shipped in-repo pattern (AF-1/AF-2/AF-3 in this same file, claim-truth-gate/narrative-truth-gate.sh engine); no new service, no new feature domain.

### Independent verification (router asked me not to trust the relay)

1. `macroTools.ts:125` = `if (usdVnd > 25500)` inside `currencySignal()`; `:118` = `if (refi < 4)` inside `policySignal()` (refinancing-rate, unrelated to FX). **Confirmed — PO's line-anchor correction is right.**
2. `grep -rn "26500|26_500" apps/ --include=*.ts"` → 0 hits. Same-shape control `25500|25_500` → 32 hits. **Confirmed exactly as PO stated.**
3. **New finding, not in the relay — corrects a load-bearing sub-claim in the ratification.** `macroTools.ts`'s `currencySignal()`/`oilSignal()`/`goldSignal()`/`policySignal()` (L97-129) are **dead code** — each name greps to exactly one line in the file (its own definition), never called. The file's own header (L4-17) confirms why: `get_macro_snapshot`'s handler now routes through `buildMacroSnapshotText()` (`macroSnapshotText.ts`), a fully generic key/value renderer over the raw macro-indicators HTTP response with **zero threshold logic of its own** — plus `registerMacroTools()` calling the Go microservice directly (port 5004). So `currencySignal()`'s "usdVnd > 25500" text does **not** ship into MARKET narrative — PO's ratification overstated this half. It doesn't change the SSOT **value** decision: `macroAdjustments.ts`'s 8 cascade rules (L111-134, L209-238) ARE live — `cascadeEngine.ts` imports them, and `usdVndMarket` is genuinely populated at runtime (`pollNews.ts:1171`, `runImpactChain.ts:152`, both `commodity.value?.usdVndRate`). 25,500 remains the only candidate with real production-code backing anywhere in the repo; only the *why* needed correcting. Also traced: chef-dish.md Step 1.5's actual live source, `MACRO_HEALTH.fx` (`.claude/skills/macro-health-read/SKILL.md` Step 5), is **direction-only** (`APPRECIATING|STABLE|DEPRECIATING`, no absolute level) — confirms the row's own root-cause note ("FX is direction-only... no hardcoded constant exists") and confirms the real drift mechanism is exactly tnb c112's diagnosis: CHEF narrates a number from the *flow-doc's own instruction text* (Step 2/3, fixed by §1c) or free-associates one, not from any live tool computation. This is why a text-vs-registry citation gate (not a tool-reprobe gate like claim-truth-gate) is the right mechanism — confirms BA's design choice.
4. **Adjacent finding (not this task's scope, flag only):** the repo's own `oil` thresholds already disagree with each other — `macroTools.ts` `oilSignal()` (dead) uses >90/<70 (Brent, CAO/THẤP), `macroAdjustments.ts` (live) uses >100 ("severe oil crisis"). Same reconciliation-gap shape as USD/VND before this fix. Recommend NOT adding `oil` to the registry this pass (agrees with BA §2c) and flag as a candidate follow-up row for PO — do not silently fold into this fix's scope.

### Design 1 — Rule AF-4 (primary, `chef-dish.md` Step 6.7)

Insert immediately after L339 (`**Signal:** Script fires \`narrative_contradiction\`...`), before the `---` at L341 — same file, one more numbered rule beside AF-1/AF-2/AF-3, exact mirror of AF-3's structure/exit-code shape:

```markdown
### Rule AF-4 — Macro-Threshold Numeric-Literal Gate (SSOT-citation + comparator-arithmetic — run before send_telegram)

→ skill: `.claude/skills/macro-threshold-gate/SKILL.md`

Before constructing EITHER Block A or Block B `send_telegram` call, invoke the macro-threshold-gate
on the composed narrative to detect numeric-literal drift on any macro-threshold citation (USD/VND,
gold — metric-agnostic, registry-driven; `oil` deferred, see registry `_meta.oil_deferred`).

Invoke (choose Block A or Block B text accordingly):
```
GATE_EXIT = skill `.claude/skills/macro-threshold-gate/SKILL.md`
  post_body = <composed Block A or Block B text>
  agent_id  = "unified-agent"
```

**Exit-code handling:**
- `0` = PASS → proceed to `send_telegram` call(s). (A `[NOTE] metric_not_in_registry ...` line, if printed, is not a FAIL — copy it into the Block B WORK message per EC-2, do not silently drop it.)
- `1` = FAIL — cited threshold or comparator-arithmetic diverges from `docs/data/macro-threshold-registry.json`; signal emitted to `po`. Self-correct (no external tool call needed — this is a static registry lookup, unlike AF-3's live re-probe):
  1. Read stdout: `[FAIL] metric=... cited=... canonical=... claim="..."`
  2. Rewrite the offending sentence using the registry's canonical value (or correct comparator direction).
  3. Re-run this skill with corrected text.
  4. Second-pass PASS → proceed to `send_telegram`.
  5. Second-pass FAIL (`po_ruling_q1_20260808T113305`) — SENTENCE-SCOPED STRIP, not a dish-scoped block: (a) remove the offending numeral/threshold citation from the composed text entirely, (b) restate the same point in qualitative direction-only form (no numeral), (c) append `[AF-GATE: stripped unreconciled macro-threshold numeral — metric=<metric>]` to the Block B WORK message, (d) proceed to `send_telegram`. NEVER publish the un-reconciled numeral. NEVER suppress the whole dish — AF-4's offending span is always a single deletable numeral/clause (unlike AF-3's), so AF-3's "leave it in with an honest-gap note" half does NOT apply here.
- `2` = config-error (registry unreadable/misconfigured) → fail-loud: `send_telegram(channel="bug", message="[unified-agent] macro-threshold-gate CONFIG ERROR")` and EXIT.

**Signal:** Script fires `macro_threshold_drift` on FAIL (same `.signal_queue.rows[]` delivery mechanism `narrative_contradiction` already uses via `scripts/orch-apply.sh`, `to:"po"` — do not build a second signal path). Do NOT suppress it.
```

### Design 2 — Step 7.6 secondary check (defense-in-depth)

Insert after L653 (`- \`quality_verdict\` and \`layers_walked_summary\`...`), before `**Write tool call (single atomic write):**` at L655/656 — runs on the composed-in-memory JSON, before the single `Write` call (mirrors this file's own AC-3 "compose in memory, one write" discipline, no second write):

```markdown
**Macro-Threshold Secondary Validation (defense-in-depth, FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE)**

Before the Write call below, run the SAME gate used in Step 6.7 Rule AF-4 against the composed-in-memory
JSON's narrative fields — not a substitute for AF-4 (already ran pre-publish); exists because Step 7.6's
`tnb_synthesis.*` is an independently-composed excerpt, not guaranteed byte-identical to Block A/B, and
feeds frontend/downstream consumers per this step's own purpose statement.

```
GATE_EXIT = skill `.claude/skills/macro-threshold-gate/SKILL.md`
  post_body = tnb_synthesis.us_macro_layer + "\n" + tnb_synthesis.vn_macro_layer + "\n" + join(known_gaps, "\n")
  agent_id  = "unified-agent"
```

- `0` PASS → `metadata.macro_threshold_gate = "pass"`, proceed to Write unchanged.
- `1` FAIL → apply the SAME sentence-scoped strip as Step 6.7 Rule AF-4 directly to the in-memory JSON
  field(s) before Write. Do NOT re-run Step 7's `send_telegram` (already published) — this only corrects
  the persisted record. `metadata.macro_threshold_gate = "corrected"`. The `macro_threshold_drift` signal
  already fires from the script — no second signal path.
- `2` config-error → `send_telegram(channel="bug", message="[unified-agent] macro-threshold-gate CONFIG ERROR (Step 7.6)")`. Do NOT abort the dish cycle here — Step 8's notebook/commit is mandatory (AC-3 settled-write invariant) and the dish already published; write the JSON with `metadata.macro_threshold_gate = "config_error"` and continue to Step 8.
```
Add `"macro_threshold_gate": "pass|corrected|config_error"` to the `metadata` object in the Step 7.6 JSON schema (after `layers_walked_summary`, L585).

### Design 3 — `docs/data/macro-threshold-registry.json` (final, replaces BA §2c's illustrative shape)

Refines BA's shape with 3 architect-level additions the script needs: (a) `aliases` per metric (BA's shape had no way to *locate* a metric mention in free text), (b) `historical_context_markers` (closes BA's open EC-1 risk — a temporal-context guard, same lexicon-in-data pattern as the comparator lists, not resolved by BA), (c) `number_format` per metric — **VND thresholds use BOTH `.` and `,` as thousands separators with no decimal (NFR-5)**, but **USD thresholds use `,` thousands + `.` decimal** (the gold example is literally `$4,052.50`) — a single universal separator-strip rule would mis-parse one of the two; this field disambiguates per-metric at parse time.

```json
{
  "version": "1",
  "_meta": {
    "purpose": "SSOT for the macro-threshold numeric-literal gate (FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE). scripts/macro-threshold-gate.sh reads ALL metrics/thresholds/comparators/lexicon/separator-conventions from THIS file at runtime — mirrors docs/data/claim-tool-map.json's SSOT-data-file pattern. ZERO metric/threshold/comparator literals in the shell script.",
    "coupled_task": "FIX-USDVND-THRESHOLD-SSOT (backlog, still undecided) — if that row changes the production usd_vnd constant or its shape, this entry must be updated in the SAME change.",
    "po_ratification": "po_goahead_20260808T113305 / po_ruling_q1_20260808T113305 on FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE. usd_vnd.source corrected by architect (2026-08-08): macroTools.ts:125 anchor is right, but currencySignal() there is dead code, never called — the genuinely live evidence is macroAdjustments.ts's 8 cascade rules (cascadeEngine.ts-imported, fed live usdVndMarket from pollNews.ts/runImpactChain.ts). Value 25500 unchanged by this correction.",
    "oil_deferred": "oil intentionally NOT added this pass — the repo's own oil thresholds already disagree (macroTools.ts oilSignal(): >90/<70, dead code; macroAdjustments.ts: >100, live) — same reconciliation-gap shape as usd_vnd/gold pre-fix. Flag as a candidate follow-up row; do not silently resolve here."
  },
  "crossing_comparators": { "en": ["exceeds", "above", "breach above", "crossed", "broke above"], "vi": ["vượt", "vượt mốc", "phá vỡ", "trên"] },
  "neutral_comparators":  { "en": ["vs", "near", "level"], "vi": ["so với", "gần", "mức"] },
  "historical_context_markers": { "en": ["back in", "historically", "previously reached"], "vi": ["hồi", "đã có lúc", "từng chạm", "năm ngoái", "trước đây"] },
  "metrics": {
    "usd_vnd": {
      "unit": "VND",
      "number_format": "thousands_only",
      "value": 25500,
      "comparator": "gt",
      "aliases": ["USD/VND", "USD-VND", "tỷ giá", "tỷ giá USD/VND", "tỷ giá USDVND"],
      "source": "apps/mcp-server/src/domain/services/cascade/macroAdjustments.ts:111-134,209-238 (8 live cascade rules, cascadeEngine.ts-imported, fed live usdVndMarket) — NOT macroTools.ts:125 currencySignal(), confirmed dead code, see _meta.po_ratification"
    },
    "gold_usd": {
      "unit": "USD/oz",
      "number_format": "comma_thousands_dot_decimal",
      "value": 4300,
      "comparator": "gt",
      "aliases": ["gold", "vàng", "XAU"],
      "source": "docs/agents/unified-agent/flow/chef-dish.md Step 6, AUTO-CURE c98"
    }
  }
}
```

### Design 4 — `scripts/macro-threshold-gate.sh` contract (architect designs, developer implements — NOT authored here)

Mirrors `scripts/narrative-truth-gate.sh`'s exit-code + signal-emission conventions, but **simpler**: pure text/arithmetic, no MCP gateway re-probe (no network dependency, no "No-Bash cowork subagent" gateway-availability caveat — Bash-availability caveat from `claim-truth-gate/SKILL.md` still applies, mirror its probe-don't-inherit note verbatim).

- **CLI:** `bash scripts/macro-threshold-gate.sh <text-file|-> <agent_id>` — 2 required args, no cache arg (nothing to cache; static registry lookup).
- **Algorithm (per metric in registry, per alias match in text):** locate each `aliases[]` occurrence → scan a bounded window (~80 chars) around it for (1) a `historical_context_markers` hit → skip this occurrence entirely (informational only, EC-1); (2) a comparator word from `crossing_comparators`/`neutral_comparators`; (3) 1-2 numeric tokens, parsed per that metric's `number_format` (thousands_only: strip both `.`/`,`; comma_thousands_dot_decimal: strip `,` only, keep `.` as decimal). Two numbers found near a crossing comparator → (observed, threshold) pair, run BOTH sub-checks. One number found → SSOT-citation check only (nothing to arithmetic-check against). Neutral comparator → SSOT-citation check only, never arithmetic (NFR-3/EC-4).
- **EC-2 unregistered metric:** a numeric-threshold-shaped citation whose keyword matches no registry alias → print `[NOTE] metric_not_in_registry metric="<matched text>" claim="..."`, exit 0 contribution (not a FAIL — nothing to check against — but never silently absorbed either; AF-4 instructs the calling flow to log it).
- **Exit codes:** `0` PASS (or nothing to check) · `1` FAIL — `[FAIL] metric=... cited=... canonical=... claim="..."` per BA §2e · `2` config-error (missing args, missing/malformed `macro-threshold-registry.json`, unreadable input file).
- **Signal emit on FAIL:** append `macro_threshold_drift` row to `.signal_queue.rows[]` via `scripts/orch-apply.sh`, `to:"po"` — same jq-merge block shape as `narrative-truth-gate.sh` L397-452 (reuse verbatim, swap payload fields to `{agent_id, metric, cited, canonical, comparator, claim_text}`). `NTG`-style env escape hatch for tests: `MTG_SKIP_SIGNAL_EMIT=1`.
- **Test file:** `scripts/test-macro-threshold-gate.sh`, mirrors `scripts/test-narrative-truth-gate.sh`'s DoD-harness shape. Minimum cases: (a) "USD/VND 26,130 exceeds 26,500" → FAIL (SSOT-citation, cited≠25500); (b) "USD/VND 24,800 exceeds 25,500" → FAIL (comparator-arithmetic, correct cited value but false claim — proves the 2 sub-checks are independent); (c) gold "breach above $2,200" (SSOT-citation, cited≠4300) → FAIL; (d) gold "near $4,300" → PASS (negative control, neutral comparator, NFR-3); (e) "tỷ giá đã có lúc chạm mốc 25,000 hồi 2023" → PASS (EC-1 historical guard); (f) `26.500` (VN dot-thousands) and `26,500` parse identically for `usd_vnd` (NFR-5); (g) oil citation with a number → `[NOTE] metric_not_in_registry`, exit 0 (EC-2); (h) determinism — identical input → identical verdict across repeated runs.

### Design 5 — `.claude/skills/macro-threshold-gate/SKILL.md` (architect designs, developer implements)

Mirrors `claim-truth-gate/SKILL.md`'s invocation-contract shape (Purpose / Engine-SSOT-pointer / Invocation contract table `post_body`+`agent_id` / exit-code table / self-correct protocol / smoke-test pointer / "Not this skill's job" pointer table routing lexicon-edits to the registry and engine-edits to the script). Key divergences from claim-truth-gate to carry over explicitly: (1) no `cache` input (nothing to cache), (2) no "Time-sensitivity override" section — CHEF is non-real-time and has no override, per `po_ruling_q1_20260808T113305`; the SENTENCE-SCOPED STRIP *is* this gate's only persistent-FAIL path, document it in place of that section, (3) self-correct step 1 is "rewrite from the registry value" not "re-call a tool" (no MCP call in this engine at all).

### File-by-file fan-out (for PM)

**agent-father** (flow/knowledge-file edit authority, one combined pass on `chef-dish.md` per BA's own note):
- `docs/agents/unified-agent/flow/chef-dish.md:52,69,371,467-469` (BA §1c textual reconciliation, verbatim before/after already specified there)
- `docs/agents/unified-agent/flow/chef-dish.md` new Rule AF-4 (Design 1 above) + Step 7.6 secondary-check insert (Design 2 above)
- `docs/standards/tnb-methodology-layers.md:21`, `docs/agents/tran-ngoc-bau/flow/main.md:87`, `docs/agents/tran-ngoc-bau/flow/audit-methodology.md:12` (BA §1c, unchanged)

**developer** (cross-service specialist per `zone-detect`; precedent: `claim-truth-gate/SKILL.md` + `narrative-truth-gate.sh` + `claim-tool-map.json` were built as one engineering unit, CCATO-T1→T2, not split across agent types — same precedent applied here):
- `docs/data/macro-threshold-registry.json` (new, Design 3 content above, verbatim)
- `scripts/macro-threshold-gate.sh` (new, Design 4 contract above)
- `scripts/test-macro-threshold-gate.sh` (new, Design 4 test cases above)
- `.claude/skills/macro-threshold-gate/SKILL.md` (new, Design 5 outline above)

**Sequencing:** developer's artifacts (registry+script+skill) must land BEFORE agent-father wires Rule AF-4 into `chef-dish.md` — the flow-doc edit references a skill/script that must exist first, or the next CHEF cycle fails on a missing-file `2`-exit. PM should sequence the two subtasks with that dependency, not parallelize them.

### Risk flags

- **Dead-code cleanup, out of scope:** `macroTools.ts` L97-129 (`oilSignal`/`goldSignal`/`policySignal`/`currencySignal`) is fully unreferenced. Not actioned here (not this task's file/scope) — candidate for `code-janitor`.
- **oil reconciliation gap** — flagged above (Independent verification #4), candidate follow-up PO row, same shape as `FIX-USDVND-THRESHOLD-SSOT`.
- **Sequencing dependency** (above) — a real footgun if PM parallelizes the two subtasks instead of sequencing them.
- **No DDD violation:** all 3 new artifacts are cross-service infra (script+data+skill), zero `apps/*` domain-layer touch; the only `apps/mcp-server` files this cycle *read* (not modified) are `macroTools.ts`/`macroAdjustments.ts`, explicitly read-only per BA §6 — confirmed, no edit proposed to either.

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
