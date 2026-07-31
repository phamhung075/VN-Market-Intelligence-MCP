# po triage 2026-07-31T01:32Z — dev-team Step 1, cron tick 2026-07-31T01:07Z
#
# Inputs: ci_red CI-RED-8e1e66e5 (run 30594239516) + 4x bug-escalation from
# commit-sweep-guard. Executed FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY AC-1
# BY HAND (that row is still BACKLOG/unshipped): read the failing job logs and
# extracted the FAILEDFILE / offending-file identities BEFORE deduping.
#
# Disposition:
#   frontend-eslint -> DEDUP into READY FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT
#                      (dedup_key ci_job:frontend-eslint|file:apps/frontend/bun.lock matches
#                       verbatim; annotate the row, no new task)
#   size-lint       -> existing READY row covers 1 of 8 offenders; mint 2 rows for the
#                      other 7 (6 apps/mcp-server + 1 apps/pdf-extractor) + correct the
#                      existing row's now-unsatisfiable job-level AC
#   bun test        -> NEW file identity src/__tests__/1837a-pipeline-state.test.ts,
#                      owned by zero rows -> mint row A
#   4x sweep-guard  -> dev-team's "hook is noisy / cannot see the pathspec" premise is
#                      FALSIFIED at source -> mint row D (actuator + adjudication rule)
#
# Usage: jq -f scripts/po-triage-20260731-0132-cired-headstamp-sizelint-sweepguard.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

