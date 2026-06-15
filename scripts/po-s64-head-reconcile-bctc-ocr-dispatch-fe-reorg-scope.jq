# po-s64-head-reconcile-bctc-ocr-dispatch-fe-reorg-scope.jq
#
# Single-pass dev-team :07 tick triage (origin 2026-06-15, PO):
#
#   ITEM 1 (board reconcile — DO FIRST): the prior PO held
#     FIX-BCTC-ENRICH-SILENT-0ROWS at REVIEW (done_verified=PENDING) and minted
#     FIX-BCTC-BANK-PDF-OCR-RASTERIZE (READY, P0, dev-pdf-extractor) as the TRUE
#     remaining root, BUT `.head.active_task_id` was never advanced — it still
#     points at the REVIEW-held task, misdirecting the :07 tick away from the
#     READY P0. This script:
#       (a) RECONCILES `.head` -> active_task_id = FIX-BCTC-BANK-PDF-OCR-RASTERIZE,
#           next_agent = dev-team, fresh note (drops the stale "promoted ready->
#           in_progress" claim).
#       (b) DISPATCHES FIX-BCTC-BANK-PDF-OCR-RASTERIZE ready[] -> in_progress[]
#           with dispatch stamps (status IN_PROGRESS, owner/route dev-pdf-extractor,
#           claimed_by dev-team). Leaves it the #1 user-facing P0 coding lane.
#
#   ITEM 2 (NEW user sprint — scope through normal chain): user intent
#     "frontend pages resemble each other, merge to categories + organize better".
#     Read-only audit persisted at
#     docs/analysis-briefs/2026-06-15-frontend-page-reorg-audit.md. This script:
#       (c) APPENDS a sprint_goal.entries[] entry FE-PAGE-REORG (Wave-1 P0+P1 /
#           Wave-2 P2+P3, owner dev-frontend, /goal#1+#2 enforced in vision).
#       (d) MINTS BA-FE-PAGE-REORG to backlog[] (TODO, owner ba, zone docs/agents/)
#           -> routes the normal ba->architect->pm->dev-frontend->qa chain. This is
#           a PLANNING deliverable; it consumes ZERO dev coding WIP. The dev-frontend
#           IMPL lane enters only after the spec lands, keeping WIP<=2 vs the BCTC
#           OCR P0 coding lane.
#
# Idempotent: head reconcile is a set (re-run = same value); dispatch guarded by
# in_progress membership (already-dispatched -> no dup, ready[] stays drained);
# sprint_goal + BA mint guarded by id presence (re-run mints 0).
#
# Harness adds: atomic temp -> [ -s ] -> `jq empty` -> CONSERVATION guard
# (in_progress += exactly the dispatched task, ready -= it, all other board arrays
# byte-unchanged; backlog += exactly the BA mint; sprint_goal.entries += exactly 1)
# -> rename. Commit orch-state by EXPLICIT PATH only; never git add -A.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s64-head-reconcile-bctc-ocr-dispatch-fe-reorg-scope.jq \
#       docs/data/orch/orch-state.json > /tmp/orch.new
#   [ -s /tmp/orch.new ] && jq empty /tmp/orch.new && mv /tmp/orch.new docs/data/orch/orch-state.json

def TASK: "FIX-BCTC-BANK-PDF-OCR-RASTERIZE";
def BA_ID: "BA-FE-PAGE-REORG";

