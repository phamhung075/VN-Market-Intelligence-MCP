# BA Spec — FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING

**Agent:** ba · **Date:** 2026-08-12 · **Task:** FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING (P0, occurrence_count=3, plan_only/supervised)
**Blockers for PO:** ONE (§5 Q1) — a publish-scope call, not a technical question. Does not block architect starting.

---

## 0. Duplication check (mandatory)

Live `task_board` grep for `CHEF` (2026-08-12): no other open row targets this exact defect.
`FIX-CHEF-STEP0-BCTC-PROCESSED-DIR-BLINDSPOT` (the WHERE-to-look auto-cure) and
`FIX-CHEF-STEP75-L3-BIZCTX-FLOOR` (the gate itself, c108) are both already landed and are named
explicitly DISTINCT by this row's own note. `FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION`
(`ready[]`) is **related but not duplicate** — see §4 NFR-4 for the coupling. Not duplicated here.

---

## 1. TRACE — where does GATHER→conviction_calls[] actually drop?

**Direct answer to the row's own question:** the drop is **not** at Step 5. Step 5 in the live file
(`chef-dish.md` L137-176, "LAYER 5 — Kinh Dịch overlay") calls `get_portfolio_conviction`, which is a
**distinct live TA/hexagram data source with zero relationship to `bctc_signal_*`/`fundamental_*`**
(confirmed by the file's own inline note, `chef-dish.md:166-168`, citing memory
`feedback_chef_kinhdich_confab`). There is no "portfolio_conviction merge" step that touches business
context at all — the row's own step-numbering hypothesis (4=thesis build / 5=portfolio_conviction
merge / 6=per-ticker rationale) does not match the file's real step semantics; this is itself a useful
finding, not just a correction.

**The real drop has three compounding points, primarily at Step 4:**

1. **Step 0 GATHER (`chef.md` L146-157) never names a session variable for what it collects.** Every
   OTHER downstream data source in this same flow that survives to Steps 4-7 does so via an explicit
   "Store as `$VAR`" instruction (`MACRO_HEALTH` at Step 1.5, `$L5_GAP_TOKEN` at Step 5, `$L6_GAP_TOKENS`
   at Step 6). `bctc_signal_*`/`fundamental_*` is the one gathered source with **no** such instruction —
   Step 0 says only "Collect file groups" and stops. Nothing downstream has anything to reference.

