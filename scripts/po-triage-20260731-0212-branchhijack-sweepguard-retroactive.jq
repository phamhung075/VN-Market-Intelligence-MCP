# PO triage 2026-07-31T02:12Z — Step 0-SIG pass.
# Mints 2 FIX rows + 1 additive PO review note + manual-dispatch-sweep stamp on TE-T11.
# Apply:  jq -f scripts/po-triage-20260731-0212-branchhijack-sweepguard-retroactive.jq \
#           docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Idempotent: re-running is a no-op (guards on existing .id).

def now: "2026-07-31T02:12:46Z";

def row_branch_hijack:
{
  "id": "FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR",
  "type": "FIX",
  "size": "M",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "cross-service/",
  "owner": "architect",
  "next_agent": "architect",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0212",
  "created_at": now,
  "updated_at": now,
  "origin_signal_id": "dev-20260731T020908",
  "dedup_key": "git-isolation:shared-working-dir|symptom:branch-checkout-hijacks-peer-commits",
  "verification_gate": "live_two_agent_concurrent_branch_scenario_no_cross_attribution",
  "title": "Every subagent shares ONE git working directory + ONE HEAD: any agent that honours a `branch:` field (e.g. a PM handoff) checks out that branch in the shared checkout, and every concurrent peer's commits silently land on it. 4 independent hits on 2026-07-31 alone; zero board rows existed.",
  "root_cause": "STRUCTURAL, not behavioural. There is no worktree/checkout isolation between agents — all agents (router, dev-team, pm, po, developer, architect, agents-architect, qa) operate on the same `$PROJECT_ROOT` and therefore the same `.git/HEAD`. `git checkout <branch>` is a process-global mutation of shared state with no lock, no claim and no TTL, so it is not serialisable against peers the way the index is (the index at least has `index.lock` + the Layer-0 sweep guard). CLAUDE.md's `NO branches — all work stays on main` invariant is the only thing holding the system together, and it is enforced by prose alone: nothing structurally prevents a `branch:` field from appearing in a PM handoff / task row and being obeyed. Note this is the SIBLING hazard to the shared-INDEX sweep (FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD family, 6 rows, Layer-0 hook shipped): same shared-working-dir root, different shared resource (HEAD vs index), and the sweep-guard hook is structurally blind to it because it only inspects $GIT_INDEX_FILE shape, never HEAD.",
  "evidence": "dev-team signal `dev-20260731T020908` (signal_queue, status READ, minted by commit 3b20fc8c9): '4x today: subagents share dev-team's git checkout (no worktree isolation); a branch checkout (e.g. PM handoff's branch: field) hijacks peer commits.' The 4 named incidents that tick: dev-team's own stray commit, agents-architect's stray commit, the FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE developer originating the branch, and the head-stamp developer's stash-pop failure. Independently corroborated by project memory `feedback_subagent_branch_checkout_hijacks_shared_working_dir` ('dev-team's own commits land on a subagent's branch; recover via isolated worktree, never checkout main mid-subagent-edit') — the hazard has been KNOWN and carried as tribal memory + ad-hoc recovery, never as a board row. 4 occurrences in one day clears the recurring-bug bar (>=2) by a factor of 2.",
  "ac": "(AC-1) Name the enforcement layer and make it STRUCTURAL, not prose. The prose invariant already exists in CLAUDE.md and did not prevent 4 hits — a 5th doc sentence is a rejection. Candidate layers to evaluate explicitly, choosing and justifying one: (a) a `pre-checkout`-equivalent guard (git has no pre-checkout hook — say so if rejecting, do not silently assume one exists) e.g. a wrapper/alias or a `post-checkout` hook that hard-reverts + fail-louds any move off `main`; (b) real per-agent `git worktree` isolation; (c) a schema-level ban on the `branch:` field in task rows / PM handoffs so the trigger can never be authored. (AC-2) Whatever layer is chosen MUST be reachable by agents that have no MCP grant — the same reason the sweep guard was pushed down to a git hook (`docs/policies/dev-standards.md` CANONICAL sweep-guard entry): a skill-level or flow-doc-level fix can be improvised around, and 4/4 of these incidents were improvised behaviour, not doc-following. (AC-3) DEDUP/RECONCILE — do NOT mint a 3rd overlapping row. Two adjacent rows already exist and this row must explicitly state its boundary against both, in writing, before implementing: `UC-RDL-P7` (BACKLOG, next=po — 'Reconcile branch policy across the FULL branch lifecycle with the main-only invariant') owns the POLICY; `SPIKE-C44-PARALLEL-PROOF` (BACKLOG — 'two developer agents in worktrees on disjoint zones, no shared-index race -> lift sequential mandate') is the permission-WIDENING spike and shares the worktree mechanism this row may want to use as its fix. If the chosen fix is (b) worktree isolation, SPIKE-C44 becomes a hard dependency, not a sibling — say so and sequence it. (AC-4) Live positive control, two concurrent agents in the real repo (or a byte-clone of it): agent A checks out a branch, agent B commits its own files, assert B's commit landed on `main` and is not reachable only from A's branch. Asserting from hook/wrapper source prose is a rejection.",
  "files": [],
  "reference_only_files": [
    "scripts/git-hooks/pre-commit",
    "scripts/git-hooks/install.sh",
    "CLAUDE.md",
    "docs/policies/dev-standards.md"
  ],
  "related": "Sibling of the FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD family (shared working dir, shared INDEX) — this row owns the shared HEAD. Adjacent policy row UC-RDL-P7; adjacent mechanism spike SPIKE-C44-PARALLEL-PROOF (see AC-3).",
  "dedup_checked": "2026-07-31T02:12Z — jq over EVERY task_board lane matching /branch|worktree|hijack|checkout/i => 10 hits, all read: 8 are unrelated uses of the word 'branch' in a code-path sense (dead branch, non-fatal branch, macOS branch, null-branch head-sync, etc.); the only 2 genuine matches are UC-RDL-P7 (policy scope) and SPIKE-C44-PARALLEL-PROOF (permission-widening spike) — neither owns the hazard, both cross-referenced in AC-3. Confirms dev-team's own 'zero existing board rows' claim in commit 3b20fc8c9, with the two adjacencies it did not surface.",
  "baseline_pass": null,
  "desc": null
};