# --- (b) pull the OCR task out of ready[] (if still there) and stamp it for dispatch ---
( [ .task_board.ready[] | select((.id // "") == TASK) ] | first ) as $ocr_ready
| ( .task_board.in_progress | map(.id // "") | index(TASK) ) as $ocr_already_inprog

# dispatch-stamped task = the ready row (or, if already dispatched, keep existing in_progress row untouched)
| ( if $ocr_ready != null then
      ( $ocr_ready
        + { status: "IN_PROGRESS",
            owner: "dev-pdf-extractor",
            route: "dev-pdf-extractor",
            next_agent: "dev-pdf-extractor",
            claimed_at: $now,
            claimed_by: "dev-team",
            dispatched_at: $now,
            dispatched_by: "po-s64",
            dispatch_note: ((.dispatch_note // "") +
              " [PO-s64 " + $now + "] HEAD RECONCILED + DISPATCHED ready->in_progress. #1 user-facing P0 coding lane (get_bctc_full VCB/CTG='Chua co du lieu BCTC' true remaining root = scanned bank PDF OCR-rasterize leg). dev-pdf-extractor leads; PaddleOCR in-image; GENERIC low-text-density routing, no allowlist; preserve 989654f2 enrich_failed fail-loud; done_verified = REAL VARIED rows VCB AND CTG vs named-volume market.db + FPT/VCB non-regressed.") }
      ) else null end ) as $ocr_dispatch

# --- (c) FE-REORG sprint_goal entry ---
| ( .sprint_goal.entries | map(.sprint_id // "") | index("FE-PAGE-REORG") ) as $sg_present
| { sprint_id: "FE-PAGE-REORG",
    status: "active",
    vision: "Frontend pages that resemble each other collapse into shared generic components + a 6-category taxonomy, so the same UI fix lands on ALL pages at once (no per-page special-casing) with zero API/route/behavior change.",
    scope_in: "apps/frontend internal consolidation (Remix+TS+Tailwind+shadcn/ui, 33 dashboard routes, ~17.8K LOC). Wave-1 (P0+P1): merge dashboard.intel->_index; extract generic <ScreenerTable> (x5 pages); extract <SummaryGrid>+<LeaderboardCard>+<DirectionBadge> (x8 pages); lib/api/loader-utils.ts safeFetch<T> (x33 loaders). Wave-2 (P2+P3): <CodeSelector>+<DetailPanel>, <ContentCard>+badge components, <CollapsibleSection>, Remix route-group folders + unit tests on extracted components.",
    scope_out: "NO API-contract change, NO route-URL change, NO behavior change. Cluster #6 (analysis/orchestration/market-summaries large domain pages) NOT merged (logic orthogonal). Existing tests stay green untouched.",
    success_metric: "~5.1K LOC removable consolidated across waves; ONE <ScreenerTable> serves ALL entity tables (/goal#2 — same fix across all pages); EVERY migrated cell renders REAL loader data verified vs live payload — NO destructuring-default / placeholder masking a real metric (/goal#1 + standing no-fake-data directive); full existing frontend test suite stays green.",
    owner: "dev-frontend",
    audit_brief: "docs/analysis-briefs/2026-06-15-frontend-page-reorg-audit.md",
    waves: ["Wave-1: P0+P1 (merge+3 extracts)", "Wave-2: P2+P3 (3 extracts + route-group folders + unit tests)"],
    chain: "ba -> architect -> pm -> dev-frontend -> qa",
    created_at: $now } as $sg_entry

# --- (d) BA mint ---
| ( [ .task_board | to_entries[] | select(.value|type=="array") | .value[] | (.id // "") ] | index(BA_ID) ) as $ba_present
| { id: BA_ID,
    type: "SPRINT-M",
    title: "Requirement spec for FE-PAGE-REORG: frontend page-resemblance consolidation (6-category taxonomy + shared generic components), Wave-1 (P0+P1) then Wave-2 (P2+P3)",
    owner: "ba",
    status: "TODO",
    priority: "P2",
    zone: "docs/agents/",
    sprint: "FE-PAGE-REORG",
    route_to: "ba",
    audit_brief: "docs/analysis-briefs/2026-06-15-frontend-page-reorg-audit.md",
    desc: "Decompose the read-only frontend reorg audit into a wave-sequenced spec. Wave-1 (P0+P1): FR-1 merge dashboard.intel->dashboard._index (exact dup, same /api/market-digest, view toggle, ~225L); FR-2 extract a SINGLE generic <ScreenerTable> with configurable columns/renderers serving financials/officers/shareholders/reputation/services/quality-audit (x5-6, ~800L); FR-3 extract <SummaryGrid>+<LeaderboardCard>+<DirectionBadge> across the x8 card-grid Top-N ranking pages (~1.2K L); FR-4 lib/api/loader-utils.ts safeFetch<T>(url,parser) killing loader boilerplate across all 33 loaders (~2K L). Wave-2 (P2+P3): <CodeSelector>+<DetailPanel>, <ContentCard>+sentiment/type/agent badge components, <CollapsibleSection>, Remix route-group folder refactor (org only, no URL change) + unit tests on every extracted component. Architect splits any multi-zone item (component lib vs per-route migration). HARD /goal constraints in every FR's acceptance: (1) generic component is ONE implementation serving ALL entities -- no per-page special-case fork (/goal#2); (2) every migrated cell MUST render REAL loader data verified vs the live payload -- a destructuring-default or '?? placeholder' that masks a real metric is a FAIL (/goal#1 + no-fake-data); (3) NO API-contract / route-URL / behavior change -- existing frontend tests stay green untouched (regression gate).",
    generic_mandate: "One <ScreenerTable> (and one of each extracted component) serving ALL pages -- NO per-page special-cased fork. /goal#2.",
    no_fake_data_requirement: "Every migrated cell renders REAL loader data verified vs live payload; no destructuring-default / '?? placeholder' may mask a real served metric. /goal#1 + standing no-fake-data directive.",
    verification_gate: "Existing frontend test suite green untouched (no API/route/behavior change); each extracted component used by >=2 pages with real props; QA spot-verifies migrated cells render live values not placeholders.",
    created_at: $now,
    created_by: "po-s64" } as $ba_task

# ============ apply mutations ============
| .

# (a) head reconcile -> point at the READY/now-dispatched P0
| .head.status        = "active"
| .head.active_task_id = TASK
| .head.next_agent     = "dev-team"
| .head.updated_at     = $now
| .head.updated_by     = "po-s64"
| .head.note = ("PO TRIAGE " + $now + " (dev-team :07 tick). HEAD RECONCILED: prior head stale-pointed at FIX-BCTC-ENRICH-SILENT-0ROWS (REVIEW/done_verified=PENDING in review[]) -- never advanced after that task's done_verified HOLD (check-a FAIL: scanned bank PDFs = 0 text-chars, text-table parser never fires). HEAD now -> FIX-BCTC-BANK-PDF-OCR-RASTERIZE (P0, dev-pdf-extractor) -- the TRUE remaining root of get_bctc_full(VCB/CTG)='Chua co du lieu BCTC' (add OCR-rasterize leg via PaddleOCR before text-table parse; GENERIC low-text-density routing, no allowlist). DISPATCHED ready->in_progress this tick = 1 dev coding lane. ARCH-CRON-SCHEDULER-RELIABILITY (in_progress) is architect-design + QA-LIVE-OUTCOME-OBSERVE gate -- consumes NO dev coding WIP. WIP<=2 honored. ITEM 2 scoped: minted sprint_goal[FE-PAGE-REORG] + BA-FE-PAGE-REORG (TODO, ba) for the frontend page-resemblance consolidation -- PLANNING deliverable (ba->architect->pm), zero dev coding WIP; dev-frontend IMPL lane enters only after spec lands (2nd lane within WIP<=2, low-risk internal refactor). PUSH HELD (PO deferred call; origin diverged via benign cloud-chore). Commit orch-state by EXPLICIT PATH. Script: scripts/po-s64-head-reconcile-bctc-ocr-dispatch-fe-reorg-scope.jq.")

# (b) dispatch: remove from ready[], append to in_progress[] (guarded)
| ( if $ocr_dispatch != null then
      .task_board.ready      |= map(select((.id // "") != TASK))
      | .task_board.in_progress += [ $ocr_dispatch ]
    else . end )

# (c) sprint_goal entry (id-guarded)
| ( if $sg_present == null then
      .sprint_goal.entries += [ $sg_entry ]
      | .sprint_goal._updated_at = $now
      | .sprint_goal._updated_by = "po-s64"
    else . end )

# (d) BA mint (id-guarded across all board arrays)
| ( if $ba_present == null then
      .task_board.backlog += [ $ba_task ]
    else . end )

# bump board stamps
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s64"
| .updated_at = $now
| .updated_by = "po-s64"
