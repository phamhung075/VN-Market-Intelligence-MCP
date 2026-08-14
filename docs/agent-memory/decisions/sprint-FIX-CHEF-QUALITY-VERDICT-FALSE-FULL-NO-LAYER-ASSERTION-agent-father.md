# Decision Journal — Sprint FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION · agent-father

**Sprint goal:** Convert chef-dish.md Step 7.5's quality-verdict gate from a narrative self-judgement
into a deterministic assertion over the literal payload it persists, and widen the same mechanism to
cover business-context citation, JSON schema conformance, and the direction enum (PO 2026-08-14
scope-widening, promoted P0).
**Agent:** agent-father
**Started:** 2026-08-14T20:56Z

---

### STEP agent-father-S1 · agent-father · 2026-08-14T20:56Z
**task-id:** FIX-CHEF-QUALITY-VERDICT-FALSE-FULL-NO-LAYER-ASSERTION
**what-done:** Read the full board row (note + `po_scope_widening`), `chef.md`, `chef-dish.md`,
`chef-telemetry.md`, `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING-BA-spec.md`, and
`docs/handoffs/tnb-audit-latest.md` (c130) to establish ground truth before touching anything.

**what-considered:**
- **Root cause of recurrence.** The 5 sub-checks (a)-(e) already existed in prose (landed across
  three prior AutoCures: c103, c108, F-EVENING-QUALITY-OVERCLAIM). They still produced a false "full"
  3 more times (07-21, 07-31, 08-14). tnb-audit c130 independently confirmed the same root cause on
  the sibling BIZCTX row: "wiring present but not executed" — FR-0..FR-7 shipped in commit
  `c11504775` yet the 2026-08-14 evening dish still claimed the BIZ_CTX_OK gap-token branch while
  `$BIZ_CTX_SIGNALS` held a genuine in-window DXG entry (c130 Headline #1). This confirmed the defect
  is not "the rule is wrong" (FR-6's rule text is correct) but "the rule is graded narratively" — an
  LLM self-assessing "did I do X in Step 3/4" has no mechanical tie to the actual field text it is
  about to persist, and both can silently diverge.
- **Where to place the fix.** Considered (a) leaving Step 7.5/7.6 order/mechanism unchanged and only
  tightening wording (rejected — this is exactly what c103/c108/F-EVENING-QUALITY-OVERCLAIM already
  tried, 3x, and it recurred every time); (b) moving the gate to run after Step 7.6's Write + Read-back
  (rejected as sole mechanism — would leave Step 7.6 as an independent second extraction, i.e. the same
  two-judgements defect, just relocated); (c) making Step 7.5 the single place that both ASSEMBLES the
  literal field text/objects Step 7.6 persists AND scores every sub-check against that same assembly,
  with Step 7.6 reduced to "write these exact variables verbatim" plus a mandatory post-write Read-back
  self-check as a final RAW guard (chosen — closes AC-2's "single pass, no independent second
  judgement" directly, and gives AC-4 a mechanical anchor inside the flow itself rather than deferring
  entirely to the next TNB/QA audit cycle).
- **Scope-widening mechanism.** PO's directive is explicit: "same deterministic assertion over
  persisted synthesis JSON mechanism, not three separate patches." Added SCHEMA_OK (f) and
  DIRECTION_OK (g) as two more ANDed sub-checks in the SAME verdict computation, not as separate gates
  — a SCHEMA_OK/DIRECTION_OK failure forces `degraded` through the identical `$FAILED_CHECKS` /
  `known_gaps[]` path the other 5 sub-checks already use, with one addition: schema/enum violations
  must be self-corrected BEFORE Step 7.6 writes (these are output-validity requirements, not
  data-availability gaps — a wrong-shape JSON is invalid output, not an honestly-disclosed absence).
- **BIZCTX row boundary.** `FIX-CHEF-BIZCTX-GATHER-TO-CONVICTION-WIRING` is in REVIEW (next_agent
  agent-father), explicitly not-mine per the dispatch brief. Confirmed by direct read that its FR-1..
  FR-7 wiring (`$BIZ_CTX_SIGNALS`, `$BIZ_CTX_CITED`, the Step 4 citation sub-step, the JSON schema's
  `business_context_cited` field) is already live in `chef.md`/`chef-dish.md` — this row only needed
  to make the BIZ_CTX_OK *check* itself mechanical (literal null-scan across `$CONVICTION_CALLS[]`,
  and a literal empty-dict check on `$BIZ_CTX_SIGNALS` before allowing the gap-token branch), reusing
  the already-wired artifacts rather than re-wiring anything. No edit touched the gather/citation
  sub-step itself.
- **Not in scope (explicitly excluded, documented inline in the flow-doc comment):** c130 Headline #1's
  deeper defect — chef issuing an ACCUMULATE call that actively contradicts DXG's own upstream
  `bctc_signal.valuation.verdict=AVOID` gate — is a conviction-direction-vs-source-data contradiction,
  a different defect class from "was business context cited at all." Left untouched; belongs to the
  BIZCTX row's continued work or a fresh finding, not this row's assertion mechanism.

**why-decision (AC-by-AC):**
- **AC-1** (full unwritable when any mandatory field lacks required tokens): the verdict `if` is a
  7-way AND (`L2_OK AND L3_OK AND L4_PILLARS_OK AND BIZ_CTX_OK AND GAP_CATALOGUE_OK AND SCHEMA_OK AND
  DIRECTION_OK`) — a single FALSE forces `degraded`, unchanged structurally from the pre-existing gate
  but each operand is now a literal scan instead of a narrative judgement.
- **AC-2** (single pass, no independent second judgement): Step 7.5's ASSEMBLY block is the ONE place
  `$US_MACRO_LAYER_TEXT`/`$VN_MACRO_LAYER_TEXT`/`$VALUATION_LAYER_TEXT`/`$CONVICTION_CALLS`/
  `$KNOWN_GAPS_SO_FAR` are constructed; Step 7.6's "Field mapping" section explicitly forbids
  re-derivation and maps 1:1 onto these same variables. There is no second extraction path left.
- **AC-3** (negative control — synthetic L2-stripped dish must produce degraded + L2 gap token):
  documented inline as "Illustrative negative-control example" in Step 7.5 — manually walked the new
  rule with `$US_MACRO_LAYER_TEXT = ""`: no `"PMI"`, no `"EFFR"`/`"IORB"` pair, no geopolitical clause,
  no gap token in either scanned string → `L2_OK = FALSE` mechanically, regardless of every other
  sub-check's state → `$QUALITY_VERDICT = "degraded"`, `$FAILED_CHECKS =
  ["[gap:L2_US_macro_absent_no_gap_token]"]`. Contrast case (`$US_MACRO_LAYER_TEXT` containing
  `"PMI 52.3"`) scores `L2_OK = TRUE` under the identical rule — confirms the assertion is sensitive to
  content, not a constant-degrade stub. This is the flow-doc-equivalent of a RED→GREEN pair for a
  prose gate with no code to unit-test: RED = the pre-fix narrative check has no mechanical tie to
  `$US_MACRO_LAYER_TEXT` (demonstrated by the 3 live false-full occurrences); GREEN = the new literal
  substring rule, applied to the same synthetic stripped input, deterministically fails and produces
  the correct gap token.
- **AC-4** (RAW-verify by reading the persisted JSON, not notebook/self-report): added a mandatory
  post-write Read-back self-check to Step 7.6 (parse JSON, confirm `quality_verdict` matches Step 7.5's
  computed value, confirm top-level keys match SCHEMA_OK's set, confirm every `direction` is in the
  enum) — this makes the flow itself assert against the literal bytes on disk, not just its own
  in-memory intention. The row's own AC-4 additionally requires an EXTERNAL RAW-verify "on the next
  fire" — that is QA's job on the next live chef dispatch (I cannot fire chef myself from this task);
  flagged explicitly in the RETURN block below as the handoff.
- **AC-5 / widened scope (a) business_context_cited:** BIZ_CTX_OK now null-scans the literal
  `$CONVICTION_CALLS[].business_context_cited` array and requires a MECHANICAL empty-dict check on
  `$BIZ_CTX_SIGNALS` before the gap-token branch is legitimate — directly closes the c130 Headline #1
  failure mode (gap-token claimed while data was genuinely available).
- **(b) schema conformance:** SCHEMA_OK checks the assembled payload's top-level key set and
  `tnb_synthesis`'s sub-key set against the ONE schema in Step 7.6, for every `$DISH_TYPE` — directly
  targets the eod `tnb_layers/clustering/signals/thesis_summary` shape substitution (c130 Headline #2).
  Failure forces self-correction before write, not just disclosure.
- **(c) direction enum:** DIRECTION_OK checks literal enum membership (`BUY|HOLD|SELL|NEUTRAL`) and
  that `ticker` is a real per-ticker symbol, not a macro/composite label — directly targets the
  evening `ACCUMULATE`/`RISK_OFF`/`MACRO_BRENT` findings.

**why-change:** Chose to REWRITE Step 7.5 (assembly + 7 sub-checks) and TRIM Step 7.6 (write + Read-back
self-check only) rather than append a 6th/7th sub-check onto the existing narrative-graded structure —
appending would have left the root cause (narrative grading with no mechanical tie to persisted text)
intact for sub-checks (a)-(e) while only the 2 new ones (f)/(g) would be literal, an inconsistent and
incomplete fix given this is the row's 4th attempt at the same defect class.

**verification performed (flow-doc-only change — no application code, no test runner):**
- Manually re-applied the new rule set against 3 synthetic scenarios: (1) L2-stripped (AC-3, above,
  → degraded + L2 token); (2) all-fields-present-and-tokened (→ full); (3) BIZ_CTX_SIGNALS non-empty
  but business_context_cited null on every entry and no gap token (mirrors c130 Headline #1's evening
  DXG case) → `BIZ_CTX_OK = FALSE` (gap-token branch requires the mechanical empty-dict check, which
  fails since `$BIZ_CTX_SIGNALS` is non-empty) → `degraded` + `[gap:business_context_absent]` — this is
  the corrected behavior; the pre-fix gate would have narratively accepted the (mis-claimed)
  `[gap:business_context_limited]` token that was actually present in that dish and scored
  `BIZ_CTX_OK = TRUE`.
- Code-fence balance check (`awk`/python parity scan) on the full edited file: 42 fences, balanced.
- No script/service/data-file created — flow-doc-only, per PO's explicit scope note on the board row.

**next-fire RAW-verify handoff (for QA, per the row's own AC-4):** on the next chef fire (morning /
eod / evening), `jq '.metadata.quality_verdict, .tnb_synthesis.us_macro_layer, (.conviction_calls[] |
{ticker, direction, business_context_cited}), (.metadata | keys), (.tnb_synthesis | keys)'
docs/data/unified-agent-synthesis-<date>-<slot>.json` — confirm `quality_verdict` is `degraded`
wherever `us_macro_layer` lacks PMI/EFFR-IORB/geopolitical-event/gap-token, confirm every
`conviction_calls[].direction` is in the enum, and confirm top-level/`tnb_synthesis` keys match the ONE
schema for every dish_type including eod.

**commit:** (recorded after this journal's commit — see notebook entry for SHA)
