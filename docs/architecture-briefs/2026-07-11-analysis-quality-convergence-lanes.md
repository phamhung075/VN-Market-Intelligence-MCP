# Architecture Brief — ANALYSIS-QUALITY-CONVERGENCE Lane Split

**Date:** 2026-07-11
**Author:** agents-architect
**Status:** READY — route to pm for decomposition
**Trigger:** BA handoff `docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md` (7 FRs, 7 NFRs, 12 ACs). Zero PO blockers per BA.

---

## 1. Lane Split — Summary

| Lane | Scope | Owner(s) | Gate | Can start now? |
|---|---|---|---|---|
| A | FR-1 (6-flow indicator wiring) + FR-2 (CHEF AF-1 gate ext.) | `cowork-refactory-expert` | none | YES |
| B | FR-5 (CCATO-T3, 6-pt claim-truth-gate wiring) | `cowork-refactory-expert` | FR-4 DONE_VERIFIED | NO — after Lane C |
| C | FR-4 (CCATO-T2 skill) | `developer` | CCATO-T1 (DONE_VERIFIED — clear) | YES, parallel with A |
| D | FR-3 (GAP-CHEF-SYNTHESIS-B: endpoint + card) | `dev-mcp-server` + `dev-frontend` | §0.6 / GAP-CHEF-SYNTHESIS-A DONE_VERIFIED | NO — currently REVIEW, ungated at DONE only |
| E | FR-7 (recon SPIKE spec) | `ops-mainserver-fetch` (primary), `ops-vps-fetch` (consult if VN-geo-blocked leg) | none | YES — pm mints (see §6, architect does not write orch-state) |
| F | FR-6 (Phase-2 note) | n/a — prose passthrough, no action this cycle | — | n/a |

Lanes A and C run in parallel (disjoint zones: `docs/agents/*` vs `.claude/skills/`). Lane B is a hard-blocked continuation of the same `cowork-refactory-expert` queue as Lane A — sequence Lane A first in that queue, but do not let it block Lane C starting immediately.

---

## 2. Lane A — FR-1 + FR-2 (cowork-refactory-expert, zero new code)

### 2.1 Anchors (BA-verified, trusted as-is; architect adds only the bctc-analyst decision BA left open)

| Flow | File | Anchor |
|---|---|---|
| unified-agent (CHEF) | `docs/agents/unified-agent/flow/chef.md` | Step 0 GATHER (L89-116, existing P0 tool block) — add `get_roc_momentum`/`get_relative_strength`/`get_52w_proximity`; feed Step 3/Step 4 per BA §1 |
| market-watcher | `docs/agents/market-watcher/flow/cycle.md` | Step "2. Market indicators" |
| digest-predict | `docs/agents/digest-predict/flow/daily-predict.md` | P-3 / P-4 |
| market-analyst | `docs/agents/market-analyst/main.md` | "Call P0 indicator tools at session start" block |
| news-scout | `docs/agents/news-scout/flow/stage-sentiment.md` | ~L27-34, existing `get_market_sentiment_index` block — add `get_insider_sentiment` alongside |
| bctc-analyst | `docs/agents/bctc-analyst/flow/stage-analyze.md` + `stage-consolidate.md` | **Architect decision below** |

**bctc-analyst anchor decision (BA left open — resolved):** `get_insider_sentiment` is a market-data gateway call, not a BCTC-document OCR pass — it does not belong as a 7th `stage-pass-*.md` file. Insert it in `stage-analyze.md` § **E1+E3 — Multi-Pass Trick Detection** (L131), as a new per-TICKER (not per-pass) call made once **before** the `[E1] Sequential passes` block (L143) — store result as `insider_sentiment_context`. Then `stage-consolidate.md` **Step 5 — Write trick_summary** (L37) cites `insider_sentiment_context` as corroborating/non-corroborating evidence in the trick narrative, consistent with the existing pattern where consolidate reads already-gathered per-pass results rather than fetching new data itself. Honest-NULL expected today (§0.3: `insider_transactions`=0 rows) — this is a designed PASS state, not a wiring bug (AC-10 cross-ref, do not re-diagnose `FIX-VPS-SSC-INSIDER-502`).

