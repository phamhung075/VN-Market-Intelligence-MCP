# po-s138-merge-money-radar-into-momentum-kickoff.jq
# ---------------------------------------------------------------------------
# Single-pass TRIPLE-mutation self-initiated SPRINT KICKOFF (idempotent).
#
# Origin 2026-07-02 (po-s138) — USER verbatim: "need merge money-radar to
# momentum". Consolidate the two parallel dashboard surfaces
# (/dashboard/money-radar + /dashboard/momentum) into ONE unified momentum
# page while PRESERVING both card contracts (brief §10 do-NOT-homogenize:
# radar cards non-null/depth-independent, momentum cards honest-NULL/OHLCV-
# depth-gated). Both feeder APIs (/api/momentum-indicators + /api/money-radar)
# already serve HTTP 200 → PURE FRONTEND (apps/frontend/), single zone, NO
# mcp-server/backend work. WIP was 2/2 full (dev-mcp-server BCTC) — this is a
# DISJOINT zone, minted plan-only; PO does NOT spawn (dev-team loop adopts).
#
# M1 — id-guarded APPEND sprint_goal.entries[] with the merge vision.
# M2 — id-guarded MINT the BA-spec cascade-kickoff → ready[] (next_agent=ba,
#      zone=apps/frontend/, type=SPRINT-S, user_prioritized). Skipped if the
#      id is already present in ANY board lane.
# M3 — SUPERSEDE FIX-FE-HEADER-NAV-MONEY-RADAR: relocate ready[]→done[] with
#      status=DONE (lane-coherent: done[] permits DONE/DONE_VERIFIED only),
#      done_verified:false, resolution=superseded-by-merge, superseded_by=<the
#      merge BA id>. Its user-need "reach radar from the header" is FOLDED into
#      the merge (unified nav entry) — adding a separate radar nav entry to a
#      route about to become a redirect would be a doomed double-entry.
#      Guarded: only if present in ready[] AND not already in done[].
#
# Head DELIBERATELY UNTOUCHED (router continues from the PO RETURN NEXT).
#
# Conservation: ready net +0 (mint +1, supersede −1); done +1;
#   sprint_goal.entries +1; backlog/in_progress/review/done_verified byte-stable.
# Idempotency: M1 sprint_id-guard, M2 id-guard across all lanes,
#   M3 guard (present in ready AND absent from done) → re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s138-merge-money-radar-into-momentum-kickoff.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply does Zod + dup-key + lane-coherence + CAS + atomic rename;
#    commit orch-state by EXPLICIT PATH; PUSH HELD — fleet-push timer pushes.)
# ---------------------------------------------------------------------------

