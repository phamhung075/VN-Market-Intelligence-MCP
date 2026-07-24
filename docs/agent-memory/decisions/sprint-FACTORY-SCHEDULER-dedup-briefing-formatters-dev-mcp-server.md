# Decision Journal — Sprint FACTORY-SCHEDULER-dedup-briefing-formatters · dev-mcp-server

**Sprint goal:** Extract shared briefing formatters into `scheduler/briefings/format/`; break the franceSummaryJob↔morningBriefingJob↔eveningSummaryJob job→job cross-import cycle.
**Agent:** dev-mcp-server
**Started:** 2026-07-24T09:02:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-24T09:02:00Z
**task-id:** FACTORY-SCHEDULER-dedup-briefing-formatters
**what-done:** Read all 3 briefing job files at source (france 882L/evening 492L/morning 430L). Confirmed the actual cross-import graph: france→morning (`formatGlobalSnapshotSection`), france→evening (`formatForeignFlowSection`, `isVnIndexFresh`), evening→morning (`formatGlobalSnapshotSection`). No morning/evening→france edge existed.
**what-considered:** Ticket names 5 formatters (globalSnapshotSection, foreignFlowSection, moversSection, alertLines, vnIndexFreshness) but only 3 were actually cross-imported; `formatMoversSection` (evening, private) and `formatAlertLines` (france, private) were single-file-only.
**why-decision:** Extracted all 5 per the ticket's explicit list — consolidating the full briefing-formatter family into one `format/` folder now, not just the 3 that happened to cause the cycle, avoids a second future pass and matches the ticket's stated subfolder + name list literally.
**why-change:** No change from task scope.

---

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-24T09:02:00Z
**task-id:** FACTORY-SCHEDULER-dedup-briefing-formatters
**what-done:** Created `apps/mcp-server/src/scheduler/briefings/format/{globalSnapshotSection,foreignFlowSection,moversSection,alertLines,vnIndexFreshness}.ts` — verbatim moves (42L/45L/114L/98L/27L, all ≤120L). Moved each formatter's private leaf helpers along with it: `deltaArrow`→globalSnapshotSection.ts (duplicated as a private fn — also still needed privately by morning's `formatCommoditiesSection`, which is morning-only and stays there); `fmtVolume`/`fmtMoverLine`/`MoverEntry`→moversSection.ts; `severityLabel`→alertLines.ts (with `AlertDisplayRow`).
**what-considered:** For `deltaArrow`: (a) export it from morning and import back into format/ (keeps a job→format→job edge), (b) duplicate the 4-line pure fn in both places. Chose (b) — zero coupling, trivially small, no drift risk (leaf pure fn, unit-tested transitively via both call sites).
**why-decision:** Byte-identical function bodies confirmed via `git show HEAD:<old-file> | sed -n '/^function X/,/^}/p'` vs the new file, `diff` — all 9 moved units (deltaArrow, formatGlobalSnapshotSection, isVnIndexFresh, formatForeignFlowSection, fmtVolume, fmtMoverLine, formatMoversSection, severityLabel, formatAlertLines) diffed empty.
**why-change:** No change from task scope.

---

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-24T09:02:00Z
**task-id:** FACTORY-SCHEDULER-dedup-briefing-formatters
**what-done:** Rewired all 3 job files to import from `./format/*.js` instead of each other. Removed the 3 job→job import lines (france→morning, france→evening, evening→morning) — `grep -n 'from "./morningBriefingJob.js"\|from "./eveningSummaryJob.js"\|from "./franceSummaryJob.js"' scheduler/briefings/*.ts` returns zero matches post-change. Removed now-dead `computeSectorAverage`/`getStockProfile`/`SECTOR_NAME_VI`/sectorPeers.js import from eveningSummaryJob.ts (only consumer was the moved `formatMoversSection`) and now-dead `TelegramMessageFactory` import from franceSummaryJob.ts (only consumer was the moved `formatAlertLines`).
**what-considered:** Test import paths (ticket flags `1783-foreign-flow-bulletin.test.ts:16` + ~9 total test files importing these formatters directly from the job files, not from a shared module): (a) rewrite all test import paths to `./format/...`, (b) keep thin re-export lines (`export { X } from "./format/x.js"`) on each job file so tests resolve unchanged.
**why-decision:** Chose (b) — 9 test files across 3 formatters would need touching for (a) with zero functional benefit; re-exports are a standard barrel pattern already used elsewhere in this codebase (ssc.ts, vnstockStore.ts per this session's own prior FACTORY-INFRA splits) and keep the job files as the stable public-import surface tests already depend on.
**why-change:** No change from task scope.

---

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-24T09:02:00Z
**task-id:** FACTORY-SCHEDULER-dedup-briefing-formatters
**what-done:** Verified equivalence + gates. `bun tsc --noEmit` clean. Targeted 9-file suite (the exact files touching these formatters, incl. `1783-foreign-flow-bulletin.test.ts`, `1503-ohlcv-foreign-flow.test.ts`, `1784-sector-alert-format.test.ts`, `1552-evening-vnindex-freshness.test.ts`, `1511/1512-*global-snapshot.test.ts`, `1424-evening-sector-aggregation.test.ts`, `1794-eod-vol-rsi.test.ts`, `FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts`): 89 pass / 0 fail / 188 expect() calls — captured BEFORE any edit as the baseline, re-ran AFTER — numbers identical byte-for-byte (same pass count, same expect() count). `gen-project-stats.ts --dry-run`: toolCount 184 / cronJobCount 88 — unaffected (pure formatter move, no tool/cron surface touched).
**what-considered:** Whether byte-diff-of-function-bodies + targeted-suite-identical is sufficient proof without a golden-output integration test. Ticket explicitly frames unit-level equivalence as "the load-bearing proof since live verify is deferred" — both legs (byte-diff + identical test counts) satisfy that bar; a new golden-output test would just re-assert what the moved unit tests already assert (they call these exact functions with the exact same inputs).
**why-decision:** Two independent equivalence signals (mechanical byte-diff of the moved code + behavioral test-count identity) triangulate the "no logic change" claim without needing a 3rd redundant proof.
**why-change:** No change from task scope. Full `bun test` (1222 files, 14840 tests): 14748 pass / 40 skip / 52 fail / 46785 expect() calls — grep-confirmed zero fail-line overlap with `briefings/`, `franceSummaryJob`, `eveningSummaryJob`, `morningBriefingJob`, or `format/`; all 52 fails are pre-existing classes already documented in this session's own prior notebook entries today (VPS-push/5000ms-timeout flake, `_deprecated/1302-technical-indicators.test.ts` stale-fixture assertions unrelated to briefings).

---

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-24T09:02:00Z
**task-id:** FACTORY-SCHEDULER-dedup-briefing-formatters
**what-done:** SCOPE BOUND honored — CODE-ONLY, no rebuild, no live-container verify. This is a scheduler/interface-layer TypeScript source change baked into the Docker image at build time (same category as prior FACTORY-INFRA split tasks today) — the live container still runs pre-change code until the next user-gated rebuild+swap.
**what-considered:** N/A — explicit instruction, not a judgment call.
**why-decision:** Dispatcher explicitly stated rebuilds are user-gated and one was just done; batching this onto a future rebuild avoids an unauthorized rebuild.
**why-change:** No change — `rebuild_verify_status: PENDING-USER-GATED` reported honestly in the RETURN block rather than fabricating a live-container check.