2. **Step 4 (`chef-dish.md` L88-134, LAYER 4 4-pillar valuation) is where the per-ticker thesis/rationale
   is actually built**, and its earnings-outlook pillar cell (L96) says only `"BCTC trend, sector
   revenue"` — generic enough that a model satisfies it with macro/sector-level language (exactly what
   the live evidence shows: VCB's 08-11 rationale cites "USD/VND carry reversal + FII outflow +
   Kinh Dịch HOLD", zero product/customer/ops/mgmt content). There is no instruction anywhere in Step 4
   to reach into the Step-0-gathered file and surface one of its `product`/`customer`/`ops`/`mgmt`
   string fields. **This is the primary drop point** — it is where a per-ticker rationale is composed
   and where the pillar table already gestures at "BCTC" without ever naming the actual gathered fields.

3. **Step 7 Block B "Citation Discipline" (`chef-dish.md` L398) is satisfiable without ever surfacing the
   fact text.** It requires "≥1 of: signal ID, source file, source_tier" — citing the filename
   `bctc_signal_VCB_20260811_routine.json` alone passes this discipline literally, without ever quoting
   `product`/`customer`/`ops`/`mgmt`. This is a second, independent way the wiring can go missing even if
   a future model tried harder at Step 4.

4. **Step 7.6's `rationale_one_liner` extraction rule (`chef-dish.md` L640) says only "Extract conviction
   calls from Step 4 per-ticker scoring"** — it never says the persisted `rationale_one_liner` must carry
   a biz-context citation, so even a model that spoke the fact aloud in Block B prose has no requirement
   to persist it into the one place (`unified-agent-synthesis-*.json`) this row's own `verification_gate`
   RAW-verifies against.

5. **Step 7.5 sub-check (d) `BIZ_CTX_OK` (`chef-dish.md` L481-492) is a pure OR-gate with no tie to
   whether data was actually available** — `(cites a fact) OR (gap token)`. Nothing forces the "cites a
   fact" branch to be attempted first, so the path of least resistance is always the gap token, even on
   a cycle where `$BIZ_CTX_SIGNALS` (proposed below) is non-empty. This is exactly the mechanism PO's own
   escalation describes ("the gap token is not a missing-data report, it is a wiring defect mislabelled
   as a data gap").

**Corroborating finding, not previously surfaced (worth flagging to architect/agent-father directly):**
the 08-11 dish's narrative asserts *"bctc_signal archive block 14/16 watchlist tickers"* — this is a
near-verbatim echo of a specific figure that exists **only** inside two HTML `<!-- -->` design-rationale
comments in the flow docs themselves: `chef.md:140` ("already-tracked '14/16 tickers
serve-layer-blocked' upstream data gap") and `chef-dish.md:430-431` ("14/16 filed tickers currently
serve-layer-blocked"). Both comments are dated 2026-07-13/07-17, are **not** live data, are **not**
instructions, and the "BCTC-EXTRACT-QUALITY sprint" they reference does not resolve to any open
`task_board` row today — PO's own 2026-08-11 evidence and TNB c144 ("4 tickers/cycle on schedule")
independently confirm the serve layer is healthy now. This strongly suggests the executing model is, at
least some of the time, treating a stale changelog comment inside the flow doc as if it were current
cycle-live status rather than deriving availability from what it actually gathered this cycle — same
failure family as `feedback_flow_doc_veto_manufactures_pass_read_spec_before_blaming_script` and
`feedback_a30_prose_overrides_embedded_escalate_verdict` (prose in the doc overriding a live
computation). Cheap to fix regardless of whether it is THE mechanism or only A contributing one — see
FR-0 below.

---

## 2. Explicit instruction set (the fix — exact before/after text, for whoever executes; BA has no
edit authority on flow files, see §6)

### FR-0 — Temporal-scope the two stale AUTO-CURE comments (prevents comment-as-live-fact confabulation)

| File:Line | Before | After |
|---|---|---|
| `chef.md:140` | `DISTINCT from and additional to the already-tracked "14/16 tickers serve-layer-blocked"` | `DISTINCT from and additional to the AS-OF-2026-07-17 "14/16 tickers serve-layer-blocked" figure (historical — do NOT cite this number as current-cycle status; re-derive availability fresh from THIS cycle's Step 0 gather, never from this comment)` |
| `chef-dish.md:430-431` | `data this cycle — see bctc-analyst BCTC-EXTRACT-QUALITY sprint, 14/16 filed tickers` / `currently serve-layer-blocked) still allows QUALITY:full as long as the gap is` | `data this cycle — see bctc-analyst BCTC-EXTRACT-QUALITY sprint, AS-OF-2026-07-13 "14/16 filed tickers` / `serve-layer-blocked" figure — historical, NOT current status) still allows QUALITY:full as long as the gap is` |

### FR-1 — `chef.md` Step 0 GATHER: name the session variable (insert after L157, before the blank line at L158)

```markdown
**Store as `$BIZ_CTX_SIGNALS` (mandatory — this is the ONLY handle Steps 4/6.5/7/7.5/7.6 in
chef-dish.md read from; without this store, downstream steps have nothing to reference):**
Build a per-ticker dict from every `bctc_signal_*`/`fundamental_*` file collected above (both
`docs/signals/` and `docs/signals/processed/`), keyed by ticker symbol:
```
$BIZ_CTX_SIGNALS[<TICKER>] = {
  product: <file.product>, customer: <file.customer>, ops: <file.ops>, mgmt: <file.mgmt>,
  source_file: "<filename>", ts: <file.ts or file._processed.processedAt>
}
```
If a ticker has more than one qualifying file this cycle, keep only the most recent by
`ts`/`processedAt`. If ZERO `bctc_signal_*`/`fundamental_*` files were collected this cycle (across
BOTH locations), `$BIZ_CTX_SIGNALS` is empty — this is the ONLY condition under which the
`[gap:business_context_unavailable]` path at Step 7.5 is legitimate. Compute this fresh every cycle
from what THIS Step 0 pass actually read from disk — NEVER from a remembered figure, a prior cycle's
notebook line, or this file's own changelog comments (see FR-0).
```

### FR-2 — `chef-dish.md` header: carry `$BIZ_CTX_SIGNALS` into the session-state handoff (L19-20)

| Before | After |
|---|---|
| `Input: same \`$DISH_TYPE\` env passed into \`chef.md\`, plus the session state accumulated in` / `\`chef.md\` Steps 0.5/0/1 (signal groups, qualifying clusters, published-marker claim).` | `Input: same \`$DISH_TYPE\` env passed into \`chef.md\`, plus the session state accumulated in` / `\`chef.md\` Steps 0.5/0/1 (signal groups, \`$BIZ_CTX_SIGNALS\`, qualifying clusters, published-marker claim).` |

### FR-3 — `chef-dish.md` Step 4: the actual injection point (edit pillar table L96 + insert new mandatory sub-step after L102, before the Volatility & Breadth Context block at L104)

Pillar table row edit:

| Before (L96) | After |
|---|---|
| `\| Earnings outlook \| Triển vọng lợi nhuận \| BCTC trend, sector revenue \|` | `\| Earnings outlook \| Triển vọng lợi nhuận \| BCTC trend, sector revenue, business-context fact from \`$BIZ_CTX_SIGNALS\` if present for this ticker (see mandatory sub-step below) \|` |

New sub-step, inserted after the confidence-scoring bullets (L99-102), before `**Volatility & Breadth
Context**`:

```markdown
**Business-context citation (mandatory when `$BIZ_CTX_SIGNALS` has an entry for this ticker):**
For each ticker in a qualifying cluster with a `$BIZ_CTX_SIGNALS[<TICKER>]` entry, the
earnings-outlook pillar's rationale text for that ticker MUST quote or closely paraphrase ≥1 of the
`product`/`customer`/`ops`/`mgmt` field values, attributed to the source file. Store the result:
```
$BIZ_CTX_CITED[<TICKER>] = { field: "product"|"customer"|"ops"|"mgmt", text: "<cited excerpt>",
                              source: "<source_file>" }
```
Do NOT fabricate a citation for a ticker with no `$BIZ_CTX_SIGNALS` entry — cite only where gathered
data actually exists for that specific ticker this cycle. Do NOT pull in a ticker that is not already
part of this cycle's qualifying clusters/conviction_calls[] purely to satisfy this requirement (see
§5 Blocker Q1 for the one open policy question this raises). If `$BIZ_CTX_SIGNALS` is empty for
EVERY ticker in the dish, `$BIZ_CTX_CITED` stays empty and the Step 7.5 gap-token path applies —
this is the honest floor, identical in spirit to the Step 1 degraded-dish floor and the Step 5
`$L5_GAP_TOKEN` floor.
```

### FR-4 — `chef-dish.md` Step 6.5 SYNTHESIZE: fold the citation into the causal-chain sentence (append to the Rules list after L258, before L260 "Store all chain sentences...")

```markdown
- If `$BIZ_CTX_CITED[<ticker>]` is set for the ticker in this cluster's chain, the `[ticker: end
  state]` component of the causal-chain sentence MUST include the cited fact (or an immediate
  trailing clause carrying it) — e.g. "...VCB price +4.12% on SOE inflow, ROE 16.7% vs sector 17.6%
  (bctc_signal_VCB_20260811_routine.json)." This does not change the chain's required shape; it is
  additive content at the ticker-state position.
```

### FR-5 — `chef-dish.md` Step 7 Block B: close the "cite the filename, never the fact" loophole (extend Citation Discipline bullet, L398)

| Before | After |
|---|---|
| `Citation Discipline: every paragraph-2 claim MUST cite ≥1 of: signal ID, source file, source_tier. Claims without citations are a FLOW VIOLATION — self-correct or downgrade to "unverified observation".` | `Citation Discipline: every paragraph-2 claim MUST cite ≥1 of: signal ID, source file, source_tier. Claims without citations are a FLOW VIOLATION — self-correct or downgrade to "unverified observation". **When \`$BIZ_CTX_CITED[<ticker>]\` is set for a ticker discussed in paragraph 2, citing the source filename alone is NOT sufficient — the actual cited fact text (from \`$BIZ_CTX_CITED[<ticker>].text\`) MUST also appear**, not merely its filename.` |

### FR-6 — `chef-dish.md` Step 7.5: redefine `BIZ_CTX_OK` against the new concrete artifact (replace L490-492)

| Before | After |
|---|---|
| `BIZ_CTX_OK = (≥1 ticker in the dish cites a product/customer/ops/management fact` / `              sourced from a bctc_signal_* or fundamental_* signal read in Step 0)` / `             OR (an explicit gap token was written, e.g. [gap:business_context_unavailable])` | `BIZ_CTX_OK = ($BIZ_CTX_CITED is non-empty for ≥1 ticker in conviction_calls[] this cycle —` / `              i.e. Step 4's mandatory citation sub-step actually fired, not merely asserted)` / `             OR ($BIZ_CTX_SIGNALS was legitimately empty this cycle — see chef.md Step 0 —` / `                 AND an explicit gap token was written, e.g. [gap:business_context_unavailable])` |

This closes the exact defect PO's escalation names: previously `BIZ_CTX_OK` could pass via the gap
token regardless of whether `bctc_signal_*` data was actually available and simply unused. After this
edit, the gap-token branch is only legitimate when `$BIZ_CTX_SIGNALS` (computed fresh at Step 0, FR-1)
was genuinely empty — a self-contradictory state (gap token + non-empty `$BIZ_CTX_SIGNALS`) is no
longer representable as PASS.

### FR-7 — `chef-dish.md` Step 7.6: persist the citation into the JSON (auditable, RAW-verifiable — matches this row's own verification_gate)

Schema addition, `conviction_calls[]` items (after `rationale_one_liner`, L603-604):
```json
      "rationale_one_liner": "...",
      "business_context_cited": { "field": "ops", "text": "...", "source": "bctc_signal_VCB_20260811_routine.json" } | null
```

Implementation-rules addition (after the existing "Extract conviction calls from Step 4..." bullet,
L640):
```markdown
- If `$BIZ_CTX_CITED[<ticker>]` is set for a ticker (Step 4), its `conviction_calls[]` entry's
  `business_context_cited` field MUST carry that object verbatim (not re-summarized) — this is the
  field this row's own `verification_gate` RAW-verifies against on the next dish. `rationale_one_liner`
  for that ticker SHOULD also end with a short clause naming the cited fact (e.g. "; biz-ctx: ROE
  16.7% vs sector 17.6%, PE premium +57%") so a human reader of the JSON alone sees the same evidence
  without cross-referencing `business_context_cited`. Tickers with no citation this cycle carry
  `business_context_cited: null` — explicit null, not an omitted key (keeps the field always present
  for downstream/frontend consumers per `GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD`, out of scope here).
```

---

## 3. Functional Requirements + DDD Layer Mapping

| ID | Requirement | DDD Layer | Notes |
|---|---|---|---|
| FR-0 | Temporal-scope the two stale "14/16 blocked" AUTO-CURE comments (`chef.md:140`, `chef-dish.md:430-431`). | **Interface** (documentation-as-contract) | Cheap, independent of the rest — do first. |
| FR-1 | `chef.md` Step 0 — build and name `$BIZ_CTX_SIGNALS` per-ticker dict. | **Interface** | The missing handle; everything else depends on this existing. |
| FR-2 | `chef-dish.md` header — carry `$BIZ_CTX_SIGNALS` across the file-split boundary. | **Interface** | One-line addition to an existing list, same pattern as `signal groups`/`qualifying clusters`. |
| FR-3 | `chef-dish.md` Step 4 — mandatory per-ticker citation sub-step producing `$BIZ_CTX_CITED`. | **Interface/Application** | This is the actual thesis-build injection point (§1 finding #2) — the primary fix. |
| FR-4 | `chef-dish.md` Step 6.5 — fold citation into the causal-chain sentence. | **Interface** | Additive, does not change the chain's required grammar. |
| FR-5 | `chef-dish.md` Step 7 Block B — close the filename-only citation loophole. | **Interface** | Prevents a technically-compliant-but-empty citation. |
| FR-6 | `chef-dish.md` Step 7.5 — redefine `BIZ_CTX_OK` against `$BIZ_CTX_CITED`/legitimately-empty `$BIZ_CTX_SIGNALS`. | **Application** (gate logic) | Closes the "gap token as path of least resistance" defect PO's escalation names directly. |
| FR-7 | `chef-dish.md` Step 7.6 — persist `business_context_cited` into `conviction_calls[]`. | **Infrastructure** (JSON persistence) | The field this row's `verification_gate` RAW-verifies against — without it, verification stays prose-only. |

All 7 edits are to existing flow/knowledge files (`chef.md`, `chef-dish.md`) — **BA has no edit
authority on these** (`ba/init.md` `boundary_rules.forbidden_outputs`: "NEVER modify agent files, flow
files, or knowledge files"). Per the live precedent for this exact pair of files
(`docs/handoffs/FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE-BA-spec.md` §6), flow-doc edits route to
**agent-father** (flow/knowledge-file edit authority per dispatch table's agent-file-lifecycle row),
not developer — there is no new script/service/data-file in this fix, unlike the USDVND row.

---

## 4. Non-Functional Requirements

- **NFR-1 (no new data source, no re-fetch):** FR-1 through FR-7 wire the ALREADY-GATHERED Step-0
  `bctc_signal_*`/`fundamental_*` file content only. They must NOT trigger a second MCP call to
  re-fetch business data. This is distinct from Step 6a's `four-factor-synthesis` skill, which
  legitimately calls `get_bctc_series`/`get_bctc_full` fresh for its own deeper F/V/G/B scoring — a
  different, deeper analysis pathway, explicitly out of scope here (do not conflate the two).
- **NFR-2 (convention consistency):** `$BIZ_CTX_SIGNALS`/`$BIZ_CTX_CITED` must follow the exact
  "Store as `$VAR`" prose convention already established for `MACRO_HEALTH` (Step 1.5), `$L5_GAP_TOKEN`
  (Step 5), and `$L6_GAP_TOKENS` (Step 6) — not a new convention.
- **NFR-3 (opportunistic, never forced):** the mandatory citation in FR-3 applies ONLY to tickers that
  (a) are already in a qualifying cluster this cycle AND (b) have a `$BIZ_CTX_SIGNALS` entry. It must
  never fabricate a citation for a ticker without gathered data, and — see Blocker Q1 — the default
  design does not widen ticker coverage just to manufacture a citation.
- **NFR-4 (coupling flag, not silently duplicated):** `FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION`
  (`ready[]`, distinct row) is moving the WHOLE `quality_verdict` gate from narrative self-judgment to a
  deterministic assertion over the persisted JSON payload, for L1-L6 generally. Once that row lands, its
  biz-context assertion should read THIS row's new `business_context_cited`/`$BIZ_CTX_CITED` artifact
  rather than re-deriving its own heuristic — flagged here so the two rows converge instead of drifting,
  same discipline as the USDVND precedent's NFR-4 coupling note. Not built here; that row's own scope.
- **NFR-5 (dish-level, not per-ticker, gate floor unchanged):** `BIZ_CTX_OK` (FR-6) still only requires
  **≥1** ticker across the whole dish to carry a citation — unchanged from the pre-existing gate's own
  floor. This fix does not raise the bar to "every ticker," it makes the existing ≥1-ticker bar
  actually reachable through real data instead of only through a gap token.

---

## 5. Edge Cases + Blocker

- **EC-1 (partial coverage):** a qualifying cluster has 3 tickers, only 1 has a `$BIZ_CTX_SIGNALS`
  entry. Cite for that 1; no requirement on the other 2 (NFR-3).
- **EC-2 (drain-timing duplicate):** the same ticker's file exists in both `docs/signals/` and
  `docs/signals/processed/` mid-drain-race. `$BIZ_CTX_SIGNALS` build rule (FR-1) already de-dups by
  keeping only the freshest `ts`/`processedAt` — no double-count risk (same non-duplication guarantee
  the original `FIX-CHEF-STEP0-BCTC-PROCESSED-DIR-BLINDSPOT` auto-cure already established for the
  file-move itself).
- **EC-3 (`fundamental_*` schema, `[TRANSITION]` branch, `chef.md:157`):** live repo state today (2026-08-12)
  has **zero** `fundamental_*` files anywhere on disk and no discoverable `report-analyzer` producer flow
  (folded into `bctc-analyst` per `chef.md`'s own note) — the soak window this branch names appears to
  have already lapsed with nothing ever landing in it. Not a blocker for this fix (the `product`/
  `customer`/`ops`/`mgmt` field names verified live against `bctc_signal_*` are what FR-1 keys on), but
  flagged as a candidate dead-code cleanup for a future `code-janitor`/doc-self-heal pass — out of scope
  here, do not silently fix.
- **EC-4 (legitimately empty `$BIZ_CTX_SIGNALS`):** e.g. bctc-analyst genuinely produced zero output
  this cycle, or the drain moved everything outside the 24h window. The `[gap:business_context_unavailable]`
  path stays available and correct — FR-6's redefinition only closes the case where data WAS available
  and the gap token was written anyway.
- **EC-5 / Blocker Q1 (publish-scope, PO call):** should Step 4's citation requirement ever cause chef
  to WIDEN which tickers appear in `conviction_calls[]` this cycle (i.e. pull in a ticker with fresh
  `$BIZ_CTX_SIGNALS` data that is NOT otherwise part of a qualifying cluster), purely to give
  `BIZ_CTX_OK` more surface area to pass on? **BA's recommendation (the design above, NFR-3, defaults to
  this):** NO — opportunistic-only, cite within the dish's existing ticker set, never pad coverage.
  Rationale: widening ticker coverage is a scope/relevance decision (which tickers deserve a published
  call this cycle), not a data-availability decision, and conflating the two risks a different failure
  mode (chef publishing calls on tickers that didn't actually cluster-qualify, just to satisfy a quality
  gate). PO only needs to confirm or veto this default; it does not block architect from starting on
  FR-0 through FR-7 as specified.

---

## 6. File-by-File Plan

**Flow-doc edits (agent-father — flow/knowledge-file edit authority, one combined pass on the 2 files):**
- `docs/agents/unified-agent/flow/chef.md:140` (FR-0), `:157` insert (FR-1)
- `docs/agents/unified-agent/flow/chef-dish.md:19-20` (FR-2), `:96` + insert after `:102` (FR-3),
  `:430-431` (FR-0), insert after `:258` (FR-4), `:398` (FR-5), `:490-492` (FR-6), `:603-604` schema +
  insert after `:640` (FR-7)

**Read for context, no change:**
- `docs/standards/tnb-methodology.md:6` — the "do we understand the business behind the ticker" anchor
  line this whole fix is in service of; unchanged, already correct.
- `docs/signals/processed/bctc_signal_VCB_20260811_routine.json` — live schema reference for
  `product`/`customer`/`ops`/`mgmt` field names, verified this cycle (§1).

**No new files, no new script, no application code** — this entire fix is prose/instruction wiring
inside two already-existing flow markdown files. Unlike the USDVND precedent (which needed a new
registry + gate script), there is no deterministic-check artifact proposed here beyond FR-6/FR-7's
gate-logic and schema edits — those ARE the deterministic mechanism (a boolean over a named variable
that either got set or didn't), not a new engine.

---

## 7. Verification Gate Mapping

Board `verification_gate`: *"A subsequent chef evening/morning dish persists `known_gaps[]` WITHOUT
`[gap:business_context_absent/unavailable]` AND ≥1 `conviction_calls[]` rationale cites a
product/customer/ops/mgmt fact traceable to a `bctc_signal_*`/`fundamental_*` signal read that cycle —
RAW-verify against the synthesis JSON, never the notebook self-report."*

| Requirement | Satisfied by |
|---|---|
| `known_gaps[]` omits the biz-context token on a cycle with available data | FR-6 (BIZ_CTX_OK can no longer PASS-via-gap-token when `$BIZ_CTX_SIGNALS` is non-empty) |
| ≥1 `conviction_calls[]` rationale cites a traceable product/customer/ops/mgmt fact | FR-3 (citation sub-step) + FR-7 (`business_context_cited` persisted verbatim in the JSON, RAW-verifiable) |
| RAW-verifiable against the synthesis JSON, not self-report | FR-7's schema addition is the exact field to `jq` on the next `unified-agent-synthesis-*.json` |

---

## [Architect] Brownfield Findings

**Zone:** `cross-service/` (row's own field, confirmed correct) — real touched surface is
`docs/agents/unified-agent/flow/chef.md` + `docs/agents/unified-agent/flow/chef-dish.md`, i.e. agent
flow-doc/prose files, **not** `apps/<service>/` application code. Zone-detect Tier-1 does not apply
(no `apps/` path); `BUILD-STANDARD: not-applicable` (BUG-FIX/refactor-in-doc, no new primitives) —
Standard Detection matrix skip confirmed.

**Ratification — FR-0 through FR-7 (all 7 CONFIRMED SOUND, content-verified against live files):**
Re-read every "Before" quote in §2 against the current on-disk `chef.md`/`chef-dish.md` byte-for-byte
(not trusted from the spec) — all 10 anchor strings (FR-0 x2, FR-1, FR-2, FR-3 x2, FR-4, FR-5, FR-6,
FR-7 x2) match verbatim. **One drift found, non-blocking:** `chef-dish.md` picked up +44L on
2026-08-13 (commit `c31ee006e`, `FIX-CHEF-MIDFLOW-BAIL-DETERMINISM` — 8 Checkpoint pointers inserted
at step boundaries) and `chef.md` +5L, both AFTER BA wrote this spec (2026-08-12) — every line number
in §2/§6 is now stale by a variable, non-uniform offset per file-region. Content is unaffected (no
edit touched any FR-anchored text), but a line-literal patch against BA's cited numbers would land in
the wrong place. **Corrected live line map** (re-verified this cycle, use these — or better, anchor
on the quoted text itself, not the number):

| FR | File | BA's line | Live line (2026-08-14) |
|---|---|---|---|
| FR-0a | `chef.md` | :140 | **:145** |
| FR-0b | `chef-dish.md` | :430-431 | **:475-476** |
| FR-1 (insert) | `chef.md` | after :157 | **after :162**, before blank :163 / `Supplementary calls` :164 |
| FR-2 | `chef-dish.md` | :19-20 | **:24-25** |
| FR-3 (table row) | `chef-dish.md` | :96 | **:116** |
| FR-3 (insert) | `chef-dish.md` | after :99-102 | **after :122** (confidence-scoring bullets end), before blank :123 / `**Volatility & Breadth Context**` :124 |
| FR-4 (insert) | `chef-dish.md` | after :258, before :260 | **after :294** (carry/FII provenance bullet), before :295 `Store all chain sentences...` |
| FR-5 | `chef-dish.md` | :398 | **:443** |
| FR-6 | `chef-dish.md` | :490-492 | **:535-537** (3-line block, verified verbatim incl. the `ANY_LAYER_PARTIAL` sibling check at :542 — FR-6's rewrite does not touch it and does not need to, "relied on a gap token" stays computable from the new definition's 2nd OR-branch) |
| FR-7 (schema) | `chef-dish.md` | after :603-604 | **after :648** (`"rationale_one_liner": "..."`), before :649 closing `}` |
| FR-7 (impl rule) | `chef-dish.md` | after :640 | **after :685** (`- Extract conviction calls from Step 4 per-ticker scoring...`) |

**Blast-radius check (repo-wide grep, `BIZ_CTX` token):** zero hits outside `chef.md`/`chef-dish.md` +
this handoff + BA's decision journal + the unified-agent notebook. No TS/Go/shell consumer reads
`$BIZ_CTX_SIGNALS`/`$BIZ_CTX_CITED`/`BIZ_CTX_OK` — confirms NFR-1's "no new data source" framing and,
more importantly, confirms there is genuinely **zero application-code blast radius**: this is prose-only
wiring inside 2 markdown files, full stop. No hidden script/test depends on the old `BIZ_CTX_OK`
definition text.

**DDD/layer mapping (§3 table):** accepted as-written. These are prose/gate-logic files, not typed
code, so "Interface/Application/Infrastructure" is used in BA's loose sense (already the convention
on the USDVND precedent, `FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE-BA-spec.md` §3) — instruction
text = Interface, `BIZ_CTX_OK` verdict logic = Application, the persisted JSON schema = Infrastructure.
No objection; extending the existing convention, not inventing a new one.

**Blocker Q1 (§5 EC-5) — RULING, within architect's remit (this is a design-soundness question, not
a publish-scope veto):** BA's opportunistic-only default (NFR-3, already baked into FR-3's own text —
"Do NOT pull in a ticker that is not already part of this cycle's qualifying clusters... purely to
satisfy this requirement") is the technically correct design and is **ratified as specified, no
change**. Force-widening ticker coverage to manufacture a citation would conflate a data-availability
gate with a publish-scope decision — a strictly worse failure mode than the one this row exists to
fix (chef publishing a call on a ticker that never cluster-qualified, purely to make `BIZ_CTX_OK`
pass). Since FR-3 as written already implements the safe default, **this does not block agent-father's
execution** — PO retains veto right per BA's note, but a later veto is a follow-up FR against FR-3's
opportunistic clause, not a rework of FR-0/1/2/4/5/6/7.

**Reuse check:** confirms BA's own §6 finding — no new interface, no new script/service, no new data
file. `$BIZ_CTX_SIGNALS`/`$BIZ_CTX_CITED` follow the exact existing "Store as `$VAR`" prose pattern
(`MACRO_HEALTH`, `$L5_GAP_TOKEN`, `$L6_GAP_TOKENS`) — extend, not duplicate. Nothing to flag.

**Risk flags:** none blocking.
- R1 (informational): the stale-line-number drift above will recur on the NEXT flow-doc edit that
  lands on either file before this fix ships — agent-father's own edit-prepare flow already re-reads
  the live file before patching (per its `edit-prepare.md`), so this is self-correcting in practice;
  flagged only so agent-father does not blindly trust BA's line numbers either.
- R2 (informational, not actioned per BA's own EC-3): `chef.md:162`'s `fundamental_*` `[TRANSITION]`
  branch (soak window H-18→H-19) has zero live files backing it — confirmed still true this cycle
  (0 `fundamental_*` files anywhere on disk). Does not affect FR-1 (keys on `bctc_signal_*` field
  names, verified live). Candidate for a future code-janitor/doc-self-heal pass, out of scope here.
- R3 (informational): `FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION` (`ready[]`,
  `next_agent: agent-father`, same zone) confirms agent-father-as-next_agent is an already-established,
  currently-live routing pattern for this exact file family — not a novel routing choice being
  introduced by this row.

**Fan-out (this row only — no PM step, no developer step):** `agent-father` is the sole next agent.
Rationale: zero application code, zero new interfaces, edits confined to 2 agent flow-doc files
squarely inside `agent-father`'s "All agent-file lifecycle" ownership (dispatch table). Routing through
PM would add a decomposition step with nothing to decompose (one wave, 2 files, 10 edit sites, no
`depends_on` graph). Matches BA's own RETURN recommendation and the (unshipped) USDVND precedent's
identical fan-out shape.

**Scan clean:** true ✓

## Decision Journal
See `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-ba.md`, task_id
`FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING`.

## RETURN
```
DONE: BA spec complete — traced the GATHER->conviction_calls[] drop to Step 4 (thesis build, primary)
      compounded by 3 secondary gaps (Step 7 citation-discipline loophole, Step 7.5 gate not tied to
      actual data availability, Step 7.6 not persisting the citation) + one independent corroborating
      finding (two stale flow-doc comments echoed near-verbatim in the live-defective narrative).
      Row's own "Step 5 = portfolio_conviction merge" hypothesis is factually wrong — Step 5 is Kinh
      Dich/get_portfolio_conviction, unrelated to bctc business-context (confirmed via the file's own
      inline note). 7 exact before/after flow-doc edits specified (FR-0..FR-7), zero new
      scripts/services/application-code needed.
NEXT: architect | confirm the FR-0..FR-7 edit set (all flow-doc, no new infra) and fan out to
      agent-father for execution (flow/knowledge-file edit authority — BA has no edit access to
      chef.md/chef-dish.md).
HANDOFF: docs/handoffs/FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING-BA-spec.md
BLOCKER: Q1 (§5 EC-5) — opportunistic-only vs. force-widen ticker coverage to manufacture a citation.
      BA recommendation given (opportunistic-only); needs PO confirm/veto, does not block architect.
PIPELINE: continue
```
