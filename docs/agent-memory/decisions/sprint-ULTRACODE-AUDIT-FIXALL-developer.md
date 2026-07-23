# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · developer

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** developer
**Started:** 2026-07-15T18:15:50Z

---

### STEP developer-S1 · developer · 2026-07-15T18:15:50Z
**task-id:** UC-RDL-P5
**what-done:** Replaced CLAUDE.md:7-26 (20L condensed Phase A/A.5/B pseudocode) with an 8-line pointer to
`.claude/skills/dispatch-claim/SKILL.md` + Phase B `task_claim` call + a 3-row outcome table
(claimed / re-entrant same-session / peer-collision), commit `aef457f38`.
**what-considered:**
- Rewrite the table with 2 outcomes (claimed/peer) matching the OLD prose — rejected: the brief's whole
  point is the missing re-entrant branch was the bug; a 2-row table reproduces the same defect.
- Move Phase A/A.5 detail inline in a shorter form vs pure pointer — rejected: brief explicitly says
  "shrink to a pointer"; inline detail duplicates the canonical SKILL and re-creates the drift the P4
  sibling proposal (sprint-task:/task: prefix) already flagged as a duplication class.
**why-decision:** Brief's exact replacement text + SKILL.md:250-256 re-entrant pattern (heartbeat+proceed,
do NOT exit) is the authoritative source; table format keeps all 3 outcomes scannable while the pointer
carries Step 0a/Phase A/A.5 detail without re-duplicating it in always-loaded CLAUDE.md context.
**why-change:** No change from plan — applied brief's spec verbatim, kept owner_client_session/ttl/
task_claim contract and peer-EXIT wording intact per brief's risk note.

### STEP developer-S2 · developer · 2026-07-15T20:05:54Z
**task-id:** UC-DTL-P2
**what-done:** Added Step 5.5 board-hygiene to `dev-team-tick-preflight.sh` (relocates post-cycle.md
Step 4.2 cold-eviction so it runs on every lock-winning tick); 34 new tests, 89/89 GREEN.
**what-considered:** Router paraphrase named the wrong script (context-bloat-backstop.sh — unrelated
file-line-cap governance) and asked for SKIP/ERROR firing, which the brief's own verifier explicitly
forbids (peer already owns hygiene on SKIP; lock state undefined on ERROR).
**why-decision:** Followed the architecture brief (authoritative "full acceptance criteria" source
per the dispatch prompt) over the router's paraphrase — full reasoning in
`docs/agent-memory/decisions/sprint-UC-DTL-P2-developer.md`.
**why-change:** Corrected target script + scoped firing to RUN/RUN-IDLE only (documented deviation).

### STEP developer-S3 · developer · 2026-07-15T22:26:00Z
**task-id:** UC-CDC-P2
**what-done:** Ported the mktemp stderr-separation idiom into `cowork-guaranteed-slot-firer.sh:183`
run_firer (`raw=$(eval "$SLOT_MATCHER_CMD" 2>&1)` -> `2>"$slot_err"` mktemp file); added T13 regression
(stderr diagnostic + valid stdout JSON, guaranteed slot still fires); 28/28 GREEN, shellcheck clean.
**what-considered:** Router's inline text pointed at `log()`'s `tee` (line 97) as root cause; the
linked architecture brief (cowork-dispatcher-cron-P2, Verifier-confirmed w/ 34 live "non-JSON output"
log errors incl. a missed chef-eod slot) names line 183's `SLOT_MATCHER_CMD` capture instead.
**why-decision:** Followed the brief (authoritative, evidence-verified) over the router's paraphrase —
`log()`'s tee never feeds a command-substitution JSON parse in this file, confirmed by grep audit; the
`2>&1` on the matcher eval is the only real stdout/stderr merge point feeding `jq` in this script.
**why-change:** Fixed line 183 (not line 97) — same bug class, correct location; no new pattern invented.