# ── A. bun test RED — live .head lost its updated_at/updated_by stamp ──────────
.task_board.backlog += [{
  "id": "FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A",
  "type": "FIX",
  "size": "S",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "cross-service/",
  "owner": "developer",
  "next_agent": "developer",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0132",
  "created_at": "2026-07-31T01:32:47Z",
  "updated_at": "2026-07-31T01:32:47Z",
  "origin_signal_id": "CI-RED-8e1e66e5",
  "check_id": "CI-RED-8e1e66e5",
  "ci_fingerprint": "9de25f02daa1d23c07bab4bd741634c29a88ac0060e190c7ead1f70ce1fa2d0a",
  "dedup_key": "ci_job:bun test|file:apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts",
  "verification_gate": "ci_green_on_subsequent_push",
  "title": "CI job `bun test` RED: live docs/data/orch/orch-state.json .head is a 3-field literal {status,active_task_id,next_agent} with NO updated_at / updated_by — 1837a-pipeline-state.test.ts AC-1+AC-3 fail. The routing pointer has silently lost its only freshness stamp; orch-apply.sh Stage 1.5 stamps task_board ROWS but was never extended to .head, and HeadSchema declares both fields optional so the write gate passes it clean.",
  "root_cause": "Two-plane divergence, both read at source this tick. (1) apps/mcp-server/src/infrastructure/orchStateSchema.ts:220-233 HeadSchema declares updated_at:227 and updated_by:226 as .optional() and the object is .passthrough() — a head replaced by the 3-field literal {status:idle, active_task_id:null, next_agent:router} validates GREEN through scripts/orch-apply.sh. (2) apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts:66-80 requires exactly 5 head fields (status, active_task_id, next_agent, updated_at, updated_by) and :103-108 parses head.updated_at as a Date — new Date(undefined) is NaN, so AC-3 fails too. The producers are the per-tick ad-hoc .jq transforms agents mint (e.g. scripts/dev-team-flip-ucaslp6-review-20260731-0115.jq) which write the head-idle reset as a whole-object literal instead of a merge. THE ACTUATOR ALREADY EXISTS AND WAS DELIBERATELY SCOPED SHORT: scripts/orch-stamp-updated-at.mjs (orch-apply.sh Stage 1.5, task FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH) stamps updated_at diff-based on task_board ROWS only; its own header at :12-14 CITES 'HeadSchema:227' as the reason nothing ever complained, then never covers .head. This row is the residual surface of that already-shipped fix, not a new mechanism.",
  "evidence": "Failing-FILE read per FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY AC-1, not inferred from the job name: `gh run view 30596148097 --log-failed` => `14864 pass / 40 skip / 2 fail`, `=== FAILED FILES (1) ===`, `FAILEDFILE: src/__tests__/1837a-pipeline-state.test.ts`. Reproduced locally: `bun test src/__tests__/1837a-pipeline-state.test.ts` => 3 pass / 2 fail, `error: Missing required head field: updated_at` (:79) and AC-3 isNaN(parsed.getTime()) received true (:106). Live file confirms: `jq -c .head docs/data/orch/orch-state.json` => {\"status\":\"idle\",\"active_task_id\":null,\"next_agent\":\"router\"} — 3 keys, no stamp. CROSS-SHA PERSISTENT AND FLAPPING, not a one-off: walked .head across the last 60 commits that touched orch-state.json — has_updated_at toggles false/true repeatedly (false at 040be366d 03:15, 511236f93 03:20, c63e92995 03:24; true at ebcced67a 03:06 and earlier; false again at a42fb930e, bb923be57, a17faa03a, 2169cf005, 5f364d66c on 07-30). Dropping diff read verbatim at 040be366d: `-\"updated_at\": \"2026-07-31T00:55:38Z\" / -\"updated_by\": \"developer\"` replaced by a 3-key head. Same commit family also desyncs .head.status to idle while in_progress[] holds a live claimed row (observed this tick: .head idle/null while FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE is IN_PROGRESS and ba is actively running) — one cause, two symptoms.",
  "ac": "(AC-1) REPAIR THE LIVE FILE FIRST, in the same change: .head regains updated_at + updated_by. Use a real `date -u +%Y-%m-%dT%H:%M:%SZ`; do NOT synthesise a historical timestamp (scripts/orch-stamp-updated-at.mjs:20-22 — a synthesised stamp is worse than a null one). (AC-2) EXTEND THE EXISTING ACTUATOR, do not add a second one: scripts/orch-stamp-updated-at.mjs also stamps .head.updated_at/.head.updated_by diff-based, using the SAME exclude-the-stamp-field-from-the-diff idempotency rule it already uses for rows (:28-41), so re-running orch-apply.sh with an unchanged candidate produces zero head churn. updated_by comes from the caller, same source the row path uses. (AC-3) LANDMINE — DO NOT FIX BY RELAXING THE TEST. 1837a-pipeline-state.test.ts has been 'fixed' three times by widening an enum (68c2de81c added \"done\"; 728ef563c added \"active\"/\"qa\"; 8a2ef7255) — making updated_at optional in AC-1/AC-3 would match that history, exit green, and permanently delete the only assertion that the routing pointer carries a freshness stamp. head.updated_at is what head-staleness/head-pin detection reads (see FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE). The test is CORRECT; the data and the write path are wrong. (AC-4) LANDMINE — DO NOT tighten HeadSchema updated_at/updated_by to required as the primary fix. orch-apply.sh is the single mandatory write path for a file every agent writes; a required field on a document that currently lacks it hard-fails EVERY write and freezes the whole board. If tightening is done at all it must land strictly AFTER AC-1+AC-2 are live and verified, as a separate follow-up, never in the same commit. (AC-5) VERIFY ON THE CI PLANE: `gh run view <run with headSha AFTER this fix> --json jobs -q '.jobs[]|select(.name==\"bun test\")|.conclusion'` == success. A local bun test exit 0 is necessary, not sufficient. (AC-6) Positive-control the stamper, do not let a passing suite mean an unexercised predicate: assert that a candidate whose .head content changed DOES receive a fresh stamp, and that an unchanged .head does NOT get re-stamped.",
  "files": ["scripts/orch-stamp-updated-at.mjs", "docs/data/orch/orch-state.json"],
  "reference_only_files": ["apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts", "apps/mcp-server/src/infrastructure/orchStateSchema.ts", "scripts/orch-apply.sh"],
  "related": "Residual surface of FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH (shipped, rows only). Adjacent but DISTINCT from FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE (review) — that row is about clobbering a live active_task_id resume pointer; this one is about the freshness stamp being dropped by ANY whole-object head write, including correct ones. Also distinct from FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD (backlog) — that guards .task_board.head, the DEPRECATED stub, in the opposite direction. Do not merge any of the three.",
  "dedup_checked": "2026-07-31T01:30Z — jq over every .task_board lane (backlog 372 / ready 52 / review 201 / in_progress 1 / done / done_verified / archive / active_sprints) matching id+title+status_note against /1837a|pipeline-state|pipelineState/i => 1 hit, active_sprints SSOT-INTEGRITY-PERIMETER (a sprint container, not a task row, no AC for this). Separately matched /HEAD-|head-write|HEAD-OVERWRITE|HEAD-SYNC|head_sync/i => 10 rows, all read, all different scope (see related). Layer-2 (head_sha in an open FIX status_note) => 0.",
  "baseline_pass": null,
  "desc": null
}]

