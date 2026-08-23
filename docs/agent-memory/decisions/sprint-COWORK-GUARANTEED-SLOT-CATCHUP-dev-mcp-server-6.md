# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server (continuation 6)

**Sprint goal:** see sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md header — this file is a byte-cap rollover continuation (dual-axis cap check, base file capped 2026-07-31, -2 capped 2026-08-01, -3 capped 2026-08-06, -4 capped 2026-08-09, -5 capped 2026-08-13 on byte-axis).
**Agent:** dev-mcp-server
**Started:** 2026-08-13T18:36:27Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-08-14T06:10:00Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** Implemented architect blueprint verbatim: new `bctc_news_fallback_hints` table (schema-financial-reports.ts), rewrote `tryNewsChainFallback()` to persist there instead of `financial_reports`, rewrote 7 tests (6 named + Finding F-1), added FR-5 RAG-non-leak test + 2 serving-plane tests.
**what-considered:**
- Blueprint §4b's suggested arm-(b1) reason-string rewording ("no hint recorded") — REJECTED: would break the existing AC-2 test's `toContain("preserved")` assertion, which acceptance criterion 5 + blueprint §6 row 7 both require staying byte-unchanged. Kept the original "preserved" wording instead.
- RED-8's 2nd-call `pdfTextOverride` fixture (English text) — discovered it never actually parsed (zero-confidence/empty balance sheet); pre-fix this was masked by a stale financial_reports row from call 1 that a separate "Bug 1352a" extraction_method-only UPDATE silently re-stamped. Fixed root cause: replaced fixture with real Vietnamese BCTC minimal text (mirrors 048-ssc-pipeline.test.ts's MINIMAL_BCTC_TEXT) so the call genuinely succeeds, matching the test's own stated intent.
**why-decision:** Both deviations preserve the row's explicit acceptance criteria (AC-3 exact-rewrite-intent, AC-5 arm-b1 non-regression) more faithfully than following the blueprint's literal text where blueprint and AC conflicted; standing rule "fix root cause not recurrent symptom" for the fixture.
**why-change:** RED-before (git-stash A/B) confirmed 8/19 tests correctly RED against old impl; GREEN after restore. tsc clean, grep-verified zero `INSERT INTO financial_reports` remains in newsChainFallback.ts.