### STEP developer-S4 · developer · 2026-07-16T00:00:00Z
**task-id:** UC-CDC-P3
**what-done:** Added `isSuppressedByBoundaryDedup()` (reuses `snapToCronBoundary`, no 2nd boundary
impl) to `cowork-match-slots.js`; applied via one shared `legacyCandidates()` helper at both legacy
return points (pure-legacy branch L134-146 + cadence-unavailable fallback L155-166) — single SSOT
inherited by dispatcher/preflight/firer (all 3 invoke this same script unmodified, confirmed by grep).
Backward-compat preserved: `last_fired==null`/malformed → never suppressed (fires). 10 new tests
(TC-15..19 legacy dedup via matchSlots + TC-20..23 direct unit tests on the helper); full suite
26/26 GREEN; adaptive-mode tests (TC-9..14) unchanged and still pass. Corrected the false R3
"lock persists across ticks" rationale in `slot-claim.md` (real mechanism = last_fired boundary
dedup + published marker; the per-slot claim is released via try/finally right after each spawn).
**what-considered:** Extending the dedup to the null-`policy_id` fallthrough inside true adaptive
mode (~L184-191, pressureState/policyObj/cadence-module all live) — rejected: detail_ref's *Change*
section scopes the fix strictly to "legacy branch (lines 134-145)" and cites the adaptive path's
first-run precedent as the model to *preserve*, not extend; task's own hard constraint ("do NOT
change adaptive-mode behavior") governs, and that fallthrough only runs when adaptive mode is
genuinely active (not a fallback).
**why-decision:** Router's paraphrase additionally named L155-165 (cadence-unavailable fallback) and
L184-187 (null-policy_id fallthrough) as part of the bug. Detail_ref (authoritative) names only
L134-145. L155-165 is a textually-identical duplicate of the legacy branch (same bug, reached only
when `require('./cadence-policy.js')` throws — not "adaptive behavior"), so fixing it via the shared
helper stays SSOT-aligned without contradicting detail_ref. L184-187 sits inside genuine adaptive
evaluation — left unchanged per the explicit adaptive-mode-unchanged constraint; detail_ref does not
scope there either. Also applied the detail_ref's explicit slot-claim.md correction even though the
router's paraphrase said "likely none" for doc updates — detail_ref is authoritative on that file.
**why-change:** No scope change from detail_ref for the core fix; added the doc correction detail_ref
calls for that the paraphrase missed.

### STEP developer-S5 · developer · 2026-07-16T01:01:31Z
**task-id:** UC-CCA-P5
**what-done:** Reordered `docs/agents/news-scout/flow/stage-log-notify.md` to notebook settled-write
(Step 4) -> exec-proof gate (Step 5) -> log_agent_work open/close (Step 6) -> coverage-state (Step 7)
-> WORK ping (Step 8), renumbering away the old 3e/4/4b labels; commit `181a16142`.
**what-considered:**
- Leave coverage-state (Step 7) before the gate to mirror market-watcher exactly — rejected: brief's
  own *Change* spec places it after the log_agent_work pair and calls the market-watcher-vs-here
  difference a harmless deviation; matching the brief's exact stated order over-rides the sibling's
  ordering since the brief text is the authoritative acceptance criteria for this task.
