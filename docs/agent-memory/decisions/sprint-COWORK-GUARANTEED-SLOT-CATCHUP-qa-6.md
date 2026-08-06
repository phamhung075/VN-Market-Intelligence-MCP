# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/miss-recording for elapsed guaranteed slots; not reopened for this row (unrelated CI-red size-lint fix riding the same QA-drain batch, separate sub-agent instance from qa-5.md to avoid a concurrent-write collision).
**Agent:** qa
**Started:** 2026-08-06T21:24:36Z

---

### STEP qa-S1 · qa · 2026-08-06T21:27:20Z
**task-id:** FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L
**what-done:** Direct-commit verify of `qa[]` row (`branch:null`, `.commit_sha: e000c5e3f`).
**what-considered:**
- Trust `review_note`'s prose claims (19/19 targeted tests, tsc clean, size-lint 0 offenders, CI green) vs. re-derive every check myself from RAW sources.
- Container `bun tsc --noEmit` process was OOM-killed twice inside `vn-market-intelligence-mcp-mcp-server-1` (mem-constrained, unrelated to this fix) — could have reported this as inconclusive/N/A, instead ran it on host `apps/mcp-server` directly to get a real signal (0 errors).
- Repo-wide `size-lint-justification.sh --check` now fails (exit 1) with 4 offenders that are NOT this row's file (`schema.ts`, `getBctcRefinedTool.ts`, `app_factory.py`, `embedder.py`) — considered blocking on this vs. confirming it's out of this row's own `files[]` scope (unrelated drift that appeared after this fix landed 2026-07-31).
**why-decision:** APPROVED, DONE_VERIFIED. Commit `e000c5e3f` confirmed real + on main ancestry; `git show --stat` matches the row's `files[]` entry exactly plus the expected new sibling `vpsProxyStalenessConfig.ts` extraction byproduct. Read the diff myself: `EXPECTED_INTERVALS`/`MARKET_HOURS_ONLY_SERVICES`/`NEWS_QUIET_HOURS_SERVICES`/`SBV_BUSINESS_DAY_SERVICES` moved verbatim, `isStale()` body untouched, `EXPECTED_INTERVALS.news` still `20` (AC-2 calibration integrity holds by construction, not just by claim). Live `wc -l`: `vpsProxyStaleness.ts`=107L, `vpsProxyStalenessConfig.ts`=48L, both under cap via real extraction (AC-1); no baseline-grandfather entry, no justification header (AC-6 landmine avoided, confirmed by direct grep). Re-ran AC-3's 3 targeted suites myself in the LIVE container (not a worktree): 19/19 pass, matches claim exactly. `mock-guard.sh` PASS. One pre-existing type-only `infrastructure/` import in `vpsProxyStaleness.ts` confirmed present before both `b08045ef0` and `e000c5e3f` (not introduced by this commit) and file is `interface/` layer not `domain/` — golden rule doesn't apply, no new DDD violation. AC-5 independently re-verified on the CI plane myself (not trusted from prose): `gh run view 30655761525` confirms `headSha 7b0833c0d709aef8262bab5033fe4dedcdb72519`, `size-lint` job `conclusion=success`, all 19 jobs green, `e000c5e3f` confirmed ancestor of that head via `git merge-base --is-ancestor`.
**why-change:** none — verdict matches this row's own claimed AC-1 through AC-6 outcomes; the 4 unrelated size-lint offenders discovered during re-run are flagged in `status_note` for separate CI-RED triage, correctly out of this row's own `files[]` scope, not blocking this verdict.

