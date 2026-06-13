# Decision Journal — Sprint DETECT-FIX-BRIDGE · po

## 2026-06-13T22:28Z — STEP: promote health-recheck findings [task: DETECT-FIX-BRIDGE]
- what-considered: (a) promote each of 32 findings 1:1, (b) bundle by zone/root, (c) defer cosmetic.
- chose: (b)+(c) — 10 deduped FIX tasks; bundled 7 schema-drift doc-bugs into 1 (same fix-class: docs/agents tool-package param edits); deferred I1/I2/I6/I9/I12/M3-M7 (known-env/lower-impact) to next pass.
- why-change: 1:1 would flood backlog with 7 near-identical entries + duplicate I7/I11 already tracked. Ranked B1/B5 (5d data-pipeline deaths) P0 above schema-drift per user-impact directive.
- dedup: I7=FIX-SBV-FX-VPS-FETCHER-UNHEALTHY, I11=FIX-MCP-CRASH-LOOP-WRITEWAL (skipped); SCHEMA-DRIFT-P5/P8 are DDL self-heal not doc-drift (distinct, not deduped).
- gate: jq global-dedup (155 backlog, 0 collision); JSON-valid; tsc GREEN pre-push; mutex po-commit-s52 claimed+released. Commit c68edcfa.
