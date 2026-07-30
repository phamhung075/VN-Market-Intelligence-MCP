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
