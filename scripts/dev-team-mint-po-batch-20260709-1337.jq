# Dev-team tick 2026-07-09T13:37Z — mint PO triage BATCH (3 tasks) from po agentId afc03d962e73bad1a.
# WIP check at mint time: ready=0, in_progress=0 -> WIP=0. Mint 2 high-priority FIX direct to
# in_progress (WIP -> 2, respects the WIP<=2 invariant), hold the 1 low-priority hygiene FIX in
# backlog (picked up later by BOUNDED-1 or a future PO triage tick — see note on that row: fixing
# FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX in this same batch is what will make BOUNDED-1
# actually able to auto-promote it).
# Usage: jq --arg now "$NOW" -f scripts/dev-team-mint-po-batch-20260709-1337.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (append only if id absent board-wide); lane-scoped writes only.

def id1: "FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX";
def id2: "FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH";
def id3: "FIX-DRAIN-QUARANTINE-NONROUTABLE-SIGNALS";
def allids: [.task_board | to_entries[] | select(.value | type == "array") | .value[] | .id? // empty];

. as $doc
| (allids) as $ids
| if ($ids | index(id1)) == null then
    .task_board.in_progress += [{
      id: id1,
      status: "IN_PROGRESS",
      title: "bounded-1 promote jq crashes object-indexing .items ARRAY with task-id string",
      owner: "dev-team",
      next_agent: "developer",
      type: "FIX",
      zone: "cross-service/",
      size: "S",
      priority: "high",
      created_at: $now,
      created_by: "po-triage-20260709T1337Z",
      files: ["scripts/devteam-backlog-promote-bounded1.jq"],
      related: ["FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE"],
      status_note: "REPRODUCED live (exit 5, no corruption). effective_depends_on (L112-120) does $detail_items[.id] at L117 (object-indexing) but $detail_items = ($detail[0].items // {}) (L150) and live docs/data/orch/archive/backlog-detail.json .items is a plain ARRAY of 437 objects each carrying its own .id. First detail_ref'd row scanned during eligibility filtering (TASK17-FOREIGN-FLOW) crashes the WHOLE transform: jq error Cannot index array with string. orch-apply.sh correctly aborted (empty candidate, zero corruption) but BOUNDED-1 idle-capacity backlog pickup has promoted NOTHING on any tick since 2026-07-08. FIX: id-key the array at ingest, e.g. replace L150 ($detail[0].items // {}) with a shape-defensive map: (($detail[0].items // []) | if type==\"object\" then . else (map(select(.id!=null)|{key:.id,value:.})|from_entries) end). Do NOT change depends_on semantics, only the array-vs-object lookup. Read the actual script first. baseline_pass: jq --arg now \"$NOW\" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-promote-bounded1.jq docs/data/orch/orch-state.json > /dev/null must exit 0 with live WIP==0, emitting a doc that moves exactly ONE eligible row backlog->ready; re-run through orch-apply.sh must not abort on empty candidate."
    }]
  else . end
| if ($ids | index(id2)) == null then
    .task_board.in_progress += [{
      id: id2,
      status: "IN_PROGRESS",
      title: "1294-macro-spam-fix test flakes CI RED — intelligenceCycleJob fires unmocked live yahooFinance/SBV fetch",
      owner: "dev-team",
      next_agent: "dev-mcp-server",
      type: "FIX",
      zone: "apps/mcp-server/",
      size: "S",
      priority: "high",
      created_at: $now,
      created_by: "po-triage-20260709T1337Z",
      files: [
        "apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts",
        "apps/mcp-server/src/scheduler/news-analysis/intelligenceCycle/types.ts",
        "apps/mcp-server/src/__tests__/1294-macro-spam-fix.test.ts"
      ],
      related: ["docs/signals/ci-red-554bb302-20260709134751.json", "FACTORY-SCHEDULER-split-intelligenceCycleJob"],
      status_note: "Signal ci-red-554bb302 (bun test job RED on main HEAD 554bb302, GH run 29020855429). CONFIRMED FLAKE not regression by both router (local isolated run 2/2 pass) and po (4/4 pass, intermittent CI history). ROOT CAUSE: intelligenceCycleJob.ts _runCycle(deps) L255-262 makes UNMOCKED live network fetches (fetchYahooFinancePrices/storeCommoditySnapshot, fetchSbvRates/storeSbvSnapshot via direct await import) not injected through CycleDeps, so 1294-macro-spam-fix.test.ts mock deps cannot stub them -> nondeterministic live traffic in test run. Almost certainly exposed by FACTORY-SCHEDULER-split-intelligenceCycleJob (merged same tick, 554bb302). FIX: add fetchCommoditiesFn/storeCommodityFn + fetchSbvFn/storeSbvFn to CycleDeps (mirror existing pollNewsFn/fetchPricesFn/insertClaimFn injection pattern), default to real fetchers, inject no-op/deterministic stubs in 1294-macro-spam-fix.test.ts. Verify no other test relies on the live path. baseline_pass: cd apps/mcp-server && bun test src/__tests__/1294-macro-spam-fix.test.ts must be GREEN with NO [yahooFinance] fetched / [sbv] macro snapshot fetched live-fetch log lines; full bun test suite still green; CI bun test job green on the subsequent push."
    }]
  else . end
| if ($ids | index(id3)) == null then
    .task_board.backlog += [{
      id: id3,
      status: "TODO",
      title: "drain-signals re-skips 4 non-routable stray files every tick — quarantine + confirm writer output dir",
      owner: "dev-team",
      type: "FIX",
      zone: "cross-service/",
      size: "S",
      priority: "low",
      supervised: false,
      created_at: $now,
      created_by: "po-triage-20260709T1337Z",
      files: ["scripts/agents-flow/drain-signals.js"],
      related: [id1],
      status_note: "Recurring per-tick noise, no functional impact: docs/signals/cowork-team-2026-07-03T16-00-00Z.json + 3x price_anomaly_202607{02,03,04}*.json are correctly skipped as non-routable (no from/type) but re-scanned every tick. FIX: (a) drain-signals.js quarantines unrecognized no-from/type files to docs/signals/malformed/ after logging so they stop being re-scanned; (b) redirect upstream writers (cowork tick-report + price_anomaly detector) so their output artifacts stop landing in the routable-signal inbox. Do NOT blindly delete the price_anomaly_*.json files — confirm no live consumer (money-radar/dish surfacing) reads them before choosing quarantine-vs-relocate. Held in backlog (not in_progress) to respect WIP<=2 this tick — eligible for BOUNDED-1 auto-pickup once id1 (FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX) ships. baseline_pass: a fresh dev-team tick's drain step logs the 4 files as quarantined/handled ONCE, a second tick does not re-scan them; no routable signal is ever quarantined."
    }]
  else . end
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-via-dev-team"
