# BA Spec — FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE

**Task:** FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE · P1 · zone `apps/mcp-server/` · supervised:true · plan_only:true
**BA date:** 2026-08-06
**Verdict:** Spec complete. **Zero PO blockers** (nothing here is a priority/VN-term/data-source-availability/historical-vs-realtime question). **One scope correction flagged for PO ratification** (§0 below) — does not block architect from proceeding. **NEXT: architect.**

---

## 0. CRITICAL — Part 1 of the dispatched "REQUIRED FIX SHAPE" is disproven; do not implement it as worded

The board row's `note` (and the dispatching prompt that echoed it) states as ROOT CAUSE: *"vnIndexDelta=-526.13 computed against prevFetchedAt=null — a delta with NO baseline"* and REQUIRED FIX Part 1: *"a delta computed against prevFetchedAt:null MUST NOT be emitted — it is not a delta."*

**This premise is already self-retracted in its own source document** (`docs/handoffs/2026-07-15-market-dish-933-false-vnindex-526-point-drop.md` §8.2, banner-titled *"The delta is fine. §8, §8.1, and §6.4 are all wrong."* — §6.4 is the exact clause the board row's Part 1 restates). §8.2's own evidence: back-solving `baseline = current − delta` across 6 readings shows a rock-stable, correct prior-session-close baseline (1806.63 on 07-15, rolling to 1782.12 on 07-16). Conclusion in that doc: *"Acting on §6.4 would delete a correct, useful field."* The board `note` was written the same day (2026-07-15T20:56Z) but was never reconciled against the 02:25Z retraction that supersedes it — a stale premise surviving forward through the board row into this dispatch.

**I independently re-derived the same conclusion from live code, not by trusting the retraction either:**

- `apps/macro-indicators/pkg/application/usecases.go` — `computeDelta(current, prev *float64)` returns `(nil, "unknown")` when `prev == nil`. It **already refuses to emit a delta with no baseline**, generically, for all 4 headline fields. The -526.13 that reached MARKET was a real, non-nil arithmetic result — proof its `prev` argument was non-nil that day too.
- `prevFetchedAt` (`dtos.go:136`) is **not** vnIndex's baseline field. Per its own comment ("`PrevFetchedAt` (*string) used for oil/gold/usdVnd delta computation + DTO provenance") and `usecases.go:158` (`resolveCommodityPrevClose`), it is the **oil/gold/usdVnd** commodity fetch's provenance timestamp. `vnIndexDelta`'s actual baseline is `prevVnIndex`, resolved separately by `resolvePrevSessionVnIndex()` (`usecases.go:409-421`, `daily_ohlcv` OFFSET 1 — a **different port, different table**). `prevFetchedAt: null` on 07-15 was true of the commodity fields; it says nothing about whether `vnIndex` had a baseline, and it did.
- **The actual root cause of the -526.13** was that `resolveVNIndex()` (`usecases.go:399-407`) fell back to `fixtureVNIndex` (tier-4, `is_estimate=true`) for the **current-session** value while `resolvePrevSessionVnIndex()` still correctly returned the real prior close (~1806.63). `computeDelta` did its job correctly on a poisoned **input** — this is exactly what the same handoff's §8.2/§8.3 already concluded ("the arithmetic did its job on garbage input... §6.3's plausibility gate remains the right and only durable fix"), now confirmed at the source-line level.

**Recommendation, for PO to ratify (not a blocker — architect can proceed either way):** close Part 1 as literally worded — no code change belongs there; it would delete a correct field. Retain only a **small, cosmetic-severity** companion (§8.2's own downgrade of it): give `vnIndex` its own baseline-provenance field (e.g. the `daily_ohlcv` session date `prevVnIndex` was read from) instead of leaving a reader to wrongly infer vnIndex's anchor from the commodity-shared `prevFetchedAt` — this is what produced the false alarm twice (the 07-16 §8 incident and the 07-25 `po_falsification_20260725T1507` note below). See FR-3.

### 0.1 — The 07-25 `po_falsification` RE-TEST instruction tests the wrong hypothesis; corrected re-test supplied

`po_falsification_20260725T1507` (on the live board row) instructs whoever implements this gate to *"probe `get_macro_snapshot` TWICE during a live VN market session and assert `vnIndexDelta` recomputes against the advancing `prevFetchedAt`."* Given §0's finding, this is not a coherent test — `prevFetchedAt` and `vnIndexDelta` are **structurally unrelated fields** (commodity provenance vs. VN-Index baseline). Run as literally worded, this re-test will observe `prevFetchedAt` advancing (it tracks the commodity fetch clock) while `vnIndexDelta`'s implied baseline correctly stays flat within a session — and a naive implementer, primed by the instruction, would misread that as "the real defect."

**Corrected re-test (performed this cycle, live, during actual VN market hours):** assert `vnIndexDelta` recomputes correctly against **`vnIndex`'s own baseline** (`current − vnIndexDelta` should reproduce a stable, session-constant `prevVnIndex`, cross-checked against an independent local read).

Two live `POST http://macro-indicators:5004/snapshot` probes, 13s apart, at 2026-08-06T07:38:41Z / 07:38:54Z (inside the 02:15–07:45 UTC session window):

| probe | `vnIndex` | `vnIndexDelta` | implied baseline (`vnIndex − vnIndexDelta`) | tier / estimate |
|---|---|---|---|---|
| 1 | 1764.01 | −12.45000000000005 | **1776.46** | 1 / false (live) |
| 2 | 1764.01 | −12.45000000000005 | **1776.46** | 1 / false (live) |

Independently, `vn_index_cache` (mcp-server's own DB, written by the separate `vnIndexRefreshJob`) read at 07:35:02Z: `price=1765.23, prev_price=1776.46`. **The implied baseline (1776.46) matches `prev_price` exactly across two independent code paths** — the mechanism is coherent and correct. This closes the open sub-question definitively; no further live-session testing is needed by whoever implements. **Do not action the literal `po_falsification_20260725T1507` re-test wording** — supersede it with this corrected form (FR-4).

---

## 1. Upstream probe — CI-FRESH-01 (per dispatch's "UPSTREAM PROBE FIRST")

**Answer: vnIndexRefresh is alive right now.** Live-probed during actual VN market hours (session window 02:15–07:45 UTC; probe at 07:35–07:41 UTC, i.e. genuinely inside the window, not adjudicated off-hours):

- `vn_index_cache` (mcp-server DB): `fetched_at: 2026-08-06T07:35:02.086Z` — ≤3 min stale at probe time (SLA: ≤10 min during market hours). PASS.
- `macro-indicators` `/snapshot`: `vnIndex_source_tier: 1`, `vnIndex_is_estimate: false`, `dataSource: "live"` — currently serving a genuine tier-1 read, not the tier-4 fallback.
- `market_prices` (mcp-server DB, code=`VNINDEX`, a **third**, separate write path — `marketTools.ts`/`fetchVnIndex`, VnDirect direct fetch): `updated_at: 2026-08-06T07:41:34.228Z` — <1 min stale at read time.

Board history: `CI-FRESH-01-FIX` was already batch-closed `done_verified` on 2026-07-17 (`po-decisions.md` L484, CLUSTER-G convergence), but that closure's own evidence was an **off-hours INFO reclassification** ("audit ran at market CLOSED... absence expected" — i.e. it never actually caught the job running). This cycle's probe supplies the market-hours-live confirmation that closure lacked, and it is healthy.

**Blast-radius consequence for this row (per dispatch's own conditional):** *"if the refresh is dead, EVERY downstream macro_snapshot consumer reads the tier-4 fallback, not just chef."* Refresh is **not** dead right now — the blast radius does **not** currently extend beyond the already-known transient degrade path (tier-1 → tier-4 fallback inside `resolveVNIndex()` when the live fetch errors or returns ≤0, `usecases.go:399-407`). The 07-15 dish-933 incident was a **transient degrade event** on that fallback branch, not evidence of a structurally dead job. No code action is owed to CI-FRESH-01 by this row; treat it as re-confirmed closed.

---

## 2. DDD layer mapping

**Domain layer (new):** a plausibility-guard function — given `(macroVnIndex, macroTier, macroIsEstimate)` and `(referenceVnIndex, referenceFreshness)`, return `{trustworthy: boolean}` or a gap-token. Pure, no I/O. Natural home: `apps/mcp-server/src/domain/services/` (sibling of the existing `marketContextBuilder.ts`, `regimeConfidenceThreshold.ts`).

**Application layer:** the `get_macro_snapshot` use-case orchestration must, on every call, read the local `market_prices`/`VNINDEX` (or `vn_index_cache`) row **in addition to** the macro-indicators HTTP response it already fetches, feed both into the domain guard, and substitute a gap-token for `vnIndex`/`vnIndexDelta`/`vnIndexDirection` when the guard fails. This is new orchestration, not a new microservice call — `apps/mcp-server` already independently populates a local VN-Index (via `vnIndexRefreshJob`/`marketTools.ts`) on its own 5-min cadence; it does not currently cross-check it against what `macro-indicators` returns.

**Infrastructure layer:** no new infra needed for the reference read — `vnIndexCacheStore.ts` (read path) and/or the existing `market_prices` query already used by `marketContextBuilder.buildMacroSection` are reusable as-is. The macro-indicators HTTP client (`infrastructure/microservices/clients.ts`, `BASE_URLS.macro`) is also already wired.

**Interface layer:** `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` (the `get_macro_snapshot` MCP tool response shape) — surfaces the gap-token instead of the numeric claim when the guard fails. `macroSnapshotGuard.ts` already exists in this same directory as a **shape** guard (valid/invalid response envelope) — this is a **new, distinct** guard (value plausibility, not shape); do not conflate the two, but co-locate.

**Zone confirmed correct:** `apps/mcp-server/` is the right zone for the gate itself (dispatch's own framing). The two values being compared live in two different services (`apps/macro-indicators` Go service vs. `apps/mcp-server`'s own DB), but `apps/mcp-server` is the only place that already holds — or can cheaply obtain — both readings in the same request, since it is the consumer of the Go service's `/snapshot` endpoint. Per CLAUDE.md ("never consolidate microservices"), the fix must NOT be implemented by pulling `apps/mcp-server`'s local VN-Index logic into `apps/macro-indicators`, or vice versa — the guard belongs at the consumer/composition point, not inside either producer.

---

## 3. Requirements

### FR-1 — Same-cycle cross-plane plausibility check (the durable fix — Part 2 of dispatch, confirmed still valid)
**DDD:** domain (guard function) + application (orchestration) + interface (response substitution)

When `get_macro_snapshot` assembles its response, compare the macro-indicators service's `vnIndex` against `apps/mcp-server`'s own local VN-Index reference (`market_prices.code='VNINDEX'`, populated by `marketTools.ts`/`vnIndexRefreshJob` — the SAME value `get_market_snapshot` serves and the SAME value the original 2026-07-15 incident used to establish ground truth, per that handoff's §1). If the two values diverge by more than 5% (relative to the local reference), the `vnIndex`-derived fields (`vnIndex`, `vnIndexDelta`, `vnIndexDirection`) in the `get_macro_snapshot` response **MUST** be replaced by an explicit gap-token — never narrated as a numeric fact. `vnIndex_is_estimate`/`vnIndex_source_tier` remain visible (they are diagnostic, not the leaking channel).

**Naming clarification (WHAT, not HOW — architect must resolve before design, this is not optional):** the board row's literal phrase *"market_context (tier-2)"* is ambiguous across three different things in the live codebase, and two of the three are wrong targets:
1. The MCP tool `get_market_context()` — confirmed by direct code read (`marketContextBuilder.ts`) it does **not** surface VNINDEX at all today (not in the `watchlist` table, not in `MACRO_CODES`). Comparing against it would silently no-op (always "no VN-Index found," never a comparison).
2. Chef/unified-agent's own synthesis-JSON field, also named `market_context.vn_index` (inside `docs/data/unified-agent-synthesis-*.json`) — the 07-15 handoff's own §2a/§2c already proved this field is populated **from the same tier-4 macro_snapshot pipeline**, not an independent source. Comparing macro_snapshot against this would compare the value against itself — vacuous, always divergence=0, no defense.
3. `market_prices.code='VNINDEX'` (equivalently, what `get_market_snapshot` serves) — genuinely independent of the macro-indicators Go service's own VN-Index resolution, written by a separate fetcher (`fetchVnIndex`/VnDirect) on a separate cadence. **This is the only one of the three that is a real second plane.** It is also what the original incident actually verified against (handoff §1: *"confirmed twice: `get_market_snapshot`... and MARKET morning-briefing"*) — the handoff's own later §2a text calling this `get_market_context()` was itself imprecise language, not a different tool.

**Recommend target #3.** Architect should state explicitly in the design doc which of the three was intended, so a future reader does not have to re-derive this.

### FR-2 — Gate condition: unconditional divergence check, not gated on `is_estimate`/`source_tier` alone
**DDD:** domain
Per `feedback_nonzero_values_need_plausibility_check` and this row's own precedent citation (BAL-1f/FU-DE-SERVE-HONEST): do not gate the divergence check on `vnIndex_is_estimate=true` alone — a tier-1 misreport should also be caught (defense-in-depth; the flag that would gate the check could itself be the thing that's wrong). The check runs every call; the **response** (fail-open vs. gap-token) may differ by tier — see EC-1.

### FR-3 — (downgraded companion, cosmetic severity — replaces literal Part-1) Surface vnIndex's own baseline provenance
**DDD:** interface (DTO) — `apps/macro-indicators`
Per §0, do not remove or null the `vnIndexDelta` computation. Add a field distinct from the commodity-shared `prevFetchedAt` that identifies which session `prevVnIndex` was read from (e.g. the `daily_ohlcv` date of that row), so a consumer/auditor can verify the anchor without incorrectly inferring it from the oil/gold/usdVnd timestamp. Low severity — do not treat as gating this row's DONE criteria; may ship as a fast-follow.

### FR-4 — Corrected RE-TEST superseding `po_falsification_20260725T1507`
**DDD:** verification/infrastructure
Whoever implements FR-1 should re-run the corrected form of the RE-TEST (§0.1) as part of verification: two `get_macro_snapshot` (or direct `/snapshot`) probes during a live VN market session, asserting the **implied baseline** (`vnIndex − vnIndexDelta`) stays constant within the session and matches an independent local read (`vn_index_cache.prev_price` or equivalent). This cycle's live probe already satisfies this once (§0.1 table) — a second, independent confirmation at implementation time is still good practice but the open question itself is closed.

### FR-5 (secondary — explicitly NOT primary AC, per dispatch) — Narration-side guard, unified-agent/chef
**DDD:** interface (prose generation), different zone
The dispatch note flags this as belonging to unified-agent's chef flow, secondary. Record for whoever picks that row up: the 07-15 handoff's §8.3/§8.3-R found that a naive "no direction claim when the matching `*Delta` is null/gap-tokened" guard **false-positives on legitimate news-sourced claims** (msg 936's oil-rally sentence, correctly cited from a real, timely news article, would have been blocked by a gate keyed only on macro gap tokens). Any pre-send narration guard must resolve the claim's source layer (macro-delta vs. news-citation) before flagging. Do not scope this into the current row's AC; flag it to whoever owns the chef-flow companion fix.

---

## 4. Edge cases

- **EC-1 — Local reference itself unavailable/stale.** If `market_prices.VNINDEX` (or `vn_index_cache`) hasn't refreshed within its own SLA (≤10 min market hours), the cross-plane check cannot run. Recommend: fail-**closed** (gap-token) only when the macro-indicators side is `is_estimate=true`/`source_tier>=4` AND the local reference is unavailable (both sides untrustworthy → say nothing rather than guess); fail-**open** (serve the value, tier flags as today) when the macro-indicators side is tier-1 live but the local reference alone is stale (avoids over-suppression per §8.3's explicit warning against blanket suppression turning into "agents stop citing real data").
- **EC-2 — Market closed / degenerate flat case.** Per the `po_falsification_20260725T1507` weekend-frozen-feed episode: an unchanging index across a closed market is correct, not a defect. The 5% divergence check is about **cross-plane agreement**, not day-over-day movement size — it should fire identically whether the market is open or closed, since both sides should still roughly agree on the last-known level. Do not special-case market-closed into a bypass.
- **EC-3 — Threshold denominator.** The dispatch's ">5%" is level-vs-level divergence between the two planes (e.g. `|macroVnIndex − localVnIndex| / localVnIndex`), not delta-vs-delta and not the day-over-day move size. The 07-15 incident's own ~29% figure was a **move-size** framing (526/1806); the **cross-plane divergence** that cycle was `(1782.12−1280.5)/1782.12 ≈ 28.2%` — both exceed 5% comfortably, so the distinction doesn't change today's incident's outcome, but architect should pick one denominator explicitly and document it (recommend level-vs-level, since that's the literal board-row wording and it's independent of session move size).
- **EC-4 — Extending beyond vnIndex.** §8.3 of the source handoff explicitly warns the underlying invariant ("no direction/move claim when tier is low or delta absent") is not VN-Index-specific — oil/gold/usdVnd carry the same risk. **Not in this row's scope** (dispatch is VN-Index-only) — architect should design the domain guard as a small reusable helper (field-agnostic: level A, level B, threshold → trustworthy/gap) so extending to the other 3 fields later is a call-site addition, not a rewrite. Do not scope-creep the AC to cover them now.

---

## 5. Blockers

**Zero PO-level blockers.** The one substantive item (§0 — Part 1 as literally worded is disproven) is a technical correction grounded in code + a live retraction already on record in the row's own `detail_ref`, not a business/priority/VN-term/data-source/historical-vs-realtime question. Recommending PO ratify the scope narrowing (close Part 1 literal, keep Part 2 + FR-3 companion) is noted for the record but does not gate architect starting FR-1's design.

---

## 6. Recommended fix-set for architect (file : section : change)

| # | File | Layer | Change |
|---|---|---|---|
| 1 | `apps/mcp-server/src/domain/services/` (new file, e.g. `vnIndexPlausibilityGuard.ts`) | domain | FR-1/FR-2 pure guard function |
| 2 | `apps/mcp-server/src/interface/mcp/tools/macro/macroTools.ts` | interface/application | Wire guard into `get_macro_snapshot` response assembly; add local `market_prices`/`VNINDEX` read alongside existing macro-indicators HTTP call |
| 3 | `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts` | interface | Co-locate but do NOT merge — distinct guard (shape vs. value plausibility) |
| 4 | `apps/macro-indicators/pkg/application/dtos.go` + `usecases.go` | interface (DTO) | FR-3 companion only — new vnIndex-specific baseline-provenance field; do NOT touch `computeDelta`'s null-guard (already correct) or remove `vnIndexDelta` |
| 5 | test harness (new, `apps/mcp-server/src/__tests__/`) | verification | FR-4 — reproduce the 07-15 incident inputs (macroVnIndex=1280.5/tier4/estimate vs. local=1782.12) → assert gap-token, not the numeric claim, reaches the tool response |

No `apps/macro-indicators` change is required for the primary AC (FR-1/FR-2) — only the FR-3 companion touches it, and that's additive/low-severity.

---

## 7. Coordination / dedup note

No duplicate row exists for the corrected scope. `UC-CCA-P3` owns the double-publish/marker-lifecycle defect (distinct, already noted on the board row). `FIX-VNINDEX-ESTIMATE-IMPLAUSIBLE-DELTA-GATE` (P2, `apps/macro-indicators/`, BACKLOG, created 2026-07-16 from the earlier tran-ngoc-bau c110 finding) is a **prior, narrower sibling** of this same family — its own title already says "add a plausibility bound on the vnIndex delta" and its zone (`apps/macro-indicators/`) reflects the same producer-vs-consumer ambiguity this spec resolves (§ DDD layer mapping: the guard belongs in the consumer, `apps/mcp-server/`, not the producer). Flag to PO/architect: fold `FIX-VNINDEX-ESTIMATE-IMPLAUSIBLE-DELTA-GATE` into this row on completion rather than implementing it separately in the wrong zone — same underlying fix (FR-1) satisfies both.

---

## RETURN
DONE: BA spec complete, zero PO blockers (one scope-correction flagged for PO ratification, non-blocking).
NEXT: architect — confirm FR-1's comparison target (recommend `market_prices.VNINDEX`, see FR-1 naming clarification), rule on EC-1's fail-open/fail-closed asymmetry, produce brownfield file-level design for the domain guard + `macroTools.ts` wiring.
HANDOFF: docs/handoffs/FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE-BA-spec.md
PIPELINE: continue (supervised — do not auto-advance past architect without supervisor go-ahead per this row's `supervised_note`)