# ── B. size-lint — 6 uncovered offenders in apps/mcp-server ────────────────────
| .task_board.backlog += [{
  "id": "FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS",
  "type": "FIX",
  "size": "M",
  "priority": "P2",
  "status": "BACKLOG",
  "zone": "apps/mcp-server/",
  "owner": "dev-mcp-server",
  "next_agent": "dev-mcp-server",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0132",
  "created_at": "2026-07-31T01:32:47Z",
  "updated_at": "2026-07-31T01:32:47Z",
  "origin_signal_id": "CI-RED-8e1e66e5",
  "check_id": "CI-RED-8e1e66e5",
  "dedup_key": "ci_job:size-lint|files:claimCandidateScanner.ts,signalValidator.ts,vpsPushLogStore.ts,polymarket.ts,orchStateSchema.ts,vpsProxyTools.ts",
  "verification_gate": "size_lint_file_level_then_ci_green",
  "title": "CI job size-lint now reports 8 offending files, not 1 — the existing READY row FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER covers exactly one of them, so fixing it alone CANNOT turn the job green. This row owns the 6 apps/mcp-server offenders (1 new-offender + 5 baseline-tolerance-exceeded).",
  "root_cause": "RATCHET BROKEN BY A RED GATE. size-lint has been RED continuously since ~2026-07-30T01:24Z, so the marginal cost of adding a 9th offender is zero — nobody's commit is blocked by a gate that is already failing. Offender count went 1 -> 8 in ~21h (1 at 2026-07-30T04:49Z per the macro row's own evidence; 8 at 2026-07-31T01:22Z, run 30596148097). Two distinct sub-modes: `new-offender` = file >120L with no docs/data/size-lint-baseline.json entry and no `size-justification:` header in its first 10 lines (scripts/audits/size-lint-justification.sh :57 THRESHOLD, :83 detect, :129 branch); `baseline-tolerance-exceeded` = file HAS a baseline entry but grew past its upper tolerance.",
  "evidence": "Read verbatim from `gh run view 30596148097 --log-failed`, step 'Run size-lint-justification --check': `[size-lint] FAIL — 8 offending file(s) (scanned 1346)`. The 6 in this zone, with LOCAL `wc -l` independently confirming CI's count byte-for-byte: apps/mcp-server/src/domain/services/narrativeTruthGate/claimCandidateScanner.ts NEW-OFFENDER 190L (>120L, no baseline, no header); apps/mcp-server/src/infrastructure/orchStateSchema.ts baseline=664 actual=870 upper=730 (+206L over baseline, +140 over tolerance — by far the worst); apps/mcp-server/src/infrastructure/fetchers/polymarket.ts baseline=447 actual=500 upper=491; apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts baseline=233 actual=269 upper=256; apps/mcp-server/src/domain/services/signalValidator.ts baseline=215 actual=259 upper=236; apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts baseline=152 actual=212 upper=167. The 2 out-of-zone offenders are owned elsewhere: usecases_vmt_liquidity_resolvers.go (existing READY macro row) and apps/pdf-extractor/infrastructure/extraction_engine.py (sibling row FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE).",
  "ac": "(AC-1) `bash scripts/audits/size-lint-justification.sh --check` no longer lists ANY of the 6 files above. VERIFY AT FILE LEVEL, NOT JOB LEVEL — the job stays RED until the macro-indicators and pdf-extractor siblings also land, so `size-lint == success` is NOT this row's gate and must not be waited on. (AC-2) LANDMINE — NEVER fix with `--update`. The baseline is regenerated WHOLESALE, not merged, on every --update (script :175 `_note`), so one --update grandfathers every current offender repo-wide and converts an 8-file failure into a permanent amnesty. It would exit 0 and look green. This is the single most likely wrong fix. (AC-3) orchStateSchema.ts (870L, 31% over its own baseline) gets a REAL treatment, not a header bump: it is the Zod SSOT for a file every agent writes and it has grown +206L past a baseline that was itself already an exception. Split it by section (the file already has numbered `§ N` banners) or state explicitly, in the justification header, why 870L is cohesive. A bare `size-justification: 870L — large schema` is a rejection. (AC-4) For the 4 remaining baseline-tolerance-exceeded files, state per file which was chosen: genuine trim, or a justification header naming the real current count (the declared number must be within +/-10% or min 5L of actual — script :26, :87). (AC-5) claimCandidateScanner.ts is 190L and NEW (added by CCATO-MCP-T1-DOMAIN-ENGINE, 4d20a76a2): prefer a split to <=120L over a justification header — it is 3 days old, not legacy. (AC-6) After this row + both siblings land, `gh run view <run after all three> --json jobs -q '.jobs[]|select(.name==\"size-lint\")|.conclusion'` == success. Whoever lands LAST owns that check.",
  "files": ["apps/mcp-server/src/domain/services/narrativeTruthGate/claimCandidateScanner.ts", "apps/mcp-server/src/infrastructure/orchStateSchema.ts", "apps/mcp-server/src/infrastructure/fetchers/polymarket.ts", "apps/mcp-server/src/interface/mcp/tools/system/vpsProxyTools.ts", "apps/mcp-server/src/domain/services/signalValidator.ts", "apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts"],
  "reference_only_files": ["scripts/audits/size-lint-justification.sh", "docs/data/size-lint-baseline.json"],
  "related": "Sibling zone-splits of ONE red job: FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER (ready, apps/macro-indicators/, 1 file) and FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE (this triage, apps/pdf-extractor/, 1 file). Split per-zone deliberately rather than one `multi` row — an architect split hop while main is already red costs more than it buys, and each zone's file list is independently verifiable from the same script output. NOTE the cost of that choice, recorded honestly: unlike the frontend-eslint/size-lint split of 2026-07-30, these three rows share ONE job conclusion, so no single row can verify at job level.",
  "dedup_checked": "2026-07-31T01:30Z — jq over every lane matching /size-lint|sizelint|size_lint/i => 1 hit (the macro READY row); read its full body, it names exactly one file (usecases_vmt_liquidity_resolvers.go) in root_cause, dedup_key and files[], and pre-dates the other 7 offenders. Separately matched each of the 6 filenames => 0 open rows.",
  "baseline_pass": null,
  "desc": null
}]