### 2.2 FR-2 atomicity requirement (load-bearing — not in BA's NFRs explicitly, architect adds)

FR-1's CHEF leg (adding `roc`/`z_score`/`decile`, `rs`/`percentile`, `pct_from_52w_*`, `insider net_sentiment_score` families into `chef.md` Step 0/3/4) and FR-2 (extending `chef.md` Step 6.7 Rule AF-1's blocked-token regex to cover those same 4 families) **MUST land in the same commit/task**. If FR-1's CHEF wiring ships without FR-2, CHEF can immediately cite an unsourced momentum/RS/52w/insider number and reopen the exact `FIX-CHEF-FABRICATED-TA-NUMBERS` vector FR-2 exists to close — a zero-day regression window, not a theoretical risk. The other 5 flows in FR-1 (bctc-analyst, market-watcher, news-scout, digest-predict, market-analyst) have no analogous Rule-AF-1-style gate in scope this sprint (BA scoped FR-2 to `chef.md` only) and are NOT coupled — they may land independently/incrementally.

**pm decomposition guidance:** one task for "FR-1 chef.md leg + FR-2" (atomic), one task (or up to 5 smaller tasks) for "FR-1 remaining 5 flows" — all `cowork-refactory-expert`, sequenced however that agent's own queue prefers, since NFR-3 (additive-only) makes them independently safe once the CHEF pair ships together.

### 2.3 Precedent

Mirror `IND-P1-CONSUMER-WIRING-AUDIT` (DONE_VERIFIED, commit `7832cc1f`, 64ins/7del additive across 6 flows) — same owner (`cowork-refactory-expert`), same gateway `call_tool(server="vn-market", tool="<bare>")` wrapper, same honest-NULL/`[SKIP]` discipline, same client-side filter requirement (§0.9 — tools return full-universe `tickers[]`, not per-symbol).

---

## 3. Collision Finding — `IND-P1-MOMENTUM-CONSUMER-WIRING` is SUPERSEDED by FR-1, not a duplicate to dispatch as-is

`IND-P1-MOMENTUM-CONSUMER-WIRING` (BACKLOG, `held_by:"po-s135"`, sprint `MARKET-INDICATOR-DEPTH-P0`) already carries a fully-built `wiring_map` for the same 4 momentum/RS tools. **It diverges from BA's fresh §0.4 matrix in 3 material ways:**

1. Its `wiring_map` targets **alert-commander** and **tran-ngoc-bau** — BA's FR-1 does not touch either flow at all (BA's 6 flows are chef/unified-agent, bctc-analyst, market-watcher, news-scout, digest-predict, market-analyst).
2. Its `wiring_map` assigns `get_foreign_accum_rank` to 4 flows (market-watcher, unified-agent, alert-commander, news-scout) — BA's FR-1 explicitly **DEFERs `get_foreign_accum_rank` everywhere** (§0.2, still blocked on `FIX-FOREIGN-FLOW-COVERAGE`).
3. It EXCLUDES `market-analyst` ("pending its tool-call-mechanism verification") — BA's §0.5 live-confirms that exclusion is stale; FR-1 includes market-analyst.
4. It has no `get_insider_sentiment` leg at all (different tool, not in its original P1-momentum-suite scope).

**Recommendation for pm:** do not dispatch `IND-P1-MOMENTUM-CONSUMER-WIRING` as-is. Two options, pm's call:
- **(a) Supersede-and-close:** flip `IND-P1-MOMENTUM-CONSUMER-WIRING` to `status:"SUPERSEDED"` with a note cross-referencing the new FR-1 task id(s), since FR-1's §0.4 table is the corrected, live-verified version of the same intent (its own `held_by:po-s135` hold is also now half-stale per BA §0.1 — 3/4 tools cleared).
- **(b) Merge-in-place:** overwrite its `wiring_map` field with BA's §0.4 table and clear `held_by` for the 3 cleared tools (keep foreign_accum_rank deferred), then dispatch that row instead of minting a fresh FR-1 task id.
Either way — the deliverable is BA's §0.4 matrix, not the row's original `wiring_map`. Do not let a stale board row silently override BA's fresher live-probe.

