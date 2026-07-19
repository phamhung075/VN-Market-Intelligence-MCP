# Agent Father — Notebook

## 2026-07-09T08:46Z — FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE (router-dispatched, brief docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md §2.2+§2.3)

- Task: 2 recurring-bug fixes at ops's Close Gate Step 4/4b handoff (router had to discover+commit
  ops's uncommitted board+journal artifacts twice — `f4afa0e03`, `b907a8ea6`) + 3 one-off decision-
  journal filenames.
- (2.2) `docs/protocols/docker-deployment-runbook.md`: new `§ Step 4/4b Commit-Gate Invariant` —
  modeled verbatim on agents-architect's own Brief-Commit Invariant (`handlers.md`): explicit-path
  `git add`/`commit`/`git show` self-verify of ops's 3 Close-Gate paths; Step-4 RETURN/report MUST
  carry the commit SHA or is INCOMPLETE; a router/PO cleanup-commit flagged as a defect to report,
  not a recovery path; 3rd recurrence → escalate. `.claude/skills/commit-boundary/SKILL.md` zone
  table: added `ops` row scoped to exactly `notebooks/ops.md` + `decisions/sprint-<id>-ops.md` +
  `orch-state.json` (Close-Gate board+head write only).
- (2.3) Same runbook section: STEP ops-Sn / decision-journal `SPRINT_ID`-resolution enforcement
  line. Folded the 3 named one-off files into `sprint-SYSTEMIC-REMAKE-P1-ops.md` as `STEP
  ops-S1/S2/S5` (chronological insert by their own timestamps) — surfaced + fixed a pre-existing
  duplicate-`S2` numbering bug in that file (relocate-stock-catalog S1→S3, extract-computeDecision
  S2→S4, split-repositories S2→S6). Originals deleted post-fold (content preserved, not lost).
- Board update (`orch-state.json` in_progress→review + `.head` sync): attempted via
  `scripts/orch-apply.sh` (clean isolated diff, orch-validate PASS) then REVERTED — task text
  explicitly asked for it, but my own `commit_zone.excluded` (init.md) bars `orch-state.json` from
  agent-father commits outside the ONE named signal-queue-DONE-mark exception (task_board writes
  are not that exception), matching the S4 precedent of deferring board writes to po/router rather
  than overriding my own zone boundary on a launching agent's instruction. Reported the exact
  validated jq transform for router/po to re-run + commit.
- Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` S5.

## 2026-07-13T20:15Z — UC-RDL-P1 lock-namespace doc fix (router-dispatched, brief docs/architecture-briefs/2026-07-13-uc-rdl-p1-lock-namespace-adjudication.md)

- Doc-only fix: `.claude/skills/dispatch-claim/SKILL.md` (Canonical Namespace table L39 + §Sprint-Task
  Outer Wrap L267-284) and `.claude/skills/task-lock/SKILL.md` (L29) documented the sprint-task
  chain-mutex `task_id` VALUE prefix as `sprint-task:<id>`; 100% of live flows + server code use
  `task:<id>`. Corrected both to `task:<id>`; `task_kind` stays `"sprint-task"` (id-prefix and kind
  are different axes — did not rename the enum). Also reworded the L269 intro sentence in the same
  section for internal consistency (not explicitly line-cited in the brief but directly adjacent to
  the two named edits — same file/section, no scope creep).
- Rejected touching `docs/handoffs/TASK_1979-p1-af-4-task-lock-skill-rebind.md` (a completed
  historical handoff also containing the old string) — out of the brief's named scope (two SKILL.md
  files only); left L492 provenance prose in dispatch-claim untouched per brief instruction; verified
  `CLAUDE.md`'s `intent:` pattern (Phase B) unchanged (that merge was adjudicated a false positive).
- Commit `18885ff50`, explicit pathspec, exactly the 2 target files — none of the ~89 dirty peer
  files in the tree were staged.
- Decision journal: `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-agent-father.md` S1.

### Edit (system-auditor) 19:44 — 2026-07-18 D-FLEET Tier-4 PILOT scaffolding (brief docs/architecture-briefs/2026-07-18-cron-workflow-optimize-tier4-fleet-audit.md §8, signal cron-workflow-optimize-tier4-fleet-audit-20260718T192722Z.json)
- Change: Phase 1 ONLY (EDIT-1..EDIT-5) — new "D-FLEET (Tier-4, PILOT)" audit dimension bolted onto
  system-auditor: notebook cycle-telemetry rollup (FA-1), task_board/signal_queue derived
  cooperation metrics read-only (FA-2), tool-usage-stats.json read degraded-mode aware (FA-3),
  alert/prediction accuracy generalization via already-generic tools (FA-4), synthesis + existing
  D-IMPROVE emit pipeline reuse (FA-5), notebook append + pilot-run counter (FA-6). On-demand PILOT
  only — zero `cronConfig.ts` entry, zero always-on cadence.
- Files modified: 5 — `docs/agents/system-auditor/audit-dimensions.md` (new D-FLEET section after
  D5), `docs/agents/system-auditor/flow/main.md` (AUDIT_TIER=4 extraction row + Tier Dispatch row,
  explicit note to skip Step 0d tick-election for tier-4), `docs/agents/system-auditor/handlers.md`
  (new `## Step D-FLEET` handler, Trigger + FA-1..FA-6 + failure modes + not-in-scope), `docs/agents/
  tools/package/system-auditor.md` (Tier-4 read-scope note + 3 new MCP tool rows: get_prediction_
  accuracy, create_prediction_claim, get_alert_accuracy — verified live in `docs/agents/tools/list/`
  before citing), `.claude/agents/system-auditor.md` (single additive description clause).
- Cascade: none — no rename, no `inter_agent` change, no roster/CLAUDE.md/dispatch entry (pilot is
  manually invoked, same mechanism as existing Tier-1/2/3 spawns).
- Validation: 5/5 — YAML frontmatter untouched/valid, all cross-referenced paths resolve (`§Step
  D-FLEET` in handlers.md exists, brief path exists), size-justification comments updated on all 3
  edited `.md` files with line-count deltas, tool names cross-checked against `docs/agents/tools/
  list/*.md` (all 3 exist), zero `apps/**` touched.
- Decision: brief explicitly hard-boundaries this task to Phase 1 (docs only) — Phase 0 (tool-usage-
  stats.json per-agent redesign, `apps/mcp-server/**`) is LANE-B, constitutionally forbidden to
  agent-father (same boundary as D4's `dev-mcp-server` note). Raised Phase 0 to po as a SPRINT-XS
  backlog request via `docs/signals/agent-father-tier4-phase0-toolstats-backlog-20260718T194216Z.json`
  (type=brief_complete, same payload path, citing §2c/§8 — reuses po's existing `brief_complete`
  triage-signals.md row rather than inventing a new signal type). Pilot Run #1 explicitly documented
  as executable in tool-usage-stats degraded mode (FA-3) — not gated on Phase 0 landing first, per
  the launching signal's own instruction.

### Edit (unified-agent) 22:5x — 2026-07-19 fix-chef-write-boundary (router-dispatched, PO signal
docs/signals/po-20260719T203100Z.json, GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST)
- Sibling defect to the same-day TNB grant fix — DIFFERENT mechanism per PO's explicit framing:
  tool was already granted (`Write` in `.claude/agents/unified-agent.md` L5) but forbidden by a
  contradicting L4 description ("Writes only to ... notebook ... No other filesystem writes
  permitted", added 2026-05-19) that never cascaded when `chef.md` Step 7.6 (2026-07-10) added the
  `docs/data/unified-agent-synthesis-*.json` write. `model:haiku` resolved the self-contradiction
  non-deterministically → intermittent self-refusal ("tool limitation") even while the same cycle's
  `send_telegram` publish succeeded — matches PO's evidence, did not re-verify independently (out of
  agent-father's zone to run a live cowork cycle).
- Fixed: (1) `.claude/agents/unified-agent.md` L4 description now explicitly authorizes
  `docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT_ID>.json` alongside the notebook, mirroring the
  existing `bctc-analyst.md`/`fb-market-poster.md` "No other filesystem writes permitted except X"
  pattern rather than inventing new phrasing. (2) `docs/agents/unified-agent/init.md` cascades the
  matching allowlist (capabilities/responsibilities/constraints/boundary_rules) — bootstrap
  previously had zero `docs/data/` allowlist. (3) `chef.md` Step 7.6: added an AUTHORIZATION comment
  at the write call site itself (closes the self-refusal vector where the model actually decides),
  and pinned `CYCLE_DATE = WORK_DATE` (Step 0.5's single Asia/Ho_Chi_Minh value, computed once)
  instead of re-deriving "VN date of cycle execution" fresh in Step 7.6 — root cause of the observed
  filename inconsistency (07-17 evening UTC-leaning vs 07-18 VN-leaning; 07-14 19:50Z run emitted
  both `-07-14` and `-07-15` 25s apart). Naming stays `date_vn+dish_type` per
  `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (P1 backlog, ba-owned cycle_id-keying follow-on) —
  did NOT implement cycle_id-keying myself, that row's structural fix is out of this task's scope.
- Also carried 2 previously-stranded `chef.md` auto-cures found dirty in the working tree at task
  start (tran-ngoc-bau c111 single-pillar L6-gap check, `FIX-CHEF-STEP0-BCTC-PROCESSED-DIR-BLINDSPOT`
  dual-directory signal read) into the same commit — both already RAW-verified present/landed by
  TNB c113 per `orch-state.json`, same precedent as `bb0bbddcb`; did not touch any of the other ~30
  unrelated dirty files in the tree (notebooks, synthesis JSONs, signals from live peer sessions).
- Report-only, not fixed (explicitly out of scope, PO said "report don't fix"): 2026-07-17 14:13Z
  notebook entry cited `unified-agent-synthesis-2026-07-17-intraday.json` but that file's
  `metadata.cycle_id` belongs to the earlier 04:13Z run — the notebook "Synthesis: <path>" line is
  not a persistence receipt; PO already tracks this under `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING`.
- Verification note: no live chef cycle ran during this task (agent-father cannot invoke cowork
  cycles) — PO's AC #3/#4 (RAW-verify next live dish; require 3 consecutive clean dishes before
  DONE_VERIFIED) are for the next tran-ngoc-bau audit cycle to close, not this pass.
- Commit `04dd12a23`, pushed (origin/main was already caught up on PO's `232cc1126`/`25a1af583` and
  my own prior `2617a511c` — verified via `merge-base --is-ancestor` before pushing, no force).
- Decision journal: none minted (task explicitly said board state already handled, no re-litigation).

### Edit (tran-ngoc-bau) 20:33 — 2026-07-19 fix-tnb-tool-grant (router-dispatched, task fix-tnb-tool-grant)
- Change: `.claude/agents/tran-ngoc-bau.md` line 5 frontmatter `tools:` was `Read, Edit, Write, Glob,
  Grep` — zero MCP grant, while all 6 of its own sub-flows hard-require `mcp__gateway__call_tool`
  (PUBLISHED MARKER GATE `task_claim`+`get_week_period` in main.md is a mandatory hard gate;
  `read_telegram_reports`/`send_telegram`/`get_macro_snapshot`/`get_system_status`/`get_market_snapshot`/
  `compare_financials`/`get_price_history`/`get_sector_comparison`/`get_agent_signals`/
  `get_signal_effectiveness`/`get_alert_accuracy`/`log_agent_work` across bootstrap.md, audit-market.md,
  audit-chef-coverage.md, audit-signals.md, auto-cure-and-handoff.md). Added `mcp__gateway__call_tool`
  to the frontmatter — matches the exact grant pattern of all 6 correctly-provisioned cowork peers
  (unified-agent, market-watcher, alert-commander, news-scout, bctc-analyst, digest-predict all carry
  `Read, Write, Edit, mcp__gateway__call_tool`); kept `Glob`+`Grep` (peer-divergent by design — TNB is
  the only cowork agent whose flow enumerates ALL other agents' notebooks, main.md Step 3
  `Glob: docs/agent-memory/notebooks/*.md`, a genuine, distinct need). Did NOT add `Bash` — RAW-verified
  this is NOT a TNB-specific gap: `bctc-analyst.md`/`market-watcher.md` notebooks explicitly self-document
  "no Bash tool this session ... notebook git-commit deferred to next Bash-capable process" as an
  established, universal, ~c078+ precedent across every cowork agent (idea-forge, market-analyst,
  qa-responder, digest-predict, alert-commander confirmed same pattern); git log confirms a separate
  drain/router process commits these notebooks on the agents' own behalf (`bb0bbddcb` "...on TNB's
  behalf"). Granting Bash to TNB alone would create fleet asymmetry, not fix one — router's task framing
  on this one point was corrected, not applied as stated.
- Files modified: 3 — `.claude/agents/tran-ngoc-bau.md` (frontmatter tools line), `docs/agents/tools/
  package/tran-ngoc-bau.md` (added missing `get_week_period` row; corrected stale "Task-Lock ... Phase 2
  Ready, not yet active in cycle.md" note — `task_claim` has been an active mandatory gate in main.md
  since the PUBLISHED MARKER GATE was added), `docs/agent-memory/notebooks/tran-ngoc-bau.md` (appended a
  CORRECTION entry after c114 — `F-MCP-SUBAGENT-SYSTEMIC` as logged c108-c114 was a static, 100%-
  reproducible frontmatter gap, not "per-spawn nondeterministic grant-drop"; historical c108-c114 entries
  left untouched).
- Cascade: none — no rename, no `inter_agent` change, roster/dispatch table entries for tran-ngoc-bau
  carry no tool list (verified via grep, nothing to sync there).
- Validation: 5/5 — YAML frontmatter still valid (name/color/description/tools/model all present),
  tool package now matches frontmatter grant, no `apps/**` touched, TNB's own write-boundary
  (notebook + handoffs + docs/signals only) unchanged, no Bash added (verified against 5 peer
  cowork-agent notebooks before deciding).
- Audit of other agents (task part d — reported, NOT fixed this pass): (1) FLEET-WIDE, already
  self-documented, not newly discovered: `commit-mutex` skill's `git add`/`git commit` steps and
  `claim-truth-gate` skill's `bash scripts/narrative-truth-gate.sh` step both require Bash, but every
  cowork peer with `mcp__gateway__call_tool` (alert-commander, market-watcher, news-scout, bctc-analyst,
  digest-predict, unified-agent, idea-forge, market-analyst, qa-responder) carries NO Bash — only
  `fb-market-poster`, `ops`, `po`, `system-auditor` do. `digest-predict`'s notebook already has an open
  ask to dev-team on whether to grant Bash fleet-wide — not duplicating. (2) `idea-forge` (`tools: Read,
  Glob, Grep` — no Write, no Edit, no mcp__gateway__call_tool) and `market-analyst` (`tools: Read, Glob,
  Grep, mcp__gateway__call_tool` — no Write, no Edit) both have flow files (`main.md`) that instruct a
  notebook `git add`/`git commit` step presupposing a prior Write/Edit the frontmatter never grants —
  same class of mismatch as TNB's, but LOWER severity/urgency: both notebooks are stale since 2026-05-20
  ("no session recorded") — these agents appear dormant/not in active cowork cadence, unlike TNB which
  fires daily and had a live, growing audit backlog. Not fixed this pass (task scope = TNB only;
  flagging for a follow-up review.md pass or explicit dispatch).
- Decision: guide ref `guide-agent-definition.md` §5.1 (frontmatter tools must match flow-file tool
  calls) + `.claude/skills/agent-md-factory/SKILL.md` P-1/P-2/Q-1 (SSOT, no duplication) — reconciled the
  grant against the actual 6 sub-flow contracts rather than blind-copying a peer's list; task-lock
  skill's own INV-GATEWAY-1 note confirms dev-team-tier agents (agent-father included) intentionally
  lack `mcp__gateway__call_tool` — this fix is scoped to cowork-tier tran-ngoc-bau only, no analogous
  change made to agent-father's own grant.