def row_sweepguard_retroactive:
{
  "id": "FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR",
  "type": "FIX",
  "size": "S",
  "priority": "P1",
  "status": "BACKLOG",
  "zone": "cross-service/",
  "owner": "developer",
  "next_agent": "developer",
  "supervised": false,
  "plan_only": false,
  "created_by": "po/triage-20260731T0212",
  "created_at": now,
  "updated_at": now,
  "dedup_key": "sweepguard:escalation-actuator|defect:retroactive-unwindowed-counter+session-scoped-actor",
  "verification_gate": "live_repo_log_state_positive_control_not_fresh_scratch_actor",
  "title": "The escalation actuator shipped in eac71308e is ALREADY past threshold for 2 live sessions the moment it landed: prior_warns counts the ENTIRE historical .git/sweep-guard.log with no time window and no deploy baseline, so it is a de-facto instant fleet-wide reject flip — the exact flip the brief deliberately staged as a Phase-2 with 24h observation + rollback. Compounding it, `actor` is $CLAUDE_CODE_SESSION_ID, which every subagent of one router session SHARES, so it can never scope to an agent.",
  "root_cause": "TWO defects in one block, `scripts/git-hooks/pre-commit:487-506`. (D1) RETROACTIVE, UNWINDOWED COUNTER: line 500 `prior_warns=$(grep -Fc \" actor=${actor} \" \"$LOG_FILE\")` counts every BARE line ever written for that actor. The log is append-only and nothing prunes or windows it (`post-commit` only appends `correlated sha=` lines, which carry no `actor=` and so do not double-count). The actuator therefore inherited a pre-existing backlog at deploy time instead of starting from zero. (D2) ACTOR != AGENT: line 487 `actor=\"${CLAUDE_CODE_SESSION_ID:-...}\"`. In Claude Code every subagent spawned from one router session inherits that same session id, so router/dev-team/pm/po/developer/architect/qa all report as ONE actor. T8's shipped property ('a different actor's first BARE commit in the same repo still only warns') is true in a scratch repo where the test fabricates distinct ids, and vacuous in production. Consequence: a first-time-offending agent inherits every peer's strikes, so the actuator converges SESSIONS, not offenders — which is precisely the fleet-wide behaviour the brief's own rationale ('WITHOUT waiting on a fleet-wide reject-mode flip') claimed to avoid.",
  "evidence": "MEASURED ON THE LIVE REPO 2026-07-31T02:12Z, not inferred from source prose. `.git/hooks/pre-commit` is a SYMLINK to `scripts/git-hooks/pre-commit` (`ls -la` confirmed) => landing == deploying, the escalation is live right now with no separate install step. `grep -c 'ESCALATED REJECT' .git/hooks/pre-commit` = 1. Replaying the hook's own predicate verbatim against the live log (156 lines): actor 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae -> prior_warns=70, threshold=3 -> escalated=TRUE -> exit 1; actor ad265f86-1675-4ab9-8d93-7ea39e36d08a -> 6 -> escalated=TRUE. (Two further actors sit at 1 each and are still in warn.) So the NEXT bare commit by either of those two sessions is hard-blocked, and 64c7c677 is the live router session for this very tick. D2 is provable straight off the triaged signal: `commit-sweep-guard-2026-07-31T014328Z-3664.json` records PM's commit 8d233ccc5 as `actor=64c7c677-0f0f-4cee-a3ce-dba79d70b7ae`, and that identical string is the coordination_session PO/dev-team/developer are all running under this tick. WHY THE SHIPPED AC-4 DID NOT CATCH THIS (read from the commit message + developer journal, not assumed): the live positive control used `fresh actor live-control-fresh-actor-8f3d21` in a `disposable scratch repo` — i.e. an EMPTY log and a synthetic per-agent id. Both defects are invisible under exactly those two conditions. Same class as project memory `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist` (symlinked hook, gate validated on a state the fleet does not actually have).",
  "ac": "(AC-1) The counter must start at zero for state that predates its own deployment. Ship a deploy baseline (e.g. only count lines at/after a recorded marker, or a windowed `since` bound) and state which was chosen and why. After the fix, re-run the hook's own predicate against the UNMODIFIED live log and paste the numbers: both 64c7c677-… and ad265f86-… must be BELOW threshold. Truncating/deleting `.git/sweep-guard.log` to get there is a REJECTION — that destroys the forensic record the whole family of rows depends on. (AC-2) Either make `actor` genuinely identify the acting agent, or — if no per-agent identifier is reachable inside a git hook (verify this, do not assume) — say so explicitly in the code comment and in the doc, rename the concept from 'per-actor' to what it actually is ('per-session'), and re-derive whether threshold=3 is still the right number for a unit that is 8+ agents wide. Leaving a session-shared id documented as 'per-actor' is a rejection; the wrong noun is what made this ship. (AC-3) Restore the staging the brief required and this actuator bypassed: a documented one-line rollback (`GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=0`) surfaced where a BLOCKED agent will actually read it — the stderr message already names it, so verify instead that at least one flow doc / skill an agent loads BEFORE committing carries it — plus the 24h observation window the brief attached to the warn->reject flip. (AC-4) Add T10 to `scripts/git-hooks/pre-commit.test.sh`: a scratch repo SEEDED with a pre-existing over-threshold log for the actor about to commit must NOT block on that actor's first post-deploy commit. This is the exact scenario T7-T9 structurally cannot reach (all three start from an empty log). Keep 9/9 green. (AC-5) Positive control must be run against a byte-copy of the LIVE `.git/sweep-guard.log`, not a fresh empty one — a fresh-actor/empty-log control is what produced the false green here and repeating it is not evidence.",
  "files": [
    "scripts/git-hooks/pre-commit",
    "scripts/git-hooks/pre-commit.test.sh"
  ],
  "reference_only_files": [
    ".git/sweep-guard.log",
    "docs/architecture-briefs/2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md",
    "docs/agents/po/flow/triage-signals.md"
  ],
  "related": "Direct follow-up to FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION (REVIEW, next=qa) — that row's 4 ACs are all met AS WRITTEN; this row owns the two properties its AC set did not cover. 7th row of the sweep-guard family. Does NOT re-open the parent: parent proceeds to QA independently, with a po_review_note pointing here.",
  "dedup_checked": "2026-07-31T02:12Z — jq over every lane matching /SWEEPGUARD|SWEEP|COMMIT-PATH/i => 15 hits, all read. The 6 family rows are: -HOOK (DONE_VERIFIED), -SKILLS (DONE), -LAYER2 (DONE_VERIFIED), parent FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD (BLOCKED, next=po), -SCRIPT-ACTUATOR-AND-NOTEBOOK-LONGTAIL (REVIEW, next=po), -SWEEP-VICTIM-SELF-DETECT (BACKLOG), plus FIX-SWEEPGUARD-WARN-ONLY-... (REVIEW, next=qa). None owns the escalation counter's initial state or the actor-identity granularity — both properties were introduced by eac71308e, which landed 01h before this triage. Remaining 8 matches are unrelated (coverage-sweep, stranded-sweep, epic-wrapper-sweep, cyclejob-sweep, bounded1-lane-sweeper, saturated-count spike).",
  "baseline_pass": null,
  "desc": null
};