### STEP dev-team-router-S1 · dev-team · 2026-08-14T06:30:00Z
**task-id:** FIX-BCTC-NEWSCHAIN-FALLBACK-ZEROS-WRITE-TARGET
**what-done:** RAW-verify pass ahead of push (PUSH-AUTONOMY-1 §5 attestation), independent of dev-mcp-server's own self-report — router re-ran the check itself rather than trusting the notebook claim at face value.
**what-considered:** `grep -n "INSERT INTO financial_reports\|financial_reports" apps/mcp-server/src/application/usecases/bctc/newsChainFallback.ts` — confirmed zero write statements, only read/comment references. Confirmed `bctc_news_fallback_hints` table live in `schema-financial-reports.ts` (`initFinancialReportsTables()`, `UNIQUE(action_code, sort_key)`, indexed). Independently ran `bun test src/__tests__/1294b-bctc-fallback.test.ts` live (not from cache/mock) — 10 pass / 0 fail / 40 expect() calls; live log output confirms the actual code path (`"fallback hints recorded (bctc_news_fallback_hints, NOT financial_reports)"`) fires for real fallback cases, not a fabricated/stubbed assertion.
**why-decision:** RAW-verified — commits 215010308/af4d7e166/dd579e292 match their own claims; attesting to unblock push per PUSH-AUTONOMY-1 §5 (RAW-verify token in an added decisions/** line).

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-08-14T09:35:00Z
**task-id:** FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH
**what-done:** Diagnosed + fixed CI-red `ALLZERO-OHLCV-FETCH.test.ts` — AC-1..AC-3 fixtures hardcoded absolute dates (`2026-06-1x`) against `get_price_history`'s real `date('now','-N days')` SQL filter; wall-clock drift carried them outside the `days=60` window, so the file failed even in isolation (not cross-test leakage). Replaced literals with a `dateStr(daysAgo)` helper deriving fixture dates from `Date.now()` — same idiom already used in `178-price-history.test.ts`.
**what-considered:**
- Widen `days` param instead of fixing dates — REJECTED: masks symptom, next drift cycle re-breaks it; doesn't fix root cause.
- Freeze `Bun.env`/mock the clock — REJECTED: heavier, file has no existing clock-injection seam, `dateStr()` is the established repo convention for this exact class.
**why-decision:** Root-cause fix (dynamic relative dates) matches the sibling test's already-proven pattern; zero production code touched.
**why-change:** No change from brief — brief flagged "per-file isolation" as diagnostic hint; confirmed via isolated run the defect is intra-file (stale fixtures), not cross-file state leakage. Did not touch `FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL.test.ts` (the sibling FAILEDFILE) — separate board row, out of scope.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-08-14T08:35:00Z
**task-id:** FIX-CI-BUNTEST-FOREIGN-FLOW-MISSING-TRADING-DAY-NO-BACKFILL
**what-done:** Router direct-dispatch (PO starvation escalation, ~67h/13 folds/0 pickup). Diagnosed CI-red: `checkForeignFlowGap()` always called real `getTodayVnDate()` with no override; the test fixture only ever seeded through 2026-08-07, so every real trading day since then (08-10..08-13) silently became a new zero-row "gap" — `rowsAffected` drifted 1→5. Added an injectable `today` param (default real clock, mirrors `findForeignFlowGapDays(db, vnToday)` one layer down); test now pins `CHECK_TODAY="2026-08-08"`. Cross-plane check (PO's flagged concern): confirmed by design (file header + infrastructure.md) this detector has NO backfill/reconstruction path — it only escalates via `agent_feedback`+Telegram — so the SLA-monitor staleness (3900min/1020min) is a separate, already-known-unrecoverable production symptom of the SAME upstream VPS outage, not something this test asserts a fix for; fixing the test did not require touching backfill logic because none exists or was ever claimed to exist.
**what-considered:**
- Rewrite fixture dates relative to `Date.now()` (the ALLZERO-OHLCV-FETCH precedent) — REJECTED: `isVnTradingDay` is anchored to an embedded holiday-year table (`VN_HOLIDAYS`/`VN_CALENDAR_LAST_YEAR`), so relative dates could land on undefined future years or accidentally shift onto a real holiday — the fixed-date fixture is intentional here, unlike the pure-day-offset ALLZERO case.
- Change `checkForeignFlowGap` to accept `today` — chosen: same DI seam `findForeignFlowGapDays` already exposes; zero behavior change for the real `dataAuditJob.ts` caller (default arg).
**why-decision:** Root cause is a testability gap (no clock injection), not a production defect — matches the FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH sibling's wall-clock-drift class exactly, confirmed by the exact predicted gap-day math (real "today"=08-14 minus seeded-through-08-07 = 5 gap days, matching the observed `Received: 5`).
**why-change:** No change from brief — brief asked to check whether this is one defect with two symptoms; determined it is NOT (test defect is DI-only; production symptom is the already-diagnosed, already-unrecoverable VPS push-outage documented in checkForeignFlowGap.ts's own header + infrastructure.md).

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-08-14T15:35:00Z
**task-id:** FIX-BCTC-REPARSE-PERIOD-KEY-SYSTEMATICALLY-STALE-100PCT-QUARANTINE
**what-done:** Router pre-claimed but had no `Agent` tool grant to nest-spawn `dev-mcp-server` (documented known-drift gap, `developer/flow/main.md`); board row's own `next_agent`=`developer` at claim time, so implemented directly under the `dev-mcp-server` zone flow per that exception. Root cause confirmed by reading code (not just the row's prose): `reparseSingleWithOcrFallback` computed its "supplied" period ENTIRELY from `parseYearQuarterFromFilename(payload.filename)` — the stranded queue row's stale filename — and passed it straight to `deps.pipeline`, never consulting the extracted `rawText` for the period. `parseBctcReport`'s `checkPeriodContentConsistency` guard (confirmed correct, untouched) then refuses on mismatch.
**what-considered:**
- Weaken/bypass the period-mismatch guard — REJECTED explicitly by the row's own text ("must not be weakened") and independently confirmed correct by reading `periodContentExtractor.ts`'s own doc comment (conservative-by-design, negative-control-tested).
- Re-derive period from filename at a LATER point (e.g. re-parse filename post-extraction) — REJECTED: filename is fixed at row-creation time regardless of when re-parsed; re-reading it again would not fix staleness.
- Re-derive period from document CONTENT via the already-existing pure `extractPeriodFromContent()` (periodContentExtractor.ts) right before calling `deps.pipeline` — CHOSEN: same signal the write-time guard itself trusts, zero new abstraction, falls back to the filename-derived period on an inconclusive content signal (identical "cannot determine" negative control already codified for poor-OCR filings).
**why-decision:** Reuses the exact function the guard already relies on — guarantees the supplied period and the guard's own comparison basis are derived from the SAME extraction pass, closing the staleness gap at its source rather than adding a second heuristic.
**why-change:** No change from brief — brief named the fix shape explicitly ("re-derive the period key from document content at reparse time"); implementation matched it directly.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-08-14T23:10:00Z
**task-id:** TASK_2008a
**what-done:** UC-CDC-P1 slice. FR-A2: added `SESSION_STATUSES` const array (vnTradingCalendar.ts) as runtime SSOT, `SessionStatus` now derived `typeof SESSION_STATUSES[number]`. FR-A1: added `computeCalendarStatusFn: () => SessionStatus` to `EmitPressureStateDeps` (same injectable seam as signal_backlog/dev_queue_depth/container_vm_headroom_mb); `defaultDeps` wires `isVnTradingDay(getTodayVnDate()).session_status`. Enforcement inside `runEmitPressureState`: in-domain override honored, out-of-domain `console.warn`'d + discarded in favor of recompute — Zod wire stays bare `z.string().optional()` (unchanged), no schema reject.
**what-considered:**
- Hard `z.enum(SESSION_STATUSES)` at the Zod boundary — REJECTED per handoff Design Rationale: an MCP-SDK-level rejection risk would break the tool's documented never-throws contract that telemetry.md Step 6.0's MANDATORY WORK-path call depends on.
- Update the 4 blast-radius test sites via literal field addition (buildDeps/makeRunDeps/2 standalone literals) — CHOSEN, matches AC exactly; added a 5th describe block (4 new tests: omitted→compute, in-domain override wins, out-of-domain WARN+recompute via `spyOn(console,"warn")`, wire-level never-throws) rather than folding into existing blocks — the enforcement logic is a distinct axis from the existing AC-1..AC-5 coverage.
**why-decision:** AC list in TASK_2008a.md is the concrete, line-anchored spec (architect-verified 2026-08-14); it explicitly resolves the tension between the router-summary's loose "enum-gate the Zod schema" phrasing and the Design Rationale's never-throws constraint — schema unchanged, enforcement inside the function.
**why-change:** No change from plan. RED confirmed first (3/4 new tests failed pre-impl — 4th passed trivially since override-wins was already the pre-existing behavior), GREEN after. tsc clean, toolCount=183/cronJobCount=88 unchanged (no barrel edit), server boots clean on PORT=3099.

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-08-15T07:47:00Z
**task-id:** SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD
**what-done:** Read live REVIEW row: supervised:true, plan_only:true, NO po_goahead_* field. PO's 2026-08-15T07:28Z note (triage-20260815T0728Z-po.md) confirms deliberate non-ratification ("a go-ahead would be inert"). HELD — did not start AC-1/AC-2/cap-enforcement work. Probed the canonical write path (scratch candidate, no live write) to record the hold on the row itself: scripts/orch-row-prose-ceiling-check.mjs Stage 2.5 hard-rejected it (row 34725B >> 12000B ceiling, ANY net-new field is unbypassable exit-1).
**what-considered:**
- detail_ref migration to shrink the row first — REJECTED, itself blocked (FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION), same wall PO hit this morning.
- raw/direct file edit bypassing orch-apply.sh — REJECTED, forbidden by the Orch-State Hot File Write Contract, no exception for a hold-note.
- proceed with AC-2 work since the ceiling-fix code is already live on disk though its board row (FIX-PROSECEILING...) is still BACKLOG — REJECTED per instruction: a landed code fix != PO go-ahead stamp; self-ratifying is the deference antipattern PO's own note warns against.
**why-decision:** supervised:true+plan_only:true+no-po_goahead_* triple-gate unmet; PO explicitly declined ratification same-day and named this row her own follow-up — proceeding would override a contemporaneous PO decision.
**why-change:** the row-level write is ALSO blocked (2nd independent gate, empirically verified not assumed) — hold recorded in this journal + notebook instead; new compounding-gate finding (this row cannot take ANY inline write right now, including PO's own future po_goahead_* stamp) escalated to dispatcher in RETURN.

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-08-15T08:23:50Z
**task-id:** FIX-PENDING-REFINE-OUTPUT-235K-OVERFLOW
**what-done:** QA CHANGES_REQUESTED rework: prior fix's MAX_LIMIT=100 row-count clamp reproduces the 235K overflow on real data (565,285 chars at limit=100, live-worsened to 695,225 by the time I re-verified — queue ages, avg row weight grows). Added a response-size guard checking the ACTUAL assembled payload on every call (not `limit`), falls back to a small structured `{error,file_path,char_count,suggested_limit}` + lossless file write when it would exceed a 150,000-char safe ceiling.
**what-considered:**
- (a) recalibrate MAX_LIMIT from a computed real-avg-row-size ceiling — REJECTED: live-reverified the SAME limit=20 query 3 days after QA's own measurement and found it had already drifted 125,211→153,138 chars with zero code change; a static row-count cap derived from one point-in-time average would eventually re-break the same way.
- (b) dynamic per-call response-size guard, dep-injectable via guardOverride (mirrors dbOverride/fetchPageTextsDeps DI already in this file) — CHOSEN, matches QA's own "more robust... doesn't depend on getting the average row-size right forever" framing, now empirically corroborated by the 3-day drift.
**why-decision:** the guard is correct regardless of future dataset growth, protects the report_id single-row branch too (a static row-count cap cannot), and real callers (fleet cron, limit=1 per refine_bctc_md flow) are completely unaffected — only the edge-case large-limit path changes shape.
**why-change:** none from QA's proposed options — implemented (b) as QA left open; verified live in the running container at limit=1/20/50/100 against real production data (not just the synthetic fixture), confirmed the guard fires at limit=100 (524-char response, 100-row file written losslessly) and stays silent at limit=1 (7,562 chars, well under ceiling).

### STEP dev-mcp-server-S8 · dev-mcp-server · 2026-08-15T08:52:00Z
**task-id:** FACTORY-APP-split-pollNews
**what-done:** QA CHANGES_REQUESTED redispatch (0f23a703f): only peripheral clusters extracted, pollNews()'s own 790L pipeline body untouched. Continued the "one extraction per commit" ladder for stage 1 (fetch/health): 5 new files (resolveFetchers/teChromiumRetry/sourceHealth/fetchAndRecordHealth/allSourcesDarkAlert.ts), pollNews.ts 923L->671L.
**what-considered:**
- attempt full remaining decomposition (all 3 stages) in one pass, matching sibling FACTORY-APP-split-assembleBriefing's precedent — REJECTED: ~790L of tightly-threaded shared local state (db/watchlist/entries/signals) across fetch+dedup+cascade stages is materially higher-risk to move correctly in one sitting than assembleBriefing's 19 independent best-effort steps; the task's own approach field explicitly names "one extraction per commit".
- ship only stage-1 (fetch/health: resolveFetchers+fetchAndRecordHealth+allSourcesDarkAlert), verified end-to-end via the existing black-box test suite (no test imported internal symbols) — CHOSEN: concrete, verifiable, addresses QA's exact complaint (pipeline body untouched) without the correctness risk of a rushed full rewrite.
**why-decision:** matches the task's own documented cadence; every new file independently <=120L (no size-justification header, unlike 4/5 files in the prior commit QA flagged) — genuinely closes the DoD gap for this stage rather than re-adding a justification banner.
**why-change:** none — this is exactly the "continue the ladder" path QA's own status_note offered as an alternative to full-scope re-work. Remaining stages (dedup/insert, cascade/alert-generation) flagged as follow-up in file header + usecases.md, not silently left implicit.

### STEP dev-mcp-server-S9 · dev-mcp-server · 2026-08-22T17:25:00Z
**task-id:** ambient (router-dispatched follow-up on agents-architect brief 2026-08-22-agent-fabric-ddd-debug-logger-tool-optimization.md; agent-father ratified document-as-deviation in STEP agent-father-S53 but has no zone grant for apps/mcp-server/, routed the annotation writes to router→me)
**what-done:** Added `ddd-deviation-allow:` comment blocks (comment-only, no behavior change) at orchStateSchema.ts (before § 1 STATUS ENUM banner, covers StatusEnum/TERMINAL_SET) and coordinationStore.ts (before the ORPHAN_EMIT_ALLOW_LIST doc comment), mirroring the size-justification:/composition-root-logic-allow: convention. Minted backlog row FIX-COMPROOT-LOGIC-GATE-TS-EQUIVALENT for the fast-follow TS guardrail (item 2) rather than rush it this cycle.
**what-considered:**
- Reuse `composition-root-logic-allow:` marker verbatim — REJECTED: that marker is semantically Go-composition-root-specific (receiver-method if/for-count gate); reusing it on TS infra files with no such gate would be misleading grep-bait.
- Mint a new `ddd-deviation-allow:` marker (mirrors the naming pattern of `size-justification:`/`metric-mask-allow:`/`composition-root-logic-allow:`) — CHOSEN: greppable, self-describing, and is the exact hook the new backlog row's guardrail can key its escape-hatch off once built.
- Build the TS guardrail (item 2) now vs. mint backlog — CHOSEN mint: explicitly flagged non-blocking/fast-follow by agent-father's RETURN; a rushed AST heuristic risks false positives (the Go gate needed live-scan threshold tuning to hit zero FPs before wiring to CI) — same risk class not worth taking under a comment-only task's time budget.
**why-decision:** Zero existing repo precedent for a TS-side "business-rule-in-infra" annotation keyword, so minted one consistent with the existing `<scope>-allow:`/`<scope>-justification:` family rather than overloading the Go-specific marker.
**why-change:** no change — brief explicitly deferred both the ratification (agent-father/PO) and the annotation mechanics (mirror the existing convention) to this point in the chain; no prior plan existed for the exact marker name.

### STEP dev-mcp-server-S10 · dev-mcp-server · 2026-08-22T20:30:00Z
**task-id:** FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE
**what-done:** QA CHANGES_REQUESTED on commit 7ac55adc8 (AC-2 not met: matchesVnmVeaSignature gated on rule-membership alone, so BCTC-VAL-03 stacking with a 2nd soft violation still attached the VNM/VEA hint at confidence 0.4/0.6, outside the mandated {0.0,0.8}). Re-gated on `violations.length===1` (equivalently confidence in {0.0,0.8}) in confidenceFinancialReasonBuilder.ts; added 2 regression tests reproducing QA's live finding (VAL-03+VAL-05 stack ->0.6) plus a VAL-03+VAL-01-SCALE stack (->0.4).
**what-considered:**
- gate on `confidence===0.0||confidence===0.8` directly — REJECTED as primary check: equivalent in every reachable case but `violations.length===1` reads as the actual causal condition (QA's own fix recommendation phrased it as the primary form, confidence-equality as "equivalently").
- gate on rule-membership AND confidence-equality (redundant double-check) — REJECTED: `violations.length===1` alone already implies the confidence lands correctly for VAL-01/03/10 given the validator's own short-circuit structure; a redundant confidence check adds no safety, only surface.
**why-decision:** matches QA's specific, actionable finding exactly (direct-commit row, no branch, QA verdict already root-caused the gap) — smallest correct fix, no new abstraction needed.
**why-change:** none — QA's fix recommendation was followed as specified; only decision was primary-condition phrasing (violations.length vs confidence-equality), functionally identical.

### STEP dev-mcp-server-S11 · dev-mcp-server · 2026-08-22T23:20:00Z
**task-id:** UNBLOCK-FLEETPUSH-SIZELINT-ORCHSTATESCHEMA-NEW-OFFENDER-BLOCKS-ALL-PUSHES
**what-done:** Refreshed the stale `size-justification: ~1300L` header (line 3) on orchStateSchema.ts to `~1797L` + appended a growth-log bullet documenting commits efcb45ad8/1897ef6a2 (§15/§16 sprint-registry dangling-id guard). Verified size-lint --check PASS (was FAIL new-offender), tsc clean, 67/67 directly-dependent tests pass, full suite 15335/50/40 (matches known pre-existing baseline, zero new regressions). Pushed — origin/main..HEAD confirmed 0 after push.
**what-considered:**
- Trim/split the file back toward ~1300L — REJECTED: git blame confirms both commits are real, QA-approved production code (referential-integrity guard), not dead weight; task brief explicitly forbids trimming legitimate growth.
- Add a docs/data/size-lint-baseline.json grandfather entry instead — REJECTED: that file is wholesale-regenerated by `--update`, a hand-added entry would silently drop on the next regen (task brief AC-1 explicit non-goal).
- Header-only refresh declaring actual current size — CHOSEN: the checker's own tolerance design (declared-size ± 10%) exists precisely for this case; mechanical 1-line-class fix, zero code/logic change, matches the file's own established growth-log header convention.
**why-decision:** smallest correct fix matching the checker's designed escape hatch; fleet-wide P0 (40+ commits stuck off-host) makes minimal-risk speed the deciding factor over any code-restructuring option.
**why-change:** none — this is exactly the mechanical fix the dispatching task brief specified.

### STEP dev-mcp-server-S12 · dev-mcp-server · 2026-08-23T09:04:00Z
**task-id:** TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY
**what-done:** Extended guard-signal-type-coverage.sh to parse Pipeline-A (`pending_triage_inbox[]`) in addition to Pipeline-B, tagged both rule sets by pipeline so a rule from one never covers the other, and added a mint_routing_gap_row() self-filing fallback (dedup-keyed on type, via real orch-apply.sh) on any unrouted type. orchStateSchema.ts untouched (verified 0-line diff). Test suite 7->24 assertions, all GREEN against disposable fixtures; live orch-state.json smoke test GREEN.
**what-considered:**
- add a wildcard/glob matcher for Pipeline-A's "fundamental_*" alias cell — REJECTED: no live type literally matches that placeholder pattern; out of AC scope, would add untestable surface.
- mint the backlog row's `type` field as "FIX" (matching other canonical templates) — REJECTED: AC-4 explicitly names the existing `routing-gap` vocabulary slot; reusing it is the whole open-namespace point of the brief.
- add `oven-sh/setup-bun` to the CI job so mint always succeeds there too — REJECTED: CI never persists a mint (ephemeral checkout, no push-back step) and the job's actual gate (exit 1) is unaffected by mint failure; adding bun+install would add real per-push cost to the "cheapest job" for a path that degrades gracefully without it — documented honestly in the job comment instead.
**why-decision:** matches the architect brief's decision (b) and every AC in the handoff; verified end-to-end (both pipelines, both directions of the cross-pipeline blind spot, mint success + dedup-skip) against real orch-apply.sh, not asserted.
**why-change:** none — implementation follows the brief's §3 design as specified.

### STEP dev-mcp-server-S13 · dev-mcp-server · 2026-08-23T13:11:00Z
**task-id:** TASK-BCTC-INSPECT-LABEL-FIX
**what-done:** Added `QUARTERLY_PERIOD_TYPE_RE` + exported `normalizeQuarter()` to bctcInspectHandler.ts; buildLabel() now only appends a quarter suffix when period_type does NOT already match `/^Q[1-4]$/`. Updated PI3-bctc-inspect.test.ts:361 AC-14 assertion + added 6-case normalizeQuarter() describe block. Live-probed :3099/api/bctc-inspect/docs post-fix: 0/268 rows show a duplicated/garbled quarter token (was 255/257 pre-fix per architect's live-tested finding).
**what-considered:**
- BA's original narrower fix (parseInt-coerce period_quarter only) — REJECTED: architect's D-1 finding proved this only fixes the 2 HUT string rows, leaves all 255 normal rows still duplicated ("VCB Q1 Q1 2025") since period_type already holds 'Q1'..'Q4' and the unconditional append is the real defect.
- add a 1-4 range check inside normalizeQuarter() for the "Q0" edge case — REJECTED (for now): handoff's own reference implementation (verbatim, architect D-1) has no range check and explicitly frames it as an open question ("verify this is intended or add a range check"); not an AC, added scope the brief didn't ask for. Test documents the actual 0-return behavior rather than silently asserting an un-mandated null.
**why-decision:** architect D-1 spec is the corrected root-cause fix (verified live against all 255+2 rows), matches AC9/AC-14 exactly; normalizeQuarter() mirrors the file's existing exported-pure-function test pattern (isDecimalShiftAnomaly/isValidUuid).
**why-change:** none — implementation follows the handoff's D-1 code verbatim.
