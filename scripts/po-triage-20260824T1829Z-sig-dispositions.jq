# po-triage-20260824T1829Z-sig-dispositions.jq
# PO Step 0-SIG board actuation for the 2026-08-24T18:07Z dev-team triage tick (24 envelopes).
#
# Owning flow doc: docs/agents/po/flow/triage-signals.md (§ Pipeline-A routing table)
# Run: jq -f scripts/po-triage-20260824T1829Z-sig-dispositions.jq \
#        docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# 1. MINT 5 backlog[] rows for the 5 genuinely-new findings (all dedup-verified absent
#    via scripts/po-board-dedup-search.sh against the NON-TERMINAL lanes).
# 2. ACTUATE next_agent on the 5 self-filed FIX-SIGNAL-TYPE-ROUTING-GAP-* rows, which the
#    guard mints with next_agent=null -> structurally unspawnable -> CI stays red forever.
# 3. FOLD notes onto 2 UNDER-prose-ceiling rows only (backlog[398] 4272B, backlog[486] 10902B).
#    Over-ceiling fold targets (backlog[364] 33241B, ready[33] 13255B, ready[62] 12597B,
#    backlog[369] 11239B) are deliberately NOT touched -- orch-row-prose-ceiling-check hard-aborts
#    on ANY growth of an already-over-ceiling row. Those folds live in the decision journal.
# Does NOT touch .head (a live qa dispatch is pinned there) or either live peer row.

def NOW: "2026-08-24T18:29:19Z";