### STEP qa-S2 · qa · 2026-08-06T21:30:56Z
**task-id:** FIX-CI-SIZELINT-TECHANALYSIS-ROUTER-NEW-OFFENDER-143L
**what-done:** Direct-commit verify of `qa[]` row (`branch:null`, `.commit_sha: 969b5d96b`).
**what-considered:**
- Trust `status_note`'s prose (build/vet/test clean, CI run 30672400942 size-lint success) vs. re-derive every check from RAW sources myself.
- router.go/health_handler.go split matches AC-1's file-per-handler convention — only real extraction target, mirrors sibling `*_handler.go` shape; no other viable split.
**why-decision:** APPROVED, DONE_VERIFIED. Commit `969b5d96b` confirmed real + on main ancestry; `git show --stat` matches `files[]` exactly (router.go -29L, new health_handler.go +41L). Read both files live: `handleHealth(port)` same call site, `defaultPort` fallback via `strconv.Atoi(cfg.Port)` intact — AC-2 confirmed by source read, not prose. `go build`/`go vet` clean, `go test ./...` all pass; `TestHealth_Returns200`+`TestHealth_ReflectsConfiguredPort` re-run fresh (`-count=1`, non-cached) PASS. `golangci-lint run ./...` 0 issues. `router.go` absent from `size-lint-justification.sh --check` offender list (confirmed twice); repo-wide `--check` still fails on the SAME 4 unrelated offenders qa-6.md-S1 already flagged (`schema.ts`/`getBctcRefinedTool.ts`/`app_factory.py`/`embedder.py`) — corroborates pre-existing drift, not this fix's regression. No baseline-grandfather entry for `router.go` in `size-lint-baseline.json`, no justification header (AC-6 landmine avoided). AC-5 independently re-verified: `gh run view 30672400942` headSha `d93e4fbc17862f9d65720fe1bc6424b5913c8369` matches `status_note` claim exactly, `size-lint` job `conclusion=success`; that headSha confirmed descendant of `969b5d96b` and ancestor of `main`. `mock-guard.sh --files` (both touched files) PASS. DJ-GATE-1: `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-technical-analysis.md` STEP dev-technical-analysis-S3, task-id-stamped, predates this verify.
**why-change:** none — verdict matches row's own claimed AC-1 through AC-6 outcomes.

### STEP qa-S3 · qa · 2026-08-06T21:33:00Z
**task-id:** TE-T14
**what-done:** Direct-commit verify of `qa[]` row (`branch:null`, `.commit_sha: 013c90710`), flow-doc-only edit to `docs/agents/system-auditor/flow/main.md` Step 0c.
**what-considered:**
- Trust `review_note`'s "no semantic change to what system-auditor consumes" claim vs. independently grep this same file for every `system-map.json` reference, not just fleet-wide external callers (which is all review_note's own audit checked).
- Live-ran the new jq projection: exit 0, counts 11/12/0/28/7/12 match claim exactly — the projection itself is correct for the 6 paths it names.
- Found 2 real in-file consumers the projection drops: main.md:297 A-29 iterates `microservices[0].crons` (~70 entries, absent from new `{id,external_port,zone}` selector); main.md:325-339 SLA Resolver needs `.sla.*` per source (dropped from new `{id,expected_cadence_hours,stale_threshold_hours,geo_blocked}` selector) — live-confirmed 2/28 sources (bctc-discover/-push) carry `sla`, flat 168h vs sla-resolved ~1714h, risking FIX-BCTC-SLA-THRESHOLD-360 false-CRITICAL regression.
**why-decision:** CHANGES_REQUESTED. Old full-Read kept these fields implicitly in context; new jq projection actively strips anything unselected — a real behavior change despite the review_note's claim, not a doc nit.
**why-change:** none from plan — verify-committed jump ran as specced; found a genuine gap the row's own review missed.

### STEP qa-S4 · qa · 2026-08-06T22:05:00Z
**task-id:** FIX-COWORK-FLOWDOC-STALE-TRANSPORT-GAP-CAVEAT
**what-done:** Direct-commit verify of `438e66958` — confirmed real/main-ancestor, touches exactly the 4 claimed files; grep-confirmed AC-1 (zero stale-caveat text repo-wide) and AC-4 (empty diff on `.claude/agents/*.md`) myself, not trusted from dev-team's review_note.
**what-considered:**
- AC-2/AC-3 (coverage-state.json un-freezes) still false today — live-reproduced why: `coverage-stamp.sh` fails deterministically (`task_claim ttl_seconds=30` < tool schema `minimum:60`), matching market-watcher's own TODAY 20:06Z cycle log `[script-transport-error]`.
- Is this a regression of this row's diff, or a different pre-existing bug? — diff never touches the mutex/ttl description text; confirmed via memory `project_stale_transport_gap_note_blocks_coverage_state_writes.md` this exact TTL-validation failure is the ALREADY-TRACKED `FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE` (P1 BACKLOG/ba, scope widened 08-01 for precisely this mode).
**why-decision:** APPROVED, DONE_VERIFIED. This row's own scope (strip false "no Bash" premise) is correctly delivered — fallback now fires only on genuine script errors, exactly as designed, which is what surfaced the real, already-owned bug instead of masking it. Not conflating two defects by topic (feedback_selfreport_conflates_two_dbadjacent_defects_by_topic).
**why-change:** none — verdict matches AC-1/AC-4; AC-2/AC-3 correctly deferred to the sibling tracked row, not this one's to fix.