# ── C. size-lint — pdf-extractor offender ─────────────────────────────────────
| .task_board.backlog += [{
  "id": "FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE",
  "type": "FIX",
  "size": "S",
  "priority": "P3",
  "status": "BACKLOG",
  "zone": "apps/pdf-extractor/",
  "owner": "dev-pdf-extractor",
  "next_agent": "dev-pdf-extractor",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0132",
  "created_at": "2026-07-31T01:32:47Z",
  "updated_at": "2026-07-31T01:32:47Z",
  "origin_signal_id": "CI-RED-8e1e66e5",
  "check_id": "CI-RED-8e1e66e5",
  "dedup_key": "ci_job:size-lint|file:apps/pdf-extractor/infrastructure/extraction_engine.py",
  "verification_gate": "size_lint_file_level_then_ci_green",
  "title": "CI size-lint: apps/pdf-extractor/infrastructure/extraction_engine.py baseline-tolerance-exceeded (baseline=208L actual=237L upper=228L) — 9L over tolerance, smallest of the 8 offenders in the same red job.",
  "root_cause": "File has a docs/data/size-lint-baseline.json entry at 208L and has grown to 237L, 9L past its 228L upper tolerance. Sub-mode is baseline-tolerance-exceeded, not new-offender — the file is already acknowledged, it just drifted.",
  "evidence": "`gh run view 30596148097 --log-failed`, step 'Run size-lint-justification --check': `apps/pdf-extractor/infrastructure/extraction_engine.py — baseline-tolerance-exceeded (baseline=208L actual=237L upper=228L)`. Local `wc -l` = 237, matching CI exactly.",
  "ac": "(AC-1) `bash scripts/audits/size-lint-justification.sh --check` no longer lists apps/pdf-extractor/infrastructure/extraction_engine.py. FILE-LEVEL gate — the size-lint job stays red until the two sibling-zone rows land; do not wait on job green. (AC-2) LANDMINE — NEVER `--update` (baseline is regenerated wholesale, script :175 `_note`; one --update grandfathers all 8 current offenders repo-wide). (AC-3) Prefer trimming 9L of genuine slack over re-baselining; if re-baselining, state what the +29L since 208L actually added and why it belongs in this file.",
  "files": ["apps/pdf-extractor/infrastructure/extraction_engine.py"],
  "reference_only_files": ["scripts/audits/size-lint-justification.sh", "docs/data/size-lint-baseline.json"],
  "related": "Sibling zone-split of the same red size-lint job: FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS (6 files) + FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER (ready, 1 file). Do not open an untracked-brief-driven refactor here — docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md is uncommitted and out of scope for this row.",
  "dedup_checked": "2026-07-31T01:30Z — jq over every lane matching /extraction_engine|pdfx.*size|size.*pdf/i => 0 open rows.",
  "baseline_pass": null,
  "desc": null
}]