---

## 4. Lane C — FR-4 (developer, `.claude/skills/`)

**This is not new scope to mint — it is the existing `CCATO-T2-CLAIM-TRUTH-SKILL` backlog row** (sprint `NARRATIVE-TRUTH-CCATO-GATE`, status BACKLOG, `owner:"developer"`, `zone:".claude/skills/"`, `depends:["CCATO-T1-TRUTH-GATE-ENGINE"]`). Its dependency **`CCATO-T1-TRUTH-GATE-ENGINE` is DONE_VERIFIED** (qa-approved 2026-07-01, `scripts/narrative-truth-gate.sh` + `docs/data/claim-tool-map.json` live and tested) — FR-4 is unblocked today.

**pm action:** dispatch `CCATO-T2-CLAIM-TRUTH-SKILL` directly (do not re-mint a parallel FR-4 task — same deliverable, same file: `.claude/skills/claim-truth-gate/SKILL.md`, contract already fully specified in `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md` §4).

---

## 5. Lane B — FR-5 (cowork-refactory-expert, sequenced after Lane C)

**Likewise not new scope — this is the existing `CCATO-T3-FLOW-WIRING-6PT` backlog row** (BACKLOG, `owner:"cowork-refactory-expert"`, `depends:["CCATO-T2-CLAIM-TRUTH-SKILL"]`, 6 anchors already pinned: fb-market-poster STEP 4d, `chef.md` Step 6.7 Rule AF-3, market-watcher `cycle.md` Step 4f, alert-commander `stage-dispatch-log.md` Step 4a-pre, digest-predict `daily-predict.md` P-5.5, TNB `audit-market.md` Step 2).

**§0.8 naming-collision reminder (BA flagged, architect reinforces):** FR-5/CCATO-T3's 6 flows are a **different set** from FR-1's 6 flows. Overlap = exactly 3 (chef.md, market-watcher, digest-predict); FR-5 additionally touches fb-market-poster/alert-commander/tran-ngoc-bau which FR-1 never touches, and FR-1 additionally touches bctc-analyst/news-scout/market-analyst which FR-5 never touches. Since both route to the same agent (`cowork-refactory-expert`) and 3 files overlap, **pm must sequence the overlapping-file edits (chef.md, cycle.md, daily-predict.md) so FR-1/FR-2's edits land BEFORE FR-5's edits touch the same files** (FR-5 inserts a gate at Step 6.7 Rule AF-3 / Step 4f / P-5.5 — those step numbers must reflect the FR-1/FR-2-modified file, not a stale pre-FR-1 version) to avoid a merge/anchor-line-drift conflict within one agent's own sequential queue.

**pm action:** dispatch `CCATO-T3-FLOW-WIRING-6PT` (not a fresh FR-5 id) once `CCATO-T2-CLAIM-TRUTH-SKILL` reaches DONE_VERIFIED, and after FR-1/FR-2's chef.md/cycle.md/daily-predict.md edits have landed.

---

## 6. Lane E — FR-7 (recon SPIKE — spec only; architect does NOT write orch-state.json)