.task_board.backlog += [
  {
    id: "FIX-MARKETWATCHER-EOD-LEDGER-CLAIM-COMMITTED-ZERO-WRITES",
    title: "market-watcher EOD reports 10 analysis-brief ledger entries 'committed' — zero were written this cycle and 2 of the named files have never existed; the false record is durably committed to the notebook",
    owner: "agent-father",
    next_agent: "agent-father",
    status: "BACKLOG",
    priority: "P0",
    zone: "docs/agents/market-watcher/",
    created_at: NOW,
    dedup_key: "agent-write-path-defect:docs/agents/market-watcher/flow/eod.md|claim-without-write",
    origin_signal_id: "6edc3a8cd29c049f6d14935a3766a9ad50513c8b5a087089676b6d37b8976509",
    status_note: ("AC: a market-watcher-eod cycle that RETURNS 'ledger entries written' must be provably backed by a git-tracked change to each named docs/analysis-briefs/{TICKER}.md in that cycle's own commit. | EVIDENCE (router Step 5.3 reconciliation of the 2026-08-24T16:00Z tick, first fire since 2026-08-14T16:10:51Z): RETURN + notebook both claim 10 ledger entries; commit 3c3f18bc6 changed exactly ONE file (docs/agent-memory/notebooks/market-watcher.md). docs/analysis-briefs/SAB.md and VEA.md do not exist at all, which independently falsifies the create-if-missing branch at docs/agents/market-watcher/flow/eod.md:21-23 -- neither branch ran. DBC/DPM (mtime 2026-08-06), KDC (2026-05-20), MSN (2026-07-23), VNM (2026-08-12) untouched; BID/EIB/VIC dirty from EARLIER cycles, not this one. | SELF-FALSIFYING DETAIL, cite it in the fix: the RETURN's ticker list and the notebook's ticker list disagree by one member (RETURN says VIC, notebook says VJC) -- two accounts of the same ten differing proves the list was narrated, never read back from actual writes. | SCOPE: dispatch is HEALTHY (slot matched, claimed, spawned, returned); this is write-path only. | SECONDARY (do NOT re-mint, already tracked): docs/agents/market-watcher/flow/eod.md:101 git add is notebook-scoped, so the ONE genuine deliverable this cycle (docs/signals/price_anomaly_20260824T1600.json, 13025B, 34 tickers, 5 anomalies) is untracked and docs/data/coverage-state.json went dirty again ~4h after its manual restore at 693f8df9e -- same RULE 2.5 pathspec-orphan shape already on file. | Filed by po from bug-escalation envelope 6edc3a8c, dev-team tick 2026-08-24T18:07Z.")
  },
  {
    id: "FIX-REFINEBCTC-SKIPSET-NO-STATUS-FILTER-FAILED-UNITS-PERMANENTLY-TERMINAL",
    title: "refine_bctc_md resume skip-set is keyed on unit_id with no window_status filter — a unit pushed FAILED with empty markdown is excluded from every future chunk forever, no retry path in any layer; 15 of 24 pushed units of VIC Q1-2026 are now permanently empty",
    owner: "agent-father",
    next_agent: "agent-father",
    status: "BACKLOG",
    priority: "P0",
    zone: "docs/agents/refine_bctc_md/",
    created_at: NOW,
    dedup_key: "refine-bctc-durability:skipset-no-window-status-filter",
    origin_signal_id: "fb709def64fee12a580b8dfc11ccc9f45a190c6e2d9a5e1681b7ba952a62602c",
    status_note: ("AC: (i) the resume skip-set filters on window_status == 'DONE' so a FAILED unit re-enters the next chunk; (ii) a bounded per-unit retry counter prevents a genuinely unextractable page looping forever; (iii) a companion decision is recorded for what finalize_bctc_refine does when any unit is still FAILED at finalize time -- today it finalizes regardless, which is how a report with 15/24 empty units can be marked complete. | SITE: docs/agents/refine_bctc_md/flow/main.md:71 and :78 -- pushed_ids = Set(units.map(u => u.unit_id)) / chunk = windows.filter(w => !pushed_ids.has(w.unit_id)). window_status is read exactly once in the whole flow, at :74-77 for the RESET-GUARD has_done_units check, and never for skip-set eligibility. A FAILED push is therefore indistinguishable from a DONE push to the resume path. | BLAST RADIUS, verified at source via get_bctc_refined against report_id 1f53ef33-8f50-489b-8505-689740692ab0 (VIC Q1-2026), NOT from the agent RETURN: 24 pushed, 9 DONE, 15 FAILED -- units 0000/0001/0007 (morning fire 09:03-09:05Z) plus 0012-0023 (16:33-16:34Z fire), markdown empty, confidence 0, covering pages 1, 2, 11 and 20-50 (the entire notes section). | SEPARATE SUB-FINDING worth its own look, do not let it hide inside D1: units 0014,0015,0016,0018,0019,0020,0021,0023 all landed inside 16:34:09-16:34:17 -- eight units in eight seconds, one per second, all carrying the byte-identical flag string content_mismatch:prose_expected_continuation, while the other four this fire are spaced ~13s apart with varied flags. A 1/sec cluster of identical flags is a template emission, not twelve per-unit judgements. Morning contrast on the SAME report and pipeline: 75% success, 5-30s spacing -- a cliff, not a gradient. | Filed by po from bug envelope fb709def, dev-team tick 2026-08-24T18:07Z.")
  },
  {
    id: "FIX-REFINEBCTC-DONE-WITHOUT-IMAGE-LEG-SHIPS-ROWSHIFTED-NUMBERS-AT-CONFIDENCE-065",
    title: "refine_bctc_md ships window_status DONE at confidence 0.65-0.75 on units whose own flags say image_unavailable / garbled_ocr_layout — the FR-13 structure leg provably did not run, and the resulting row-shifted numbers pass every downstream null and plausibility check",
    owner: "agent-father",
    next_agent: "agent-father",
    status: "BACKLOG",
    priority: "P0",
    zone: "docs/agents/refine_bctc_md/",
    created_at: NOW,
    dedup_key: "refine-bctc-integrity:done-without-image-leg",
    origin_signal_id: "fb709def64fee12a580b8dfc11ccc9f45a190c6e2d9a5e1681b7ba952a62602c",
    status_note: ("AC: DONE is blocked when image_unavailable (or garbled_ocr_layout) is present on the unit -- FR-13's contract is numbers<-OCR, structure<-image, so an absent image leg means the contract was not met and DONE is a false status; alternatively gate DONE behind a confidence floor. | EVIDENCE, report 1f53ef33-8f50-489b-8505-689740692ab0 (VIC Q1-2026), units 0004/0005/0006 flagged image_unavailable, image_unavailable:pages6-8, garbled_ocr_layout respectively, ALL THREE shipped DONE at 0.65-0.75 with full number tables. Corruption visible in unit 0005 by sign/label inspection alone: Nguyen gia (gross cost) carries a parenthesized negative (33.020.984) -- gross cost is never negative; Du phong ton that dau tu carries POSITIVE 44.670.551 / 35.916.035 while every other provision row in the same table is parenthesized negative; Dau tu nam giu den ngay dao han dai han carries (3.436.252) where the prior-period column is +16.567.029; Gia tri hao mon luy ke moves (160.683.471) -> (73.936.379), accumulated depreciation halving YoY on a growing asset base. Values are shifted relative to their labels -- exactly what the unit's own garbled_ocr_layout flag says -- and it still shipped DONE. | WHY THIS IS WORSE THAN THE SIBLING D1 ROW: a FAILED unit with empty markdown is loud and self-describing; a DONE unit at 0.65 with plausibly-magnituded but row-shifted numbers passes every null check and every non-zero plausibility check downstream (TONG CONG TAI SAN 1.178.694.748 trieu VND is believable for VIC, so nothing flags it). See feedback_nonzero_values_need_plausibility_check. | SPLIT, PO ROUTING DECISION: this row is the DONE-GATING half only (flow-doc zone, agent-father). The root cause of the image unavailability itself is a pdf-extractor concern and folds onto the already-open FIX-BCTC-PAGE-IMAGE-FETCH-DEGRADED-CONFIDENCE-CAP (next_agent=developer) plus FIX-BCTC-IMGDEG-SIGNAL-SUMMARY-CONTRADICTS-ITS-OWN-LIVE-CONFIDENCES -- do NOT assign that slice to agent-father. | Filed by po from bug envelope fb709def, dev-team tick 2026-08-24T18:07Z.")
  },
  {
    id: "CHORE-CTXBLOAT-CLAIM-TRUTH-GATE-SKILL-MD-OVER-BYTE-CAP-RECURRING",
    title: "context-bloat-backstop-hook fires repeatedly on .claude/skills/claim-truth-gate/SKILL.md (13018B, still over cap after the 17:4xZ trim attempt) — a skill file, a subject class the context_bloat_breach routing rule's owner/zone options do not cover",
    owner: "claude-manager-helper",
    next_agent: "claude-manager-helper",
    status: "BACKLOG",
    priority: "P2",
    zone: ".claude/skills/",
    created_at: NOW,
    dedup_key: "context_bloat_breach:.claude/skills/claim-truth-gate/SKILL.md",
    origin_signal_id: "e3f9d7cf329a25a2b8d70650b51515491cf51b46461537a29f0543496398dac7",
    status_note: ("AC: .claude/skills/claim-truth-gate/SKILL.md is under the byte cap AND the hook stops firing on it for a full 24h. | MEASURED LIVE 2026-08-24T18:2xZ: 182L / 13018B. Commit b1e48b8ba ('tighten claim-truth-gate cache-param note -- reduce byte-cap overage') already attempted a trim and the file STILL breached twice after it, at 17:45:19Z and 17:47:44Z. A trim that leaves the file over cap is not a fix; this needs a split (extract the CCATO-MCP-T7 dual-path invocation section to a sibling) not another shave. | THREE fires reached this tick's durable inbox for this ONE file (15:24:50Z, 17:45:19Z, 17:47:44Z) -- folded into this single artifact per the routing rule's one-open-artifact-per-file discipline. | ROUTING GAP worth naming in the fix: docs/agents/po/flow/triage-signals.md's context_bloat_breach row offers exactly two zones, docs/agent-memory/notebooks/ and docs/agent-memory/decisions/, and its DEFER carve-out is scoped to open-sprint decision journals. A .claude/skills/*.md subject matches neither, so the rule under-specifies its own owner/zone for this class. | Filed by po, dev-team tick 2026-08-24T18:07Z.")
  },
  {
    id: "FIX-BCTCANALYST-CARRYOVER-ESCALATION-NEVER-REACHES-BOARD-11-DAYS",
    title: "bctc-analyst has carried 'DXG cash-flow-anomaly (c162) still pending dev-team pickup' verbatim in its notebook Carry-over line for 11 days with ZERO board row and no surviving signal file — the escalation exists only inside the agent's own notebook",
    owner: "agent-father",
    next_agent: "agent-father",
    status: "BACKLOG",
    priority: "P1",
    zone: "docs/agents/bctc-analyst/",
    created_at: NOW,
    dedup_key: "agent-escalation-durability:bctc-analyst|carryover-never-reaches-board",
    origin_signal_id: "57db23dcc87e9c3f1016a53f6aa58f2c0db0d1b708dec58b7e7d4e54c1fe26b7",
    status_note: ("AC: a bctc-analyst finding that survives >=2 cycles as a Carry-over line must have produced either a board row or a live docs/signals/*.json -- verified by picking any current Carry-over item and resolving it to one of those two planes. | MEASURED: docs/agent-memory/notebooks/bctc-analyst.md lines 14/24/34 carry the identical string 'DXG cash-flow-anomaly (c162) still pending dev-team pickup' across three consecutive cycles. The cited origin file bctc-analyst-20260813T001500Z.json is absent from BOTH docs/signals/ and docs/signals/processed/. Board sweep of all five non-terminal lanes for get_cash_flow / OCF-magnitude / 'astronomic' returns ZERO rows. So after 11 days the finding has no durable carrier at all. | PO ACK-WITH-CORRECTION on the finding's own content -- do NOT copy the agent's claim forward as fact: the notebook says get_cash_flow 'returns astronomically large OCF values'. Re-probed live at 2026-08-24T18:2xZ via gateway: get_cash_flow(DXG) returns period Q2/2026 with operating_cf, investing_cf, financing_cf, capex, free_cash_flow, ocf_ni_ratio ALL null. The astronomic-magnitude claim is NOT reproducible today and must not be minted as fact. What IS reproducible is a different and still-real shape: found=true with source_tier=1 while every financial field is null, which a consumer cannot distinguish from a genuine zero -- same class as the already-open FIX-VNLIQUIDITY-MISSING-INPUT-PUBLISHED-AS-COMPUTED-ZERO-UNDER-STATUS-OK. Scope the fix to the durability defect (this row) and fold the data shape onto that existing row rather than re-mint it. | CONTRIBUTING, already documented: bctc-analyst has no Bash grant (project_bctc_analyst_no_bash_grant_perpetual_dirty_artifacts), so it cannot commit or write a signal file itself -- the Carry-over line is the only channel it has. The fix belongs in the flow, not in the agent's diligence. | Filed by po, dev-team tick 2026-08-24T18:07Z.")
  }
]