# ── D. sweep-guard: detector-only after 6 rows + triage mis-adjudication ───────
| .task_board.backlog += [{
  "id": "FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION",
  "type": "FIX",
  "size": "S",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "cross-service/",
  "owner": "agents-architect",
  "next_agent": "agents-architect",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0132",
  "created_at": "2026-07-31T01:32:47Z",
  "updated_at": "2026-07-31T01:32:47Z",
  "origin_signal_id": "commit-sweep-guard-20260731T0107Z-x4",
  "title": "commit-sweep-guard is DETECTOR-ONLY after 6 shipped rows: warn mode never blocks, agents keep issuing bare commits (14 warns / 8h across 4 distinct sessions), and this tick its consumer disposed ALL FOUR signals as 'benign, hook is too noisy' on a premise falsified by the hook's own source and by the repo's own verification script.",
  "root_cause": "TWO layers, both read at source 2026-07-31T01:28Z. (L1 — NO ACTUATOR) scripts/git-hooks/pre-commit :445-454 discriminates precisely: basename(GIT_INDEX_FILE) of `next-index-*.lock` => mode=SCOPED => `exit 0`, completely silent (AC-4 of the shipped hook row); `index`/`index.lock` => mode=BARE => warn + write_signal. Default GIT_SWEEP_GUARD_MODE is warn, which by construction never blocks, so an improvised bare commit always lands. Six rows exist on this defect family (HOOK + SKILLS + LAYER2 done/done_verified; PARENT blocked; SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL in review/next_agent=po; SWEEP-VICTIM-SELF-DETECT backlog) and every one of them either detects the condition or migrates a call site — not one flips the guard from advisory to enforcing. (L2 — MIS-ADJUDICATION) neither docs/agents/dev-team/flow/drain-signals.md nor docs/agents/po/flow/triage-signals.md carries any adjudication rule for a `bug-escalation` from `commit-sweep-guard`, so triage falls back to the cheapest disposition. This tick that disposition was 'the hook warns unconditionally on any commit lacking a pathspec on the git commit invocation line itself, even when git add -- <files> + git commit ... -- <same files> was used correctly' — which is self-contradictory: had a pathspec been on the `git commit` line, git would have pre-resolved a scratch index and the hook would never have run its BARE branch. Same structural class as FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY: a recognised signal type whose routing has no mandatory evidence read, so the cheapest disposition wins by default.",
  "evidence": "PREMISE FALSIFIED, not argued: `bash scripts/audits/verify-commit-sweep-discriminator.sh` re-run this tick on git 2.49.0 => `VERDICT: PASS`, `C2 pathspec: GIT_INDEX_FILE basename = next-index-96817.lock`, `C2 PASS — git pre-resolved a scratch index before the hook ran`, `C2 PASS — peer content excluded from the commit and left staged, intact`. Therefore any signal whose payload begins `[sweep-guard] BARE commit about to absorb` proves, BY CONSTRUCTION, that no pathspec was on the `git commit` line — the only other writer on that path emits `[sweep-guard] INTERNAL: unrecognized GIT_INDEX_FILE shape`. All four of this tick's payloads are the BARE string, and .git/sweep-guard.log records all four at mode=warn: 01:06:13Z sha ebcced67a (n=2), 01:15:38Z sha 040be366d (n=2), 01:17:02Z sha 7230fe5c0 (n=2), plus 00:58:17Z sha 167b97ad3 (n=1). So the pattern actually used was `git add -- <files>` followed by a BARE `git commit -m ...` — the exact TOCTOU shape MEMORY feedback_git_add_then_bare_commit_is_toctou_race_use_pathspec_commit names. dev-team's counter-evidence (`git show --stat` shows only intended files) is NOT evidence of a pathspec: it only shows that no peer happened to stage anything inside the add->commit window. It is luck, not correctness, and `--stat` cannot distinguish the two. NOT confined to one actor or one session: .git/sweep-guard.log holds 14 BARE warns in the 8h to 01:17Z from FOUR distinct actor sessions (64c7c677, 51b9d5a9, a2161c5c, ad265f86), including 2026-07-30T19:52:33Z where a single bare commit absorbed 11 files. Flow docs are already clean — grep for a bare `git commit -m \"...\"` line in docs/agents/dev-team/flow/*.md, docs/agents/po/flow/*.md and .claude/skills/commit-mutex/SKILL.md returns ZERO, so this is improvised agent behaviour that only an enforcing gate can stop, not a doc defect.",
  "ac": "(AC-1) ADJUDICATION RULE (ship first, zero risk): add one row to the signal-routing table in docs/agents/po/flow/triage-signals.md, and the matching line in docs/agents/dev-team/flow/drain-signals.md §0a-3, for `bug-escalation` from `commit-sweep-guard`. Rule: a payload beginning `[sweep-guard] BARE commit about to absorb` is a TRUE POSITIVE by construction — the hook exits 0 silently on pathspec-scoped commits (pre-commit:453-454, proven by scripts/audits/verify-commit-sweep-discriminator.sh C2). 'The hook is noisy' / 'it cannot see the pathspec' / 'git show --stat looks clean' are all explicitly NON-dispositions. A payload beginning `[sweep-guard] INTERNAL:` is the fail-open path and IS separately actionable. (AC-2) STAGED ACTUATOR: flip GIT_SWEEP_GUARD_MODE from warn to reject. Stage it — reject mode blocks a commit rather than corrupting one, and the hook's own T5 test already proves the index is preserved on block, so the failure mode is a loud retry, not data loss. Land AC-1 first, observe one full day of warn volume, then flip. State the rollback command in the row's implementation record. (AC-3) SCOPE FENCE — do NOT re-litigate the 6 existing rows. This row adds the adjudication rule and the enforce flip ONLY. FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL (review, parked on po) still owns the script call sites; FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT (backlog) still owns victim-side detection. (AC-4) POSITIVE CONTROL, not just a green suite: after the flip, demonstrate ONE bare commit actually blocked and ONE pathspec commit still silent, from a real shell — `bash scripts/git-hooks/pre-commit.test.sh` passing is necessary, not sufficient (it was already 6/6 green while all 14 of these commits landed).",
  "files": ["docs/agents/po/flow/triage-signals.md", "docs/agents/dev-team/flow/drain-signals.md", "scripts/git-hooks/pre-commit"],
  "reference_only_files": ["scripts/audits/verify-commit-sweep-discriminator.sh", "scripts/git-hooks/pre-commit.test.sh", ".git/sweep-guard.log"],
  "related": "2nd instance of the 'recognised signal type, routing row with no mandatory evidence read, cheapest disposition wins' class — 1st is FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY (backlog, P1, still unshipped; its AC-1 had to be executed BY HAND again this tick). Cross-reference, do not merge: that row is about ci_red and failing-file reads, this one is about bug-escalation and the BARE/SCOPED discriminator. Family (all read this tick, none covers the enforce flip or the adjudication rule): FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (blocked, umbrella), -HOOK (done_verified), -SKILLS (done), -LAYER2 (done_verified), FIX-COMMIT-SWEEP-GUARD-SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL (review/next_agent=po), FIX-COMMIT-SWEEP-VICTIM-SELF-DETECT (backlog).",
  "dedup_checked": "2026-07-31T01:29Z — jq over every .task_board lane matching /sweep.?guard|SWEEP/i => 6 family rows + unrelated 'sweep' homonyms; read the full body of all 6 family rows; none carries an AC for the warn->reject flip or for a bug-escalation adjudication rule. Separately matched /GIT_SWEEP_GUARD_MODE|reject.mode|adjudicat/i => 0.",
  "baseline_pass": null,
  "desc": null
}]