Per this task's explicit non-negotiable constraint ("write ONLY to docs/architecture-briefs/ + notebook/decision journal"), the architect specifies the SPIKE row below for **pm to mint** via `jq '<transform>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` (BA's cascade table names architect as "mints" — resolved here as "architect fully specs it, pm executes the board write," consistent with pm's stated `orch-state.json .task_board` ownership in the agent roster).

```json
{
  "id": "SPIKE-EARNINGS-REV-VALUATION-PCTILE-FEASIBILITY",
  "type": "SPIKE",
  "title": "Recon SPIKE (PLAN-ONLY): probe for a REAL, machine-reachable, HTTP-only, VPS-compatible, no-paid-API-key feed for (a) analyst-consensus earnings-revisions and (b) VN-Index P/E multi-year history — GO/NO-GO verdict only, forbid any build/compute/indicator design this cycle",
  "status": "BACKLOG",
  "priority": "low",
  "size": "S",
  "plan_only": true,
  "zone": "recon",
  "sprint": "ANALYSIS-QUALITY-CONVERGENCE",
  "owner": "ops-mainserver-fetch",
  "next_agent": "ops-mainserver-fetch",
  "depends": [],
  "spec_ref": "docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md §4",
  "generic_mandate": "Probe candidates: FiinGroup/FiinTrade consensus API (expect paywalled — confirm), VNDirect/SSI/Simplize research portals (expect narrative-only — confirm structured-data absence), Refinitiv/Bloomberg VN coverage (expect enterprise-paywalled — confirm), TradingEconomics (check for a P/E multi-year VN-Index series on the already-used slug family). If any candidate is VN-hosted/geo-blocked from main server, hand the HTTP recon leg to ops-vps-fetch (same split pattern as the existing dev-vps-crawls/dev-mainserver-crawls division). Output a GO/NO-GO verdict per gap ONLY — do not scope a build even if GO (per BA: a future sprint scopes it, speculative ahead of the SPIKE's own finding).",
  "acceptance": "A findings doc exists (docs/vps-sources/ or docs/mainserver-sources/ per the recon-pipeline convention) with an explicit GO/NO-GO verdict for both (a) and (b), each backed by an actual HTTP probe result (status code / response shape / paywall confirmation), not an assumption.",
  "verification_gate": "qa confirms zero code/compute/indicator-design artifacts were produced (PLAN-ONLY discipline) and both verdicts are evidenced by a real probe, not restated from the roadmap's prior rejection text.",
  "source": "BA-ANALYSIS-QUALITY-CONVERGENCE FR-7 / AC-12"
}
```

**AC-12 compliance:** this satisfies "a recon SPIKE task is minted (BACKLOG, PLAN-ONLY, size S) for §4's two gaps, explicitly forbidding any build/compute step before a GO verdict" — the mint action itself is pm's, per the write-boundary constraint above.

---

## 7. Lane D — FR-3 split (GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD, already-minted, `zone:"multi"`)

This BACKLOG row's own `generic_mandate` already states "Architect to split mcp-server endpoint vs frontend card" — done here:

**FR-3a — `dev-mcp-server`:** `GET /api/cheb-synthesis` (or fold into `/api/market-digest`, dev-mcp-server's call) reads `docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json`, adds a `data_asof`/`generatedAt` freshness field — reuse the `sectorRotationHandler.ts` pattern (`apps/mcp-server/src/interface/mcp/routes/sectorRotationHandler.ts`). Doc updates go to `docs/architecture/microservice/mcp-server/` — dev-mcp-server writes it, architect does not.

**FR-3b — `dev-frontend`:** card component consuming FR-3a's endpoint, surfacing conviction calls / sector phases / regime / known_gaps. Doc updates go to `docs/architecture/microservice/frontend/` — dev-frontend writes it, architect does not.

**Hard gate (unchanged from board, reconfirmed live 2026-07-11):** `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` is `status:"REVIEW"`, `review_gated_by:"live-cycle-verification"` — code shipped (`chef.md` Step 7.6) but **zero live `docs/data/unified-agent-synthesis-*.json` files exist on disk** (BA §0.6, re-confirmed by architect same session). Neither FR-3a nor FR-3b starts until A flips `DONE_VERIFIED` (a live CHEF cycle producing a non-empty JSON file) — the `blocked_by` relationship already on the board row is correct; pm holds dispatch, does not need to add anything new. NFR-6 (full-pipeline RAW-verify) applies at every hop once unblocked.

---

## 8. Cross-reference discipline (AC-10 — stated, not re-diagnosed)

- `get_insider_sentiment`'s near-zero current value (§0.3, `insider_transactions`=0 rows) traces to `FIX-VPS-SSC-INSIDER-502` (status TODO/BACKLOG, VPS-proxy 502 on ssc-insider upstream) — wiring ships anyway (honest-NULL is the designed PASS state); do not re-open this as a new investigation.
- `get_foreign_accum_rank`'s DEFER (§0.2, empty `tickers:[]`) traces to `FIX-FOREIGN-FLOW-COVERAGE` (status REVIEW, `rebuild_required:true`, code shipped 2026-07-09, blocked on an ops-gated container rebuild — `feedback_container_swaps_user_gated`) — wire this one tool after that rebuild lands, not before.

---

## 9. Lane F — FR-6 Phase-2 note (no action this cycle)

BA §3's sequencing (VN-yield-curve → prop/putthrough-flow pair → limit-lock → margin-leverage, with the `FIX-MACRO-*` cluster running in **parallel** since it's a different zone, `dev-macro-indicators`, not sequenced after) is architecturally sound as written — the zone separation matches the existing microservice roster (`dev-technical-analysis`/`dev-mcp-server` vs `dev-macro-indicators`). Nothing for pm to decompose this cycle (AC-11: zero code/task-board mutation, all rows stay BACKLOG). Passthrough only.

---

## 10. Dependency Graph

```
CCATO-T1-TRUTH-GATE-ENGINE (DONE_VERIFIED)
        │
        ▼
