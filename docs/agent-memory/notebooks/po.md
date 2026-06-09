# PO Notebook

## c · 2026-06-09T04:44Z — CI-RED-RECONCILE: 629 taxonomy DELIVERED -> close SPIKE + open Cluster-1 attack FIX (po-S22)

**Trigger:** PRIORITY TRIAGE — FU-CI-PROFILE-629 architect SPIKE delivered (docs/architecture-briefs/2026-06-09-ci-629-failure-taxonomy.md, 7682B) + router raw-verified the central Cluster-1 claim. PO owns board; router owns push+gate+verify. DJ-GATE-1.

**BREAKTHROUGH (router-verified, acted on — not re-verified):** 629 is NOT schema-drift-dominated (~4 fails, PARKED P4-P8 — the 6 schema spikes chased the wrong cluster). Real #1 = MCP-SDK mock contamination ~355/56% from ONE file: apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts mock.module(@modelcontextprotocol/sdk/server/mcp.js) MockMcpServer lacks .tool()/.registerTool(); Bun ESM cache leaks to 69+ files; mock.restore() insufficient. I raw-read L38-42 myself = MockMcpServer={connect} only (verify-raw-not-badges).

**ATTACK-SCOPE = Cluster 1 SOLO-FIRST** (not 1+2+5 bundle). Rationale: isolate the single test-file fix so its ~355-drop is cleanly attributable in CI BEFORE mixing CI-workflow/symlink infra — measurement integrity + zero prod-code risk + WIP<=2.

**Board edits (1 atomic jq pass, commit-mutex held):**
- FU-CI-PROFILE-629 (backlog[78]): TODO->DONE (+closed_at +closing note). Gate=taxonomy delivered MET. Single status key (=1).
- +FIX-CI-MCP-SDK-MOCK-CONTAM (sprint .tasks, TODO, dev-mcp-server, apps/mcp-server/, high): rewrite 1862c mock so MockMcpServer exposes .tool()/.registerTool() no-ops OR scope mock to SSE transport only. baseline_pass=629 native fail+error absolute; gate=DROP well below 629 (target ~274). ZERO prod code. DISPATCH-READY.
- +FIX-CI-DATA-SYMLINK-ENOENT (Cluster 2, ~91, QUEUED, depends Cluster1): CI mkdir -p / replace symlink. NOT active.
- +FIX-CI-DEAD-REUTERS-TESTS (Cluster 5, 2 err, QUEUED, depends Cluster1): delete 2 _deprecated reuters tests. NOT active.
- Cluster 3/4 NOT opened (gated on 1+2+5 clearing). Schema-drift (Cluster 6) NOT re-opened (PARKED).

**SSOT discipline:** backlog len 79 unchanged (in-place flip); sprint .tasks 19->22 (+3 exactly); signal_queue.rows EXACTLY 56 preserved (no whole-object rewrite). Temp validated [ -s ] && jq -e . && size>600000 (707093) BEFORE mv. commit-mutex (task_kind:commit-mutex owner:po ttl 120s) held around write to serialize vs cowork */15. Commit SHA below (3 owned paths, explicit pathspec, NOT pushed — router owns).

**LESSON:** When a long-running RED-reconcile pivots from diagnosis to attack, open ONLY the single largest+cheapest+isolated cluster first (solo, not bundled) so its CI delta is attributable; queue the rest behind it with depends. Don't bundle a test-file fix with CI-workflow/.github + dead-code deletion — conflated deltas lose per-cluster attribution.

## Carry-over
- ROUTER OWNS: push (this notebook + journal + orch-state, commit SHA in return, ahead of origin) + dispatch FIX-CI-MCP-SDK-MOCK-CONTAM to dev-mcp-server NOW (Cluster 1 solo). Hold Cluster 2 + 5 QUEUED until Cluster 1 lands+measured then flip TODO. Do NOT open Cluster 3/4 yet. WIP<=2 honored.
- Next CI gate (router): native fail+error must DROP well below 629 (target ~274 if full 355 clears). Native-to-native measurement only (marker method over-counts ~2x).
- Schema-drift PARKED: no 7th touch. created_at column-existence diagnosis archived in po-S21 journal.
- Still-open (router routing): FIX-NEWS-VPS-CRASH-LOOP (ops-vps-fetch), FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE (bctc-discover), Bug A FIX-NEWS-VPS-HEALTH-SQL needs mcp-server REBUILD (ops).
