# Decision Journal — Sprint FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX · dev-mcp-server

**Sprint goal:** Plan-only spec for D4's `KNOWN_LEGIT_PREFIXES` whitelist gap (`data-quality-anomaly:*` false positive) — supervised, plan_only, no code/doc-of-record files edited this cycle.
**Agent:** dev-mcp-server
**Started:** 2026-08-08T05:52:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-08-08T05:55:00Z
**task-id:** FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX
**what-done:** Re-verified the row's citations live (not trusted as snapshot). `task_list_held(kind="sprint-task", expired=false)` via Bash-bridge (`scripts/agents-flow/mcp-call.sh`, `mcp__gateway__call_tool` absent from this session's binding) returned 12 held locks. `data-quality-anomaly:DGC:Q1-2026` (the row's cited FP source) is **absent** — TTL-expired 2026-07-30, never released. A **new** prefix, `bctc-dataquality:*` (3 locks, claimed 2026-08-06), is present and — confirmed via `docs/agent-memory/notebooks/system-auditor.md` top section (`## d4-auto · 2026-08-08T03:00:02.589Z`) — is ALREADY producing first-occurrence D4 candidates (6: both `not_found`/`pipeline_mismatch` facets × 3 locks) in TODAY's cycle. Not yet emitted to `signal_queue` (R-4b needs 2 consecutive cycles; no matching prior line exists) but will emit at the next daily tick if unaddressed.
**what-considered:** (a) fix only the row's literal `data-quality-anomaly:` citation, ship as-is; (b) also cover the live `bctc-dataquality:` prefix, flagged explicitly as beyond-literal-scope.
**why-decision:** (b) — shipping (a) alone would be a spec already-obsolete against currently-forming signal (confirmed live in today's own notebook). CLAUDE.md "verify everything live, don't trust the snapshot" directly applies.
**why-change:** no change from the dispatch brief's own instruction to re-verify live.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-08-08T06:00:00Z
**task-id:** FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX
**what-done:** Investigated `po_second_facet_20260728`'s "category error" claim (pipeline_mismatch cannot be silenced by a whitelist entry alone). `git blame -L 628,645 tasksMdJanitorJob.ts`: the R-2 per-lock mismatch loop (`for (const lock of survivingLocks)`, `:632`) has been scoped to `survivingLocks` (the R-1b-post-filter set — same set R-3's `not_found` loop reads at `:669`) since commit `e109f49f81` (2026-07-08) — the SAME commit that ported R-1b itself.
**what-considered:** whether to accept the row's claim at face value (propose a separate pipeline_mismatch-specific whitelist consultation) vs verify against live code first.
**why-decision:** REFUTED the operational claim — a single `KNOWN_LEGIT_PREFIXES` entry already silences both `not_found` and `pipeline_mismatch` for a given lock, since both loops share `survivingLocks`. No separate code path needed. (The underlying *design* observation — dev-task-plane vs escalation-lock-plane comparison is not naturally apples-to-apples — is sound; it's exactly why R-1b exists as a pre-filter. Only the "whitelist insufficient" operational claim is wrong.)
**why-change:** spec §3 documents the refutation with the git-blame evidence rather than silently accepting or silently ignoring the row's claim.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-08-08T06:02:00Z
**task-id:** FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX
**what-done:** Decided deliverable point 2 (pattern-match vs system-map.json). Checked `bctc-dataquality:vnindex-crosstool-mismatch` (one of the 3 live locks) — NOT ticker/period-shaped (`<kind>:<free-text>`, no `<TICKER>:<PERIOD>`). Checked codebase precedent: `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `loadWatchlistSeedFromSystemMap()` already solves this exact problem class (hardcoded-array-drifted-from-system-map.json) with a proven, tested pattern (module-load read + fail-open fallback, exported for direct fallback-path unit testing).
**what-considered:** (a) generalize `isKnownLegitPattern` to a structural regex on `<kind>:<TICKER>:<PERIOD>[:ESC-N]`; (b) promote the literal array to `docs/data/system-map.json`, code+docs read one source.
**why-decision:** (b) — (a) is refuted by the live data itself (`vnindex-crosstool-mismatch` isn't shape-matched, so a regex would have missed the real currently-forming FP); a looser regex to catch it risks matching genuinely-orphaned colon-shaped locks too (this repo's own standing lessons treat false negatives/masked failures as worse than recurring low-severity FPs). (b) matches CLAUDE.md's explicit "System Data — Never Hardcode" rule verbatim and reuses a proven in-repo pattern rather than inventing one. `isKnownLegitPattern`'s matching logic (simple prefix `.startsWith()`) stays unchanged — only the source of the array's *value* changes; minimal blast radius, all 27 existing tests keep their exact call surface.
**why-change:** no change from the row's own offered options — picked (b), justified against live evidence per the dispatch brief's explicit "pick one, justify it, don't leave both on the table."

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-08-08T06:04:00Z
**task-id:** FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX
**what-done:** Wrote `docs/handoffs/FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX-spec.md` (verbatim before/after diffs for `tasksMdJanitorJob.ts`, `system-map.json`, `handlers.md`, `audit-dimensions.md`, plus the test-table extension + negative-control design). Committed pathspec-scoped (`2dd62630d`). Moved board row `task_board.in_progress[2]` → `task_board.review[]` via `scripts/orch-apply.sh` (Stage 0/1 PASS, conservation check OK, 1 row stamped) — `status:REVIEW`, `owner:po`, `next_agent:po`, `supervised:true`/`plan_only:true` preserved unchanged, added `spec_doc` + `dev_mcp_server_review_note`. Reset `.head` to idle in the same write. Committed board-state pathspec-scoped (`96ea6be74`, sweep-guard escalate-threshold hit on the first bare-`-m` attempt — retried with explicit pathspec, no directory/`.` add used).
**what-considered:** combining board-state write + `.head` reset in one `orch-apply.sh` call vs two separate calls.
**why-decision:** one call/one commit — both changes are part of the same closeout action, atomic write is safer than two sequential CAS-guarded writes to the same hot file.
**why-change:** no change from plan. `tasksMdJanitorJob.ts`/`handlers.md`/`audit-dimensions.md`/`system-map.json` remain byte-identical to pre-cycle state (spec-only contract honored) — confirmed via `git status` showing zero diff on any of those 4 files this cycle.