# ── E. Correct the existing size-lint READY row: job-level AC no longer holds ──
| (.task_board.ready[] | select(.id == "FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER")) |= (. + {
  "po_scope_correction_20260731T0132": "AC-1 ('--check exits 0') and AC-4 ('size-lint job conclusion == success') are NO LONGER SATISFIABLE BY THIS ROW ALONE and must not be waited on. When this row was minted (2026-07-30T04:49Z) size-lint had ONE offender; run 30596148097 (2026-07-31T01:22Z) reports `[size-lint] FAIL — 8 offending file(s) (scanned 1346)`. Re-read AC-1 as FILE-LEVEL: --check no longer lists usecases_vmt_liquidity_resolvers.go. AC-4 (job green) now belongs to whichever of the three zone rows lands LAST. Siblings minted this tick: FIX-CI-SIZELINT-MCPSERVER-SIX-UNCOVERED-OFFENDERS (6 files, apps/mcp-server/), FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE (1 file, apps/pdf-extractor/). AC-2 and AC-3 (the never-run---update landmine) are UNCHANGED and now matter MORE: with 8 offenders live, a single `--update` would grandfather all of them at once.",
  "updated_at": "2026-07-31T01:32:47Z",
  "updated_by": "po (triage-20260731T0132)"
})