- Drop the log_agent_work "running" open call or relocate it earlier in the cycle — rejected: out of
  scope; the open/close pair must stay adjacent (close needs the open call's returned log_id) and
  moving only the pair (not splitting it) satisfies the required order with a minimal diff.
**why-decision:** exec-proof-gate SKILL.md EP-1/EP-2 reads NOTEBOOK_TS from the newest `## cNNN` heading
and requires it `>= CYCLE_START_UTC`; with the gate before the write this was structurally
unsatisfiable (always the prior cycle's timestamp) — moving the settled-write first makes EXEC_PROOF_1
checkable and closes the false-completion race where log_agent_work(completed)+WORK ping could fire
before the notebook existed for this cycle.
**why-change:** No change from plan — cycle.md required zero edits (no internal order declared there,
confirmed by full read); only stage-log-notify.md touched, no scripts/ copy of this sequence exists.

### STEP developer-S6 · developer · 2026-07-16T07:48:07Z
**task-id:** UC-ASL-P1
**what-done:** run_tiered_probe() reads tier-N heartbeat BEFORE run_probe("suppress_heartbeat") (new
flag param); main.md end-of-cycle adds tmp+mv heartbeat write for tier 2/3. T16/17/20/22 pre-seed
fixtures; T31/32 added (stale/never→SPAWN). 91/91 GREEN.
**what-considered:**
- HEARTBEAT_FILE=/dev/null — rejected: mktemp targets /dev/null.tmp.*, fails non-root, opposite bug.
- Leave T16/17/22 unchanged — rejected: no self-write means 2nd call regresses to SPAWN.
**why-decision:** Verifier's 4 caveats load-bearing (flag trap, test regression, register.md no-op,
TE-T06 non-collision) — followed verbatim; Write not Edit, diff-verified.
**why-change:** No change from plan.

### STEP developer-S7 · developer · 2026-07-16T13:05:14Z
**task-id:** UC-SDF-P4
**what-done:** Fixed drain-signals.js §0a-2 legacy-file prune hole (mtime fallback); ran
purge-legacy-processed-signals.sh, purging 1,280 unstamped processed/ files. Resumed stalled worker.
**what-considered:**
- Prior worker's uncommitted spec+script drafts — verified vs live data (not trusted blind), adopted.
- My duplicate test block vs prior worker's pre-existing one — kept theirs (more thorough), deleted mine.
**why-decision:** Smoke-tested against a scratch copy of the real inbox+processed/+DB before commit —
confirms FAIL-LOUD/routing/prune correctness without risking live signals or scope violations.
**why-change:** None; code fix + purge shipped same change-set per brief (avoids next-tick mass-unlink).

### STEP developer-S8 · developer · 2026-07-16T13:40:37Z
**task-id:** UC-GCP-P2
**what-done:** `git rm --cached` signals.db + 15 churn logs; widened .gitignore session-log rule +
debris patterns; edited drain-signals.md persist-guard to drop signals.db from the commit-path list.
**what-considered:**
- Blanket `git rm --cached sessions/*.log` (per brief) — rejected: would also untrack frozen
  incident-evidence logs (nit in brief). Verified tracked files are immune to a matching ignore
  rule (check-ignore: not-ignored with index, ignored with --no-index) — kept evidence logs tracked,
  no negation pattern needed.
- Single vs split commit — single: brief's own Risk note requires the .gitignore edit + rm --cached
  land together (pathspec-drops-deletion lesson).
**why-decision:** Verified `git add docs/signals/signals.db` exits 1 pre-fix (reproduces the exact
failure the task describes), confirming the drain-signals.md edit is load-bearing, not cosmetic.
**why-change:** Self-caught mid-task: first commit (`git commit -m ... -- <pathspec>`) silently
no-op'd the rm --cached deletions — pathspec-commit re-syncs the index from the CURRENT WORKING
TREE for listed paths, undoing `--cached` deletions still present on disk. Caught via post-commit
`git ls-files` + `git diff HEAD~1 HEAD` (both showed no change). Corrective commit re-ran
`git rm --cached` + committed with a bare `git commit -m` (no trailing pathspec) since the index was
independently verified to contain only this task's paths.

### STEP developer-S9 · developer · 2026-07-16T14:06:22Z
**task-id:** UC-GCP-P4
**what-done:** Added a stdin ref-range path filter to `scripts/git-hooks/pre-push`: computes
`git diff --name-only <remote>..<local>` per line, skips full tsc only if NO line matches
`^(apps|packages|scripts)/.*\.(ts|tsx|js|mjs|json)$|^(package.json|pnpm-lock.yaml|pnpm-workspace.yaml)$`.
**what-considered:**
- `break` on first code-touching line vs draining full stdin — chose drain-all (no break) since git
  pre-push can pass multiple ref lines and an unconsumed stdin tail risks a SIGPIPE on large pushes.
- Two-dot `git diff A..B` literal token (matches spec text) vs space-separated args — kept `A..B` for
  spec-traceability; behaviourally identical.
**why-decision:** All 4 mandatory hardenings verifier-required (fail-open on diff failure, skip
all-zero local-sha delete lines, ANY-line-triggers-full-tsc, root package.json/pnpm-lock/
pnpm-workspace in the code-touching set) map 1:1 to spec items (a)-(d) — implemented verbatim, no
simplification.
**why-change:** No change from plan; scope stayed inside the single named file per the boundary.

### STEP developer-S10 · developer · 2026-07-23T00:00:00Z
**task-id:** UC-SDF-P3
**what-done:** `git rm docs/signals/NOTE_SIGNALS_DB_DRAIN.md` — stale note ("Status: Dead since
2026-05-22") contradicted the live drain (drain-signals.js/drain-signals.md, active since 07-04).
**what-considered:**
- Rewrite as ≤3-line pointer — rejected: no surviving useful content, drain contract already fully
  documented in drain-signals.js header + drain-signals.md.
- Delete outright — chosen, matches the audit brief's own stated preference ("one fewer truth claim
  to drift").
**why-decision:** `grep -rn NOTE_SIGNALS_DB_DRAIN` across docs/scripts/.claude shows the only inbound
reference is the audit brief describing the problem — no live pointer breaks on deletion.
**why-change:** No change from plan.

### STEP developer-S11 · developer · 2026-07-22T22:50:44Z
**task-id:** UC-SDF-P1
**what-done:** Added a self-prune `find … -mmin +1440 -delete` line to tick-snapshot.md Step 4.7
bash block (right after the `mv` line, latest.json exempt); fixed false "ephemeral/overwritten"
comment to "pruned after 24h by this step". Ran the same find (minus -delete) to count 10 stale
files, then executed the delete — 10 removed, only cycle-snapshot-latest.json remains.
**what-considered:**
- only path: brief specifies the exact find line and placement verbatim; no alternative considered.
**why-decision:** CONFIRMED verifier-blessed near-zero-risk fix — implemented exactly as spec'd,
no simplification needed.
**why-change:** No change from plan.

### STEP developer-S12 · developer · 2026-07-22T23:25:06Z
**task-id:** UC-DTL-P9
**what-done:** New `scripts/pm-closeout-head-idle.jq` (--arg sprint_id/--arg now): sets a named
`active_sprints[]` entry's `.status="DONE"` in place + guarded `.head` idle, piped to
`orch-apply.sh`. Wired into `docs/agents/pm/flow/main.md` § 5 Monitor as a new "Sprint closeout"
bullet. Self-verified all 3 head cases + a refuse-guard case via new
`scripts/test/pm-closeout-head-idle-tests.sh` (5/5 pass, real SSOT hash unchanged).
**what-considered:**
- Inlining `.head.active_task_id` directly inside `index(...)` — hit jq's ambient-`.`-in-args
  pitfall (arg evaluates against the piped array, not top-level doc) → crashed "Cannot index
  array with string". Fixed by binding `$head_task_id` from top-level `.` before any pipe.
- `.head.next_action = null` — failed Zod (`next_action: z.string().optional()`, not nullable);
  switched to `del(.head.next_action)` to match the optional-absent contract.
**why-decision:** Mirrors `scripts/ops-closegate-handoff.jq`'s proven guarded-head-sync pattern
exactly, per RESCOPE spec; both bugs were caught by the mandatory self-verify against tmp fixtures
before touching the wire-in, so the shipped filter is proven-correct against the live schema.
**why-change:** No change from RESCOPE plan; two implementation-level jq/Zod pitfalls fixed during
self-verify, not scope changes.

### STEP developer-S13 · developer · 2026-07-23T00:30:04Z
**task-id:** UC-CDC-P4
**what-done:** `spawn-fanout.md` Step 5.1/5.2: bounded batcher replaces "fire all in one block" —
gates `MAX_PARALLEL` on `host_headroom_mb` (Step 4.2 `PRESSURE_STATE`, degrade if legacy) OR
`uptime` load vs `load_per_core_factor*cores`; batches wait on notification/re-probe capped at
`batch_wait_max_seconds`. New `cadence-policy.json._fanout` SSOT (5 thresholds, no hardcode).
Carve-out added to `agent-chaining-protocol.md` § Background Spawn Mandate.
**what-considered:**
- Reuse Step 4.2's `POLICY_OBJ` var vs re-read cadence-policy.json independently at Step 5.1 —
  chose independent re-read: `POLICY_OBJ` is only set on the JSON-parse-success branch of Step
  4.2, undefined on the legacy-fallback branch, so trusting it at Step 5 risks an undefined-var
  read; a direct re-read matches pressure-read.md's own precedent and degrades safely alone.
- Full graphify `--update` on `docs/` vs skip — chose skip + flag: `graphify-out/graph.json` is
  already 2 months stale (last run 2026-05-23), predating this task; an incremental run against
  `docs/` would re-extract that entire accumulated drift, wildly disproportionate to a 3-file
  S-size fix. Flagged in RETURN for PO/router, not silently absorbed or silently skipped.
**why-decision:** Matches the PO rescope spec verbatim (docs/architecture-briefs/2026-07-12-
ultracode-workflow-improvement-audit.md #cowork-dispatcher-cron-P4 rescope clause) — thresholds
SSOT, headroom+load gate, real inter-batch wait (naive batching of `run_in_background=true` is a
no-op), guaranteed-slots-first, carve-out to prevent canonical-doc drift.
**why-change:** No change from rescope plan. `DWF-phase1-cadence.test.ts` re-run 51/51 GREEN post
`_fanout` addition (no schema assertion broke) — confirms the new key is additive-safe.

### STEP developer-S14 · developer · 2026-07-23T01:15:00Z
**task-id:** UC-CDC-P4
**what-done:** QA CHANGES_REQUESTED AC1 fix — `spawn-fanout.md` Step 5.1's missing/unparseable
`cadence-policy.json` branch no longer synthesizes the whole `_fanout` object inline; downgrades
to `FANOUT_MODE="degraded_serial"`, `MAX_PARALLEL=1` sentinel. Step 5.2 inter-batch wait gained a
matching mode branch (no `FANOUT_POLICY.batch_wait_max_seconds` to read in that mode).
**what-considered:**
- QA's option (a) fail-loud+skip-tick vs option (b) MAX_PARALLEL=1 sentinel — chose (b): matches
  router's explicit "single-batch / max_parallel_degraded path" guidance and still delivers slots
  (serially) instead of dropping the tick's fan-out entirely.
- Leaving Step 5.2's wait loop untouched vs branching it — untouched would dereference
  `FANOUT_POLICY` which doesn't exist in `degraded_serial` mode (new defect); branched instead.
**why-decision:** Mirrors pressure-read.md Step 4.2's proven missing-policy pattern (MODE
downgrade, no numeric synthesis) per router's explicit fix guidance — zero `_fanout` shadow copy.
**why-change:** Scoped to AC1 only; AC2–AC6 (batch semantics, health-driven DEGRADED branch, test,
carve-out) untouched per redispatch note. `DWF-phase1-cadence.test.ts` re-run 51/51 GREEN.

### STEP developer-S15 · developer · 2026-07-23T02:24:12Z
**task-id:** UC-CCA-P6-NBWRITE
**what-done:** Replaced 4 inline AC-3 compose blocks (news-scout, bctc-analyst, chef, digest-predict
stage-log-notify/P-6) with notebook-write skill pointer + <=10L per-agent template; fixed
fb-market-poster main.md OVERWRITE->APPEND wording (Output line + STEP 8) and restructured its
template so Lessons/Known patterns become never-pruned preamble, per-cycle body rolls as `## c<NNN>`.
**what-considered:**
- Edit tool vs Python line-range replacement — Edit tool string match failed on unicode em-dash/
middle-dot bytes; switched to verified line-number Python surgery, re-read after each write.
- Also fix weekly-recap.md/weekly-prediction.md (same fb notebook, same "full overwrite" wording) —
REJECTED: outside Piece 1's *Files* list and I8 cited evidence (main.md only); flagged as residual gap.
**why-decision:** Rescope names exactly 4 files + main.md-only for fb; grep-verified zero remaining
inline duplicates in scope, zero touch outside it.
**why-change:** No change from rescope plan; net -59 lines across 5 files (81 del / 22 ins).

### STEP developer-S16 · developer · 2026-07-23T03:30:21Z
**task-id:** UC-CCA-P4
**what-done:** Added CLAIM-TRUTH GATE pointer step (skill: claim-truth-gate/SKILL.md) before every
verified-ungated public/MARKET emit: fb weekly-recap.md STEP 3e, weekly-prediction.md STEP 4e
(non-real-time, mirrors main.md STEP 4d); digest-predict weekly/daily/monthly.md before their
`send_telegram(channel="market")` (mirrors daily-predict.md P-5.5); qa-responder cycle.md Step 4b
before its MARKET `answer_text` send (real-time override, mirrors alert-commander). SKILL.md
frontmatter + Time-sensitivity override list updated to add qa-responder as an invoker.
**what-considered:**
- Board row note lists only the 5 rescope files (fb weekly x2, digest-predict daily/weekly/monthly)
  vs the dispatch's broader candidate list (unified-agent, market-watcher, alert-commander, news-scout,
  bctc-analyst, qa-responder) — grep-verified: unified-agent/market-watcher/alert-commander already
  gated (skip, no dup); news-scout/bctc-analyst only ever send to WORK, not MARKET/public (skip, not
  a publisher); qa-responder DOES send composed `answer_text` to MARKET channel from live-tool data,
  zero gate present, frontmatter confirms no Bash tool (documented no-Bash fallback in SKILL.md
  already covers this) — genuine ungated public/MARKET publisher, added.
- No engine change anywhere — dimension routing in claim-tool-map.json is agent-agnostic by design.
**why-decision:** Task title is "close gaps on ALL ungated MARKET/public publishers, claim-truth
ONLY" — qa-responder meets both the "ungated" and "public/MARKET" tests the dispatch explicitly
told me to verify; excluding a real, live gap after positively verifying it would be under-scoping,
not caution.
**why-change:** +1 file (qa-responder/flow/cycle.md) + SKILL.md beyond the board row's literal
5-file note; no data-integrity/other-dimension additions, no engine changes — same single dimension.

### STEP developer-S17 · developer · 2026-07-23T04:35:00Z
**task-id:** UC-MDH-P3
**what-done:** Added scripts/agents-flow/memory-prune-sweep.sh (4 idempotent file-ops sweeps:
sessions/*.md>14d archive, health/team-tool-recheck-*.md>30d delete+PO payload, session-logs/
fold, scheduled-task-execution-*.md relocate), paired .test.sh, wired invocation + FLOW-owns-
signal_queue-row boundary into code-janitor/flow/main.md, extended .retention.md, ran the sweep
live once (15 archived, 46 deleted, 5 folded, 3 relocated, 1 PO payload) + reran to prove no-op.
**what-considered:**
- Run live now vs leave unexecuted: rescope's commit instruction names "moved/deleted paths" as
  commit content — chose to execute (archival + stale-probe deletion both rescope-authorized).
- mtime-based age filter vs filename-date parsing: matches the brief's own verifier methodology
  and repo precedent (lsof retention, clean-obsolete-files.sh) — kept mtime.
- Full graphify `--update` vs skip: same call as S13 (UC-CDC-P4 this cycle) — graph.json 2mo
  stale (05-23), disproportionate for a hygiene fix; flagged in RETURN, not silently skipped.
**why-decision:** RESCOPE text is explicit and narrow (file-ops only, no orch-state access, FLOW
owns signal_queue append) — implemented exactly that boundary, reused AGENT_MEMORY_ROOT env-var
name already established by the sibling P1 task for the same directory family (test isolation).
**why-change:** No change from rescope plan.

### STEP developer-S18 · developer · 2026-07-23T05:40:00Z
**task-id:** UC-MDH-P4
**what-done:** New scripts/agents-flow/decision-journal-archive.sh (longest-match closed-vs-active
sprint-id resolution, stdin + --all modes) + paired .test.sh (26/26 PASS, sandboxed); wired as
pm/task-archive.md Step 5.5 + Step6 pathspec extension; CANONICAL pointer in dev-standards.md.
**what-considered:**
- Bare prefix glob vs longest-match: rescope names a live collision (OHLCV-UNIT-CONTAM prefixes
  OHLCV-UNIT-CONTAM-WHOLEROW-LT1000) — longest-match only, verified against the real repo pair.
- Added --dry-run (not in rescope contract) to safely verify live backfill counts without ever
  mutating docs/agent-memory/decisions/ — matches orch-cold-evict.sh's existing --dry-run pattern.
**why-decision:** Read-only verification of the ~281-file backfill claim was needed before writing
docs/WORK.md; a real mv/git-mv dry-run was the only way to avoid asserting an unverified number.
**why-change:** Did not execute the one-time live backfill (mutating, out of this FIX's scope) —
dry-run confirmed 202 eligible (git status/count unchanged), left as a follow-up PO-routed action.

### STEP developer-S19 · developer · 2026-07-23T08:32:00Z
**task-id:** UC-GCP-P1
**what-done:** Rewrote commit-convention.md as single-file SSOT (140L); deleted 3 sibling docs;
fixed 2 dangling `.claude/knowledge` path callers; deprecated commit-convention-audit.sh in place;
collapsed tree-map.md's 4-file subtree to one node.
**what-considered:**
- Update audit script predicates+VOCAB vs deprecate: deprecated — 0 live invocation paths
  (grep confirmed) and its digit-in-scope/Sprint-trailer heuristic no longer matches slug format.
- Role-type vocab: admit explicitly (qa/ops/pm/po/arch/ba/incident) vs remap to chore(<role>/...)
  — admit explicitly, matches dominant live usage (330+ commits use bare role types in git log).
- Merge Commits pattern: dropped, not carried forward — 0/1000 recent commits use `merge task/`,
  dead under the no-branches invariant; carrying forward a dead pattern reintroduces the doc rot.
**why-decision:** Followed the architect-adjudicated RESCOPE text verbatim on the two explicitly-
named dangling-path callers; scoped the "repoint every ref" instruction to those 2 + tree-map,
not the ~15 historical handoffs/specs also matching the grep (would falsify archival record).
**why-change:** No change from rescope plan. `/graphify docs --update --no-viz` hard-failed
(no LLM API key in this session env) — flagged in WORK.md, not silently skipped or faked.

### STEP developer-S20 · developer · 2026-07-23T07:08:15Z
**task-id:** UC-GCP-P8
**what-done:** New scripts/agents-flow/stranded-state-sweep.sh (classifier-only, `--plan` JSON to
stdout) + paired .test.sh (19/19 PASS, sandboxed); wired as post-cycle.md Step 4.3 (15L body);
CANONICAL pointer in dev-standards.md.
**what-considered:**
- "one commit per category" (multi-agent notebook batch) vs per-agent `chore(memory/<agent>)`:
  used `chore(memory/sweep)` scope — rescope's execution contract is explicit (ONE commit/category,
  cap 20), distinct from the routine end-of-cycle self-commit convention it would otherwise collide with.
- Dedup signal summary: moved the dynamic path-count out of the prefix (now a trailing "(N)")
  after confirming a front-loaded count would break startswith-prefix dedup every tick.
**why-decision:** Verified UC-GCP-P2 (DONE_VERIFIED) + SYSREMAKE-P2 RC-GITSTATE (queued, not yet
minted) ownership live before hardcoding the OWNED-ELSEWHERE skip-list, per coordination note.
**why-change:** No change from rescope plan.

### STEP developer-S21 · developer · 2026-07-23T07:26:11Z
**task-id:** UC-GCP-P3
**what-done:** drain-signals.md §0a MANDATORY PERSIST GUARD staging changed to
`git add -u -- docs/signals/ && git add -- docs/signals/processed/` + post-commit
`git status --porcelain` clean invariant (bug-telegram on residual); cross-ref note
added to commit-boundary/SKILL.md RULE 1. Commit e77635933.
**what-considered:**
- only path: implement the verifier's RESCOPE text verbatim — `git add -A` variant
  already rejected in the verifier's own critique (sweeps peers' untracked inbox).
**why-decision:** RESCOPE text was concrete and fully specified (exact staging
command, exact invariant grep chain, exact RULE-1 cross-ref wording) — no design
choice left open besides matching it exactly.
**why-change:** No change from plan. Dropped the one-shot backfill per explicit
instruction — already landed in df0b58bd9 (2026-07-12).
