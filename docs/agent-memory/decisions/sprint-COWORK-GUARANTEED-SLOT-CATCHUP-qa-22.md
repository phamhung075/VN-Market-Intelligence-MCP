# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-14T15:01:12Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-21.md (CAP-REACHED 2026-08-14T15:01:12Z, 600L byte-cap axis — 37658B > 36000B cap at 170L, well under the 600L line-cap axis)

---

### STEP qa-S141 · qa · 2026-08-14T15:01:12Z
**task-id:** FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE
**what-done:** Direct-Commit Verify. Row had no `.commit`/`.files[]` drain fields — derived commit via `git log` on both claimed files (`probe.sh`, `emit-audit-signal.sh`), found `7298e1ffb20ee2e8242c58cae3a8d9431d06177f` (2026-07-30T10:35:02+02:00, matches review_note's claimed "2026-07-30T08:40Z"), confirmed real + on `main` ancestry.
**what-considered:**
- `git show --stat` matches `probe.sh` but NOT `emit-audit-signal.sh` (zero diff to that file in this commit) — independently verified the review_note's own explanation: read `emit-audit-signal.sh` in full, confirmed it is a pure named-arg passthrough with zero hardcoded "unreachable"/A-12-specific wording anywhere; the debounce decision (call emit or not) correctly lives in the consumer (`tier1-overrides.md`), not this script. Same "flagged deviation, independently confirmed accurate, not a silent scope-drop" shape as cycle-738's `assembleEveningSummary.ts`.
- `probe.sh`: A1 confirmed (`--max-time` 3→5 live at line 343); A2 confirmed (`_classify_curl_exit()` lines 34-42, applied only on the transport-failure branch, real non-200 HTTP unchanged); ran `probe.test.sh` — today's file has 24/24 pass (extended by 2 later, unrelated A-30 commits `6ff38d27e`/`a9e03849a`) but re-diffed the commit's OWN test additions and confirmed exactly T1-T7 (7 tests) landed here, matching the row's claimed "7/7 PASS" at commit time.
- `tier1-probe.md`+`tier1-overrides.md` diff confirmed A3 (N=3 debounce, transport-FAILs only, new child file, matches the row's own extraction-fallback precedent) and A4 (the "unreachable" gloss fixed at its real template source: Health-Endpoints bullets + Emit-per-failure section) — repo-wide grep of remaining "unreachable" hits in `main.md`/`handlers.md` confirmed unrelated (docker-daemon/cron-status/DB-unreachable, different checks, correctly untouched).
- `bash -n` syntax-clean on both `.sh` files; `mock-guard.sh --files probe.sh` PASS (bash not scanned as prod source, same precedent as cycle-736); DDD/secret/process.env greps on both files: zero matches. A5 (A-04/A-13 stale) independently spot-checked: zero live hits repo-wide outside the cited archived brief — holds.
**why-decision:** vc-approved, DONE_VERIFIED. All 3 `verification_gate` items hold under independent re-derivation (exit code captured+classified, never bare CURL_ERR; emitted summary states the observed fact not "unreachable"; debounce landed in the SAME commit as the exit-code fix, not separately). Zero blocking ISSUE.
**why-change:** none — verdict matches the row's own claim. Noted (non-blocking): row's `.files[]` field is stale relative to the actual commit diff (lists `emit-audit-signal.sh`, touched `tier1-probe.md`/`tier1-overrides.md`/`probe.test.sh` instead) — documentation-only, already self-flagged by the developer, not a code defect.

### STEP qa-S142 · qa · 2026-08-14T15:02:15Z
**task-id:** MD-FUNC-01-FIX
**what-done:** Direct-Commit Verify. Commit `2fb65b5bc1c75a2ac12bd2f11e4382799e021786` (memory/journal-only, zero prod-code diff) confirmed real, on `main` ancestry, `git show --stat` matches both `files[]` entries exactly. Did NOT trust prose alone — read `marketTools.ts:334-347` live: `vn_index{price,change_pct,direction}` struct confirmed genuinely present, `direction` dynamically derived from `vnIndex.changePct` sign (not hardcoded), `price`/`change_pct` sourced from `fetchVnIndex()`'s real VNDirect `vnmarket_prices` fetch.
**what-considered:**
- Re-ran targeted `1982-quality-burndown-CHIJ.test.ts` "MD-FUNC-01" section: 18/18 pass (exact claim match). Ran 3 more market-tool-adjacent files (185-data-freshness, TSU-DEV-U6, 1881a-source-tier) alongside: 82 pass/0 fail total — row's own "83/84, 1 skip" self-description imprecise (no skip observed) but zero fail either way.
- `bun tsc --noEmit`: 0 errors. `mock-guard.sh --files marketTools.ts`: PASS. `process.env`/secret greps on the file: clean. Cross-checked referenced fix commits `815ccaedd`/`ddc36452e`: both real, on `main` ancestry, dated 2026-06-10/06-16 — predate this verify commit, consistent with "already shipped, no code change needed."
**why-decision:** vc-approved, DONE_VERIFIED. Underlying claim (fields present, live-sourced, dynamically derived) independently reproduced from source, not trusted from status_note prose. Zero blocking ISSUE.
**why-change:** none — verdict matches the row's own claim.

### STEP qa-S142 · qa · 2026-08-14T15:02:11Z
**task-id:** ALT-FUNC-02-FIX
**what-done:** Direct-Commit Verify. Row's own commit `6fed9dc8b` (notebook+journal only, verification-only row) confirmed real, on `main` ancestry, `git show --stat` matches both `files[]` entries exactly.
**what-considered:**
- Row claims the real fix is prior commit `815ccaedd` (2026-06-10) — independently confirmed real, on main; `alertAccuracy.ts` diff adds top-level `accuracy_rate:number|null` (hits/scoreable, null iff hits+misses===0); grep-confirmed field still live, un-clobbered by the one later touching commit (`e170624d3`, unrelated ISO-8601 fix).
- Re-ran row's own cited tests, not trusted from prose: 1982-quality-burndown-CHIJ 18/18 + 183-alert-accuracy/1847d-D-alert-tools 28/28 = 46/46 pass, exact match. `bun tsc --noEmit` 0 errors. DDD grep: alertAccuracy.ts's infra imports are interface→infrastructure (allowed layering, no domain violation). Secret greps clean. No production files in THIS commit → mock-guard N/A (Smart-Skip).
- Independent LIVE probe (`mcp-call.sh get_alert_accuracy {}`), not the row's own cited numbers: `accuracy_rate:1`, in [0,1], `insufficientSample:false` — contract genuinely satisfied on live main today (rolling alert window shifted the raw counts vs row's snapshot, contract/shape identical). Cross-checked `docs/data/quality-checklist.json` independently: `ALT-FUNC-02.status:"PASS"` since 2026-06-10T18:00:00Z citing same commit.
**why-decision:** vc-approved, DONE_VERIFIED. Row correctly identified this backlog item as a stale pre-fix snapshot (created ~8h before 815ccaedd landed); AC (accuracy_rate in [0,1]) independently reconfirmed live, zero blocking ISSUE.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S143 · qa · 2026-08-14T17:15:00Z
**task-id:** BCT-OBS-01-FIX
**what-done:** Direct-Commit Verify. `commit: ccddb9ae6a299733bddb5280e44a4ef79b0d86bd` present on row; confirmed real + on `main` ancestry, `git show --stat` matches both `.files[]` entries exactly (notebook + decision-journal only — no source touched, "verification-only" claim self-consistent with diff shape).
**what-considered:**
- Trust the row's own 3-week-old (07-23) "live" DB probe prose vs re-derive fresh — chose re-derive: read `dataAuditJob.ts` + `telegram.ts` source directly, confirmed `maybeSendTelegram`'s `hasIssues` gate (auto_cleaned>0 OR flagged/escalated) and `sendTelegramWork`'s zero-DB-persistence-by-design (only `sendTelegramBug`→`telegram_reports`, `sendTelegramMarket`→`market_messages`) exactly as claimed — code-logic claim holds on direct read, not just trusted prose.
- Re-ran the row's cited `157-data-audit-job.test.ts`: 22/22 pass (row claimed 18/18 at commit-time; file grew 4 tests since, zero regression), targeted AC-6 ("does not send Telegram when DB is clean") + AC-7-Telegram ("sends one message when zero-price rows exist") individually — both pass, matching the row's named contract.
- Independently re-probed LIVE state (bind-mounted `data/live/market.db`, not the row's stale claim) instead of trusting 3-week-old evidence: `cron_job_runs` shows `dataAuditJob:daily` firing daily through 2026-08-13 (yesterday), all `success`; `system_logs(source='data-auditor')` shows nonzero cleaned+warnings+criticals every single day through 08-13 → `hasIssues=true` every run, gate still fires today, not just historically. `docker exec` into the live `mcp-server` container confirms `TELEGRAM_BOT_TOKEN`/`TELEGRAM_INFO_WORK_CHANNEL_ID` still set + `TELEGRAM_ENABLED=true` right now.
- Cross-checked `docs/data/quality-checklist.json` BCT-OBS-01: `status:"PASS"` since 2026-06-10T18:00Z, evidence cites real WORK-channel msg IDs 2743-2766, `recheck_how` correctly self-flagged as the wrong check (DB-only `read_telegram_reports` structurally cannot observe a WORK send) — matches the row's own claim verbatim.
- `bun tsc --noEmit`: 0 errors. `git status apps/mcp-server/`: clean. mock-guard/DDD/secret scans N/A — zero production files in diff.
**why-decision:** Every claim independently re-derived from source code + fresh live DB/container state (not the row's own prose alone) and all hold: no fix was needed, the checklist's original FAIL genuinely was a wrong `recheck_how`, not a real gap. Zero blocking ISSUE.
**why-change:** none — verdict matches the row's own claim; live re-probe is strictly stronger evidence than the 3-week-old snapshot it supersedes.

### STEP qa-S144 · qa · 2026-08-14T17:05:00Z
**task-id:** FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW
**what-done:** Direct-Commit Verify. Commit `8b4f977fdf4d0784d4190a3fd244ce3f8e704be4` confirmed real, on `main` ancestry, `git show --stat` matches all 5 `files[]` entries exactly (+2 flagged extras: `getBctcPendingRefineTool.ts` wire pass-through + new test file, both architect-flagged). No later commit touched any of the 5 files since.
**what-considered:**
- Line-by-line source diff review (not trusted from prose): `resolveColumnLayout(headerCells, inheritedLayout)` falls back to `inheritedLayout ?? "code-first"`; `parseRefinedMarkdown`'s `initialColumnLayout`/`ParseResult.finalColumnLayout` and `finalizeBctcRefine.ts`'s `carryColumnLayout` are an exact structural mirror of the pre-existing `carrySection`/`finalSection` thread. `windowPartitioner.ts`'s `pendingTruncationTail` correctly delays the cap-hit flag by one loop iteration onto the NEXT window. All logically sound on read.
- New fixture `FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW.test.ts`: 7/7 pass, 37 expect — exact match to reviewed_note (rows_parsed=5, BEQ-7 override to PARTIAL). Broader 31-file BCTC/refine-pipeline sweep: 404/404 pass, 0 fail — no regression (row claimed 412/32; close enough via a differently-scoped grep, zero-fail is the decisive signal).
- `bun tsc --noEmit`: 0 errors. `mock-guard.sh` on all 4 touched prod files: PASS. DDD greps: all 3 core files live in `application/` (not `domain/`) — infra imports (logger/db) are pre-existing legitimate application-layer deps; `refinedMarkdownParser.ts` (claims pure/no-I/O) has genuinely zero infra imports. Secret/`process.env` greps: clean.
- Cross-checked 2 supplementary claims live: `gen-project-stats.ts --dry-run` toolCount=183/cronJobCount=88 exact match; `size-lint-justification.sh --check` PASS 0 offenders (windowPartitioner.ts actual 154L vs header's declared 149L — 5L drift, within the script's own +/-10%/min-5L tolerance, non-blocking).
**why-decision:** vc-approved, DONE_VERIFIED. Every code claim independently re-derived from the actual diff + fresh test runs, not the row's own review prose. Zero blocking ISSUE.
**why-change:** none — verdict matches the row's own claim.

### STEP qa-S144 · qa · 2026-08-14T15:02:33Z
**task-id:** FIX-NSO-TS-KEY-COMMIT-SHA-DIGITS-PARSED-AS-DATE
**what-done:** Direct-Commit Verify. `5c95e59aa`+`40ca31df2`+`363fd17bf` confirmed real, on `main` ancestry; `git show --stat` matches claimed files (`lib/notebook-section-direction.sh`, `.test.sh`, `WORK.md`, `developer.md`+journal).
**what-considered:**
- Re-derived the bug independently (not trusted from prose): ran the OLD regex by hand against the live collision heading — it extracted `76198814` (SHA digits) vs the NEW `nso_ts_key` returning `20260814000000000` (correct). Confirms the fix, not just the test.
- `notebook-auto-prune.test.sh` 11/11 pass incl. new T11. AC-3 full-corpus scan reproduced myself over every live notebook heading — 0 suspects. `test-notebook-auto-prune.sh` Test 9 fails but is a PRE-EXISTING zsh `BASH_SOURCE` sourcing bug (separately tracked `FIX-NOTEBOOKAUTOPRUNE-HOOKGUARD-BASHSOURCE-ZSH-BREAK`, still BACKLOG), fails before `nso_ts_key` is reached — not a regression.
- Sibling-overlap check (dispatcher flag): grep-confirmed `nso_ts_key` is the SOLE date-regex implementation repo-wide (zero stray `grep -oE [0-9]{4}` elsewhere) — the July `FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-MISMATCH` widening and this SHA-collision hardening are sequential passes on the SAME function, not forked copies. No apps/ TS touched → bun test/tsc N/A. Security greps clean. AC-4 data-recovery on `TASK-COWORK-MUTEX-001.status_note` confirmed present, honestly labelled `[RECOVERED ...]`, not fabricated.
**why-decision:** APPROVED, DONE_VERIFIED. All ACs (AC-1..AC-4) independently reproduced against live code/data, zero blocking ISSUE.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S145 · qa · 2026-08-14T15:03:19Z
**task-id:** FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD
**what-done:** Direct-Commit Verify. `cf862f920`+`815752129` confirmed real, on `main` ancestry; `git show --stat` matches all 3 claimed files exactly (startupHelpers.ts, startScheduler.ts, new test file).
**what-considered:**
- Read the actual diffs, not prose: AC-1 `shouldSkipRecoveryReplay` guard added before `recordJobRun` (identical shape to base-rate precedent). AC-2 default fn now calls `runBctcReparseJob({ db })`; independently read `bctcReparseJob.ts:941`'s `if (!options.db)` self-record block and grepped ALL production callers of `runBctcReparseWithDb`/`runBctcReparseJob` — only startScheduler.ts + schedulerJobTable.ts call the wrapper, no bypass path — double-wrap genuinely eliminated. AC-3 startup catch-up now gated by `shouldRunCatchup(db,'bctcReparseJob',2,30,now,false)`, diff-confirmed.
- Re-ran new test file: 13/13 pass incl. T4b explicit AC-4 case. Broader regression (53-file grep-superset of claimed 22/216 scope): 503 pass/1 skip/0 fail. `tsc --noEmit` 0 errors. `mock-guard.sh` PASS both prod files. DDD: pre-existing infra imports in scheduler/ are legitimate (interface/cron layer, not domain/) — no violation introduced.
- DJ-GATE-1 confirmed: dev-mcp-server journal lines 278-284, genuinely AC-mapped content, not boilerplate.
**why-decision:** APPROVED, DONE_VERIFIED. Every AC claim independently re-derived from the actual diff + fresh test/tsc/mock-guard runs, not the row's own review prose. Zero blocking ISSUE.
**why-change:** none — AC-5 correctly deferred by developer (needs real post-deploy cron history), documented honestly, not silently dropped.
