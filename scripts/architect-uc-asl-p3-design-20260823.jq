# scripts/architect-uc-asl-p3-design-20260823.jq
#
# Architect design-complete stamp for UC-ASL-P3 (ready[], BA spec complete —
# docs/handoffs/UC-ASL-P3-BA-spec.md — resolves ARCH-RATIFY-1..7). Also
# repoints the 3 sibling predicate rows (FIX-AUDITOR-C06-OFFMARKET-
# RECALIBRATE, FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE, FIX-AUDITOR-C12-
# READONLY-BLINDED-AND-TABLENAME, all backlog[]/owner=architect) per BA
# spec FR-12 disposition: their corrected predicates land INSIDE UC-ASL-P3's
# own script, so they should not independently edit main.md any more —
# next_agent cleared, status left BACKLOG (not closed — FR-11 has not
# landed yet, close once it does).
#
# LIVE COLLISION FOUND mid-design: FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE
# was claimed by dev-team's supervised-lane sweep 2026-08-23T12:56:49Z (TODAY,
# this session) and is now IN_PROGRESS building scripts/auditor-db-checks.sh
# with only checks.c04. UC-ASL-P3 must not start its own script-editing phase
# until that lands — depends_on added (was missing).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/architect-uc-asl-p3-design-20260823.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready | map(.id == "UC-ASL-P3") | index(true)) as $idx
| if $idx == null then error("UC-ASL-P3 not found in .task_board.ready[]") else . end
| .task_board.ready[$idx] += {
    architect_design_complete: true,
    architect_completed_at: $now,
    architect_handoff: "docs/architecture-briefs/2026-08-23-uc-asl-p3-auditor-db-checks-freeze.md",
    architect_review_note: "DESIGN COMPLETE 2026-08-23 (architect). LIVE COLLISION FOUND: FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE (IN_PROGRESS, owner=developer, claimed 2026-08-23T12:56:49Z -- TODAY, this session) is building scripts/auditor-db-checks.sh RIGHT NOW with only checks.c04 populated -- added depends_on this row (was missing from the graph; both the C-04 row's own deliverable text and its own script skeleton header already say UC-ASL-P3 extends that file, but nothing encoded the dependency edge). Do not hand FR-1/FR-3..FR-10 to a developer until C-04 lands DONE/DONE_VERIFIED. ARCH-RATIFY-1..7 resolved (full rationale in architect_handoff): (1) host-bind+sqlite-wal-guard.sh ratified, 3 independent design passes converge. (2) C-06 calendar reuse OVERRULES BA's non-binding SLA-Resolver suggestion -- that resolver is BCTC-earnings-specific, wrong domain for market_messages freshness; found the correct existing reuse target instead: apps/mcp-server vnTradingCalendar.ts (isVnTradingDay, holiday-aware) + marketHours.ts (isMarketHours, session-hours-aware) composed via the SAME bun-e dynamic-import idiom scripts/check-foreign-flow-freshness.sh already established -- do not reimplement VN holidays in bash. (3) C-11 legitimately reuses the earnings-window arithmetic (different domain than C-06, correctly BCTC-seasonal) -- port to a small shared bash fn, used by both B-05 and C-11. (4) market_messages_price_history re-confirmed zero code hits, non-issue. (5) mount-drift-check extension for PDF_EXTRACTOR_DB_HOST_PATH deferred to a follow-up. (6) zone narrowed to scripts/ + docs/agents/system-auditor/flow/ per BA's own recommendation. (7) C-12 connection reuse: reuse already-open market.db/pdf_extractor.db connections, fresh open per remaining system-map.json DB. Two-owner split flagged for pm: developer (script+test, gated on C-04) then agent-father (main.md FR-11 repoint, gated on the script existing) -- same shape as the live C-04/C04-FLOWDOC-REPOINT precedent. Full design, file-by-file plan, DDD map, test strategy, risk flags: see architect_handoff.",
    zone: "scripts/ + docs/agents/system-auditor/flow/",
    depends_on: ["FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE"],
    next_agent: "pm",
    updated_by: "architect"
  }
| (.task_board.backlog | map(.id == "FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE") | index(true)) as $c06idx
| if $c06idx == null then error("FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE not found in .task_board.backlog[]") else . end
| .task_board.backlog[$c06idx] = (.task_board.backlog[$c06idx] + {
    architect_disposition_20260823: "REPOINTED (not closed) by architect 2026-08-23 per UC-ASL-P3 BA spec FR-12: this predicate's corrected design (age-vs-SLA via reused vnTradingCalendar.ts/marketHours.ts, not the earnings-window SLA Resolver) now lands INSIDE scripts/auditor-db-checks.sh as part of UC-ASL-P3 FR-5 -- see docs/architecture-briefs/2026-08-23-uc-asl-p3-auditor-db-checks-freeze.md ARCH-RATIFY-2. Do not independently edit main.md's C-06 block. Close this row once UC-ASL-P3's FR-11 lands and the corrected predicate is confirmed live.",
    updated_by: "architect"
  } | del(.next_agent))
| (.task_board.backlog | map(.id == "FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE") | index(true)) as $c11idx
| if $c11idx == null then error("FIX-AUDITOR-C11-PDFX-STATUS-PREDICATE not found in .task_board.backlog[]") else . end
| .task_board.backlog[$c11idx] = (.task_board.backlog[$c11idx] + {
    architect_disposition_20260823: "REPOINTED (not closed) by architect 2026-08-23 per UC-ASL-P3 BA spec FR-12: this predicate's corrected design (status='success', datetime()-wrap idiom, earnings-window off-season severity reusing the SLA Resolver's in-window arithmetic ported to bash) now lands INSIDE scripts/auditor-db-checks.sh as part of UC-ASL-P3 FR-6 -- see docs/architecture-briefs/2026-08-23-uc-asl-p3-auditor-db-checks-freeze.md ARCH-RATIFY-3. Do not independently edit main.md's C-11 block. Close this row once UC-ASL-P3's FR-11 lands and the corrected predicate is confirmed live.",
    updated_by: "architect"
  } | del(.next_agent))
| (.task_board.backlog | map(.id == "FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME") | index(true)) as $c12idx
| if $c12idx == null then error("FIX-AUDITOR-C12-READONLY-BLINDED-AND-TABLENAME not found in .task_board.backlog[]") else . end
| .task_board.backlog[$c12idx] = (.task_board.backlog[$c12idx] + {
    architect_disposition_20260823: "REPOINTED (not closed) by architect 2026-08-23 per UC-ASL-P3 BA spec FR-12: the readonly-blinding half is resolved automatically once C-12 moves onto UC-ASL-P3's FR-2 host-bind+wal-guard access pattern; the table-name half (market_messages_price_history) re-confirmed zero code hits (3rd confirmation, non-issue) -- see docs/architecture-briefs/2026-08-23-uc-asl-p3-auditor-db-checks-freeze.md ARCH-RATIFY-4/7. Do not independently edit main.md's C-12 block. Close this row once UC-ASL-P3's FR-11 lands and the corrected predicate is confirmed live.",
    updated_by: "architect"
  } | del(.next_agent))
| .task_board._updated_at = $now
| .task_board._updated_by = "architect (UC-ASL-P3 design + sibling repoint)"