def id_of: if type == "object" then (.id // "") else . end;

# ---- constants -------------------------------------------------------------
"BA-MERGE-MONEY-RADAR-INTO-MOMENTUM" as $mergeId |
"MERGE-MONEY-RADAR-INTO-MOMENTUM"    as $sprintId |
"FIX-FE-HEADER-NAV-MONEY-RADAR"      as $navId |
([ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
   .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
 | map(id_of)) as $ids |

# ---- M1: sprint_goal.entries[] append (id-guarded) -------------------------
( if (.sprint_goal.entries | map(.sprint_id) | index($sprintId)) then .
  else
    .sprint_goal.entries += [ {
      sprint_id: $sprintId,
      status: "active",
      priority: "high",
      created_by: "po",
      user_prioritized: true,
      origin: "USER verbatim 2026-07-02: \"need merge money-radar to momentum\". The Money Radar dashboard (/dashboard/money-radar, LIVE HTTP 200 since Phase-0 2026-07-01) and the Momentum P1 dashboard (/dashboard/momentum) are two PARALLEL surfaces built from the SAME mirror template (brief §8/§11.3). User wants ONE surface instead of two.",
      vision: "A single unified /dashboard/momentum surface presents BOTH the money-flow radar and the momentum indicators in one place — so the user reaches all money-flow/indicator content from one nav entry — WITHOUT homogenizing the two card contracts.",
      scope_in: "PURE FRONTEND (apps/frontend/, single zone). (1) dashboard.momentum.tsx renders TWO labelled card sections: existing 4 momentum honest-NULL cards + the 4 money-radar non-null cards; loader fetches BOTH /api/momentum-indicators AND /api/money-radar via Promise.allSettled (per-section isolation — one dead feed never blanks the other). (2) dashboard.money-radar.tsx converts to a redirect loader → /dashboard/momentum (preserve deep links / bookmarks; zero dead route). (3) TopNav.tsx: ONE unified nav entry (relabel the momentum entry to signal it now carries the radar); do NOT add a separate money-radar entry; sync SSOT counts + guard test. (4) qa gate RAW-live.",
      scope_out: "NO mcp-server/backend/API change (both /api/momentum-indicators + /api/money-radar already serve 200; api.money-radar.tsx proxy STAYS as the merged loader's feeder). Do NOT DELETE dashboard.money-radar.tsx (would 404 existing links) — redirect instead. Do NOT homogenize the card contracts (brief §10 HARD): radar cards STAY non-null/depth-independent, momentum cards STAY honest-NULL/OHLCV-depth-gated; each keeps its own FreshnessBadge ('daily' SLA / 1560min) + InfoCardExpand source-link dropdown. NO reorder/relabel/removal of unrelated nav entries.",
      success_metric: "done_verified: /dashboard/momentum serves ONE page carrying all 8 cards (4 momentum honest-NULL + 4 radar non-null) each with correct FreshnessBadge + source-link dropdown; /dashboard/money-radar 302-redirects to /dashboard/momentum; ONE unified nav entry reaches the content (the separate radar nav entry is NOT added); tsc + full frontend test suite GREEN; no card-contract homogenization; no unrelated nav drift.",
      supersedes: $navId,
      created_at: $now
    } ]
  end ) |

# ---- M2: mint the BA-spec cascade-kickoff → ready[] (id-guarded) -----------
( if ($ids | index($mergeId)) then .
  else
    .task_board.ready += [ {
      id: $mergeId,
      status: "READY",
      title: "MERGE money-radar dashboard INTO the momentum page (one unified surface) — BA spec",
      owner: "ba",
      next_agent: "ba",
      zone: "apps/frontend/",
      type: "SPRINT-S",
      priority: "high",
      size: "S",
      user_prioritized: true,
      depends: [],
      created_at: $now,
      created_by: "po",
      origin: "USER verbatim 2026-07-02: \"need merge money-radar to momentum\". PO product decisions locked below; BA writes the spec, pm decomposes, dev-frontend implements, qa gates. PO does NOT spawn — dev-team loop adopts when a frontend slot frees (WIP was 2/2 full on dev-mcp-server BCTC — DISJOINT zone).",
      product_decisions: {
        target: "dashboard.momentum.tsx becomes the SINGLE unified money-flow/indicator surface — renders TWO labelled sections: Section A = existing 4 momentum honest-NULL cards; Section B = the 4 money-radar non-null cards (moved from dashboard.money-radar.tsx). Final section headings/ordering + Vietnamese labels = BA/product detail (suggest 'Động Lực' + 'Radar Dòng Tiền').",
        loader: "Merge both feeds into the momentum loader via Promise.allSettled: fetch /api/momentum-indicators AND /api/money-radar independently so a failure of one section never blanks the other (the honest-NULL/non-null contrast must survive a single-feed outage).",
        money_radar_route_fate: "CONVERT dashboard.money-radar.tsx to a redirect loader → /dashboard/momentum (302). Do NOT delete the file (existing bookmarks/deep links must not 404). api.money-radar.tsx proxy STAYS (feeds the merged loader).",
        nav_fate: "ONE unified nav entry. Relabel the existing 'Động Lực P1' (/dashboard/momentum) entry so it is discoverable as carrying the money-flow radar too (final copy = BA detail). Do NOT add a separate 'Radar Dòng Tiền → /dashboard/money-radar' entry — that route is becoming a redirect; a second entry would be a doomed double-entry. The user's original 'reach radar from the header' need is satisfied by the unified entry.",
        supersedes: "This task ABSORBS FIX-FE-HEADER-NAV-MONEY-RADAR (that task's nav work is folded here; it is relocated to done[] as superseded-by-merge in the same triage pass).",
        routing: "Single zone apps/frontend/ → NO architect split. Chain: ba (spec) → pm (decompose) → dev-frontend (implement) → qa (RAW-live gate)."
      },
      design_constraints: {
        do_not_homogenize: "HARD (brief docs/architecture-briefs/2026-07-01-money-radar.md §10): radar cards render non-null (depth-independent inputs); momentum cards render honest-NULL (OHLCV-depth-gated). The merged page MUST preserve BOTH behaviors distinctly — the contrast validates the architecture. Never zero-fill a radar null; never force-render a momentum null as non-null.",
        freshness: "Each card keeps its OWN FreshnessBadge; SLA tier 'daily' (maxStalenessMin=1560, 26h) for both card families. STANDING: 'Cập nhật lúc' freshness transparency preserved.",
        source_link: "STANDING all-info requirement: each card keeps its InfoCardExpand source-link + detail dropdown. No card loses its provenance surface in the merge.",
        language: "Plain Vietnamese for all user-facing copy (labels, section headings, null-state 'Chưa có dữ liệu'). Divergence enum tokens (GREEN/AMBER/RED/UNKNOWN) render as-is per brief §8; the human-facing badge stays Vietnamese."
      },
      acceptance: [
        "AC1: /dashboard/momentum serves ONE page with all 8 cards — 4 momentum (honest-NULL, OHLCV-depth-gated) + 4 money-radar (non-null, depth-independent) — each in its labelled section with its own FreshnessBadge + source-link dropdown.",
        "AC2: The loader fetches /api/momentum-indicators AND /api/money-radar via Promise.allSettled; a forced failure of ONE feed leaves the other section rendering correctly (per-section isolation, page always HTTP 200).",
        "AC3: do-NOT-homogenize preserved — radar cards render non-null on live data; momentum cards render honest-NULL when accruing/blocked ('Chưa có dữ liệu' + gray badge + null_reason); NO card contract is flattened to the other.",
        "AC4: /dashboard/money-radar 302-redirects to /dashboard/momentum (deep links preserved, no 404, no dead route); api.money-radar.tsx proxy still serves 200.",
        "AC5: TopNav.tsx has ONE unified enabled nav entry reaching the merged surface; NO separate /dashboard/money-radar nav entry is added; SSOT count comments + FE-HEADER-SSOT guard test updated in lockstep and GREEN; no unrelated nav entry reordered/relabelled/removed.",
        "AC6: FIX-FE-HEADER-NAV-MONEY-RADAR is confirmed superseded (folded here) — not independently shipped as a second nav entry.",
        "AC7: tsc + full frontend test suite GREEN; money-radar-cards.test.ts assertions preserved/migrated onto the merged momentum page; no momentum regression."
      ],
      verification_gate: "RAW-verify (dev-frontend + qa, not badge-relay): (a) after frontend rebuild, curl /dashboard/momentum and confirm BOTH card families render (radar non-null values present; momentum honest-NULL where data accruing); (b) curl /dashboard/money-radar and confirm 302 → /dashboard/momentum; (c) grep rendered nav for ONE enabled anchor reaching the merged surface and ZERO anchor href='/dashboard/money-radar' nav entry; (d) FE-HEADER-SSOT test + full frontend suite + tsc GREEN.",
      gate: "ba spec → pm decompose → dev-frontend implement → RAW-verify → review → qa → done_verified",
      files: [
        "apps/frontend/app/routes/dashboard.momentum.tsx",
        "apps/frontend/app/routes/dashboard.money-radar.tsx",
        "apps/frontend/app/routes/api.money-radar.tsx",
        "apps/frontend/app/components/TopNav.tsx",
        "apps/frontend/app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx",
        "apps/frontend/app/routes/__tests__/money-radar-cards.test.ts"
      ],
      parallel_note: "Zone apps/frontend/ is DISJOINT from the in-flight P1 dev-mcp-server BCTC work (FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-BANK-BS-SECTION-CLASSIFIER). PO does NOT spawn; the dev-team loop adopts per SF-1 singleton discipline when a frontend slot frees. BA-spec authoring does not consume a coding-WIP slot."
    } ]
  end ) |

# ---- M3: supersede FIX-FE-HEADER-NAV-MONEY-RADAR (ready[]→done[]) ----------
( ($ids | index($navId)) as $navPresent |
  (.task_board.done | map(id_of) | index($navId)) as $navAlreadyDone |
  ( [ .task_board.ready[]? | select((id_of) == $navId) ] | .[0] ) as $navRow |
  if ($navRow != null) and ($navAlreadyDone | not) then
      .task_board.ready |= map(select((id_of) != $navId))
    | .task_board.done += [ (
        $navRow
        + {
            status: "DONE",
            done_verified: false,
            resolution: "superseded-by-merge",
            superseded_by: $mergeId,
            superseded_at: $now,
            superseded_note: "User asked to merge money-radar INTO momentum (2026-07-02). This task added a SEPARATE 'Radar Dòng Tiền' nav entry pointing at /dashboard/money-radar — but that route is becoming a redirect to /dashboard/momentum, so a second entry would be a doomed double-entry. The user's 'reach radar from the header' need is fully honored by the unified nav entry delivered under BA-MERGE-MONEY-RADAR-INTO-MOMENTUM. No code was written for this row; scope folded, not implemented."
          }
      ) ]
  else . end )
