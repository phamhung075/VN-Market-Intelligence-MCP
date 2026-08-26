# po-triage-20260826T1120Z-inbox30-folds-mints-board-fixes.jq
#
# PO Step 0-SIG triage of the 30-envelope .dev_team_idle_chain.pending_triage_inbox
# read at 2026-08-26T11:20:54Z, plus the 3 NEW `to==po` .signal_queue.rows[] (Pipeline B).
#
# Owning flow doc: docs/agents/po/flow/triage-signals.md
# Registry pointer: docs/agents/po/flow/scripts-registry.md
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260826T1120Z-inbox30-folds-mints-board-fixes.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# This file does NOT clear the durable inbox — that is a separate, declared write
# (ORCH_APPLY_DECLARED_INBOX_TRIAGED), per triage-signals.md § Durable-inbox CLEAR.

def addnote($id; $note):
  reduce ("backlog","ready","in_progress","review","qa","done") as $l (.;
    .task_board[$l] |= map(
      if .id == $id
      then . + {
        status_note: (((.status_note // "") | if . == "" then "" else . + "\n" end)
                      + "[po/triage 2026-08-26T11:20Z] " + $note),
        updated_at: $now
      }
      else . end
    )
  );

def setfields($id; $patch):
  reduce ("backlog","ready","in_progress","review","qa","done") as $l (.;
    .task_board[$l] |= map(if .id == $id then . + $patch + {updated_at: $now} else . end)
  );

# ── FOLD 1 — 8 notebook_* envelopes (4 distinct files, each fired exactly 2x) ──
addnote("CLEAN-NB-SINGLE-SECTION-UNPRUNABLE-CODEJANITOR-DIGESTPREDICT";
  "FOLD +8 envelopes (4 files x2 fires), zero re-mints. Re-measured from disk this tick vs the 12000B cap: digest-predict.md 70L/41835B, tran-ngoc-bau.md 113L/43100B, dev-rag-service.md 186L/27694B, ba.md 112L/19953B. All 4 still breach; scope unchanged from the 2026-08-25T17:00Z re-baseline. CORRECTION to the envelope plane: the notebook_single_section_overage_breach envelopes reported tran-ngoc-bau.md at 37L/12860B, but disk reads 113L/43100B — the emitter's own snapshot is stale by ~30000B, so size the split off a live wc -c, never off the signal payload. NOTE: backlog[] CLEAN-NOTEBOOK-BYTECAP-3-FILES-UNPRUNABLE-SINGLE-SECTION is a duplicate-subject row for this same class; this READY row is the live one.")

# ── FOLD 2 — context_bloat_breach on a rolled-forward (frozen) sprint journal ──
| addnote("CHORE-PRUNE-SPRINT-COWORK-GUARANTEED-SLOT-CATCHUP-DECISION-JOURNAL";
  "FOLD — third journal of this same sprint added to scope: sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-30.md, measured from disk 146L/37591B vs 600L/36000B (byte-axis only, 1591B over). DEFER policy does NOT apply: qa-31.md already exists on disk, so qa-30 is rolled-forward and FROZEN, not the sprint's live journal. Same disposition as the -agent-father.md and qa-21.md targets already on this row.")

# ── FOLD 3 — data_stale: chef off-canonical write RECURRED, root-cause premise refuted ──
| addnote("FIX-CHEF-DEGRADED-FLOOR-RECOVERY-WRITES-OFF-CANONICAL-PATHS";
  "PREMISE REFUTED — this row's 'degraded-floor recovery path' root cause does NOT hold. Occurrence 2 landed 2026-08-26T09:25Z on a FULL-quality cycle and on a THIRD distinct wrong path: docs/agents/unified-agent/output/unified-agent-synthesis-2026-08-26-chef-intraday.json (agent output dir, not docs/data/). PO verified independently by find(1) this tick. Path census now: (1) docs/agent-memory/notebooks/ (2026-08-25 chef-intraday), (2) notebooks/chef-intraday.md wrong-FILE case, (3) docs/agents/unified-agent/output/ (2026-08-26). Three different wrong destinations rules out a single degraded branch and points at the path-resolution step itself having no canonical anchor. Artifact preserved+tracked in c9a89d766. Re-scope this row before implementing: the fix is a canonical-path assertion at write time, not a repair of the degraded branch.")

# ── FOLD 4 — 2x auditor_cycle_missing (same tier, adjacent windows) ──
| addnote("FIX-AUDITOR-TIER23-LAST-HEALTHY-STAMPED-ON-DEGRADED-CYCLE-NO-GREEN-GATE";
  "FOLD +2 auditor_cycle_missing envelopes (tier-2, 08:59:21Z 'no completion evidence in 10h' and 10:24:07Z 'in 11h', cadence 4h) — consolidation per the routing rule, same tier, one advancing window, zero re-mints. These corroborate this row directly: an ungated agent-written last-healthy stamp is exactly what makes a missing cycle indistinguishable from a healthy one.")

# ── FOLD 5 — code-janitor system-issue: decision already made 3x, root cause is ready[] ──
| addnote("FIX-JANITOR-HEALTHRECHECK-IDEMPOTENCY-GUARD-MISSES-PROCESSED-DIR";
  "FOLD — the code-janitor team-tool-recheck escalation re-fired again (envelope 3d283489, 2026-08-26T10:34:57Z). PO CONFIRMED THIS ROW IS THE ROOT CAUSE, by disk: docs/signals/ has NO janitor-health-recheck-writer-retired-*.json, while docs/signals/processed/ holds THREE (2026-08-15, -08-23, -08-24). memory-prune-sweep.sh:109 globs docs/signals/ only, so the marker it wrote is invisible to its own next run and the escalation is immortal. STANDING PO DECISION (asked and answered 4x, do not re-litigate): RETIRE team-tool-recheck permanently, do NOT rebuild it as a local cron; let the 30d sweep drain docs/agent-memory/health/team-tool-recheck-* to empty. Four board rows already carry that decision (CLEAN-RETIRE-TEAM-TOOL-RECHECK-WRITER, CLEAN-RETIRE-TEAM-TOOL-RECHECK-HEALTH-DOC-FAMILY-DEAD-REMOTETRIGGER-WRITER, DECIDE-TEAM-TOOL-RECHECK-WRITER-DEAD-SINCE-06-23-RETIRE-NOT-REPLACE, FIX-JANITOR-PRUNE-SWEEP-HARDCODED-DEAD-WRITER-PREMISE) — that 4-row mint-storm IS the symptom of this row being unfixed. Fixing the guard here closes all four.")

# ── FOLD 6 — DELIBERATELY NOT WRITTEN INLINE.
# The natural host for the `observability_defect` unrouted-type fact is
# FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS,
# but that row measures 11738B live against ORCH_ROW_PROSE_CEILING_BYTES=12000, so a
# +331B fold aborts scripts/orch-row-prose-ceiling-check.mjs. Rather than dodge the
# gate by splitting the write, the fact is carried on MINT 5 below (a fresh, near-empty
# row about the same signal) together with an explicit instruction to extend the
# routing row when it ships, and a flag that the routing row now needs a detail_ref
# cold-store migration before it can absorb any further evidence at all.

# ── FOLD 7 — premise correction: 2 of the AUTO pickers also skip deps_satisfied ──
| addnote("FIX-DEVTEAM-MANUAL-DISPATCH-BYPASSES-DEPS-SATISFIED-GATE";
  "PREMISE PARTIALLY FALSIFIED — this row's title asserts the auto-pickers are covered. PO grepped the call sites this tick: scripts/devteam-review-claim-qa-drain.jq has ZERO deps_satisfied invocations (one comment mention only) and scripts/devteam-review-claim-secondary-drain.jq has ZERO. Only devteam-backlog-claim-incident-lane-consumer.jq and devteam-backlog-claim-supervised-lane-sweep.jq actually call it. So the gap is per-call-site, not manual-vs-auto. The two review-lane drains are split out to their own row FIX-DEVTEAM-QADRAIN-SECONDARYDRAIN-SKIP-DEPS-SATISFIED-BLOCKEDBY; keep this row scoped to the hand-dispatch path and fix its title premise when implementing.")

# ── FOLD 8/9 — the 2 escalated=true bug-escalation envelopes (repeat-after-block) ──
| addnote("FIX-AUDITOR-NOTEBOOK-BARE-COMMIT-EXECUTION-FIDELITY-16-OF-59";
  "REPEAT-OFFENDER-AFTER-BLOCK confirmed (bug-escalation 262ef634, 2026-08-26T10:35:19Z, escalated=true prior_warns=4 threshold=3 outcome=blocked). actor=036ceaf1 (detect-loop session) ran a BARE `git commit -m` for a Tier-2 freshness sweep, about to absorb docs/agent-memory/notebooks/system-auditor.md + docs/data/auditor-tier2-last-healthy.json. TRUE POSITIVE BY CONSTRUCTION (pre-commit exits before the signal write on mode=SCOPED, so the signal existing at all is the mechanism proof) — not re-adjudicated against `git show --stat`. The hook has now started BLOCKING this actor, so this row is no longer cosmetic: it is costing the auditor its commits.")
| addnote("FIX-CHEFDISH-STEP8E-OWNPATHS-EXCLUDES-SYNTHESIS-JSON";
  "REPEAT-OFFENDER-AFTER-BLOCK confirmed (bug-escalation b2d0e3ca, 2026-08-26T08:53:33Z, escalated=true prior_warns=5 threshold=3 outcome=blocked). actor=7a47f7c6 (cowork-team chef-eod) ran a BARE `git commit -m 'feat(unified-agent): EOD dish 2026-08-26 08:45Z'` over exactly this row's two subject paths: docs/agent-memory/notebooks/unified-agent.md + docs/data/unified-agent-synthesis-2026-08-26-chef-eod.json. Direct live evidence that the missing own_paths entry forces the agent into a bare commit; the hook is now blocking it, so the EOD dish is at risk of going uncommitted. Raise priority accordingly.")

# ── CLOSE — CLEAN-CTXBLOAT row satisfied by 98f20610b, live re-probe attached ──
| ( [ .task_board.backlog[] | select(.id == "CLEAN-CTXBLOAT-CRON-COWORK-TEAM-SKILL-242L-OVER-200L-CAP") ] ) as $satisfied
| .task_board.backlog |= map(select(.id != "CLEAN-CTXBLOAT-CRON-COWORK-TEAM-SKILL-242L-OVER-200L-CAP"))
| .task_board.done_verified += ( $satisfied | map(. + {
    status: "DONE_VERIFIED",
    updated_at: $now,
    qa_verified_at: $now,
    verification: {
      raw_probe: {
        tool: "bash: wc -l / wc -c on .claude/skills/cron-cowork-team/SKILL.md",
        args: "wc -l < .claude/skills/cron-cowork-team/SKILL.md ; wc -c < .claude/skills/cron-cowork-team/SKILL.md",
        live_value_observed: "199 lines / 11432 bytes — under BOTH caps (200L / 12000B). Row claimed 242L/14279B.",
        observed_at: $now
      }
    },
    status_note: (((.status_note // "") | if . == "" then "" else . + "\n" end)
      + "[po/triage 2026-08-26T11:20Z] CLOSED — ALREADY SATISFIED by 98f20610b (TASK-CRON-SKILLMD-PROBE-WIRING, agent-father), which split the hot path into a sibling register.md. PO re-probed from disk independently of the reporting signal: SKILL.md 199L/11432B, register.md 167L/11555B, cron-standalone-team/SKILL.md 200L/11728B — all three clear both axes. Dispatching this row would have burned a full claude-manager-helper dispatch on finished work. NOT closed by this and still a REAL open breach: CLEAN-CTXBLOAT-CRON-DETECT-LOOP-REGISTER-12349B-OVER-12000B-BYTECAP (re-measured 173L/12349B this tick, untouched by 98f20610b)."
      + " Also absorbs the 5 stale context_bloat_breach envelopes that drained after the fix landed (39ae4b72, cccecab6, 2337f535, 89a75436, 56edb01c) — stale-on-arrival, zero mints.")
  }) )

# ── MINT 1 — fb-market-poster flow tree has no commit step at all ──
| .task_board.backlog += [{
    id: "FIX-FBMARKETPOSTER-FLOW-TREE-NO-COMMIT-STEP-DELIVERABLE-UNTRACKED",
    title: "fb-market-poster's ENTIRE flow tree contains zero commit instructions — the 09:15Z daily deliverable was left UNTRACKED (not merely uncommitted), one `git clean` from destruction; 5th instance of documented-write-path-absent-from-commit-pathspec",
    owner: "po",
    next_agent: "agent-father",
    status: "BACKLOG",
    zone: "docs/agents/fb-market-poster/",
    priority: "high",
    created_at: $now,
    updated_at: $now,
    dedup_key: "flowdoc-no-commit-step:fb-market-poster",
    origin_signal_id: "cow-20260826T093012-fbcm",
    status_note: "MEASURED BY PO 2026-08-26T11:2xZ, independent of the reporting signal: `grep -rn 'git add|git commit|commit-mutex|own_paths' docs/agents/fb-market-poster/` returns exactly ONE line fleet-wide, and it is init.md:149's debug-logger note saying NOT to commit per line. All four flow files (main.md, daily.md, weekly-prediction.md, weekly-recap.md) contain zero commit instructions. This is a MISSING INSTRUCTION, not a buggy line — the agent runs its slot cleanly, produces a verified post, and simply never commits. Live consequence: docs/social/fb-post-2026-08-26.md was untracked at 11:27Z and had to be rescued by hand in da2f7f80f. AC-1 fb-market-poster's flow gains a commit-mutex step whose own_paths cover docs/social/fb-post-<date>.md AND docs/agent-memory/notebooks/fb-market-poster.md, using the explicit-pathspec-on-BOTH-halves form (`git add -- <paths> && git commit -F <file> -- <paths>`). AC-2 ROOT CAUSE, not the 5th one-off: ship a fleet verifier that, for every docs/agents/*/flow/ tree, cross-checks the agent's DECLARED write paths (init.md knowledge/output + flow-doc write steps) against the commit pathspecs present anywhere in that tree, and fails loud on any declared write path no commit step covers. Opt-IN allowlist only. AC-3 the verifier reproduces the fb-market-poster failure BEFORE the AC-1 fix and passes AFTER. Prior instances of this class: FIX-CHEFDISH-STEP8E-OWNPATHS-EXCLUDES-SYNTHESIS-JSON, FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES, FIX-AUDITOR-NOTEBOOK-BARE-COMMIT-EXECUTION-FIDELITY-16-OF-59, FIX-BROAD-GITADD-LEAVES-STAGED-RESIDUE-DESPITE-CORRECT-COMMIT-PATHSPEC.",
    baseline_pass: "grep -rn 'git add|git commit|commit-mutex' docs/agents/fb-market-poster/flow/ | wc -l  # currently 0, must be >=1 and cover docs/social/fb-post-*.md"
  }]

# ── MINT 2 — QA-drain + SECONDARY-drain never consult blocked_by / deps_satisfied ──
| .task_board.backlog += [{
    id: "FIX-DEVTEAM-QADRAIN-SECONDARYDRAIN-SKIP-DEPS-SATISFIED-BLOCKEDBY",
    title: "Review-Lane QA-Drain and SECONDARY-Drain both dispatch rows whose blocked_by names a still-open row: neither claim script calls deps_satisfied(), so the wall-clock qa_not_before gate is the ONLY gate and a row fires the instant the clock elapses",
    owner: "po",
    next_agent: "developer",
    status: "BACKLOG",
    zone: "cross-service/",
    priority: "high",
    created_at: $now,
    updated_at: $now,
    dedup_key: "devteam-dispatch-gate:review-lane-drains-skip-deps-satisfied",
    origin_signal_id: "rtr-20260826T1105-qadrainignoresblockedby",
    status_note: "MEASURED BY PO 2026-08-26T11:2xZ: `grep -c deps_satisfied` = 0 in BOTH scripts/devteam-review-claim-qa-drain.jq (one comment mention at :46, no invocation) and scripts/devteam-review-claim-secondary-drain.jq. The two backlog-lane pickers DO call it (devteam-backlog-claim-incident-lane-consumer.jq, devteam-backlog-claim-supervised-lane-sweep.jq), which is why the existing row FIX-DEVTEAM-MANUAL-DISPATCH-BYPASSES-DEPS-SATISFIED-GATE asserts in its own title that 'the auto-pickers are covered' — that premise is FALSE for these two call sites and is corrected on that row. LIVE COST: FACTORY-STOCK-extract-vndirect-mapper (review[], blocked_by=OPS-FLEET-REDEPLOY-STOCKPRICE-MACROINDICATORS-CONFIRMED-BINARY-DRIFT, still READY) was QA-dispatched at 10:37Z against the open blocker, burned ~136k subagent tokens over 9.5min, and returned CHANGES_REQUESTED on a DoD clause that is unsatisfiable until the redeploy lands. It was armed to repeat at 14:00Z; PO defused that instance by hand this tick, which is a symptom patch, not this fix. AC-1 both claim scripts thread scripts/lib/devteam-eligibility.jq's deps_satisfied()/effective_depends_on() into their candidate predicate, matching the two backlog-lane pickers. AC-2 a regression assertion in scripts/audits/devteam-dispatch-gate-satisfiability.sh proves a row with an unsatisfied blocked_by is NOT selected by either drain, and IS selected once the blocker reaches DONE_VERIFIED. AC-3 negative control: the fix must not starve rows whose blocked_by names an already-DONE_VERIFIED or non-existent id — a dangling dep id must be reported, not silently treated as unsatisfied forever (see FIX-ORCHSTATE-DEPSFIELD-ACCEPTS-PROSE-SENTENCE-AS-DEP-ID and the live dangling TASK_003 case on FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58).",
    baseline_pass: "grep -c deps_satisfied scripts/devteam-review-claim-qa-drain.jq scripts/devteam-review-claim-secondary-drain.jq  # currently 0 invocations in both"
  }]

# ── MINT 3 — decision-journal cap-roll continuation filename is a lost-update race ──
| .task_board.backlog += [{
    id: "FIX-DECISION-JOURNAL-CAPROLL-CONTINUATION-FILENAME-LOST-UPDATE-RACE",
    title: "Decision-journal cap-roll is a lost-update race: concurrent agents each compute the SAME next continuation filename and create it with a whole-file Write(), so the later writer silently clobbers the earlier one's entry",
    owner: "po",
    next_agent: "developer",
    status: "BACKLOG",
    zone: "cross-service/",
    priority: "high",
    created_at: $now,
    updated_at: $now,
    dedup_key: "decision-journal:caproll-continuation-filename-lost-update",
    origin_signal_id: "rtr-20260826T1106-journalrollwriteclobber",
    status_note: "Two qa sessions hit this within 60 seconds on 2026-08-26 against sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-31.md; the entry was recovered ONLY because the second agent happened to notice, i.e. detection is currently luck. Mechanism: .claude/skills/decision-journal/SKILL.md § Cap Check rolls forward by computing `<base>-<n+1>.md` from the highest existing suffix, then creates it with a whole-file Write — a read-compute-write with no exclusivity, so two agents that read the same highest suffix both target the same new path and the second Write wins outright (not an append merge). The blast radius is already large: 31 continuation files exist for this one sprint's qa journal alone. RELATED, DISTINCT, do not fold: FIX-DECISION-JOURNAL-RESOLVE-PATH-IGNORES-ROLLFORWARD-CHAIN (ready[], path-resolution, not concurrency); GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS (notebooks + Edit collision, different primitive); FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR (when the roll fires, not how). AC-1 the roll-forward acquires exclusivity before it writes — O_EXCL create / mkdir-lock / claim key — and on collision RE-RESOLVES to the next free suffix instead of overwriting. AC-2 an append to an EXISTING continuation file never truncates it (no whole-file Write on a path that already exists). AC-3 a two-writer regression harness reproduces the clobber BEFORE the fix (entry A provably lost) and shows both entries surviving AFTER, on a throwaway fixture, touching no live journal.",
    baseline_pass: "two concurrent journal writers targeting the same over-cap base file both retain their entries; currently the second Write() truncates the first"
  }]

# ── MINT 4 — RC-VERIF grandfather allowlist: 50 ids still marker-blind ──
| .task_board.backlog += [{
    id: "FIX-RCVERIF-50-GRANDFATHERED-IDS-MARKER-BLIND-NO-TRACKING-ROW",
    title: "RC-VERIF's frozen grandfather allowlist still exempts 50 task ids from the DONE_VERIFIED raw_probe gate with no tracking row and no marker — only FU-RAG-DEPLOY-MEMORY was ever removed, so 50 rows can still be certified on zero evidence",
    owner: "po",
    next_agent: "developer",
    status: "BACKLOG",
    zone: "apps/mcp-server/",
    priority: "medium",
    created_at: $now,
    updated_at: $now,
    dedup_key: "rcverif:grandfather-allowlist-50-ids-untracked",
    origin_signal_id: "89a61e5339314b659151d69aeb7276ccfb6b269c1d8f28a847ca1eb72abff0e7",
    status_note: "VERIFIED BY PO 2026-08-26T11:2xZ against apps/mcp-server/src/infrastructure/orchStateSchema.ts: RC_VERIF_GRANDFATHERED_IDS (declared :553) went 51 -> 50 on 2026-08-23 when QA proved FU-RAG-DEPLOY-MEMORY was a still-QA row that had never been certified; the comment at :521 declares the set FROZEN and CLOSED. The other 50 ids were frozen wholesale from a 2026-08-08 jq snapshot and have never been individually re-examined. checkVerificationGate() (:627) skips hasValidRawProbe entirely for any id in the set, across all 7 flat lanes — so each of those 50 can be flipped to DONE_VERIFIED with no verification.raw_probe and the schema will accept it silently. There is no board row, no marker, and no report naming which of the 50 are still open vs already terminal, so nobody can tell an intentional legacy exemption from an unearned pass. AC-1 emit a durable, committed inventory of the 50 ids with each one's CURRENT lane+status, so the exemption surface is auditable instead of implicit in a TS constant. AC-2 the ids that are already terminal AND already carry a real raw_probe are removed from the set (the set may shrink; the :521 comment already forbids growth). AC-3 a check fails loud if any id in the set is flipped to DONE_VERIFIED after this row ships without an accompanying honest_gap_reason or raw_probe — an exemption must be re-affirmed at use time, not inherited forever. AC-4 negative control: the set must NOT be emptied wholesale, and orch-validate.mjs must still parse the live hot file clean after any shrink (RCV-8-a precedent).",
    baseline_pass: "the 50 ids in RC_VERIF_GRANDFATHERED_IDS have a committed lane+status inventory and a use-time re-affirmation check; currently there is neither"
  }]

# ── MINT 5 — no in-repo test-failure baseline, so a deterministic RED is re-derived forever ──
| .task_board.backlog += [{
    id: "CLEAN-MCPSERVER-TEST-FAILURE-BASELINE-ARTIFACT-ABSENT-1839B-REDERIVED",
    title: "No in-repo test-failure baseline artifact exists at all, so a KNOWN, deliberate, deterministic RED (1839b-notebook-protocol, held red by intentional evidence-preservation in docs/agent-memory/notebooks/) is re-investigated from scratch by every verifier",
    owner: "po",
    next_agent: "developer",
    status: "BACKLOG",
    zone: "apps/mcp-server/",
    priority: "medium",
    created_at: $now,
    updated_at: $now,
    dedup_key: "test-baseline:no-inrepo-artifact:1839b-notebook-protocol",
    origin_signal_id: "c7a0bc477d9bddd68d5d3bdcf137716e54f9d28190325d82f59b748ebee8f88e",
    status_note: "VERIFIED BY PO 2026-08-26T11:2xZ: apps/mcp-server/src/__tests__/1839b-notebook-protocol.test.ts exists, and a repo-wide search for any test-failure baseline artifact returns ZERO in-repo files — the known mcp-server full-suite baseline lives only in operator memory, never as a committed artifact. Consequence: a red that is EXPECTED (the test asserts against notebook content that is deliberately preserved as evidence) is indistinguishable from a regression, so every verifier re-derives it, and 'pre-existing / same standing baseline' becomes an unfalsifiable disposition — which the ci_red routing rule explicitly forbids for exactly this reason. AC-1 a committed baseline artifact (path + owning doc pointer) records each known-red test file, WHY it is red, and the condition under which the red must be re-escalated. AC-2 1839b-notebook-protocol is the first entry, naming the evidence-preservation reason. AC-3 the artifact is machine-readable and a verifier can diff a live failure set against it, so a NEW failure is loud while a baselined one is quiet. AC-4 negative control: the baseline must not be a blanket mute — an entry expires or must be re-affirmed, otherwise it becomes the amnesty the ci_red ANTI-AMNESTY FENCE forbids. SECOND, SEPARABLE FINDING carried here for want of a host row: the `observability_defect` type that reported this has NO row in EITHER triage-signals.md routing table and reached PO only through the any-unknown-type to==po fallback. It belongs on FIX-TRIAGESIGNALS-PIPELINEA-UNROUTED-RECURRINGBUG-AND-SPRINTREGISTRY-DANGLING-IDS alongside recurring-bug and sprint_registry_dangling_ids — extend that row's literal list when it ships. It could not be folded there today: that row measures 11738B against ORCH_ROW_PROSE_CEILING_BYTES=12000 and a 331B fold aborted scripts/orch-row-prose-ceiling-check.mjs. That row therefore needs a detail_ref cold-store migration (scripts/orch-backlog-stub.sh) before it can absorb ANY further evidence — treat that as a blocker on its own maintainability, not a formatting nit.",
    baseline_pass: "a committed, machine-readable known-red baseline exists and lists 1839b-notebook-protocol with a reason; currently no such artifact exists anywhere in the repo"
  }]

# ── BOARD FIX 1 — defuse the 14:00Z QA re-burn on FACTORY-STOCK ──
| setfields("FACTORY-STOCK-extract-vndirect-mapper"; {
    next_agent: "developer",
    qa_not_before: "2026-08-27T09:00:00Z"
  })
| addnote("FACTORY-STOCK-extract-vndirect-mapper";
  "RE-ROUTED qa -> developer, qa_not_before pushed 2026-08-26T14:00Z -> 2026-08-27T09:00Z. REASON: the 10:37Z QA cycle already returned CHANGES_REQUESTED with TWO unmet DoD gaps, and re-presenting the row to qa at 14:00Z would have burned a second full QA dispatch on the identical unchanged code. Gap (1) is a pure CODE gap and needs a developer, not a verifier: Tier1VnDirectFetcher.FetchPrice and Tier2VnDirectLegacyFetcher.FetchPrice are still byte-identical apart from the URL string, and no doFetch() exists — ~44L of HTTP plumbing still duplicated. Gap (2) is genuinely gated on blocked_by=OPS-FLEET-REDEPLOY-STOCKPRICE-MACROINDICATORS-CONFIRMED-BINARY-DRIFT (ready[], owner=ops, STILL OPEN), whose own NOT-BEFORE 2026-08-26T09:00Z has already elapsed — it is dispatchable now. CORRECT ORDER: developer closes gap (1) -> ops runs the redeploy -> only then back to qa for the RAW-verify clause. next_agent=developer also makes the row SECONDARY-Drain eligible (that lane picks next_agent!=qa), so it now has a working dispatch path. The underlying picker defect is minted as FIX-DEVTEAM-QADRAIN-SECONDARYDRAIN-SKIP-DEPS-SATISFIED-BLOCKEDBY — this note is the symptom patch, that row is the fix.")

# ── BOARD FIX 2 — unfreeze TASK_002 (BLOCKED is a permanent freeze) ──
| setfields("TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON"; { status: "BACKLOG" })
| addnote("TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON";
  "UNFROZE status BLOCKED -> BACKLOG. status==BLOCKED is a permanent freeze — all eight dev-team pickers gate on POSITIVE status allowlists that exclude it (see ready[] FIX-DEVTEAM-BLOCKED-STATUS-FREEZES-ROWS-NO-CONSUMER-ALLOWLIST-ADMITS-IT), so this row could never be picked and therefore could never reach DONE_VERIFIED. That mattered beyond this row: FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58 gates its own qa re-presentation on this row being DONE_VERIFIED, so the freeze deadlocked the parent too. Nothing about the work changed; only the status token.")

# ── BOARD FIX 3 — parent watchlist row: drop dangling dep, rule, discharge the drain claim ──
| setfields("FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58"; {
    blocked_by: ["TASK_001-WATCHLIST-WRITE-THROUGH-INFRA","TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON"],
    secondary_dispatch_disposition: "handled-inline-by-po-2026-08-26T11:20Z"
  })
| addnote("FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58";
  "PO RULING — SECONDARY-Drain claim discharged in place, NOT dispatched to qa. The drain stamped this row at 11:15:17Z with secondary_dispatch_target=po; PO handled it inline this tick rather than spawn a second concurrent PO session (FIX-DEVTEAM-SECONDARY-DRAIN-PO-DEFAULT-DOUBLE-DISPATCHES-PO-UNDER-TWO-UNGUARDING-LOCK-KEYS). FINDINGS: (a) The DEFECT IS STILL LIVE — `jq '.project.watchlist|length' docs/data/system-map.json` = 34 this tick, against the 58-ticker runtime roster. (b) This row was DEADLOCKED BY CONSTRUCTION on both remaining gates. blocked_by named TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX, which DOES NOT EXIST as a board row in any lane — scripts/po-board-dedup-search.sh returns no task_board path for it; its only occurrences in orch-state.json are inside this row's own blocked_by/children/po_ruling fields plus one prose mention in another row's note, i.e. a self-referential dangling dep that deps_satisfied() can never resolve. REMOVED from blocked_by here. (c) TASK_002 was status=BLOCKED, a permanent freeze no picker admits, so it could never reach the DONE_VERIFIED this row waits on — unfrozen to BACKLOG in this same write. (d) The one genuinely live gate is TASK_001-WATCHLIST-WRITE-THROUGH-INFRA (ready[], owner=ops, next_agent=ops) — it is dispatchable NOW and is the actual critical path. RULING UNCHANGED on substance: do not re-present this parent to qa until TASK_001 and TASK_002 are DONE_VERIFIED; the earlier ruling was correct, it was simply unsatisfiable. Both obstacles are removed as of this write.")

# ── PIPELINE B — close the 3 NEW to==po signal_queue rows ──
| .signal_queue.rows |= map(
    if .id == "rtr-20260826T1105-qadrainignoresblockedby" then
      . + { status: "triaged", triaged_at: $now, triaged_by: "po",
            disposition: "MINTED FIX-DEVTEAM-QADRAIN-SECONDARYDRAIN-SKIP-DEPS-SATISFIED-BLOCKEDBY (backlog, P-high, next_agent=developer). PO widened scope past the reported QA-drain: SECONDARY-drain has the identical gap (0 deps_satisfied invocations in both claim scripts, grep-verified). Live FACTORY-STOCK instance defused by hand the same tick (next_agent qa->developer, qa_not_before -> 2026-08-27T09:00Z)." }
    elif .id == "rtr-20260826T1106-journalrollwriteclobber" then
      . + { status: "triaged", triaged_at: $now, triaged_by: "po",
            disposition: "MINTED FIX-DECISION-JOURNAL-CAPROLL-CONTINUATION-FILENAME-LOST-UPDATE-RACE (backlog, P-high, next_agent=developer). Not folded into FIX-DECISION-JOURNAL-RESOLVE-PATH-IGNORES-ROLLFORWARD-CHAIN or GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS — different primitive (whole-file Write on a raced filename vs path resolution / Edit collision); cross-referenced on the new row instead." }
    elif .id == "rtr-20260826T1116-secondarydrainreadbackfieldmismatch" then
      . + { status: "RETRACTED", triaged_at: $now, triaged_by: "po",
            disposition: "RETRACTED by its own author (router) and independently confirmed FALSE by PO before any row was minted. docs/agents/dev-team/flow/main.md:1214 filters on secondary_claimed_at/secondary_claimed_by — exactly the fields scripts/devteam-review-claim-secondary-drain.jq stamps (:162-163,:174-175) — and scans every lane keeping _lane. The reported claimed_at/claimed_by filter was a hand-typed transcription in the router's own ad-hoc invocation, borrowed from the Incident-Lane Consumer readback whose script does stamp unprefixed fields. FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY (183e1ad8f) stands as correct and complete. NOTHING MINTED. The lane's one real claim this tick (FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58, target=po) was discharged inline by PO." }
    else . end
  )

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po"
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
