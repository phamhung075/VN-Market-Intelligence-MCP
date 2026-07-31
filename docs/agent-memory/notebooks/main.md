# Dev Team — Sprint Boundary Notebook

**Written:** 2026-07-31T09:02Z

## cycle-20260731T0902Z-futctg-verified-released — RAW-verified `dev-vps-crawls`'s FU-CTG-DISCOVERY-FILENAME-FILTER return (zero discrepancy on code/tests; found+closed a `.head` sync gap); pushed 2 local-only commits + own board/head-sync commit. WIP 0, idle-head

- **Commits confirmed real, built cleanly on this session's own S59 push**: `1c9959cdd` (fix+test)/`f133c659c` (notebook+journal) — both local-only (`git rev-list --left-right --count origin/main...HEAD` = 0/2 before push), zero divergence. Pushed cleanly.
- **Diff matches claim exactly**: `discover-bctc-urls-browser.py` — added `is_cover_letter_filename(url)` (final path segment, case-insensitive, query-strip+URL-decode, checks `cv_cbtt`/`cong_van_cbtt`), wired into `_fetch_pdf_url()`'s href loop (skip+continue-scan on match, same disposition as the pre-existing title filter). `urllib.parse`/`sys` already imported — no missing dependency.
- **Tests independently re-run, not trusted from self-report**: new `test_discover_bctc_filename_classifier.py` → **15/15 PASS**; full `vps-scripts/` suite → **57/57 PASS**; `py_compile` clean — exact match. Spot-checked the key test (`test_fetch_pdf_url_skips_cover_letter_returns_real_statement`) — genuinely exercises the real-world repro (article 613699's exact filenames), not a synthetic stand-in.
- **`.head` sync GAP found and closed**: board row correctly moved `in_progress→review` (`status:REVIEW`, `next_agent:qa`, `commit_sha` correct) but `.head` was left stale at `in_progress`/`FU-CTG-DISCOVERY-FILENAME-FILTER` — unlike FDA-10's clean same-write sync last tick. Fixed via `orch-apply.sh` (`.head`→idle), committed separately (`b5712ef9e`), pushed.
- **Coordination gap noted, not a defect**: `dev-vps-crawls` had no gateway/MCP grant to self-release; released on its behalf.
- **NEXT**: no items remain from this tick's dispatch. `TE-T12` still the only undispatched item from PO's 2026-07-31T0637Z triage (routes to `agent-father`). Idle-head, WIP=0.

## cycle-20260731T0847Z-bounded1-futctg-dispatched — Fresh tick: preflight RUN, drained 2 DEFER-covered context-bloat signals, `.head` idle/WIP=0 → BOUNDED-1 claimed+dispatched FU-CTG-DISCOVERY-FILENAME-FILTER (HNX BCTC discovery cover-letter filename filter gap); 1 background agent in flight

- **Preflight/GCC-preflight clean**: verdict RUN, tick `08:37Z`. No HEAD.lock, 3 external fleet-push worktrees untouched, dirty tree confirmed peer-session churn only (cowork notebooks/briefs/synthesis files).
- **Drained 2 signals, both DEFER-covered**: context-bloat breach on `dev-mcp-server`'s own decision journal (386L/94833B, overage 58833B — live in-progress sprint journal, growing fast) and a 4th consecutive breach on this session's OWN dev-team-4 journal (161L/64551B, overage 28551B). Both held per standing [[feedback_ctxbloat_breach_on_live_sprint_file_defer]].
- **CI probe**: GREEN on HEAD `39d1e0aaa`, no signal.
- **`.head` idle, WIP=0** → BOUNDED-1 promote+claim (full `--arg now`+`--slurpfile` contract, no error this time) → claimed `FU-CTG-DISCOVERY-FILENAME-FILTER` (P3/S, HNX discovery resolves a good-title article to a cover-letter PDF attachment via ArticlesFileAttach — needs filename-based CV_CBTT/cong_van_cbtt post-filter mirroring FIX-CTG-2's existing title filter). **Router-corrected `.head.next_agent`**: task zone `vps-scripts + apps/mcp-server` isn't in `system-map.json`'s zone list (Tier-1/2 zone-detect can't resolve it, Tier-3 would fall to generic `developer`) — git-history-confirmed (`fix(vps-crawls:...)` prefix, incl. the exact predecessor `bbf0f54bd` FIX-CTG-2) `dev-vps-crawls` owns `vps-scripts/*.py`; corrected before dispatch, same class as BOUNDED-1's own documented NON-CODE/DESIGN gap note. Dispatcher-wrap `task_claim` → `claimed:true` → spawned `dev-vps-crawls` in background with full context + explicit instruction to flag (not silently expand) if the fix genuinely also needs an apps/mcp-server change.
- **Elected NOT to dispatch Step 1 PO triage this tick**: BOUNDED-1 dispatched — same-tick fall-through skip per flow control (JUMP TO end after BOUNDED-1 claim).
- **NEXT**: await `dev-vps-crawls`'s RETURN, RAW-verify (re-diff the filename filter, re-run any claimed test, confirm scope stayed in vps-scripts/, board/head state), release lock. `TE-T12` remains the only other undispatched item from PO's 2026-07-31T0637Z triage (routes to `agent-father`, outside this session's zone).

## cycle-20260731T0826Z-fda10-verified-released — RAW-verified `dev-mcp-server`'s FDA-10 return (zero discrepancy); pushed its 3 local-only commits to origin, released lock. WIP 0, idle-head

- **Commits confirmed real, built cleanly on this session's own S57 push**: `ec27c69d3` (comment fix)/`41eaa8445` (board REVIEW flip)/`520277a1d` (notebook+journal) — none were pre-pushed by the agent; `git rev-list --left-right --count origin/main...HEAD` showed 3 local-only before I pushed. Pushed cleanly (`689086370..520277a1d`), pre-push `tsc` gate passed.
- **Diff matches claim exactly**: `shippingIndex.ts` — deleted the module-header line claiming "SCFI proxied via TE or BDI-related symbol"; corrected the `SHIPPING_SYMBOLS` JSDoc from "placeholder that resolves to BDI" to "SCFI has no free Yahoo ticker and is NOT fetched or proxied". Comment-only, `SHIPPING_SYMBOLS` array itself untouched. Independently ran `grep -i scfi` post-fix — exactly 1 hit, the corrected comment itself.
- **Test + build independently re-run, not trusted from self-report**: `bun test src/__tests__/252-shipping-index.test.ts` → **8 pass/0 fail/20 expect()**, exact match. `bun tsc --noEmit` → clean, exact match.
- **Board+head confirmed independently**: `FDA-10` row `status:REVIEW`, `next_agent:qa`, `commit_sha:ec27c69d3`, `status_note` accurate; `in_progress[]` empty; `.head` `{status:idle, active_task_id:null, next_agent:router, updated_by:dev-mcp-server}`.
- **Coordination gap noted, not a defect**: same class as S54/S56 — this `dev-mcp-server` instance had no gateway/MCP grant to self-release/notify; released on its behalf.
- **NEXT**: no items remain from this tick's dispatch. `TE-T12` still the only undispatched item from PO's 2026-07-31T0637Z triage (routes to `agent-father`). Idle-head, WIP=0.