# --- ACTUATION: the 5 guard-self-filed routing-gap rows are minted with next_agent=null,
#     which makes them structurally unspawnable, which is why signal-type-coverage-guard has
#     stayed RED. Give them an owner that can actually edit docs/agents/po/flow/triage-signals.md.
| .task_board.backlog |= map(
    if ((.dedup_key // "") | test("^signal-type-registry-gap:(bug|container_capacity_pressure|launchd_tracking_gap|memory_loop_breach|memory_pressure_transient)$"))
    then . + {
      owner: "agent-father",
      next_agent: "agent-father",
      zone: "docs/agents/po/flow/",
      priority: "P1",
      status_note: (((.status_note // "") | tostring)
        + " | [po " + NOW + "] ACTUATED: this row was self-filed by scripts/audits/guard-signal-type-coverage.sh with next_agent=null, i.e. structurally unspawnable -- no picker on any lane can resolve a null next_agent, so it could never be dispatched and signal-type-coverage-guard stayed RED regardless. owner/next_agent/zone set to agent-father + docs/agents/po/flow/. DISPATCH AS ONE HOP with its siblings under the umbrella row FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS -- all of them are table rows in the same two files (docs/agents/po/flow/triage-signals.md and its triage-signals-longtail.md sibling) and must not become N separate agent-father dispatches.")
    }
    else . end
  )

# --- FOLD (under-ceiling targets only) ---
| .task_board.backlog |= map(
    if .id == "FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-PHASE1-IMPL"
    then . + { status_note: (((.status_note // "") | tostring)
      + " | [po " + NOW + "] CORROBORATION FOLDED, no new row (bug-escalation envelope e2037d2c, cowork-team, 2026-08-24T15:15:30Z): the bctc leg of this Phase-1 spec now has OBSERVED, not inferred, evidence of live data loss. bctc-analyst fires 4x/day (cron 0 15,18,21,0 UTC) all in mode=routine, and the filename template bctc_signal_{TICKER}_{YYYYMMDD}_{mode}.json is date-only, so all four daily cycles write the SAME basename per ticker. scripts/agents-flow/drain-signals.js:260 sets dest = path.join(PROC, base) with NO collision guard; the -replay.json suffix at :257 fires only on a duplicate FINGERPRINT (sha256 over from+type+payload+createdAt), and the content differs every cycle, so that branch is never taken. Git proves the overwrite: docs/signals/processed/bctc_signal_VCB_20260823_routine.json has FOUR commits on 2026-08-23 (47d74a8eb 00:17Z, a8fae8137 15:07Z, c4ac9c5d0, f13fa173a 21:07Z), one per cycle, same path rewritten each time; the 08-22 file has two (e98049c69, 9aef86e43). Zero replay files present. Blast radius is BOUNDED: the SQLite signals_processed row survives per fingerprint (drain-signals.js:304) and the durable inbox batch is intact, so ROUTING is not lost -- what is lost is the on-disk forensic copy, so any reader treating docs/signals/processed/ as the day record sees 1 of 4 cycles. Suggested fix confirms this spec's own direction: bctc_signal_{TICKER}_{YYYYMMDDTHHMMSSZ}_{mode}.json, matching what bctc-analyst ALREADY does for escalation signals; template change only, 5 doc sites (docs/agents/bctc-analyst/init.md:16/:85/:149, flow/stage-analyze.md:114, flow/stage-consolidate.md:64). A dest-exists collision guard in drain-signals.js is an optional second layer in the scripts/ zone, not required to close this.") }
    else . end
  )
| .task_board.backlog |= map(
    if .id == "FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS"
    then . + { status_note: (((.status_note // "") | tostring)
      + " | [po " + NOW + "] ci_red 471a398a FOLDED on the file-scoped dedup_key (run 32749074699, head a73f0f2c7). TYPE SET HAS ROTATED off this title's Pipeline-A pair; it is now Pipeline-B: [container_capacity_pressure, launchd_tracking_gap, memory_loop_breach, memory_pressure_transient, system_issue]. Reproduced locally. THIS ROW IS THE UMBRELLA: dispatch ONE agent-father hop adding every missing table row to docs/agents/po/flow/triage-signals.md + its triage-signals-longtail.md sibling; the six FIX-SIGNAL-TYPE-ROUTING-GAP-* / -SYSTEMISSUE-UNDERSCORE-FORM-UNROUTED rows are members, not separate dispatches. PREMISE CORRECTED, do not chase: the CI log's 'bun: command not found -> [orch-apply] ABORTED: exit 127' is NOT a defect -- ci.yml states in-line that bun is deliberately off this job's bash/jq-only profile and a mint degrades to a logged mint-FAILED line; the gate is exit 1 on any unrouted type. CONFIRMS FIX-GUARD-SIGNAL-TYPE-COVERAGE-CHECK-FLAG-MISLEADING-NOT-DRYRUN: --check MUTATED the live board this tick, minting FIX-SIGNAL-TYPE-ROUTING-GAP-bug.") }
    else . end
  )