Lane C: CCATO-T2-CLAIM-TRUTH-SKILL (developer) ──────┐
        │                                              │
Lane A: FR-1 (5 flows, no chef.md) ── independent ──┐  │
Lane A: FR-1(chef.md leg) + FR-2 ── ATOMIC ─────────┼──┼──▶ Lane B: CCATO-T3-FLOW-WIRING-6PT
        (cowork-refactory-expert queue)              │  │    (cowork-refactory-expert, after BOTH
                                                       │  │     Lane A files land AND Lane C DONE_VERIFIED)
Lane E: SPIKE-EARNINGS-REV-...  ── fully independent, any time

GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST (REVIEW, live-cycle-verification pending)
        │  gate: flips DONE_VERIFIED
        ▼
Lane D: FR-3a (dev-mcp-server) + FR-3b (dev-frontend) — parallel once gate clears
```

---

## 11. Build / Ownership Chain

| Phase | Owner | Deliverable | Zone | New mint needed? |
|---|---|---|---|---|
| Lane A | `cowork-refactory-expert` | FR-1 6-flow wiring + FR-2 gate ext (atomic w/ CHEF leg) | `docs/agents/*` | YES — pm mints (BA §0.4 is the spec, supersedes stale `IND-P1-MOMENTUM-CONSUMER-WIRING` per §3) |
| Lane C | `developer` | `.claude/skills/claim-truth-gate/SKILL.md` | `.claude/skills/` | NO — dispatch existing `CCATO-T2-CLAIM-TRUTH-SKILL` |
| Lane B | `cowork-refactory-expert` | 6-pt claim-truth-gate wiring | `docs/agents/*` | NO — dispatch existing `CCATO-T3-FLOW-WIRING-6PT` |
| Lane D | `dev-mcp-server` + `dev-frontend` | endpoint + card | `apps/mcp-server/`, `apps/frontend/` | NO — dispatch existing `GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD`, gated |
| Lane E | `ops-mainserver-fetch` (+ `ops-vps-fetch` consult) | GO/NO-GO findings doc | `docs/vps-sources/` or `docs/mainserver-sources/` | YES — pm mints per §6 spec |
| qa | `qa` | AC-1..AC-12 RAW-verify per lane | — | — |

---

## Signal to PM

See `docs/signals/analysis-quality-convergence-lanes-20260711T074555Z.json`.

## Decision Journal

**task_id:** ANALYSIS-QUALITY-CONVERGENCE (architect phase)
Key non-obvious decisions this cycle: (1) bctc-analyst anchor resolved to stage-analyze.md pre-pass fetch + stage-consolidate.md citation, not either candidate alone; (2) FR-1/FR-2 CHEF-leg atomicity is a real zero-day fabrication-regression risk BA's doc didn't state as an explicit NFR — added; (3) `IND-P1-MOMENTUM-CONSUMER-WIRING` and CCATO-T2/T3 are pre-existing board rows that materially overlap FR-1/FR-4/FR-5 — flagged to prevent duplicate-mint (SHG cross-sprint naming-collision class); (4) FR-7 SPIKE fully specced but NOT self-minted — task's explicit non-negotiable write-boundary constraint overrides BA's cascade-table phrasing ("architect mints"), resolved as architect-specs/pm-executes.