# ── F. Annotate the frontend-eslint READY row: ci_red deduped into it ──────────
| (.task_board.ready[] | select(.id == "FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT")) |= (. + {
  "po_dedup_hit_20260731T0132": "CI-RED-8e1e66e5 (run 30594239516, headSha 8e1e66e5, and still failing identically on run 30596148097 / headSha 680fe759c) DEDUPED INTO THIS ROW — no new task minted. Matched on this row's own dedup_key (ci_job:frontend-eslint|file:apps/frontend/bun.lock), per the note this row left for the next triage that the two SHA-derived dedup layers in triage-signals.md would not match. Failing STEP re-read verbatim: `frontend-eslint / Install dependencies / error: lockfile had changes, but lockfile is frozen`. Green record now 0/6+ runs, unchanged root cause, cross-SHA persistent for ~24h. STILL UNSTARTED as of this triage — the row has sat READY since 2026-07-30T04:57Z while main stayed red.",
  "updated_at": "2026-07-31T01:32:47Z",
  "updated_by": "po (triage-20260731T0132)"
})

# ── G. Manual-dispatch sweep — stamp top candidate TE-T08 (additive only) ──────
| (.task_board.backlog[] | select(.id == "TE-T08")) |= (. + {
  "po_manual_dispatch_flagged_at": "2026-07-31T01:32:47Z",
  "po_manual_dispatch_flagged_by": "po (manual-dispatch-sweep)",
  "po_manual_dispatch_class": "DRS-STRANDED-OFF-ALLOWLIST",
  "po_manual_dispatch_note": "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH. Top of 20+ unflagged candidates by [rank, idx].",
  "po_coupling_landmine_20260731T0132": "READ BEFORE REWRITING .claude/skills/commit-mutex/SKILL.md. This T-08 inversion turns the skill into a ~60L hot card with the rest lazy-loaded. The PATHSPEC-SCOPED COMMIT RULE (`git commit -m \"<msg>\" -- <own-files-only>`, never a bare commit, never a directory or '.') MUST STAY IN THE HOT CARD — demoting it to a lazy ref would delete the only in-context instruction that prevents bare commits, at the exact moment commit-sweep-guard is logging 14 bare-commit warns per 8h across 4 sessions (see FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION, minted this tick). Backoff/failure handling is the correct thing to lazy-load; the commit line shape is not. Verify after the rewrite by grepping the hot card for `-- ` on the commit example.",
  "updated_at": "2026-07-31T01:32:47Z",
  "updated_by": "po (triage-20260731T0132)"
})

# ── H. Triage stamp ───────────────────────────────────────────────────────────
| .task_board.last_triaged_at = "2026-07-31T01:32:47Z"
| .task_board.last_triaged_by = "po (triage-20260731T0132, dev-team Step 1, cron tick 2026-07-31T01:07Z)"
