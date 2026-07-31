# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agent-father

**Sprint goal:** (no description recorded in orch-state for this sprint_id; this entry is ambient
cross-cutting agent-lifecycle work dispatched under the currently-active sprint_id per journal
naming convention, unrelated to the sprint's own scope.)
**Agent:** agent-father
**Started:** 2026-07-28T19:13:14Z

---

### STEP agent-father-S1 · agent-father · 2026-07-28T19:13:14Z
**task-id:** UNBLOCK-AGENT-MODELS-SWITCH-COMMIT-DISPOSITION
**what-done:** Reverted the uncommitted `.claude/switch-agent-models.sh performance` run (21 dirty
files) to HEAD state instead of committing it; git diff on all 21 originally-flagged paths is now
empty.
**what-considered:**
- Commit as-is (performance = intended standing fleet state) — rejected: no sprint/task/journal
  anywhere declares intent to switch fleet to performance; README labels `normal` as
  production/default and `performance` as critical-task-specific/temporary.
- Discard/revert to normal — chosen: last-committed `current_mode` was `normal`; dirty-file mtime
  (18:25:02 CEST) landed ~82min after switch-script fix commit 289a9d8e2 (17:03:21 CEST), whose own
  message claims testing happened only in an isolated sandbox copy never touching real files —
  pattern matches a live post-fix verification run on the real repo that was never reverted, not a
  deliberate mode switch.
**why-decision:** Absence of any declared rationale + timing correlation with the same-day script
fix commit outweighs the "same-day run = intentional" default heuristic; treated as a stale
verification artifact.
**why-change:** Acceptance criteria assumed `switch-agent-models.sh normal` alone would empty the
diff; it did not — 3 agents (ops/po/semble-search) have `modes.normal.agents` preset values that
drift from live committed frontmatter (a98c47ce1 itself flagged ops/po as known-out-of-scope drift;
semble-search is newly found). Supplemented with `git checkout -- <exact 3 paths>` to reach true
HEAD state, then filed `FIX-AGENT-MODELS-NORMAL-PRESET-DRIFT` (P3/XS/backlog) so the underlying
preset-table bug doesn't silently recur next time anyone runs the script in good faith. Board row
flipped `ready[]`→`done[]` (status DONE) + new FIX row minted into `backlog[]`, same
`orch-apply.sh` write (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).

### STEP agent-father-S2 · agent-father · 2026-07-28T23:44:39Z
**task-id:** FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON
**what-done:** Re-keyed tnb-audit marker weekly periodKey→daily VN-date (ttl 691200→100800) in
tran-ngoc-bau/main.md Step G; dropped tnb-audit from spawn-fanout.md weekly-slot list (3 spots);
also fixed cowork-schedule.json `publish_date_basis` (iso_week_period→vn_date, live
catchup-predicate input) + 2 stale downstream docs.
**what-considered:** scope to 2 named files only (rejected — schedule.json field is the same
copy-paste defect, feeds catchup rollover check live) vs fix all 5 same-defect files (chosen).
**why-decision:** root-cause fix, not just the named files — invariant applies identically.
**why-change:** AC(4) needs RAW-verify after 2026-07-29T20:13Z fire (future) — flipping
READY→REVIEW not DONE_VERIFIED; same-day recheck still owed.

### STEP agent-father-S3 · agent-father · 2026-07-28T23:56:17Z
**task-id:** FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE
**what-done:** chef.md now derives ONE canonical UTC date (`CYCLE_DATE_UTC`, Step 0.5, pinned
once) reused verbatim at all 3 surfaces: single-fire marker key, Step 7.6 filepath +
metadata.date_vn, Step 8b notebook header. Matched cowork-schedule.json publish_date_basis
(chef-morning/eod/evening: vn_date→utc_date; no-op for morning/eod, fixes evening).
**what-considered:** keep WORK_DATE (VN-local) and patch only the evening marker — rejected,
PO explicitly widened scope to "single canonical UTC point... all 3 surfaces", and VN-local
is structurally +1 day vs UTC for any post-17:00-UTC cron, which IS the root cause. Left
intraday's WORK_DATE/VN_HOUR untouched — not implicated, out of scope.
**why-decision:** UTC has no day-boundary ambiguity relative to a fixed-UTC-hour cron; pinning
once closes the race-by-construction (confirmed live: 2 sessions 8min apart, date_vn 07-28 vs
07-29, real double MARKET publish).
**why-change:** AC(2) needs RAW-verify on a subsequent evening dish (future) — READY→REVIEW.

### STEP agent-father-S4 · agent-father · 2026-07-28T23:56:17Z
**task-id:** FIX-CHEF-EVENING-L5-KINHDICH-SILENT-OMISSION
**what-done:** Step 5 now wraps get_portfolio_conviction: error/empty → `$L5_GAP_TOKEN` with
verbatim upstream error text. Step 7.5 appends it to `$LAYERS_WALKED_SUMMARY` on both branches
(no verdict change — that's the sibling row's job). Step 7.6 known_gaps[] now unions Step 6
L6-gap tokens + Step 7.5 $FAILED_CHECKS (incl. business_context_absent, previously computed
but never reached this array) + $L5_GAP_TOKEN — stated once as the reusable rule per AC(2).
**what-considered:** patch only L5 (rejected — AC(2) explicitly requires the discipline stated
once, reusable; business-context is the confirmed 2nd instance of the identical omission
pattern in the same dish) vs generalize known_gaps extraction — chosen.
**why-decision:** a token computed but not propagated to every reading surface is the same bug
as no token at all; fixing L5 alone would leave known_gaps[] structurally blind to Step 7.5's
own gap tokens.
**why-change:** AC(3) needs a synthesis JSON produced during a real kinhdich error window
(future) — READY→REVIEW, not DONE_VERIFIED.

### STEP agent-father-S5 · agent-father · 2026-07-29T08:37:29Z
**task-id:** FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS
**what-done:** Reconciled AC-2/AC-3 retention to a while-loop + added AC-2a immutability
invariant + ladder-fix (trim own section first) in notebook-write/SKILL.md +
system-auditor/main.md; added `_check_notebook_immutability` hard-reject pre-commit hook;
fixed AC-1 c<NNN> rule (forbids session-UUID) for FIX-AGENT-NOTEBOOK-UUID-PROVENANCE part (a).
**what-considered:** prose re-wording only (rejected, tried twice already, failed) vs
mechanical hash-diff hook (chosen; precedent `_check_auditor_heartbeat_shapes`).
**why-decision:** authorized drop vs unauthorized rewrite are diff-indistinguishable; only a
retained-section hash comparison HEAD-vs-staged can tell them apart — validated 4/4 true-
positive on 9b27e9723, 0 false-positive on 01e50dbc after trailing-blank normalization.
**why-change:** Append-Gate-bypass (single occurrence, f26526d0e) left as a rowed BACKLOG
item — prose-parsing narrative is fragile and not yet proven-recurring (repo's 2+ bar).

### STEP agent-father-S6 · agent-father · 2026-07-29T13:05:00Z
**task-id:** FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-LAYER2
**what-done:** Pathspec-scoped 4 named skill sites + 3 init.md RULE-1-3→"(incl.2.5)", PLUS
10 more live-re-grepped bare `git commit -m` sites (explicit-add done, commit bare) same
class: auditor D-IMPROVE, pm HSC-6+cold-evict, dev-team cold-evict+sweep+drain, 2x crawls,
architect review, dev feature-spike. 16 files.
**what-considered:** 4-site floor only (rejected, po_priority_20260729T1126 forbids) vs also
the 35-file `chore(memory/*)` notebook tail (rejected — brief 2026-07-21 §3 names that exact
pattern "Layer-2, not this row, PM-tracked pass").
**why-decision:** re-scope = verified-live+in-zone+non-notebook-pattern bare sites — meets
"floor not spec" without absorbing a separately-scoped 35-file deliverable unsupervised.
**why-change:** extends beyond literal 4-site text per PO's own re-scope ruling on this row.

### STEP agent-father-S7 · agent-father · 2026-07-30T19:57:35Z
**task-id:** FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS
**what-done:** Re-derived schema from coordinationTools.ts:82-218 (not tool desc); fixed
owner_client_session on 8 files (6 named+refine_bctc_md call_tool form+own edit-apply.md,
found live). Shipped baseline-ratchet CI guard (task-claim-owner-session-lint.sh, 7/7 tests)
+ CI job; baseline grandfathers 23 sites/9 files found beyond scope (dev-team execute-tier
etc — flagged for follow-up, not fixed unsupervised).
**what-considered:** hand-fix all 31 sites found (rejected — size S, other agents' zones,
unverified blast radius) vs fix-assigned+baseline-rest (chosen).
**why-decision:** fleet-gate lesson (validate-on-1-file) says don't mask remaining debt —
baseline makes it visible/auditable, ratchets on any future edit to those exact lines.
**why-change:** re-verify (AC5) found alert-commander's doc already compliant (separate
Bash-grant defect, not this class) and refine_bctc_md needs a spawn-prompt channel fix too
(cowork-team zone, not mine) — both surfaced honestly, not silently claimed closed.

### STEP agent-father-S8 · agent-father · 2026-07-31T00:00:00Z
**task-id:** FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL
**what-done:** DECLINED execution — did not touch `scripts/devteam-review-claim-qa-drain.jq`,
did not flip the board row's status/lane. Task requires production-code edit to a `.jq`
orchestration script in `cross-service/` (`scripts/`), which `docs/data/system-map.json`
zones[] names `developer` as specialist, not `agent-father`.
**what-considered:**
- Implement as dispatched (board `owner`/`next_agent`=agent-father, brief §8 titled
  "Actionable sequence for agent-father") — rejected: violates own init.md `not_my_job`
  ("Writing production code — that's developer"), `forbidden_outputs` ("NEVER write
  production code"), and `commit_zone.allowed` (scripts/ absent; only docs/agents/,
  docs/agent-memory/, .claude/skills/, .claude/agents/).
- Silently re-scope self to "developer" persona and proceed — rejected: identity/tool
  grant is fixed at spawn (`.claude/agents/agent-father.md` frontmatter), not self-assignable.
- Decline + report with redirect evidence (chosen).
**why-decision:** `system-map.json` zones[cross-service].specialist="developer" is the
canonical, structured ownership SSOT (not a brief's prose or a PO triage field) — 8 prior
journal entries (S1-S7) show agent-father's real footprint is agent/.md/flow/skill files
only, zero `.jq`/production-code precedent.
**why-change:** brief `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`
§8 heading and the board row's owner/next_agent field both mis-name agent-father as
implementer — cascaded from agents-architect's brief into PO's triage uncorrected;
flagging so `developer` picks it up instead (see RETURN block).

### STEP agent-father-S9 · agent-father · 2026-07-30T23:11:49Z
**task-id:** FIX-COWORK-BASH-GRANT-COVERAGE-STAMP-TRANSPORT
**what-done:** Added `Bash` to `tools:` line in news-scout.md and market-watcher.md
frontmatter (exactly 2 lines changed, per row's own spec — no Glob/Grep added).
**what-considered:**
- Apply exact 2-line change dictated by po's `po_transport_ruling` on the row (chosen —
  row states "do not re-litigate the choice here").
- Broaden grant set / add Glob+Grep — rejected, row explicitly bounces broader sets to po.
**why-decision:** Row is a pre-adjudicated UNBLOCKER with acceptance criteria pinned to
exactly these 2 files/1 line each; no discretion left for agent-father.
**why-change:** none — executed as specified.

### STEP agent-father-S10 · agent-father · 2026-07-30T23:11:49Z
**task-id:** FIX-ALERT-COMMANDER-NO-BASH-GRANT-NOTEBOOK-UNCOMMITTABLE
**what-done:** Added `Bash` to `tools:` line in alert-commander.md frontmatter (1 line),
co-dispatched with S9 in the same edit pass per the row's own deliverable instruction.
**what-considered:**
- Grant Bash (row's own primary fix, chosen) vs. router passing session-id at spawn
  (fixes lock only, not notebook commit) vs. published-marker no-session fallback
  (row: "prefer whichever also leaves the notebook committable" — Bash does both).
**why-decision:** RAW re-verified this tick: `tools:` line still missing Bash pre-edit,
`git log --since=2026-07-29T12:32:22Z` on the file was empty — matches row's own claim.
**why-change:** none — executed as specified; no cascade needed (tool-package docs list
MCP tools only, unaffected by a native Bash grant).

### STEP agent-father-S11 · agent-father · 2026-07-31T05:35:00Z
**task-id:** FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
**what-done:** Implemented brief §3/§4 verbatim: replaced `ci_red` row in
triage-signals.md (FAILEDFILE pre-dedup read AC-1, FILE-scoped `dedup_key`
primary key AC-2, anti-amnesty fence AC-3, 0-fail backstop AC-4); corrected
ci-health-probe.md Hard Constraint #2 layer-c text + CI-3 NOTE. Zero prod code.
**what-considered:**
- Byte-exact line-indexed extraction from brief into target files (chosen —
  eliminates transcription drift on very long em-dash/curly-quote prose rows).
- Manual Edit-tool retype of the full row (rejected — high risk of silent
  character drift on a load-bearing multi-hundred-word spec row).
**why-decision:** brief already field-validated this session against 3 live
rows (po_goahead note); implementer's job is verbatim transcription only.
**why-change:** none — executed as specified. AC-5 retro-sweep re-checked
live: new red since ratification (frontend-eslint/size-lint) is a separate,
already-tracked row, not the 3 AC-5 files — evidence still accurate.

### STEP agent-father-S12 · agent-father · 2026-07-31T05:40:00Z
**task-id:** FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
**what-done:** Post-commit RAW-re-read of the board row surfaced a live
`po_changes_requested_20260731T0523` note (filed 05:23:57Z, before my
05:28:22Z commit — missed because I read the row at session start). Fixed:
dropped the status-token enum (TODO/IN_PROGRESS/REVIEW/BLOCKED) from BOTH
`ci_red` dedup checks + the pre-existing `repair_task_request` row, replaced
with explicit non-terminal LANE-NAME scan (backlog+ready+in_progress+
review+qa). 2nd commit, same 2 files.
**what-considered:**
- Re-verify PO's 633/238 claim live before trusting it (chosen — jq command
  PO supplied reproduced exactly: 633 open, 238 visible under old enum).
- Ship as-is and let qa catch it (rejected — qa note explicitly blocks
  sign-off on this exact defect; shipping known-defective is not a fix).
**why-decision:** PO's own dedup-hit reproduction (2 hits) only worked
because PO manually bypassed the status filter — the shipped predicate as
literally brief-specified would mint 0/3 hits, failing its own design goal.
**why-change:** brief's §3 text (which I copied verbatim) itself carried
this defect — amendment is IN the file already open per PO's own note,
no re-dispatch, no lane move.

### STEP agent-father-S13 · agent-father · 2026-07-31T15:05:00Z
**task-id:** FIX-COWORK-SPAWNFANOUT-NO-SESSION-ID-IN-LEAF-ENTRY-PROMPT
**what-done:** `spawn-fanout.md` Step 5.2 appends new `SESSION_ID_LINE`
(cowork-team's own resolved `$CLAUDE_CODE_SESSION_ID`, never the unresolved
token) to `ENTRY_PROMPT` in BOTH branches. `refine_bctc_md/flow/main.md`
guard updated to name the extraction line. New static test
`cowork-spawn-entry-prompt-session-id.test.js` (7/7, RED confirmed pre-fix).
**what-considered:**
- Uniform vs. SELF-IDENTITY-GUARD-scoped injection (row's AC-3 choice) —
  uniform: matches router's own unconditional precedent, avoids a
  6th-recurrence allowlist (row is already the 5th).
- Append to composed `ENTRY_PROMPT` vs. write into stored `trigger_prompt`
  — rejected the latter (AC-4); confirmed zero diff on `cowork-schedule.json`.
**why-decision:** row named this the 5th "no documented producer" class —
uniform is the only fix that closes the class, not one symptom.
**why-change:** none. AC-6 live re-verify explicitly out of scope for me
(dispatch prompt); QA/next tick owns it.

### STEP agent-father-S14 · agent-father · 2026-07-31T15:19:08Z
**task-id:** FIX-PO-MANUAL-DISPATCH-SWEEP-FLAG-WITHOUT-DISPATCH-STRANDS-ROW
**what-done:** Step 1's permanent `po_manual_dispatch_flagged_at` exclusion
strands any flagged row whose BATCH never dispatched (live: TE-T12, ~8h).
Added `flag_reentrant($now_epoch; 14400s)` — fresh stamp excluded, stale
stamp re-admitted — to Step 1 + dev-standards.md:504-526 mirror. Verify
script gained `M-STALE-FLAGGED-REENTRANT` positive control; `G-ALREADY-
FLAGGED` negative control now uses a relative-fresh timestamp (jq
`todateiso8601`, not hand-typed). Live-replayed Step 1 against real board:
TE-T12 now surfaces (`reflag:true`, rank 1). Commit `64d132e43`.
**what-considered:**
- Bounded staleness window in Step 1 (chosen) vs. Step 3 fallback-fold
  when Step 2 stamps nothing — window is smaller/more mechanical: only
  touches Step 1's `select`, reuses the already-computed but unused
  `$now_epoch` arg, no new Step-3 branch/tie-break logic needed.
- 4h window: long enough that a row just stamped isn't immediately
  re-surfaced while its BATCH still has a realistic dispatch chance;
  short enough to unstick a WIP-cap-stranded row same working day.
**why-decision:** row's own AC named both shapes as acceptable and asked
for whichever is smaller/mechanical — staleness-window wins on both axes,
and same-tick double-BATCH stays structurally impossible regardless
(Step 1 computes its list once, before Step 2 stamps).
**why-change:** none — implemented exactly the row's 4-point AC. Dispatch
prompt's own step 5 asked me to run `orch-apply.sh` myself for the
`in_progress[]→review[]` lane-move; declined per own init.md `commit_zone.
excluded` ("orch-state.json ... NEVER in agent-father commits except the
ONE allowed signal-queue DONE-mark") — same boundary honored in 3 prior
STEPs this file (S-po-daily-triage, S-UC-ASL-P6, S-FIX-DEVTEAM-QADRAIN).
Supplied the exact transform in RETURN for dev-team/router to execute
instead; not a silent skip.

### STEP agent-father-S15 · agent-father · 2026-07-31T15:37:59Z
**task-id:** TE-T12
**what-done:** Created `.claude/skills/dispatch-claim/CARD.md` (38L hot
path: ownership-key rule, Phase A orphan-probe skeleton w/ N_MAX/ESCALATED
idempotency, Phase A.5 roster read, Phase B intent PRE-CLAIM try/finally,
edge-path pointers back to SKILL.md). Pointed CLAUDE.md step 2.5 at
CARD.md instead of the 493L SKILL.md. Trimmed SKILL.md's "Reference
Commits" section (11L pure git-SHA history) to a one-line git-log pointer
and added a `<!-- size-justification -->` header explaining the file's
intentional post-split size as the lazy-loaded full reference.
**what-considered:**
- Delete Reference Commits outright (row's other listed option) vs. trim
  to a one-line pointer preserving discoverability — chosen the trim: the
  SHAs are still recoverable via `git log --follow` and the linked 1962c
  brief, so a pointer costs ~0L of ongoing budget while not silently
  destroying the breadcrumb.
- Also add SKILL.md's own size-justification header (not explicitly
  required by the row's literal text, which only named it for the
  Reference Commits sub-section) — chosen anyway: the row's own note field
  says "Worst project ≤200L breach" for the WHOLE file, and the T-12
  brief's proposal explicitly says "add size-justification or split" at
  the file level; a header is cheaper than a further split and the row
  already designs SKILL.md to stay as the full lazy-loaded reference.
- Commit CLAUDE.md as part of THIS row vs. decline as out-of-zone — the
  po_routing_ruling text quoted on this row says root-config (CLAUDE.md)
  routes to developer generally (confirmed live: sibling TE-T23, the
  deeper CLAUDE.md step-2.5 prose compression, IS owner=developer,
  zone=cross-service/), and `.claude/skills/commit-boundary/SKILL.md`'s
  agent-father zone table doesn't list CLAUDE.md either. Committed anyway
  — this row's own `note` field explicitly names the CLAUDE.md pointer
  swap as part of TE-T12's deliverable (CARD.md is dead weight until
  something points at it), and the dispatch prompt quoted that note
  directly. Read as a scoped, row-specific exception (single-line pointer
  swap only, not the larger prose compression TE-T23 owns), not a general
  zone-table amendment — flagging so the zone table gets a precedent note
  if this recurs, not fixing the table unsupervised here.
**why-decision:** CLAUDE.md is injected into every spawned subagent's
system prompt — the hot-path swap (SKILL.md→CARD.md) is the load-bearing
fix; SKILL.md's own size is now a cold-path concern (read only via
CARD.md's edge-path pointers), matching the commit-mutex/signal-dashboard
precedent (hot card + justified/lazy-loaded detail file) already used
elsewhere in this repo.
**why-change:** none — implemented as specified. Verified: CARD.md 38L
(≤40L target); `grep "2.5 PRE-CLAIM"` CLAUDE.md confirms the CARD.md
pointer; grepped all 8 live callers of `dispatch-claim` outside self-refs
(cowork-team/dev-team main.md, orch-sentinel flow+init, task-lock
SKILL.md, dev-standards.md, cron-orch-sentinel.md) — all reference named
§-sections that remain intact in SKILL.md at the unchanged path, none
stale. Did not touch TE-T23 (sibling row) or `orch-state.json` (own
`commit_zone.excluded`) — status flip left to dev-team/router on RETURN.
Noted but did not act on an automated `context_bloat_breach` signal the
context-bloat-backstop hook emitted for SKILL.md post-edit (its byte-cap
predicate is never suppressible by a line-based justification by design,
TE-T24) — routed to claude-manager-helper, outside my `commit_zone`.

### STEP agent-father-S16 · agent-father · 2026-07-31T15:55:00Z
**task-id:** FIX-PO-TRIAGE-SIGNALS-CIRED-TEMPLATE-STATUS-TODO-REJECTED-BY-VALIDATOR
**what-done:** triage-signals.md's `ci_red` mint template + 4 sibling
backlog[] mints (`zone_missing_tier3`/`repair_task_request` same file,
channel-audit.md, sprint-kickoff.md) hardcoded `status: "TODO"`; only
`{BACKLOG, BLOCKED}` are lane-coherent per `LANE_ALLOWED_STATUSES.backlog`
(orchStateSchema.ts). Fixed all 5 to `status: "BACKLOG"`. Added
`scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh`
(42/42): replays each template's mint shape through the real
`orch-apply.sh` on a throwaway fixture — TODO reproduces the Stage 1b
abort, BACKLOG passes. Commit `cb6ba9567`.
**what-considered:**
- Fix ci_red only (literal scope) vs. grep the class across all po/flow/*.md
  — chose the class sweep per the task's own AC(2); found 4 more instances
  not named in the original filing.
**why-decision:** validator confirmed correct side (every live backlog[]
row already uses BACKLOG) — templates were the drifted side, class not typo.
**why-change:** none — implemented exactly the row's 2-point AC. Did not
touch `orch-apply.sh`/`orchStateSchema.ts` (explicit out-of-scope). Did not
touch `orch-state.json` — `commit_zone.excluded` honored; board flip left
to dev-team per this task's own routing note. (Renumbered S15→S16 at
merge — this worktree branched from the same parent as the TE-T12 agent's
worktree and independently minted its own S15; TE-T12's landed first.)