# ---------- apply ----------
( [ .task_board.backlog[]? | select(type=="object") | .id ] ) as $ids
| .task_board.backlog +=
    ( [ row_branch_hijack, row_sweepguard_retroactive ]
      | map(select(.id as $i | ($ids | index($i)) == null)) )

# additive PO note on the parent row so QA does not sign off blind
| (.task_board.review[]? | select(type=="object")
   | select(.id == "FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION"))
  |= ( . + {
        "po_review_note_20260731T0212":
          "PO Step 0-SIG: your 4 ACs are met as written — do NOT block QA on this note. BUT the shipped actuator is measurably already past threshold on the LIVE repo (prior_warns=70 for the live router session 64c7c677-…, 6 for ad265f86-…, threshold=3), because prior_warns counts the whole historical log with no deploy baseline; and `actor`=$CLAUDE_CODE_SESSION_ID is shared by every subagent, so 'per-actor' scoping is vacuous in production (T8 only passes because the scratch repo fabricates distinct ids). Both properties are owned by the new row FIX-SWEEPGUARD-ESCALATION-RETROACTIVE-COUNTER-AND-SESSION-SCOPED-ACTOR (backlog, P1). QA: please note in the verdict that the AC-4 positive control was a fresh-actor/empty-log scratch repo and therefore could not observe either property."
      } )

# manual-dispatch-sweep Step 2 stamp (additive audit marker only — never a lane move)
| (.task_board.backlog[]? | select(type=="object") | select(.id == "TE-T11"))
  |= ( . + {
        "po_manual_dispatch_flagged_at": now,
        "po_manual_dispatch_flagged_by": "po (manual-dispatch-sweep)",
        "po_manual_dispatch_class": "DRS-STRANDED-OFF-ALLOWLIST",
        "po_manual_dispatch_note": "po (manual-dispatch-sweep) surfaced DRS-STRANDED-OFF-ALLOWLIST candidate — folding into this tick's BATCH"
      } )

| .task_board.last_triaged_at = now
| .task_board.last_triaged_by = "po/triage-20260731T0212"
