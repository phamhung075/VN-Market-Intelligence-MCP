<!-- size-justification: 868L — thin dispatcher; PREFLIGHT script-first gate + JUMP-TO table route Steps 0a/0a.5/3/4 to sub-flows; Steps 0b/1/2 (session-gate, PO triage, planning matrix) too small to extract; full change history in git log. UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK 2026-07-22: +113L — Ready-Lane Consumer + Review-Lane QA-Drain sections (2 new idle-fallthrough pickup lanes, mirroring BOUNDED-1/SLS's existing inline shape; extracting to a sub-flow would break the single linear head-idle fall-through chain BOUNDED-1→SLS→RLC→QA-Drain that makes same-tick `.head`-collision-freedom provable by control-flow inspection alone). FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE 2026-07-23: +1L (868→869) — PROSE-SEQUENCING GATE clause appended to the existing BOUNDED-1 Promote paragraph + predicate-list update (in-place, same lines) + ONE new Reusable Scripts bullet for the new regression verifier's own line; no new section. TE-T33 2026-07-23: +6L (869→875) — the 2 DJ-GATE-1 grep-pattern comments scoped from unbounded `sprint-*-*.md` to `sprint-${SPRINT_ID}-*.md` (matches agent-chaining-protocol.md's already-scoped canonical PATTERN), noting archive/ exclusion by non-recursive-glob construction; in-place, same lines. FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP 2026-07-29: +43L (875→918) — 2 new Reusable Scripts bullets (`scripts/devteam-wrapper-autoclose.jq` + its verifier) for the new Step 4.4 post-cycle candidate; the sub-flow itself lives in post-cycle.md (same placement convention as every other Step-4.x candidate), plus a 1-line Step-4-Covers accuracy fix (4.2/4.3/4.4 were never listed there). FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE 2026-07-30: +66L (918→984) — new Design-Router Sweep (DRS) section inserted in-chain between RLC and Review-Lane QA-Drain (4th WIP≤2 writer, mirrors SLS's inline shape exactly — same single-linear-fall-through constraint as the 2026-07-22 note above applies), RLC/QA-Drain fall-through cross-references updated in place, 1 new Reusable Scripts bullet for the DRS promote+claim pair. FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER 2026-07-30: +28L (984→1012) — SLS Claim paragraph extended in-place (documents the new unstamped-ready[]-row FALLBACK path, same claim script, no new section); new "Lane × Gate Coverage Matrix" subsection under SLS (AC-1, the full lane×sup×po×wrapper resolution table, including the AC-4 epic-wrapper-children cross-reference to Step 4.4 in post-cycle.md); Review-Lane QA-Drain's Claim paragraph gained one AC-3 bullet (documents that the QA-Drain PRIMARY selector was ALREADY sup/po-agnostic by design — no code change there, prose-only clarification so it stops reading as an oversight). No new sub-flow extraction candidate — all three additions are in-place prose/section growth on existing SLS/QA-Drain blocks, same single-linear-fall-through constraint as every prior entry above. FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS 2026-07-30: +17L (1012→1029) — WIP/WIP2/WIP3/WIP4 bash gates re-pointed from a bare `.task_board.in_progress|length` to the shared `wip_in_progress` def (`scripts/lib/devteam-eligibility.jq`, now excludes BLOCKED/TERMINAL_SET rows), in-place on the existing 4 gate lines, no new section; WF-1 BLOCKED-task check gained a flat-lane status lookup (was active_sprints-only, silently missed every BOUNDED-1-class flat-lane row) + a self-healing in_progress[]→backlog[] lane-move, in-place on the existing block. No new sub-flow extraction candidate. FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN 2026-08-01: +55L (1029→1084) — new Review-Lane SECONDARY-Drain section inserted between the Session Gate and Step 1 PO Triage (the head-decoupled anchor point the qadrain-head-slot-decouple brief already identified), mirroring SLS/RLC/DRS/QA-Drain's existing inline promote/claim-script shape but UNGATED on `head.status` and NEVER writing `.head` (own design, brief 2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md §2b) — single-row cap, always falls through to Step 1 (never JUMP TO end), so it cannot break the existing single-linear head-idle fall-through chain above it; 2 new Reusable Scripts bullets (`scripts/devteam-review-claim-secondary-drain.jq` + its shared-lib predicate). No new sub-flow extraction candidate. TE-T02 2026-08-05 (docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-02): -199L (1087→888), -9,609B — 2 of 3 rare/unreachable-on-the-common-tick blocks relocated verbatim (WU-2 guarantee, content moved not deleted), never inline-summarized-away: (a) Step 0-PREFLIGHT-FALLBACK (ERROR-verdict-only) -> preflight-fallback.md; (b) Step 0a-B's per-signal orphan-adoption loop -> orphan-adoption.md, 8-line task_list_held probe kept inline so the common no-orphan-signals tick pays zero extra read cost. (c) BOUNDED-1 Promote bullet's 8 gate-history paragraphs + the NON-CODE/DESIGN next_agent-gap note (~10.6KB) intentionally left UNCHANGED here, still verbatim — the relocation target is scripts/devteam-backlog-promote-bounded1.jq, outside agent-father's commit_zone.allowed (scripts/, same precedent as TE-T12/TE-T14/TE-T21/S1-S20); exact ready-to-apply patch (both halves, to land atomically) supplied via RETURN for a developer to commit. ~130k tok/day estimated saving landed this pass; ~200k/day total once (c) lands. FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND 2026-08-06: +43L (888→931) — WF-1's task_status source array widened to also scan done[]/done_verified[] (in-place, same lines); new WF-1b TERMINAL-LANE check inserted between the existing BLOCKED carve-out and WF-2 (reuses is_terminal_task_status from scripts/lib/devteam-eligibility.jq, idle-resets `.head` on a terminal-lane hit with no lane-move, then jumps to drain-signals — closes the gap where a gateway-less specialist's own done[]/done_verified[] close left `.head` pinned in_progress and re-spawned already-finished work); WF-2's own $row source array also widened to done[]/done_verified[] as documented defense-in-depth (flagged provably-unreachable once WF-1b lands, kept for reorder-safety); WF-2's cross-ref retitled BLOCKED-then-WF-2 to BLOCKED-then-TERMINAL-LANE-then-WF-2. No new sub-flow extraction candidate — in-place growth on the existing single-linear head-idle chain, same convention as every prior entry above. New regression verifier: scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh. FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED 2026-08-06: +78L (932→1010) — rewrote the existing idle-tick Review-Lane QA-Drain block's bash gate + dispatch loop from a hardcoded `qa[]<1` single-claim to the `QA_CAP=10`/`TAKE_BUDGET` batch-claim shape (absorbs FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP's main.md half per architect's 2026-08-06 zone-correction, `docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §1c/§3 — the `.jq`-only script change is a separate developer row on the same file, dispatched in parallel); new Review-Lane QA-Drain — Head-Decoupled Invocation section inserted between Review-Lane SECONDARY-Drain and Step 1 PO Triage (Part 2 of `SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE`, closes the gap where QA-Drain's independent `qa[]` budget was never evaluated on a busy tick), reusing the identical `QA_CAP`/`TAKE_BUDGET`/`claimed_at`-`claimed_by`-correlated batch shape — never the older single-claim illustration from the 2026-07-29 brief, per the 2026-08-06 brief §1b; SECONDARY-Drain's own intro cross-references updated in place (2 sentences) to point at the new section instead of a not-yet-shipped "Part 2"; Lane × Gate Coverage Matrix `review[]` row updated to name both invocation sites sharing one budget. No new sub-flow extraction candidate — in-place growth + one new section on the existing single-linear head-idle/head-decoupled chain, same convention as every prior entry above. FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE 2026-08-06 (same day, measured live 2026-08-06T09:48Z on UC-CRITIC-HOOKS-ENFORCEMENT): +43L (1011→1054) — WF-1's task_status source array widened AGAIN to also scan `ready[]` (APPENDED LAST, after done/done_verified, same order-discipline as the terminal-lane widening earlier today); new WF-1c READY-LANE check inserted between WF-1b TERMINAL-LANE and WF-2 (idle-resets `.head` on a `ready[]`-resident head-pin, NO lane-move — the row is already correctly resident in `ready[]` for BOUNDED-1/SLS/RLC/DRS to pick up — then jumps to drain-signals, BEFORE WF-2 ever evaluates `should_hold` on it), closing the gap where a completing specialist hands a row off into `ready[]` while `.head` still reads `in_progress` (5th instance of the pipeline-resume duplicate-spawn family, `feedback_pipeline_resume_stale_placeholder_duplicate_spawn_risk`); WF-1's/WF-2's inline comments and WF-2's own `$row` source array (also widened to `ready[]`, defense-in-depth, provably unreachable once WF-1c lands) updated to match; WF-2's ordinal retitled BLOCKED-then-TERMINAL-LANE-then-WF-2 to BLOCKED-then-TERMINAL-LANE-then-READY-LANE-then-WF-2; S2 fall-through summary line corrected to name all three carve-outs. No new sub-flow extraction candidate — in-place growth on the existing single-linear head-idle chain, same convention as every prior entry above. `docs/agents/po/flow/supervised-goahead.md` re-synced to the corrected block in the same task (stale line refs fixed, 3-lane array widened to the current 6-lane array) — see that file's own header. AC-4/AC-5 verifier extension is a companion developer row (scripts/ outside agent-father's commit_zone), flagged via a new Reusable Scripts PENDING bullet, not implemented here. FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER 2026-08-07 (po_residual_measurement_20260728's sub-question 1): +0L (1054→1054) — 4 Lane × Gate Coverage Matrix rows corrected in-place (`backlog[]` F/T/F and T/F/F: "RESIDUAL GAP/out of scope" -> BACKLOG-XOR-GAP, folded into `manual-dispatch-sweep.md`'s existing human-gated PO sweep as a 3rd candidate class, no BOUNDED-1/SLS/DRS predicate widened; `ready[]` F/T/F and T/F/F: corrected stale "out of scope" wording — READY-XOR was already live since 2026-07-31, matrix was never updated) + DRS's own "Additional gap flagged" paragraph gained one UPDATE sentence (same fold, DRS's predicate itself untouched). No new section, no sub-flow extraction candidate — pure in-place prose correction/extension on 5 existing lines. Actual predicate/wiring change lives in `scripts/lib/po-manual-dispatch-eligibility.jq` (`is_backlog_xor_gap`, new def) + `docs/agents/po/flow/manual-dispatch-sweep.md` Step 1 (3rd candidate-class branch) + `docs/policies/dev-standards.md` CANONICAL mirror (kept in lockstep) — none of those are this file. FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION 2026-08-08 (Part 1 — rotation, `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §2, schema/utilities `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` DONE_VERIFIED): +53L (1054→1107) — replaced the fixed-priority BOUNDED-1→SLS→RLC→DRS→QA-Drain(idle-tick)→Step1 sequential fall-through with an aged round-robin: new § Idle-Tick Rotation Selection inserted at the exact point the old chain began (Step 0b's head-idle fall-through), computing `$SELECTED` over 6 candidates (`bounded1`/`sls`/`rlc`/`drs`/`qa_drain`/`step1_triage` — 6, not the brief's original 5, because DRS was added to the chain 2026-07-30, after the brief/schema shipped; selection + stamp-write INLINED here rather than calling the shipped `rotation_selected($doc)`/`devteam-idle-chain-stamp.jq` verbatim, both of which still hardcode the stale 5-id set and live in `scripts/`, outside agent-father's commit_zone — fast-follow flagged in both the new section and the Reusable Scripts entry to reconcile the shared library and drop the inline duplicate); each of the 5 promote/claim sections' own bodies is byte-unchanged, only their gating prose changed from "reached ONLY when [predecessor] declined" to "reached ONLY when `$SELECTED == \"<id>\"`" (total mutual exclusion — a STRICTER same-tick `.head`-single-writer guarantee than the old sequential-fall-through, provable by control-flow inspection alone, per the task's hard constraint); Step 1 PO Triage gained a rotation gate at its EXISTING physical location (unmoved — must stay reachable from Step 0b's busy-tick bypass paths, which never evaluate `$SELECTED`), skipping silently on a tick where a different id won; Session Gate gained one clarifying paragraph (§2.5) — its truly-idle predicate was already lane-independent, no logic change. Review-Lane SECONDARY-Drain and the QA-Drain Head-Decoupled Invocation site (both added after the 2026-07-25 brief, both UNCONDITIONAL/every-tick by design, neither competing for the idle-tick dispatch slot) are explicitly OUT of rotation's scope and byte-unchanged. Companion row `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` (depends on this row + `FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN`) covers Part 2 — `pending_triage_inbox[]` durability + Step 1's durable-inbox read/clear (§3.2) replacing the in-memory `pendingSignals[]` build this task deliberately left untouched; until that row + P2A land, a tick where `step1_triage` is NOT selected still destructively drains `docs/signals/*.json`/dashboard rows into an in-memory-only array per the PRE-EXISTING (unfixed) drain-signals.md ordering — an accepted, flagged interim window inherent to landing this as 3 sequential dependent rows on `main` with no feature branches, not a regression this row introduces net-new (today's fixed chain already reaches Step 1 far less than every tick whenever BOUNDED-1/SLS/RLC/DRS/QA-Drain has eligible work). FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION 2026-08-09 (Part 2 — durable-inbox consumption, `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §3.2, companion to P1A-MAIN-ROTATION above + `FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN` DONE_VERIFIED): +30L (1107→1137) — Step 1 PO Triage's `pendingSignals[]` argument switched from the tick-local in-memory array Step 0a's drain builds (informational-only since P2A landed) to a direct read of `.dev_team_idle_chain.pending_triage_inbox` (brief §3.2), gated by a no-op short-circuit (durable inbox AND both report sources empty → `JUMP TO end` before the S3 claim, never spawning PO just to have it return `NOTHING`) inserted before the pre-existing S3 dispatcher-wrap; after a successful PO spawn, a new `orch-apply.sh`-gated clear write subtracts exactly the consumed `envelope_id`s from the durable inbox (never a blind `= []`, brief §3.2's defensive-against-concurrent-append guard) — duplicate-safe-not-loss-safe on a mid-flight crash, per the brief's own deliberate asymmetry. One new cross-reference paragraph clarifies the §2.3 stamp write is NOT duplicated here — it already ran, unconditionally, before dispatch, in the Idle-Tick Rotation Selection section's own stamp block whenever `$SELECTED=="step1_triage"` won the tick; on the busy-tick bypass path (`$SELECTED` unset) no stamp is written for `step1_triage` either, unchanged pre-existing behavior. No new script file — the read/no-op/clear logic is inlined directly in this section (same precedent as the rotation selection/stamp jq immediately above), since brief §6's file list names no standalone script for this call site. Session Gate (§2.5, Step 0b, this file's own separate `pendingSignals` reference) and `docs/agents/po/flow/main.md`'s own "Receives: `pendingSignals[]` from Step 0a" line are DELIBERATELY left untouched — out of this task's explicit scope (board row context: "Step 1 — PO Triage's own call site (§3.2)" only) — flagged as a residual gap in the decision journal, not silently fixed here. No new sub-flow extraction candidate — in-place growth on the existing Step 1 section, same convention as every prior entry above. FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR 2026-08-14: +15L (1137→1152) — the existing Durable-inbox CLEAR block (unchanged jq filter, same `consumed_ids` computation) now ALSO exports `consumed_ids_csv` and passes it as `ORCH_APPLY_DECLARED_INBOX_TRIAGED` to `orch-apply.sh` — `scripts/orch-conservation-check.mjs` dropped `pending_triage_inbox` from its `signal_total` magnitude-ratio floor (a drain-to-zero queue, not an accumulating log — a legitimate full clear was tripping the same 0.5-ratio circuit-breaker built to catch accidental mass-deletion, with the only bypass, `ORCH_APPLY_ALLOW_SHRINK`, explicitly forbidden to this caller, forcing PO/dev-team into artificial sequential sub-batching, reproduced live twice: 29 envelopes 2026-08-11, 248 envelopes 2026-08-14) and replaced it with an independent, never-bypassable per-envelope row-identity guard on this same array — this is that guard's SOLE sanctioned declaration site (the only call site that legitimately removes inbox entries at all). No new section, in-place comment + 2-line code addition on the existing block. FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE 2026-08-14 (per architect blueprint `docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md` §5, applied verbatim by agent-father): +78L (1152→1230) — Step 0b's entry-gate age clause (`head.updated_at < 24h`) dropped (WF-1/1b/1c/WF-2 never referenced it in their own bodies, zero-byte-diff behavior change inside those blocks); new WF-3 RESUME-ATTEMPT-BOUND check inserted after WF-2's supervised-hold carve-out — `.head.resume_attempts`/`.head.last_resume_at` (new fields, both schemas `.passthrough()`, no schema change needed) increment once per genuine S2 resume-respawn, 3-attempt bound escalates the row to `BLOCKED` + `hold_reason` + `resume_attempt_bound_exceeded_at/_by` (new pair — deliberately not `blocked_by`, already schema-meaningful as a reverse dependency edge) and idle-resets `.head` in the same write; new WF-4 STALE-AGE check inserted after WF-3, replacing the deleted 24h stale-crash sibling branch — 2h threshold (4x measured p100 close-time, 2x the existing `task:<id>` 1h lock TTL backstop), keyed off the `in_progress[]` row's own `claimed_at` (never `.head.updated_at`, which auto-refreshes on WF-3's own write and would silently self-defeat), corroborated against `git log --since=<claimed_at> --grep=<task_id>` before resetting (match found → do NOT reset, real progress landed but lane/`.head` haven't caught up yet — the adjacent 2026-08-05 write-coherence gap, explicitly out of scope, see `FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN`); both new checks fire BUG-channel Telegram naming task id + pin duration; S2 dispatcher-wrap gained a 6-line increment write on the successful-claim path (before `Agent(...)`, after `outer_claim.claimed` confirms true) — the sole site capable of looping indefinitely on the same `active_task_id`, so the sole site needing the counter. No new sub-flow extraction candidate — in-place growth on the existing single-linear head-idle chain, same convention as every prior entry above. Companion schema typing (`HeadSchema.resume_attempts`/`last_resume_at`) + a synthetic-fixture regression verifier are optional, non-blocking `developer`-zone follow-ups (brief §7/§8), not spawned this cycle — PO to mint separately if wanted. FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND 2026-08-14 (same family, same day, 4th/5th instance of the pipeline-resume duplicate-spawn class; agent-father triage, `docs/agent-memory/decisions/sprint-TRIAGE-STALE-HEAD-FAMILY-20260814-po.md`): +43L (1233→1276) — WF-1's task_status source array widened AGAIN to also scan `review[]`/`qa[]` (APPENDED LAST, after ready[], same order-discipline as the terminal-lane and ready-lane widenings); new WF-1d REVIEW-LANE check inserted between WF-1c READY-LANE and WF-2 (idle-resets `.head` on a `review[]`/`qa[]`-resident head-pin observed as `task_status` REVIEW/QA/DEGRADED, NO lane-move — the row is already correctly resident where Review-Lane QA-Drain/SECONDARY-Drain expect it — then jumps to drain-signals, BEFORE WF-2 ever evaluates `should_hold` on it; carries an inline AC-6 negative-control sentence asserting `in_progress[]` rows are unaffected), closing the gap where a gateway-less specialist self-lane-moves its own finished row into `review[]`/`qa[]` while `.head` still reads `in_progress` (live occurrences: commit 969acbcc7 dev-rag-service, commit 95e07eca5 dev-mcp-server, both hand-corrected by the router); WF-2's own `$row` source array was found ALREADY carrying review[]/qa[] (pre-existing, undocumented) — no functional change there, only the matching defense-in-depth/provably-unreachable-once-WF-1d-lands comment added, same documentation convention as the done/done_verified and ready widenings; WF-2/WF-3/WF-4 ordinal headers bumped (FOURTH→FIFTH, FIFTH→SIXTH, SIXTH→SEVENTH) and WF-2's cross-ref retitled BLOCKED-then-TERMINAL-LANE-then-READY-LANE-then-WF-2 to BLOCKED-then-TERMINAL-LANE-then-READY-LANE-then-REVIEW-LANE-then-WF-2; S2 fall-through summary line corrected to name all four inert-lane carve-outs (was three). No new sub-flow extraction candidate — in-place growth on the existing single-linear head-idle chain, same convention as every prior entry above. `docs/agents/po/flow/supervised-goahead.md` NOT touched this task — its `$row` array already mirrors WF-2's (unchanged) 6-lane array; only WF-2's own in-file comment changed, which that file does not duplicate. AC-7 verifier extension (positive+negative control for `scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh`) is a companion developer row — scripts/ is outside agent-father's commit_zone.allowed — flagged via RETURN, not implemented here. FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE QA-fix 2026-08-22 (QA CHANGES_REQUESTED 2026-08-14 on the original 08-14 WF-3 landing above; architect corrected the blueprint's own §5c code sample 2026-08-22, `docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md` §3/§5c, agent-father applied the corrected patch verbatim): +21L (1276→1297) — WF-3's escalation jq (main.md, inside the `resume_attempts>=3` branch) now lane-moves the row OUT of `in_progress[]` INTO `backlog[]` in the SAME write that flips it `BLOCKED` (CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c), `execute-tier.md:116`), mirroring WF-1's own BLOCKED-task check (`main.md:331-338`) — the original 08-14 sample flipped `status` in place inside `in_progress[]` without moving it, stranding a bound-exceeded row forever since WF-3's own `.head` idle-reset (same write) permanently disables WF-1's re-trigger condition (`.head` must still name the row); also added the missing `(<Xh Ym>)` duration parenthetical to WF-3's BUG-channel telegram (§4's signal-shape spec always specified it, the original sample omitted it, WF-4's sibling message already had it). No new section, in-place growth on the existing WF-3 code block only; WF-4/S2 untouched. FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ 2026-08-22 (po triage cited `triage-signals.md:7` to decline the CLEAR on an earlier pass this same session; 90 minutes later the router's own direct-to-PO dispatch prompt — `.claude/skills/dispatch/SKILL.md`'s "queue / triage" row, which never runs this Step 1 body at all — instructed PO to do the CLEAR instead, contradicting `triage-signals.md:7`; a 64-envelope backlog including an already-correctly-dispositioned 08-15 `ci_red` had regrown because neither doc's stated owner was reachable on every invocation path; agent-father resolution, `docs/agent-memory/decisions/triage-20260822T1927Z-po.md`): the Durable-inbox CLEAR write is REMOVED from this call site — dev-team's own Step 1 physically cannot run on the router-direct dispatch path, so a dev-team-owned CLEAR can never be unconditional; ownership moves to `docs/agents/po/flow/triage-signals.md` § Step 0-SIG (PO is the only party present on both invocation paths). This section's own durable-inbox read is kept, re-scoped to gating the no-op short-circuit + convenience-pass only, no longer PO's authoritative source. `docs/agents/po/flow/main.md`'s stale "Called from: dev-team Step 1" / "Receives: pendingSignals[] from Step 0a" lines (flagged as a residual gap by `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` 2026-08-09 above and left untouched then) are corrected in the same task. `docs/agents/dev-team/flow/drain-signals.md`'s cross-reference and `docs/policies/dev-standards.md`'s CANONICAL pointer (both named this file's Step 1 as the CLEAR site) are re-pointed to `triage-signals.md` in the same task — no functional change to either file's own logic. FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW 2026-08-25 (agent-father, per architect brief docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md §4d/§5; sibling row FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS DONE_VERIFIED commit cd0039432, followed verbatim, not re-derived): +88L (1279→1367) — new § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation section inserted at the Session-Gate→Step-1 anchor, FIRST of the three unconditional blocks there (ILC → SECONDARY-Drain → QA-Drain Head-Decoupled → Step 1) per the brief's explicit ordering — wires the already-shipped scripts/devteam-backlog-claim-incident-lane-consumer.jq call site (independent INCIDENT_CAP=2 budget, batch-claim, BGFAN-1 fan-out, UNCONDITIONAL/no rotation gate, single invocation site only — unlike QA-Drain's two-site shape, because per brief §4d ILC strictly dominates a rotation-gated site so a second site would be redundant); Review-Lane SECONDARY-Drain's own intro sentence updated in place ("after the Session Gate above" -> "after the Incident-Lane Consumer above") since it is no longer physically first at this anchor; one new Reusable Scripts bullet; § Invariants gains one clause naming INCIDENT_CAP alongside the existing WIP≤2 and qa[]<QA_CAP so all three budgets are visible in one place. TWO PRE-EXISTING NEIGHBOUR-SECTION DEFECTS DELIBERATELY NOT COPIED HERE (live-caught the same tick this row was dispatched, out of this row's own scope to retrofit, flagged in the RETURN for a follow-up row): (1) this section's own readback scans EVERY `.task_board` lane generically (`.task_board | to_entries[] | select(.value|type=="array") | ...`), never names one lane by prose assumption — Review-Lane SECONDARY-Drain's own `.task_board.review[]`-only readback can silently miss a `done[]`-origin pick its own claim script's stated `review[] UNION done[]` candidate set produces; (2) this section's own spawn text derives status/lane/claimed_by from the actually-picked row, never a hardcoded literal — SECONDARY-Drain's own spawn text hardcodes a false "status=REVIEW, branch:null" premise for any non-review-origin pick. FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY 2026-08-25: +14L (1369→1383) — (agent-father; follow-up row to the two neighbour-section defects flagged by FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW immediately above, reproduced live this tick per the dispatching row's own repro, `task_board.backlog[485]`): Review-Lane SECONDARY-Drain's readback (§ Review-Lane SECONDARY-Drain) widened from a `.task_board.review[]`-only scan to the same generic all-lane scan ILC already uses (`.task_board | to_entries[] | select(.value|type=="array") | .key as $lane | .value[] | select(...) | . + {_lane: $lane}`, copied not reinvented) — closes the exact gap ILC's own header already named: a `done[]`-origin pick (the claim script's own documented `review[] UNION done[]` candidate set legitimately produces one) stamped the board correctly but the old `review[]`-only readback returned empty, so `picked` silently stayed unset and the row was never dispatched, no error surfaced. Spawn text (AC-7) no longer hardcodes "stale review[]-lane row (status=REVIEW, branch:null)" / "Read its status_note/review_note fields directly" — both now derive from the actually-picked row (`picked._lane`, `picked.status`), and the note-field instruction no longer assumes `status_note`/`review_note` exist (a `done[]`-origin pick may carry neither). Claim script (`scripts/devteam-review-claim-secondary-drain.jq`) is BYTE-UNCHANGED — its `review[] ∪ done[]` candidate set was already correct and deliberate per its own header; this was a caller-only defect. No new section, in-place edit of the existing readback/dispatch code block only; this lane's "never writes `.head`" property and the single-linear head-idle fall-through chain are both unchanged. FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY AC-6 2026-08-25 (agent-father, PO ruling `po_ruling_ac4_ac6_20260825` — AC-6 upgraded 1 clause -> 3 on PO's own 16:05Z read-only pipeline replay, which proved the pipe is GREEN AT HEAD, so the board's own zero post-fix stamps could no longer be assumed "nothing eligible"): +48L (1383->1431) — closes the silent-failure mode in this same SECONDARY-Drain bash block, no new section. (i) the `| bash orch-apply.sh || true` trailing swallow is REMOVED; `apply_exit=$?` now captures the real exit code, classified into two distinguishable printf lines — CAS-ABORT (exit 2, benign peer-write collision) vs REAL-ABORT (any other nonzero) — both naming `candidates_pre_pipe`. (ii)/(iii) a NEW read-only pre-pipe candidate count (`CANDIDATE_COUNT`, `include "scripts/lib/devteam-eligibility"` + the SAME `effective_next_agent` predicate the claim script itself already includes — reused, not re-derived or duplicated, same shape as the Incident-Lane Consumer's own `INCIDENT_WIP` pre-check) is the only way to tell "genuinely nothing eligible" apart from "something was eligible but the readback still came back empty" — an exit-0 apply and an empty readback are indistinguishable on their own. An empty `picked` now prints exactly one of NOTHING-ELIGIBLE (0 candidates pre-pipe) or STAMPED-BUT-NOT-READ-BACK (>=1 candidate pre-pipe, exit 0, readback still empty — an anomaly to investigate, never silently assumed benign); a nonzero `apply_exit` is already classified above and does not also print a redundant readback line. Sibling row FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-NO-RETRY (backlog, agent-father) carries the identical `|| true` swallow on the OTHER lane (§ Review-Lane QA-Drain — Head-Decoupled Invocation's own orch-apply pipe) — cited, deliberately NOT fixed here (outside this row's own `files` scope); this exit-classify + candidate-count shape (no retry loop — this lane's single-row-per-tick + always-falls-through design already tolerates a miss next tick) is meant to be directly adoptable there too, not reinvented. Read-only end-to-end verified against a scratch copy via `ORCH_APPLY_LIVE_FILE_OVERRIDE` before commit: exit-0/candidate-found path leaves `picked` non-empty with zero extra log lines (unchanged behavior); the exit-code/candidate-count classification logic itself unit-verified for all 4 branches (CAS-ABORT, REAL-ABORT, STAMPED-BUT-NOT-READ-BACK, NOTHING-ELIGIBLE) plus the success no-op case. AC-4 is NOT touched by this change (evidence-gated, owned by QA/PO, out of this row's implementable scope). FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW 2026-08-25 (router hand-dispatch — agent-father is off the DRS-ratified allowlist, PO ruling `triage-20260825T1815Z`; live incident: ILC dispatched `FIX-PDFX-TESSERACT-CONFIDENCE` 15:35:59Z, `resume_key` `ttl_seconds:3600` expired 16:35:59Z, agent finished 16:43:49Z, the 16:37Z tick fell inside the 7m50s unguarded window with every in-flow guard correctly declining and no duplicate spawning only because the router held out-of-band knowledge the process was alive): +~61L (1431→1492) — closes the root cause (neither S2's own resume-claim nor ILC's own dispatch-claim ever renews `resume_key` once claimed, so its 3600s TTL runs as wall-clock-since-dispatch rather than time-since-last-activity, inverting from duplicate-BLOCKER to duplicate-ENABLER on any specialist running past 60 minutes) at BOTH named call sites (AC-3): § Step 0b S2 dispatcher-wrap's and § Incident-Lane Consumer's own `if not outer_claim.claimed:` (peer-held) branches now each fire ONE `task_heartbeat` renewal, `owner_client_session` sourced VERBATIM off `outer_claim.current_holder` from the SAME call (never guessed, never `$CLAUDE_CODE_SESSION_ID` of the renewing tick — Rung-A-honest, `taskHeartbeatTool.ts`), `ttl_seconds` held at the pre-existing 3600 (AC-4: never raised — raising only moves the cliff, per the row's own explicit trap warning). AC-1 (cannot expire while `.head` shows `in_progress` on the same `active_task_id`): satisfied by construction — every subsequent tick that reaches either branch renews on a ≤30-min cadence, ≥2x inside the 60-min TTL, for as long as WF-1..WF-4 above (all BYTE-UNCHANGED) keep declining to reset `.head`. AC-2 (crash recovery preserved AND proven, not asserted): proven by control-flow inspection, not empirical 60+min execution (infeasible for this row to run live) — a live long-running agent's guard is renewed every reachable tick (Half A); a genuinely dead dispatcher (cron itself stops ticking) renews nothing, so `resume_key` still organically lapses on its own unchanged 3600s TTL exactly as before this fix, and WF-3/WF-4 (untouched) remain the sole, independent authority that eventually resets a truly-abandoned `.head` pin (Half B) — this keepalive step never resets `.head`, never spawns, and cannot override either backstop. AC-5: `scripts/audits/devteam-dispatch-gate-satisfiability.sh`'s own methodology (replay REAL `.jq` claim scripts against a board fixture) structurally cannot exercise a `call_tool(task_claim/task_heartbeat)` sequence (no `.jq` file backs either call site) — stated explicitly, new "PENDING" Reusable-Scripts bullet added with a ready-to-apply companion-script draft (SYNTHETIC-fixture, stubbed-tool-response harness), not applied here (`scripts/` outside agent-father's `commit_zone.allowed`, same TE-T02/S1-S20 split precedent used throughout this header). New Invariants bullet documents the guard; no schema change (`TaskSchema`/`HeadSchema` already `.passthrough()`); zero-byte change to WF-1/1b/1c/1d/2/3/4, the Idle-Tick Rotation Selection, and every other lane's own claim logic — this task's own scope is exactly its two named call sites, no more. FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW AC-6 CORRECTION 2026-08-25 (+52L, 1492->1544): PO ruled the first cut's AC-2 sign-off FALSIFIED, not merely unproven — the keepalive renewed `resume_key` on `claimed:false` forever without ever advancing `.head.resume_attempts` (that counter incremented ONLY on the successful-claim branch), so WF-4's own named safety net ("S2's own outer_claim peer-held check") could no longer fail open: a dead-but-once-committed specialist (satisfying WF-4's git-log-grep corroboration) stayed permanently stranded in `in_progress[]` instead of self-healing via WF-3's pre-existing 3-attempt bound. Fix (PO's own "cheapest, most surgical" option): S2's renew branch now increments `.head.resume_attempts` too, sourced from OUTSIDE the coordination.db lock it renews — never circular — restoring WF-3's reachability without reverting the keepalive itself (the pre-fix duplicate-spawn window was real and stays closed). ILC's own peer-held branch is deliberately NOT symmetrically changed — reasoned and stated inline there: that branch is reachable at most once per row (ever), never a repeating per-tick loop the way S2's is, and any row it dispatches that also wins `.head`'s narration slot is covered by the S2-side fix from its second tick onward. WF-4's in-file comment corrected in the same change (AC-8) to stop describing the now-bounded peer-held check as a bare lock-presence safety net. FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE + FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA 2026-08-26 (developer, architect brief docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md §1a/§3): +22L (1550->1572L) — not-before time-gate prose added to the Review-Lane QA-Drain Claim bullet (both call sites) + SKIP-branch revert wired into both QA-Drain SKIP branches (scripts/devteam-qadrain-skip-revert.jq, new) + one new Reusable Scripts bullet; in-place, same sections, no new headings. FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW QA-rework 2026-08-26: +2L (1572->1574L) — corrected 3 prose instances (ILC UNCONDITIONAL paragraph, ILC spawn-context string, Invariants INCIDENT_CAP bullet) that falsely claimed `INCIDENT_CAP` sits outside/never competes with the shared `WIP≤2` slot; `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) has NO `claimed_by` filter and DOES count incident rows — a deliberate asymmetry the jq file's own comment already documents (L153-157); description-only fix, no behavior/script change; QA CHANGES_REQUESTED remediation, in-place, same sections, no new headings. -->

<!-- BGFAN-1: ALL Agent spawns from THIS dispatcher MUST use run_in_background=true. Canonical rule + rationale → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate. Background ≠ parallel: gated chain (po→ba→…→qa) still serializes on completion notification; independent tier tasks fan out concurrently. Commit-mutex serialization unchanged. -->
# Dev Team — Cron Orchestration Flow (Thin Dispatcher)

## Team Boundary (Sprint 2026-05-31 — expanded)

This flow may spawn any INDIVIDUAL agent. Taxonomy:

- **dev-core:** po, ba, architect, pm, developer, qa, fixer
- **dev-zone:** dev-mcp-server, dev-api-gateway, dev-stock-price, dev-technical-analysis, dev-macro-indicators, dev-kinh-dich, dev-alert-engine, dev-pdf-extractor, dev-rag-service, dev-frontend, dev-mainserver-crawls, dev-vps-crawls, dev-news-fetch
- **ops** lane (ops, ops-mainserver-fetch, ops-vps-fetch) — spawned on infra/fetch incident
- **maintenance** lane (claude-manager-helper, code-janitor, agent-father, agents-architect, system-auditor, cowork-refactory-expert, idea-forge) — on-demand only; mutex-wrap REQUIRED (see below)
- **cowork** lane (news-scout, market-watcher, bctc-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, fb-market-poster, qa-responder, market-analyst, refine_bctc_md) — on-demand only; mutex-wrap REQUIRED (see below)
<!-- roster mirrors docs/data/system-map.json .project.agents[]; re-sync here when roster changes -->

**NEVER spawn the `cowork-team` or `dev-team` dispatcher flows** — those are team dispatchers; spawning them here recurses infinitely. This guard is non-negotiable.
<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check. Individual agents are safe; dispatcher FLOWS are not. -->

**Cross-team work** (cowork agent reports a code bug): write a signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md`. This remains the primary channel. Direct on-demand cowork spawn is ADDITIONAL (for cases where dev-team needs immediate cowork output after a code change).

**On-demand spawn of maintenance/cowork agents — mutex-wrap REQUIRED:**
Before spawning any agent from the maintenance or cowork lanes, claim a lock keyed on the agent id to prevent double-running a concurrent cron instance:
```
agent_spawn_key = "task:on-demand:" + agent_id + ":" + $(date -u +"%Y%m%d")
# SAFE-JSON: payload built as a structured object — NEVER interpolate agent_id into a /bin/sh string.
# INVARIANT (DRAIN-INJECTION-SAFE): no signal/payload/DASHBOARD field may appear in a shell command line.
# Safe patterns: (a) jq --arg for bash SQL/JSON steps; (b) structured object passed to call_tool; (c) sqlite3 db < file.
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              agent_spawn_key,
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600,
  payload:              "{\"site\":\"on-demand\",\"spawning\":\"" + agent_id + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
})
if not outer_claim.claimed:
  log "[dev-team] SKIP on-demand " + agent_id + " — cron holds lock (" + outer_claim.current_holder.owner_agent + ")"
  send_telegram(channel="work", message="[dev-team] on-demand " + agent_id + " SKIP — cron holds lock")
  # fall through; do NOT spawn
else:
  try:
    Agent(agent_id, context..., run_in_background=true)   # (background) — BGFAN-1
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: agent_spawn_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
```
Skill ref: `.claude/skills/task-lock/SKILL.md` § Dispatcher-Wrap Pattern.

## Input
`read_telegram_reports(status="new")` | `list_unresolved_reports()` | `docs/data/orch/orch-state.json` `.task_board` | git log (last 30 commits) | `git branch`

## Output
Tasks executed → `docs/data/orch/orch-state.json` `.task_board` updated → WORK notified

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Dispatch — Fluid JUMP TO

JUMP-TO convention → skill: `.claude/skills/jump-to/SKILL.md`

| Spawn context | JUMP TO | Detail file |
|---|---|---|
| Cold start / cron tick | `preflight` | inline below |
| HEAD.lock cleared / preflight pass | `drain-signals` | `drain-signals.md` (includes Step 0a-D: DASHBOARD.md cross-team drain) |
| CI probe (after drain-signals) | `ci-health-probe` | `ci-health-probe.md` |
| Pipeline resume (`in_progress`) | `pipeline-resume` | inline below |
| FIX / direct task | `execute` | `execute-tier.md` |
| Post-execution verification only | `post-cycle` | `post-cycle.md` |
| Empty signals + empty TASKS.md + no reports | `session-gate` | inline below |

---

<!-- jump:preflight -->
## Step 0-PREFLIGHT — Dev-team Tick Preflight (TOKEN-ECONOMY-TICK-PREFLIGHT WU-2)

Run the deterministic preflight script FIRST and capture its one-line JSON verdict — this
replaces the LLM-narrated presence/SF-1/fire-election chain below on the common RUN/SKIP path
(risk notes R6/R7/R8, `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md`). Self-arm (cron-detect-loop
re-registration) is **no longer read from here** — `CronCreate`/`CronList`/`CronDelete` are Claude
Code CLI-native tools, unreachable from a curl-based script, so self-arm now fires FIRST, on every
tick (RUN and SKIP alike), from the `.claude/skills/cron-detect-loop/SKILL.md` Job 1 `CronCreate`
`prompt:` text itself — before this script even runs.

```bash
VERDICT_JSON=$(bash "$PROJECT_ROOT/scripts/agents-flow/dev-team-tick-preflight.sh")
PREFLIGHT_RC=$?
VERDICT=$(echo "$VERDICT_JSON" | jq -r '.verdict')
```

Script SSOT: `scripts/agents-flow/dev-team-tick-preflight.sh` (uses shared
`scripts/agents-flow/mcp-call.sh`). Requires `$CLAUDE_CODE_SESSION_ID` in the environment.

### JUMP-TO table (preflight verdict)

| Verdict | Action |
|---|---|
| `RUN` | SF-1 (`dev-team-cron-singleton`, TTL=5400) + fire-election (`cron:dev-team:<tick>`, TTL=600) locks are HELD by this session. **Do NOT re-run presence/SF-1/fire-election below** — JUMP TO `gcc-preflight` (GCC-PREFLIGHT read + HEAD.lock/worktree-GC), skipping the START telegram/self-arm/presence/SF-1/fire-election steps entirely (already satisfied by the script). Both locks stay held for the rest of the dispatch body — release-at-end (`telemetry`/`jump:end`) is unchanged. |
| `RUN-IDLE` | Same precondition as `RUN` — SF-1 + fire-election locks are HELD by this session; Step 5 of the script only evaluates idle-emptiness after winning both. `docs/signals/*.json`, `signals.db` freshness, `signal_queue` NEW rows, and `task_board.active_sprints` are ALL empty/fresh (`$VERDICT_JSON.detail` names the checked fields). Mirrors cowork's silent-release (`_step8_silent_release`, `scripts/agents-flow/cowork-tick-preflight.sh` lines 74-105): emit last state (`log "[dev-team] RUN-IDLE — " + $VERDICT_JSON.detail`) + release both locks + **zero commit**. Do NOT run `gcc-preflight` (no HEAD.lock/worktree-GC) and do NOT JUMP TO `drain-signals` (no signal drain, no board write, no `chore(signals): drain + prune` commit) — set `FIRE_TICK=$(jq -r '.tick' <<< "$VERDICT_JSON")` so the existing `jump:end` SF-1/fire-election release logic fires for both locks, then JUMP TO `end` directly. |
| `SKIP` | Done. Script already sent the `work`-channel telegram and preserved R7 lock semantics: SF-1-claim-failed → nothing released (never held it); fire-election-lost-after-SF-1-won → SF-1 released. EXIT — no further reads needed. |
| `SKIP-WIDENED` | CADRAT-5 extended-idle outer-poll widening (docs/architecture-briefs/2026-08-04-cadence-rationalization.md §8 item 6). **No lock was ever claimed this tick** — the script short-circuits BEFORE presence/SF-1/fire-election, evaluated via the SAME idle-check predicates `RUN-IDLE` uses (re-read fresh, never stale) once the persisted consecutive-RUN-IDLE counter (`docs/data/dev-team-idle-widen-state.json`) has reached its threshold AND `calendar_status` (`docs/data/pressure-state.json`, ENUM-gated) is `weekend` or `holiday`. Done — no further reads needed, zero telegram (unlike `SKIP`, this is not a peer collision, just nothing to do during a confirmed-quiet stretch). Cron expression `7,37 * * * *` is unchanged — this is a per-tick suppression, not a schedule edit. |
| `ERROR` | Script hit a transport/malformed-response/local-guard failure (`$VERDICT_JSON.detail` has why — lock state may be undefined). JUMP TO `preflight-fallback` below (relocated to its own sub-flow file, never deleted — TE-T02) — read from there as if the script never ran. |
| *(none of the above — `$VERDICT` is empty/unset)* | `VERDICT_JSON` was not a single valid JSON document — `jq -r '.verdict'` on malformed/non-JSON input prints nothing, so `$VERDICT` matches NONE of the RUN/RUN-IDLE/SKIP/SKIP-WIDENED/ERROR strings above and is otherwise undefined caller behavior. Historically caused by FIX-DEVTEAM-PREFLIGHT-STEP55-COLDEVICT-STDOUT-LEAK-CORRUPTS-VERDICT (Step 5.5's real cold-eviction call leaking `orch-cold-evict.sh`'s multi-line progress output onto this script's stdout ahead of the JSON verdict — fixed at the source 2026-08-01, kept here as a defensive fallback for any future regression of the same shape). Treat identically to `ERROR`: JUMP TO `preflight-fallback` below — lock state is undefined, the fallback repairs via re-claim. |

---

<!-- jump:preflight-fallback -->
## Step 0-PREFLIGHT-FALLBACK — Original Presence/SF-1/Fire-Election (ERROR-fallback only)

> Reached ONLY on `ERROR` verdict from `scripts/agents-flow/dev-team-tick-preflight.sh` above (or
> when this flow is run manually / pre-WU-2). Content relocated verbatim (never deleted, TE-T02) —
> R6/R7/R8 fallback guarantee, see `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md` § Design decisions.

→ Run sub-flow: `docs/agents/dev-team/flow/preflight-fallback.md`, then continue at `jump:gcc-preflight` below.

<!-- jump:gcc-preflight -->
## Step 0-PREFLIGHT-CONTINUE — GCC-PREFLIGHT + HEAD.lock Guard + Worktree GC

> Reached from BOTH the `RUN` verdict above (script already handled presence/SF-1/fire-election —
> no duplicate work) AND as the natural continuation of `preflight-fallback` immediately above it
> on the `ERROR` path. Same content either way.

```
# GCC-PREFLIGHT: load gateway call contract before any call_tool use
→ Read docs/standards/gateway-call-contract.md   (one file, ~60L, ~250 tokens — closes 6 recurring tool-call error classes)

if .git/HEAD.lock not exists:
  # T5: worktree prune (always, lock absent branch)
  pruned = $(git worktree prune -v 2>&1 | head -20)
  if pruned non-empty: send_telegram(channel="work", message="[PREFLIGHT] git worktree prune: {pruned}")
  # T6: 24h worktree lock expiry sweep
  if .claude/worktrees/ exists:
    for each f in .claude/worktrees/*/.git/*.lock:
      age_h = (now() - mtime(f)) / 3600
      if age_h > 24:
        log "[PREFLIGHT] expired worktree lock: {f} age={age_h}h removed"
        rm -f {f}
  JUMP TO drain-signals

else:
  # T2: capture lock size for diagnostics
  lock_size = $(stat -f %z .git/HEAD.lock)   # macOS; Linux: stat -c %s
  age = (macOS) now() - $(stat -f %m .git/HEAD.lock)
        (linux)  now() - $(stat -c %Y .git/HEAD.lock)
  pid_alive = pgrep -x git | xargs -I{} lsof -p {} 2>/dev/null | grep '.git' → non-empty?

  if age > 60s AND NOT pid_alive:
    # T1: capture lsof + lock metadata before removal
    lsof .git/HEAD.lock 2>&1 > docs/agent-memory/sessions/preflight-lsof-{ts}.log
    ls -laT .git/HEAD.lock >> docs/agent-memory/sessions/preflight-lsof-{ts}.log
    # F4 (c59-T2): all commit steps use git_commit_retry idiom on index.lock/HEAD.lock
    #   → docs/protocols/head-lock-self-cure.md § F4
    rm .git/HEAD.lock
    send_telegram(channel="work", message="[PREFLIGHT] HEAD.lock removed — age={age}s size={lock_size}B pid_alive=false — {ISO timestamp}")
    session_headlock_count++
    if session_headlock_count >= 3 within 24h:
      send_telegram(channel="work", message="[dev-team] HEAD.lock recurred 3x in 24h — architect rethink needed")
      write docs/signals/{ts}-headlock-recurrence.json:
        {from: "dev-team", to: "architect", type: "recurring-bug", payload: {module: ".git/HEAD.lock", count: 3}}
    # T5+T6: run worktree gc after lock clearance too
    pruned = $(git worktree prune -v 2>&1 | head -20)
    if pruned non-empty: send_telegram(channel="work", message="[PREFLIGHT] git worktree prune: {pruned}")
    if .claude/worktrees/ exists:
      for each f in .claude/worktrees/*/.git/*.lock:
        age_h = (now() - mtime(f)) / 3600
        if age_h > 24: log "[PREFLIGHT] expired worktree lock: {f} age={age_h}h removed"; rm -f {f}
    JUMP TO drain-signals

  elif age <= 60s:
    send_telegram(channel="bug", message="[dev-team] HEAD.lock too young ({age}s) size={lock_size}B — may be active write — escalate ops")
    JUMP TO end

  elif pid_alive:
    send_telegram(channel="bug", message="[dev-team] HEAD.lock held by live git pid size={lock_size}B — escalate ops")
    JUMP TO end
```

---

<!-- jump:drain-signals -->
## Step 0a — Drain `docs/signals/` + Orphan-Signal Adoption

> **Honest bound:** zero live sessions = zero execution; the reaper only makes work ADOPTABLE, it never self-heals execution.

### Step 0a-A: Agent-signals drain

→ Run sub-flow: `docs/agents/dev-team/flow/drain-signals.md`

Output: `pendingSignals[]` for Step 1, or empty.

### Step 0a-B: Orphan-signal adoption (P1.5-AF-2 — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · TASK_1987)

After draining agent-signals, probe for adoptable orphaned sprint-tasks from dead dev-team sessions:

```
N_MAX = 3   # poison-task threshold (configurable; global default = 3)

orphan_signals = call_tool(server="vn-market", tool="task_list_held", arguments={
  kind:        "orphan-signal",
  owner_agent: "dev-team"
})
# READ-ONLY probe — DoD-P15-2: NEVER use task_heartbeat/task_claim to probe published artifacts
```

If any `orphan_signals` row has `signal.payload.original_task_kind == "sprint-task"` →
→ Run sub-flow: `docs/agents/dev-team/flow/orphan-adoption.md` (full per-signal adoption loop:
FR-4 board-state guard [identical rule to `dispatch-claim/SKILL.md` § Orphan-Adoption Probe,
hot+cold-archive+supervised classification via shared `scripts/lib/resolve-task-lane-by-id.jq`],
N_MAX redispatch-count gate, claim, DoD-P15-1 tree-hygiene precondition, checkpoint verify,
FR-5 lane-aware board flip, resume-spawn; sub-flow ends with its own `JUMP TO end` once a task is adopted this tick).
Common case (`orphan_signals` empty, or no `sprint-task` rows in it) → fall through, no further read needed.

**Scope note:** Step 0a-B handles `original_task_kind="sprint-task"` only. `cowork-slot` and
`dashboard-row` orphan-signals directed to `owner_agent="dev-team"` are rare edge cases;
route to PO for manual triage if encountered (they carry a published-artifact checkpoint check
per DoD-P15-2 that requires cowork context dev-team does not own).

---

**After Steps 0a-A and 0a-B:**

If `pendingSignals[]` empty AND `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports → JUMP TO `session-gate`.

---

<!-- jump:ci-health-probe -->
## Step 0a.5 — CI Health Probe

→ Run sub-flow: `docs/agents/dev-team/flow/ci-health-probe.md`

Non-fatal: probe errors log and fall through. On RED HEAD: emits `ci_red` signal to `docs/signals/` (routed to PO in Step 1).
`pendingSignals[]` is unchanged if CI is GREEN or probe skips — no signal appended.

---

<!-- jump:pipeline-resume -->
## Step 0b — Pipeline Resume + Session Gate

Slice `.head` from `docs/data/orch/orch-state.json` (~150 tokens — see `docs/standards/orch-state-access.md §1`):
```bash
# NEVER cat the full file — jq slice only
HEAD=$(jq -c '.head' docs/data/orch/orch-state.json)
head_status       =$(printf '%s' "$HEAD" | jq -r '.status')
head_active_task  =$(printf '%s' "$HEAD" | jq -r '.active_task_id')
head_next_agent   =$(printf '%s' "$HEAD" | jq -r '.next_agent')
head_next_action  =$(printf '%s' "$HEAD" | jq -r '.next_action')
head_updated_at   =$(printf '%s' "$HEAD" | jq -r '.updated_at')
```
`narrative.*` block is lazy-loaded only on explicit human-facing resume request — do NOT read at cold start.

**v1 legacy (no `head` key):** field names were `status`/`activeTaskId`/`nextAgent`/`updatedAt` directly at root. Self-heal to v4 on next write (first writer detects `._meta.schema` absent or `< "v4"` and writes v4 envelope with canonical `_meta: {updated_at, updated_by, schema: "v4", ssot: true}`).

- `head.status == "in_progress"` AND `head.next_agent` non-null →
  <!-- FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE (2026-08-14): age clause
       (`head.updated_at < 24h`) dropped from this parent gate — WF-1/WF-1b/WF-1c/WF-2 below
       never referenced `head.updated_at` in their own bodies (zero-byte-diff behavior change
       inside those four blocks), and age-based staleness is now evaluated by WF-3/WF-4 below,
       AFTER WF-2's supervised-hold carve-out, keyed off the row's own `claimed_at` rather than
       `.head.updated_at` (which auto-refreshes on every `.head` write, including WF-3's own
       resume-attempt counter — see architecture brief §1 for the full rationale). -->
  **WF-1 BLOCKED-task check (AC-WF1-5 — run FIRST, before S2 dispatcher-wrap):**
  ```bash
  # FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS (2026-07-30): status
  # lookup now ALSO scans the flat in_progress[] lane (not just legacy
  # active_sprints[].tasks[]) — every BOUNDED-1/SLS/RLC/DRS pickup lands a
  # claimed row in in_progress[], the exact shape head.active_task_id points
  # at here, so the old active_sprints-only query silently never matched a
  # flat-lane row (confirmed: it would have missed FU-CNYVND-DEAD-FIELD-REMOVE
  # entirely).
  # FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND (2026-08-06): source array
  # now ALSO scans done[] + done_verified[] — a gateway-less specialist
  # closing its own head task (INV-GATEWAY-1) can lane-move its OWN row into
  # done[]/done_verified[] but cannot write `.head`, so the pre-fix
  # in_progress/active_sprints-only query resolved task_status=empty on an
  # already-finished task, missed the BLOCKED carve-out below, and fell
  # through to a duplicate S2 re-spawn (live incident: GUARD-COWORK-NOTEBOOK-
  # AGENTS-SELF-EDIT-FLOW-DOC, commit 336228ebe). done[]/done_verified[] are
  # appended AFTER in_progress/active_sprints (order matters: `first` must
  # keep preferring an in_progress/active_sprints copy on a transient
  # STATUSFLIP-LANEMOVE dual-presence race — a different, already-tracked
  # defect class, out of scope here — never prematurely idle-reset a row that
  # might still be genuinely live).
  # FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE (2026-08-06, same day): source
  # array now ALSO scans ready[], APPENDED LAST (after done/done_verified,
  # same order-discipline rationale as above — a ready[]-resident row must
  # never win a `first` race against an in_progress/active_sprints/done/
  # done_verified copy of the same id). Closes the gap where a completing
  # specialist hands a row off into ready[] (writes next_agent on the row
  # AND `.head`, leaves the row itself ready[]-resident for BOUNDED-1/SLS/
  # RLC/DRS pickup) while `.head` still reads in_progress — the pre-fix
  # query resolved task_status=empty on a staged-not-claimed row, missed the
  # BLOCKED carve-out below, and would have fallen through all the way to a
  # duplicate S2 re-spawn (live near-miss: UC-CRITIC-HOOKS-ENFORCEMENT,
  # architect->developer handoff 2026-08-06T09:41Z — no re-spawn occurred
  # only because the router manually self-claimed
  # task:UC-CRITIC-HOOKS-ENFORCEMENT as an ad-hoc precaution; no automated
  # guard existed before this fix). See WF-1b below (terminal-lane
  # short-circuit) and WF-1c below (new, ready-lane short-circuit), which
  # both consume this widened task_status.
  # FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND (2026-08-14, same family,
  # same day): source array now ALSO scans review[] and qa[], APPENDED LAST
  # (after ready[], same order-discipline rationale as the done/done_verified
  # and ready widenings above — an inert-lane copy must never win the `first`
  # race against an in_progress/active_sprints copy of the same id during a
  # transient STATUSFLIP-LANEMOVE dual-presence race). Closes the gap where a
  # gateway-less specialist self-lane-moves its OWN finished row into
  # review[]/qa[] (writes next_agent on the row, cannot write `.head` —
  # INV-GATEWAY-1) while `.head` still reads in_progress — the pre-fix query
  # resolved task_status=empty on a review[]/qa[]-resident row, missed every
  # carve-out below, and fell through to a duplicate S2 re-spawn (live
  # occurrences: commit 969acbcc7 dev-rag-service, commit 95e07eca5
  # dev-mcp-server, both hand-corrected by the router). See WF-1d below (new,
  # review/qa-lane short-circuit), which consumes this widened task_status
  # exactly like WF-1c does for ready[].
  task_status=$(jq -r --arg tid "$head_active_task" \
    '( [ (.task_board.in_progress // [])[], (.task_board.active_sprints // [])[].tasks[]?,
         (.task_board.done // [])[], (.task_board.done_verified // [])[],
         (.task_board.ready // [])[],
         (.task_board.review // [])[], (.task_board.qa // [])[] ]
       | map(select(.id == $tid or .task_id == $tid)) | first.status ) // empty' \
    docs/data/orch/orch-state.json)
  if [ "$task_status" = "BLOCKED" ]; then
    # BLOCKED task — reset head to idle so pipeline-resume never re-spawns it,
    # AND (CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c), execute-tier.md) lane-move
    # the row OUT of in_progress[] INTO backlog[] in the SAME write if the
    # agent that flipped it to BLOCKED did not already do so — self-healing
    # backstop for the FU-CNYVND-DEAD-FIELD-REMOVE incident class (a parked
    # BLOCKED row silently ate a full wip_in_progress concurrency slot).
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" --arg tid "$head_active_task" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}
       | if ((.task_board.in_progress // []) | any(.id == $tid or .task_id == $tid)) then
           .task_board.backlog = ((.task_board.backlog // []) + [ (.task_board.in_progress // [])[] | select(.id == $tid or .task_id == $tid) ])
           | .task_board.in_progress = ((.task_board.in_progress // []) | map(select((.id != $tid) and ((.task_id // null) != $tid))))
         else . end' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="work", "[dev-team] head task " + head_active_task + " is BLOCKED — head reset idle + lane-moved in_progress[]→backlog[] if parked there, routing to triage")
    JUMP TO drain-signals   # PO triage picks up from here
  fi
  ```
  **WF-1b TERMINAL-LANE check (FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND — run SECOND, after BLOCKED, before WF-2 and before S2 dispatcher-wrap):** a gateway-less specialist that closes its own head task (INV-GATEWAY-1) can lane-move its OWN row into `done[]`/`done_verified[]` but cannot write `.head` — the widened `task_status` lookup above (WF-1) now resolves that terminal status instead of empty, so short-circuit here to an idle `.head` reset EXACTLY like the BLOCKED branch above, but WITHOUT its lane-move (the row is already correctly resident in `done[]`/`done_verified[]` — INV-GATEWAY-1 means the specialist could move its own lane, just not `.head` — nothing left to move). This branch is the ONLY place capable of preventing the duplicate S2 re-spawn: a terminal, non-supervised row's `should_hold` (WF-2 below) already evaluates `false` today and would STILL fall through to S2 regardless of WF-2's own lane-widening — only this explicit short-circuit stops it. Reuses `is_terminal_task_status` from `scripts/lib/devteam-eligibility.jq` (TERMINAL_SET={DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED}, SSOT `apps/mcp-server/src/infrastructure/orchStateSchema.ts`) rather than re-deriving a literal status list.
  ```bash
  is_terminal=$(jq -r --arg s "$task_status" \
    'include "scripts/lib/devteam-eligibility"; is_terminal_task_status($s)' \
    docs/data/orch/orch-state.json)
  if [ "$is_terminal" = "true" ]; then
    # Terminal head-pin — reset head to idle so pipeline-resume never
    # re-spawns the (already-finished) task. NO lane-move (unlike the
    # BLOCKED branch above): the row is already correctly resident in
    # done[]/done_verified[], never stranded in in_progress[].
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="work", "[dev-team] head task " + head_active_task + " is already terminal (task_status=" + task_status + ") — head reset idle, no re-spawn (row already resident in done[]/done_verified[])")
    JUMP TO drain-signals   # PO triage picks up from here
  fi
  ```
  **WF-1c READY-LANE check (FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE — run THIRD, after BLOCKED and TERMINAL-LANE, before WF-2 and before S2 dispatcher-wrap):** a row handed off into `ready[]` while `.head` still names it `in_progress` (the completing specialist wrote `next_agent` on the row + `.head` but the row itself is staged in `ready[]`, not claimed live work) is neither BLOCKED nor terminal — but `ready[]` residency is a definitional guarantee that no agent currently owns the row; it is inert staging-queue content awaiting BOUNDED-1/SLS/RLC/DRS pickup on a later tick, never "in flight". The widened `task_status` lookup above (WF-1) now resolves the row's own lane status (observed live: `"READY"`) instead of empty, so short-circuit HERE, BEFORE WF-2 gets a chance to evaluate `should_hold` on it — a ready[]-resident row must never be treated as "held" (WF-2's hold/resume contract is for a row an agent is actively working and must pause before resuming; a ready[]-resident row was never resumed in the first place, supervised or not). NO lane-move (unlike the BLOCKED branch): the row is already correctly resident in `ready[]`, exactly where BOUNDED-1/SLS/RLC/DRS's own pickup logic expects it.
  ```bash
  if [ "$task_status" = "READY" ]; then
    # Ready-lane head-pin — reset head to idle so pipeline-resume never
    # re-spawns a task that is merely staged, not claimed. NO lane-move
    # (unlike the BLOCKED branch above): the row is already correctly
    # resident in ready[] for BOUNDED-1/SLS/RLC/DRS to pick up normally.
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="work", "[dev-team] head task " + head_active_task + " is ready[]-resident (task_status=READY) — head reset idle, no re-spawn, no lane-move (row already staged in ready[] for BOUNDED-1/SLS/RLC/DRS pickup)")
    JUMP TO drain-signals   # BOUNDED-1/SLS/RLC/DRS pick it back up from ready[] on a later tick
  fi
  ```
  **WF-1d REVIEW-LANE check (FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND — run FOURTH, after BLOCKED, TERMINAL-LANE and READY-LANE, before WF-2 and before S2 dispatcher-wrap):** a row a gateway-less specialist self-lane-moved into `review[]`/`qa[]` while `.head` still names it `in_progress` (the completing specialist wrote `next_agent` on the row + `.head` but the row itself is staged in `review[]`/`qa[]`, not claimed live work) is neither BLOCKED, terminal, nor ready-lane-resident — but `review[]`/`qa[]` residency, exactly like `ready[]` residency, is a definitional guarantee that no agent currently owns the row; it is inert staging-queue content awaiting Review-Lane QA-Drain / Review-Lane SECONDARY-Drain pickup on a later tick, never "in flight". The widened `task_status` lookup above (WF-1) now resolves the row's own lane status (observed live: `"REVIEW"`, `"QA"`, or `"DEGRADED"` — `LANE_ALLOWED_STATUSES`, `orchStateSchema.ts`; a `BLOCKED` row in either lane is already caught by the WF-1 BLOCKED branch above, before this check runs) instead of empty, so short-circuit HERE, BEFORE WF-2 gets a chance to evaluate `should_hold` on it — a review[]/qa[]-resident row must never be treated as "held" (WF-2's hold/resume contract is for a row an agent is actively working and must pause before resuming; a review[]/qa[]-resident row was never resumed in the first place, supervised or not). NO lane-move (unlike the BLOCKED branch): the row is already correctly resident in `review[]`/`qa[]`, exactly where the Review-Lane QA-Drain / SECONDARY-Drain pickers expect it. NEGATIVE CONTROL (AC-6): a row genuinely resident in `in_progress[]` still resolves `task_status="IN_PROGRESS"` (`REVIEW`/`QA`/`DEGRADED` never overlap `IN_PROGRESS` — `in_progress[]` stays first in the widened WF-1 array, so a same-id STATUSFLIP-LANEMOVE race still prefers it) and reaches S2 dispatcher-wrap unchanged — this check must not, and does not, shadow the normal resume path.
  ```bash
  if [ "$task_status" = "REVIEW" ] || [ "$task_status" = "QA" ] || [ "$task_status" = "DEGRADED" ]; then
    # Review/QA-lane head-pin — reset head to idle so pipeline-resume never
    # re-spawns a task that is merely staged for Review-Lane QA-Drain/
    # SECONDARY-Drain pickup, not claimed live work. NO lane-move (unlike
    # the BLOCKED branch above): the row is already correctly resident in
    # review[]/qa[] for the Review-Lane pickers to pick up normally.
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="work", "[dev-team] head task " + head_active_task + " is review[]/qa[]-resident (task_status=" + task_status + ") — head reset idle, no re-spawn, no lane-move (row already staged for Review-Lane QA-Drain / SECONDARY-Drain pickup)")
    JUMP TO drain-signals   # Review-Lane QA-Drain / SECONDARY-Drain pick it back up from review[]/qa[] on a later tick
  fi
  ```
  **WF-2 SUPERVISED-HOLD check (FIX-DEVTEAM-STEP0B-RESUME-SUPERVISED-HOLD-GATE — run FIFTH, after BLOCKED, TERMINAL-LANE, READY-LANE and REVIEW-LANE, before S2 dispatcher-wrap):** mirrors the BLOCKED carve-out above but does NOT reset `head` — a supervised row must stay the active task so a later `po_goahead_*` stamp lets resume proceed automatically on the very next tick, with no manual re-triage round-trip. Closes the gap where `supervised:true` + a prose "SUPERVISED HOLD" note were invisible to this resume path, which spawned anyway.
  ```bash
  # FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND (2026-08-06): $row source
  # array ALSO gains done[]/done_verified[], for AC-1's literal "BOTH
  # lookups" text. DEFENSE-IN-DEPTH, PROVABLY UNREACHABLE in the resulting
  # control flow once WF-1b above lands — WF-1b always runs first and JUMPs
  # away on any terminal-lane hit before this WF-2 block executes. Kept only
  # so a future reorder of WF-1/WF-1b/WF-2 doesn't silently regress; a future
  # "dead code" cleanup must not remove this without re-verifying that
  # invariant first.
  # FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE (2026-08-06, same day): $row
  # source array ALSO gains ready[], APPENDED LAST, same "BOTH lookups"
  # literal-text discipline as the done/done_verified addition above and
  # AC-1's own append-not-prepend order requirement. Also
  # DEFENSE-IN-DEPTH/PROVABLY UNREACHABLE once WF-1c above lands — WF-1c
  # always runs first and JUMPs away on any ready-lane hit before this WF-2
  # block executes. Kept for the same reorder-safety reason as the
  # done/done_verified widening; do not remove without re-verifying the
  # WF-1/WF-1b/WF-1c/WF-2 ordering invariant first.
  # FIX-DEVTEAM-WF1D-REVIEW-QA-LANE-HEAD-PIN-BLIND (2026-08-14): $row source
  # array already carries review[]/qa[] (2nd/3rd position below, right after
  # in_progress[] — pre-existing, previously undocumented; this comment is
  # the documentation sync, no functional array change). Same "BOTH lookups"
  # literal-text discipline as the done/done_verified and ready additions
  # above. DEFENSE-IN-DEPTH, PROVABLY UNREACHABLE once WF-1d above lands —
  # WF-1d always runs before this WF-2 block and JUMPs away on any
  # review[]/qa[] lane hit. Kept for the same reorder-safety reason as the
  # done/done_verified and ready widenings; do not remove without
  # re-verifying the WF-1/WF-1b/WF-1c/WF-1d/WF-2 ordering invariant first.
  should_hold=$(jq -r --arg tid "$head_active_task" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    'include "scripts/lib/devteam-eligibility";
     (detail_items_from($detail)) as $detail_items
     | ( [ (.task_board.in_progress // [])[], (.task_board.review // [])[], (.task_board.qa // [])[],
           (.task_board.done // [])[], (.task_board.done_verified // [])[],
           (.task_board.ready // [])[] ]
         | map(select(.id == $tid or .task_id == $tid)) | first ) as $row
     | (($row != null) and ($row | effective_supervised($detail_items))) as $supervised
     | ( (($row // {}) | keys) + ((.head // {}) | keys) | any(test("^po_goahead"))) as $goahead
     | ($supervised and ($goahead | not)) | tostring' \
    docs/data/orch/orch-state.json)
  if [ "$should_hold" = "true" ]; then
    log "[dev-team] SUPERVISED HOLD " + head_active_task + " — effective_supervised=true, no po_goahead_* stamp on row or head; fall through to Step 1 (do NOT spawn)"
    JUMP TO drain-signals   # PO triage picks up from here; head is left UNCHANGED (unlike BLOCKED) so resume re-evaluates and proceeds the instant a po_goahead_* stamp lands on the row or head
  fi
  ```
  **WF-3 RESUME-ATTEMPT-BOUND check (FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE —
  run SIXTH, after BLOCKED/TERMINAL-LANE/READY-LANE/REVIEW-LANE/SUPERVISED-HOLD, before WF-4 and
  before S2 dispatcher-wrap):** AC-3/AC-4. `.head.resume_attempts` increments once per genuine Pipeline
  Resume re-spawn attempt (S2's own increment, below); stays flat on any tick where
  `outer_claim` fails (peer-held — a specialist genuinely still holds `task:<id>`, not a resume
  attempt). Bound = 3.
  ```bash
  resume_attempts=$(jq -r '(.head.resume_attempts // 0)' docs/data/orch/orch-state.json)
  if [ "$resume_attempts" -ge 3 ]; then
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    pin_claimed_at=$(jq -r --arg tid "$head_active_task" \
      '((.task_board.in_progress // [])[] | select(.id == $tid or (.task_id // null) == $tid) | .claimed_at) // .head.updated_at // empty' \
      docs/data/orch/orch-state.json)
    reason="resume-attempt-bound-exceeded (resume_attempts=$resume_attempts/3)"
    # 2026-08-22 fix (QA CHANGES_REQUESTED 2026-08-14): duration parenthetical, computed the
    # SAME way WF-4 below computes it, so both BUG-channel signals for this head-pin surface
    # read consistently (architecture brief §4 always specified this, the original sample
    # here omitted it).
    dur_text=""
    if [ -n "$pin_claimed_at" ]; then
      age_sec=$(jq -n --arg ts "$pin_claimed_at" \
        'def to_epoch: if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
           then (sub("Z$"; ":00Z") | fromdateiso8601) else fromdateiso8601 end;
         (now | floor) - ($ts | to_epoch)')
      hrs=$((age_sec/3600)); mins=$(((age_sec%3600)/60))
      dur_text=" (${hrs}h${mins}m)"
    fi
    # 2026-08-22 fix (QA CHANGES_REQUESTED 2026-08-14): CANONICAL:SSOT-STATUSFLIP-LANEMOVE(c)
    # (execute-tier.md:116) — an IN_PROGRESS -> BLOCKED flip MUST lane-move the row OUT of
    # in_progress[] and INTO backlog[] in the SAME write, mirroring the WF-1 BLOCKED-task
    # check (main.md:331-338) exactly. The prior sample here set status:"BLOCKED" in place
    # inside in_progress[] and never moved it — the gap this fix closes.
    jq --arg s "idle" --arg t "$now" --arg u "dev-team" --arg tid "$head_active_task" --arg reason "$reason" \
      '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}
       | if ((.task_board.in_progress // []) | any(.id == $tid or (.task_id // null) == $tid)) then
           .task_board.backlog = ((.task_board.backlog // []) + [
               (.task_board.in_progress // [])[] | select(.id == $tid or (.task_id // null) == $tid)
               | . + {status:"BLOCKED", hold_reason:$reason,
                      resume_attempt_bound_exceeded_at:$t,
                      resume_attempt_bound_exceeded_by:"dev-team (resume-attempt-bound)"}
             ])
           | .task_board.in_progress = ((.task_board.in_progress // []) | map(select((.id != $tid) and ((.task_id // null) != $tid))))
         else . end' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    send_telegram(channel="bug", message="[dev-team] RESUME ATTEMPT BOUND EXCEEDED task=" + head_active_task + " resume_attempts=" + resume_attempts + "/3 pinned since " + pin_claimed_at + dur_text + " — stopped re-spawning, marked BLOCKED for triage, head reset idle, lane-moved in_progress[]→backlog[]")
    JUMP TO drain-signals
  fi
  ```
  **WF-4 STALE-AGE check (FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE — run SEVENTH,
  after WF-3, before S2 dispatcher-wrap):** AC-1/AC-2. Replaces the removed 24h stale-crash
  sibling branch that used to sit after the S2 dispatcher-wrap block below. Threshold 2h
  (7200s). Keys off `row.claimed_at`, NOT `.head.updated_at`
  (`.head.updated_at` is auto-refreshed by `scripts/orch-stamp-updated-at.mjs` on WF-3's own
  write above, so it cannot be used here without self-defeating the moment resume attempts
  start recording).
  ```bash
  pin_claimed_at=$(jq -r --arg tid "$head_active_task" \
    '((.task_board.in_progress // [])[] | select(.id == $tid or (.task_id // null) == $tid) | .claimed_at) // .head.updated_at // empty' \
    docs/data/orch/orch-state.json)
  if [ -n "$pin_claimed_at" ]; then
    age_sec=$(jq -n --arg ts "$pin_claimed_at" \
      'def to_epoch: if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
         then (sub("Z$"; ":00Z") | fromdateiso8601) else fromdateiso8601 end;
       (now | floor) - ($ts | to_epoch)')
    if [ "$age_sec" -ge 7200 ]; then
      commit_found=$(git log --since="$pin_claimed_at" --fixed-strings --grep="$head_active_task" --oneline 2>/dev/null | head -1)
      if [ -z "$commit_found" ]; then
        now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        hrs=$((age_sec/3600)); mins=$(((age_sec%3600)/60))
        jq --arg s "idle" --arg t "$now" --arg u "dev-team" \
          '.head = {status:$s, updated_at:$t, updated_by:$u, active_task_id:null, next_agent:null}' \
          docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
        send_telegram(channel="bug", message="[dev-team] STALE HEAD PIN task=" + head_active_task + " pinned ${hrs}h${mins}m (threshold 2h) — no commit referencing this task since pin, no BLOCKED/terminal/ready/supervised carve-out matched — head reset idle, routing to triage")
        JUMP TO drain-signals
      fi
      # commit_found non-empty: real progress happened since the pin but .head/
      # lane haven't caught up — the adjacent write-coherence class PO flagged
      # 2026-08-05 (architecture brief §6, deliberately out of scope here — see
      # FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN). Conservative default:
      # do NOT reset here. Fall through to S2's own outer_claim peer-held check.
      # AC-8 CORRECTION (FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-
      # REOPENING-DOUBLE-SPAWN-WINDOW, PO ruling 2026-08-25): that check must
      # NEVER again be described as a bare lock-presence safety net — a peer-
      # held `resume_key` is renewed (task_heartbeat) every tick this branch is
      # reached, so the lock's mere presence no longer implies a live
      # specialist; renewed-but-abandoned looks identical to renewed-and-alive.
      # The ACTUAL safety net is WF-3's resume-attempt-bound above: S2's renew
      # branch now increments `.head.resume_attempts` on every renewal (not
      # only on a fresh successful claim — see the comment there), so a task
      # this stale-age check declines to reset still trips WF-3's pre-existing
      # 3-attempt ceiling within a few more ticks and gets BLOCKED for triage
      # instead of stranded forever.
    fi
  fi
  ```
  If task is NOT BLOCKED, NOT terminal, NOT ready-lane-resident, NOT review/qa-lane-resident, NOT
  supervised-held, NOT resume-attempt-bound-exceeded, and NOT stale-age-exceeded → dispatcher-wrap
  then spawn `head.next_agent`. JUMP TO `execute`.
  ```
  # S2 dispatcher-wrap:
  bare_task_id = head.active_task_id   # from docs/data/orch/orch-state.json .head block
  resume_key   = "task:" + bare_task_id
  # SAFE-JSON: head.next_agent is read from orch-state.json (agent-authored) — NEVER interpolate into /bin/sh.
  # Use structured object passed to call_tool (MCP gateway, no shell exposure).
  outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
    ttl_seconds: 3600,
    payload: "{\"site\":\"S2\",\"spawning\":\"" + head.next_agent + "\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
  })
  if not outer_claim.claimed:
    # AC-1/AC-2/AC-4 RESUME-KEY KEEPALIVE (FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-
    # REOPENING-DOUBLE-SPAWN-WINDOW, 2026-08-25): a peer session (an EARLIER tick's own S2/ILC/SLS/
    # RLC/DRS/QA-Drain/BOUNDED-1 dispatcher-wrap — each cron fire is a brand-new `$CLAUDE_CODE_SESSION_ID`,
    # `docs/protocols/task-lock-protocol.md` § Session-Singleton Subclass) still holds `resume_key` —
    # the pre-existing, CORRECT skip path. Renew it here, every tick this branch is reached, so a
    # specialist genuinely still running past 60 minutes is not silently unguarded up to 30 minutes
    # from now (this tick's own cadence) — closing the exact gap the 2026-08-25 incident exploited
    # (ILC dispatch 15:35:59Z, resume_key expired 16:35:59Z, agent still running, 16:37Z tick would
    # have found it "free"). `owner_client_session` below is read VERBATIM off `outer_claim.
    # current_holder` returned by THIS SAME call, moments earlier — never guessed/forged — so the
    # coordination store's Rung A ownership match (`taskHeartbeatTool.ts`: "default match is SOLELY
    # on owner_client_session... wrong session cannot renew another session's lock via
    # owner_client_session alone") is satisfied honestly: we present the row's own recorded
    # authoritative key, never `owner_agent` alone (`.claude/skills/task-lock/SKILL.md` § OWNERSHIP
    # KEY). NOT a theft/impersonation bypass: INV-GATEWAY-1 already establishes "dev-team" — the
    # continuous dispatcher ROLE, never any one cron tick's ephemeral session — as the SOLE steward
    # of every `sprint-task` lock this flow claims; no peer AGENT's lock is ever touched, only this
    # exact `resume_key`, which no code outside Step 0b/S2 and the sibling dispatcher-wrap sections
    # ever claims. `ttl_seconds` stays 3600 — UNCHANGED, a renewal, never a raise (AC-4 forbids
    # raising it: that only moves the cliff, it does not remove it). AC-2/AC-6 (crash recovery
    # preserved AND independently bounded — PO ruling 2026-08-25 superseded the first cut's AC-2
    # sign-off, which asserted this half without proving it: unbounded, this branch turns WF-4's
    # own named safety net — "S2's own outer_claim peer-held check" — into a self-sustaining loop,
    # because `.head.resume_attempts` used to increment ONLY on the successful-claim branch below
    # (main.md ~589), so a peer-held resume_key that is renewed every tick forever never advances
    # it and WF-3's 3-attempt ceiling is never reached): this renewal still fires ONLY on ticks that
    # actually run and actually reach this branch — a genuinely dead dispatcher (cron itself stops
    # ticking) renews nothing, so `resume_key` still organically lapses on its original, unchanged
    # 3600s TTL. WF-4 (2h stale-age + git-log corroboration) above is byte-unchanged by this fix and
    # remains independent authority — see its own corrected comment above (AC-8). WF-3 (resume-
    # attempt-bound) above is ALSO byte-unchanged, but this branch now FEEDS it (increment below):
    # the bound source is OUTSIDE the lock this branch renews (`.head.resume_attempts` lives in
    # orch-state.json, not in coordination.db), so it is never circular. This keepalive step itself
    # still never resets `.head`, never spawns, and never overrides WF-3/WF-4 directly — it only
    # keeps WF-3's own counter moving so a task stuck on this branch tick after tick still trips
    # WF-3's pre-existing 3-attempt ceiling instead of renewing forever.
    if outer_claim.current_holder:
      hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
        task_id: resume_key,
        owner_client_session: outer_claim.current_holder.owner_client_session,
        ttl_seconds: 3600
      })
      # AC-6 BOUND: increment `.head.resume_attempts` on THIS renew branch too — the one thing the
      # first cut of this fix omitted. `bare_task_id == head.active_task_id` by construction (S2
      # only ever evaluates the CURRENT head-pinned task), so this counter always tracks the right
      # row, whether it was originally pinned by S2 itself or inherited from the Incident-Lane
      # Consumer's own top-of-batch claim (ILC sets `.head.active_task_id` too — scripts/devteam-
      # backlog-claim-incident-lane-consumer.jq — so any ILC-originated pin is ALSO covered here from
      # its second tick onward without any change needed at the ILC call site itself). 3 renewals of
      # a task that never completes — dead or merely very slow — now trips the SAME resume-attempt-
      # bound the success path already enforces, resetting `.head` to idle and lane-moving the row
      # to `backlog[]` for triage (WF-3 above). A genuinely fast-completing specialist never
      # accumulates 3 of these before the row leaves `in_progress[]`.
      now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      jq --arg t "$now" \
        '.head.resume_attempts = ((.head.resume_attempts // 0) + 1) | .head.last_resume_at = $t' \
        docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
      log "[dev-team] SKIP pipeline resume " + resume_key + " — held by peer session (renewed, hb.ok=" + hb.ok + ", resume_attempts incremented)"
    else:
      # claimed:false with no current_holder = coordination.db unavailable/degraded (F3/F5,
      # docs/protocols/task-lock-protocol.md § Failure Modes) — nothing was actually renewed, and
      # this is an infra fault rather than a genuine peer-held signal, so `.head.resume_attempts` is
      # deliberately NOT incremented here (an infra hiccup should not spend down the same 3-attempt
      # budget a genuinely stuck specialist does) — fall through unchanged, same as before this fix.
      log "[dev-team] SKIP pipeline resume " + resume_key + " — held by peer session"
    # fall through to Step 1 (do NOT spawn)
  else:
    # FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE (AC-3): record this genuine
    # resume-respawn attempt BEFORE spawning, so a repeated no-op resume is distinguishable from
    # a task that is genuinely still running (WF-3 above reads this same counter next tick).
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg t "$now" \
      '.head.resume_attempts = ((.head.resume_attempts // 0) + 1) | .head.last_resume_at = $t' \
      docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
    try:
      Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1; await task notification before next gate
      # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release here on
      # the success path. run_in_background=true returns in milliseconds while the spawned agent runs far
      # longer; releasing in a `finally` bound to this call frees resume_key while the agent is still live, so
      # the NEXT tick's outer_claim above would succeed again and spawn a SECOND agent onto the same task.
      # ttl_seconds:3600 on outer_claim (above) is now the lock's lifetime bound instead — this resume branch
      # is only reachable again once head moves off in_progress (agent closed out) or the TTL lapses (crash
      # recovery backstop, same role as WF-4's 2h stale-age reset above — FIX-DEVTEAM-HEAD-PIN-STALE-
      # THRESHOLD-24H-VS-TICK-CADENCE 2026-08-14, superseding the old 24h stale-crash sibling branch).
    except:
      # Release ONLY when the spawn itself threw (Agent() never handed off) — otherwise a throwing spawn would
      # hold resume_key locked for the full TTL having started nothing.
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      raise
    JUMP TO execute
  ```
- `head.status == "idle"` or `head.status == "done"` (Close Gate Step-6/PM-closeout terminal reset — `active_task_id:null, next_agent:"router"`; established convention across multiple prior closes, e.g. FACTORY-MACRO-split-repositories, FACTORY-DOMAIN-split-cascade-engine) or `head` missing or v1 schema → fall through to **Idle-Tick Rotation Selection** below, then whichever ONE lane it picks (Step 1 included).

---

### Idle-Tick Rotation Selection (aged round-robin — FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION)

**Replaces** the pre-2026-08-08 fixed-priority fall-through order (BOUNDED-1 → SLS → RLC → DRS → QA-Drain(idle-tick) → Step 1 PO Triage, in that literal sequence, every tick BOUNDED-1 had eligible work) — that ordering let BOUNDED-1 (or whichever lane sat earliest) win perpetually whenever it had *any* eligible row, permanently starving every lane below it (measured: 6 `FIX-ORPHAN-FR*` children — 3 of them P0 — sat untouched in `ready[]` 2026-07-22→2026-08-08 because RLC was never reached; this very row sat starved 8 days by the identical defect). Design source: `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` §2 (PO-ratified, `docs/agent-memory/decisions/ruling-20260725T1101Z-devteam-idle-chain-po.md`) + schema/utilities shipped by `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES` (DONE_VERIFIED) — `dev_team_idle_chain: z.record(z.unknown()).optional()` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts`), `rotation_selected($doc)` (`scripts/lib/devteam-eligibility.jq`), `scripts/devteam-idle-chain-stamp.jq`.

Runs ONCE, ONLY on the head-idle fall-through above (`head.status == "idle"` or `head` missing/v1) — the exact position the old fixed chain began. Picks the single OLDEST-served candidate, ties broken by fixed declared order (bootstrap tick only — see `rotation_selected`'s own header for the identical algorithm this mirrors):

```bash
SELECTED=$(jq -r \
  '(.dev_team_idle_chain.rotation // {}) as $r
   | ["bounded1","sls","rlc","drs","qa_drain","step1_triage"]
   | map({id: ., stamp: ($r[.].last_served_tick // "1970-01-01T00:00:00Z")})
   | sort_by(.stamp)
   | .[0].id' \
  docs/data/orch/orch-state.json)
```

**6 candidates, not 5 — DRS gap flagged, not silently absorbed:** the shipped `rotation_selected($doc)` (`scripts/lib/devteam-eligibility.jq:466`) and `scripts/devteam-idle-chain-stamp.jq`'s `$known_ids` guard both hardcode the ORIGINAL 5-id set from the 2026-07-25 brief (`bounded1`, `sls`, `rlc`, `qa_drain`, `step1_triage`) — that brief predates Design-Router Sweep (DRS), which was inserted into the fixed chain 5 days later (2026-07-30, `FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE`) and shares the identical WIP≤2 competing-slot semantics as SLS/RLC (`wip_in_progress`, "a 4th writer of the existing named slot"). Omitting DRS from rotation would just relocate today's starvation problem onto DRS (an unconditional-priority straggler wedged into an otherwise-fair cycle) instead of fixing it for "every lane" as required. `scripts/lib/devteam-eligibility.jq` and `scripts/devteam-idle-chain-stamp.jq` live in `scripts/` — outside agent-father's `commit_zone.allowed` (same TE-T02/S1-S20 split precedent already used repeatedly in this file's own header) — so the 6-candidate selection above and the stamp write below are INLINED here rather than calling those two shipped functions, with `"drs"` added to both candidate lists. **Flagged fast-follow (not implemented here — cross-zone):** extend `rotation_selected($doc)` + `devteam-idle-chain-stamp.jq`'s `$known_ids` to the current 6-id set so this file can drop the inline duplicate and call the shared library directly, closing the drift this note documents. `.dev_team_idle_chain` is `z.record(z.unknown()).optional()` (fully loose) — adding a `.rotation.drs` sub-key needs zero schema change.

**Dispatch — exactly ONE of the 6 sections below executes this tick, the rest are SKIPPED ENTIRELY (not evaluated, not gated, not attempted):** each of the 6 named sections that follow (§ Idle-capacity backlog pickup (BOUNDED-1), § Supervised-Lane Sweep, § Ready-Lane Consumer, § Design-Router Sweep, § Review-Lane QA-Drain (idle-tick block), § Step 1 — PO Triage) now opens with `Reached ONLY when $SELECTED == "<id>"` in place of the old `reached ONLY when [predecessor] did NOT dispatch`. This is a STRICTER single-writer guarantee than the old sequential fall-through (which could, in principle, walk through up to 5 gate evaluations in one tick before finding a winner): here, mutual exclusion is total and immediate — an LLM agent executing this flow reads `$SELECTED`, jumps directly to the ONE matching section, and skips reading/evaluating the other 5 outright. `.head`-collision-freedom stays provable by control-flow inspection alone (the task's own hard constraint) — even MORE trivially than before, since only one code path can possibly execute per tick, full stop, independent of any lane's own WIP/gate outcome. Every one of the 6 sections' own promote/claim/dispatch bodies is **byte-unchanged** from the pre-rotation version — the fairness fix is which lane gets a turn, never what a lane does with its turn (brief §2.2).

**No same-tick cascade (brief §2.4, deliberately rejected alternative):** if `$SELECTED`'s own gate/promote/claim is a genuine no-op this tick (nothing eligible, or its own WIP/QA_CAP already saturated), do **not** fall through to the next-oldest candidate in the same tick — that would reintroduce a smaller-scope version of the exact defect being fixed. The tick is simply spent on that lane's (empty) turn; the stamp still advances (below), so the SAME lane cannot be picked again until the other 5 have each had one.

**Stamp update — unconditional, single write, run HERE (immediately upon selection, BEFORE dispatching to whichever of the 6 sections `$SELECTED` names) rather than after:**
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg now "$NOW" --arg c "$SELECTED" \
  '(["bounded1","sls","rlc","drs","qa_drain","step1_triage"]) as $known
   | if ($known | index($c)) == null then .
     else .dev_team_idle_chain.rotation[$c].last_served_tick = $now
        | .dev_team_idle_chain._updated_at = $now
        | .dev_team_idle_chain._updated_by = "dev-team"
     end' \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
```
This is `scripts/devteam-idle-chain-stamp.jq`'s own logic verbatim, `"drs"` added to `$known_ids` — same inline-duplication rationale as the selection jq above. **Before, not after (deliberate deviation from the brief §2.3's literal "immediately after the block runs" phrasing, functionally equivalent):** the stamp write is unconditional — it never reads or depends on the selected lane's own outcome — and targets an independent top-level key (`.dev_team_idle_chain.*`, never `.task_board.*`/`.head`), so its ORDER relative to the lane's own promote/claim writes cannot create a race or clobber (both go through the same CAS-retry-guarded `orch-apply.sh`, on different keys). Stamping here, once, BEFORE dispatch, is strictly simpler and safer than the alternative (duplicating this same 3-line write at every one of the 5 lanes' own `JUMP TO end`/`JUMP TO execute` exit points, which would be needed to survive their short-circuits if the stamp ran AFTER — a single call site beats five near-identical copies). **Fairness bound this guarantees:** the just-served consumer becomes the freshest of the 6, so it cannot be selected again until the other 5 have each had a turn — in any window of 6 consecutive idle-fallthrough ticks, every consumer is served exactly once (bound widens from the brief's original ≤5-tick figure to ≤6-tick, purely because DRS adds a 6th competitor; same provable-by-construction shape).

`step1_triage` has no promote/claim body of its own at this position — when it is `$SELECTED`, this stamp write is ALL that happens for it HERE; its actual PO-triage dispatch stays at its existing physical location (`## Step 1 — PO Triage` below, unmoved — it needs `pendingSignals[]`/reports already gathered upstream, and must stay reachable from the busy-tick "fall through to Step 1" paths in Step 0b above, which never evaluate `$SELECTED` at all). See that section's own gate for the mechanics.

**Session Gate (§2.5, below) is unaffected by which of the 6 was selected** — its `.task_board`/reports/`pendingSignals` truly-idle predicate was already lane-independent before this change; a no-op turn on a saturated board correctly stays silent (predicate false → no telegram), never misreads "this one lane found nothing" as "the whole loop is idle."

---

### Idle-capacity backlog pickup (BOUNDED-1)

Reached ONLY when `$SELECTED == "bounded1"` this tick (Idle-Tick Rotation Selection above). If a different id was selected, SKIP this entire section — do not evaluate its WIP gate, do not run its promote/claim scripts — and continue directly to the next physically-listed section (which will, in turn, also skip unless it is the one `$SELECTED` names). Fixes the root-cause gap SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1: with `ready[]=0` and `in_progress[]=0`, nothing previously promoted or claimed a plain BACKLOG/TODO row — the backlog pile was inert to unattended automation (PO triage only self-initiates NEW sprints off signals/Telegram, it never sweeps plain backlog[] rows). BOUNDED-1 caps this lane at ONE task in flight — user-gated 2026-07-04; do NOT raise past 1 for this lane (the existing WIP≤2 invariant below is the separate, human/router-supervised dispatch budget).

**WIP FORMULA (corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK; FURTHER corrected 2026-07-30, FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS):** WIP is `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) — a pure concurrency count, EXCLUDING any `in_progress[]` row whose `.status` is not real live work (BLOCKED or any `TERMINAL_SET` member) — never a bare `.task_board.in_progress|length`. `ready[]` is a STAGING queue (promoted-but-not-yet-claimed work, including rows placed there by other sources — PM/architect decomposition, PO triage, the Supervised-Lane Sweep, the Ready-Lane Consumer below), never concurrency. The prior formula `(ready|length)+(in_progress|length)` let a saturated `ready[]` (36 rows live 2026-07-21, mostly PM epic-decomposition children this gate had no way to drain — see the Ready-Lane Consumer below) permanently evaluate `WIP<1` as false even when `in_progress==0` — instance 9 on the count-threshold-gate class, deadlocking BOTH this gate and the Supervised-Lane Sweep's gate simultaneously. Root cause + fix: `docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK-po.md`. Bare `in_progress|length` was STILL wrong even after that fix — a row parked in `in_progress[]` with `.status: "BLOCKED"` (escalated, awaiting adjudication) kept consuming a full concurrency slot forever; live incident FU-CNYVND-DEAD-FIELD-REMOVE froze this gate + SLS/RLC/DRS fleet-wide for ~2.5h. `wip_in_progress` is `include`-d ONCE in `scripts/lib/devteam-eligibility.jq` — every gate below (WIP/WIP2/WIP3/WIP4) calls it directly, no per-caller duplicate arithmetic. DoD/regression instrument (tests gate SATISFIABILITY on a live-shaped saturated fixture, not lane resolution): `scripts/audits/devteam-dispatch-gate-satisfiability.sh`.

```bash
WIP=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' docs/data/orch/orch-state.json)
if [ "$WIP" -lt 1 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-promote-bounded1.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  jq --arg now "$NOW" -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-bounded1.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  new_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
  if [ "$new_head_status" = "in_progress" ]; then
    JUMP TO execute   # claimed a task — execute-tier.md's own Phase-3.5 dispatcher-wrap claims task:<id> and resolves the real specialist via zone-detect skill
  fi
fi
# WIP>=1, or nothing eligible was promoted/claimed -> fall through unchanged, continue to Supervised-Lane Sweep below
```

- **Promote** (`scripts/devteam-backlog-promote-bounded1.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `effective_supervised != true` AND NOT an epic wrapper AND `depends_on` is eligible AND NOT detail-DEFERRED* AND NOT a non-dev-owner+null-next_agent row — the Phase-1 supervised set (see `.head.note` history) is held OUT of this auto-pickup lane and is picked up instead by the **Supervised-Lane Sweep (SLS)** below (rows that are BOTH `effective_supervised` AND `effective_plan_only`) — see FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (2026-07-21): prior to that fix this comment claimed gated rows "still launch normally via the router-adjudicated path (Step 1 PO triage / manual dispatch)", which was FALSE — no such sweep existed anywhere (confirmed live against `docs/agents/po/flow/main.md` + this file's own pre-fix content; root cause of 6+ day idle P0 rows, see `scripts/po-signaldrain-20260721T16-bctcscope-cowork-loopclosure.jq`). **SUPERVISED GATE (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE, 2026-07-09):** `effective_supervised` = true if EITHER inline `.supervised` on the board row OR — detail-authoritative — `docs/data/orch/archive/backlog-detail.json` `.items[<id>].supervised` is true (no `.detail_ref` precondition; lookup is keyed purely by `.id`); absent/null in both = NOT supervised (promotable). Closes the 2026-07-09T15:48Z near-miss where the old board-row-only check silently treated every detail_ref'd supervised row as unsupervised. **EPIC-WRAPPER GATE (FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE, 2026-07-10):** `is_epic_wrapper` = true if EITHER inline `.children` on the board row OR `docs/data/orch/archive/backlog-detail.json` `.items[<id>].children` resolves to a non-empty array (same no-`.detail_ref`-precondition precedence as the supervised gate) — decomposition-container rows (e.g. `mode=audit-epic`/multi-child SPIKEs) are NEVER auto-promoted, independent of the `supervised` flag's value. Closes the 2026-07-09T23:17Z near-miss (`AUDIT-FETCH-COMPLETE` auto-claimed, point-fixed by hand with `supervised:true`) plus the structurally identical `FACTORY-GUARD-CI-REGRESSION-SPIKE` row, which the supervised gate alone could not catch (`supervised:null` everywhere). **DEPENDS-ON GATE (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08):** effective `depends_on` = inline `.depends_on` on the board row if non-empty, else — for `detail_ref`'d rows — the lookup in `docs/data/orch/archive/backlog-detail.json` `.items[<id>].depends_on`, else `[]`; a dep is satisfied ONLY if it resolves to `status == "DONE_VERIFIED"` in ANY task_board lane OR (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING, 2026-07-28) as a normalized-`DONE_VERIFIED` entry in cold-archived `docs/data/orch/archive/YYYY-MM.json` `.done_tasks[]` (plain `DONE` is NOT sufficient in either location), and a dep id found in NEITHER hot NOR cold-archive is treated as UNSATISFIED (conservative-skip — never blanket-satisfied). Filter applies during candidate selection so a blocked top-ranked row cannot starve an eligible lower-ranked one. Requires `--slurpfile detail docs/data/orch/archive/backlog-detail.json` AND `--slurpfile archive <(bash scripts/lib/archive-glob-cat.sh)` on the invocation (see block above; see `scripts/lib/devteam-eligibility.jq` `dep_status_map($archive)` for the full root-cause + normalization contract). **DETAIL-DEFERRED GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated if `docs/data/orch/archive/backlog-detail.json` `.items[<id>].status` is a non-null string whose ascii-downcased value STARTS WITH `"deferred"` (case-insensitive; covers `DEFERRED`, `DEFERRED-INFRA`, and any future `DEFERRED-<reason>` variant — 11 detail rows carry a detail-DEFERRED* status live today); looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the supervised/children gates); absent/null detail status = NOT gated (promotable). Closes the 2026-07-12 near-miss where `BCTC-HIST-VPS-BACKFILL` (detail status `DEFERRED-INFRA`) was re-picked at 09:37Z and 10:07Z because the board layer never mirrors a detail DEFERRED* disposition back onto the thin backlog[] row's own `status` field. **NON-DEV-OWNER GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE, 2026-07-12):** a row is gated ONLY if BOTH hold — (1) `docs/data/orch/archive/backlog-detail.json` `.items[<id>].owner` is a non-empty string that does NOT match the dev-role pattern `^dev(-|$)|^developer$` (case-insensitive, i.e. it names a deliberate-launch owner such as po/ops/architect/agents-architect/ba/pm/qa/agent-father/system-auditor), AND (2) the BOARD row's `.next_agent` is null/absent/empty (see the "NON-CODE / DESIGN row `next_agent` gap" note below — with no `next_agent`, zone-detect's Tier-3 fallback would mis-route the row to the generic `developer` placeholder). Scoped to THIS unattended idle-pickup lane only — a row gated here AND ALSO `effective_plan_only` is picked up by the **Supervised-Lane Sweep** below; a row gated here WITHOUT `plan_only` is a tracked residual gap (no dedicated sweep lane yet — surfaced by `scripts/audits/bounded1-supervised-lane-report.sh`'s SECONDARY section, not silently assumed-covered). Conservative default (absent/empty owner, dev-role owner, or a non-empty `next_agent`) = NOT gated (promotable). Closes the 2026-07-12 near-miss where the next two queued BOUNDED-1 picks behind `BCTC-HIST-VPS-BACKFILL`, `FIX-COWORK-SPAWN-IDENTITY-PREAMBLE-OFFFLOW` and `IND-ROADMAP-LEDGER` (both `owner:"po"`, `next_agent:null`), were the same structural class. **PLAN-ONLY GATE (FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE, 2026-07-12; generalized to `effective_plan_only` board-OR-detail by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16):** a row is gated if EITHER the board row's own inline `.plan_only` OR `docs/data/orch/archive/backlog-detail.json` `.items[<id>].plan_only` is exactly `true` — looked up purely by `.id` (no `.detail_ref` precondition, same precedence as the sibling gates above); conservative default (absent/null in both places) = NOT gated (promotable). `plan_only:true` rows are plan-first / architect-recon asks, not autonomous code-fixes, and are withheld from idle auto-pickup — route them via deliberate architect/PO dispatch instead. Closes the 2026-07-12 near-miss where `FIX-MCP-MEMORY-CODE-LEAK` (board `status:BACKLOG, next_agent:null`, detail `plan_only:true, next_agent:"architect", owner:"dev", status:"TODO"`) defeated both the DETAIL-DEFERRED gate (`status:"TODO"` doesn't start with "deferred") and the NON-DEV-OWNER gate (`owner:"dev"` is a dev-role owner) and was auto-picked/routed to a dev specialist as an autonomous code-fix. **NON-DEV-NEXT_AGENT GATE (FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12; generalized to `effective_next_agent` detail-first/board-fallback by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16, which also SUBSUMES FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE):** sibling of NON-DEV-OWNER but keys off `.next_agent` instead of `.owner` — a row is gated if the row's EFFECTIVE `next_agent` (`docs/data/orch/archive/backlog-detail.json` `.items[<id>].next_agent` if present-non-empty, ELSE the board row's own inline `.next_agent`) is a non-empty string that does NOT match the dev-role pattern `^dev(-|$)|^developer$` — i.e. not zone-detect-routable, covering architect/ba/pm/agents-architect AND the maintenance lane (agent-father/system-auditor/code-janitor/...) in one check; conservative default (absent/empty effective next_agent, or a dev-role value) = NOT gated (promotable). The prior version's extra "AND board next_agent is empty" clause is REMOVED — that clause is exactly why an inline board `next_agent` naming a non-dev agent with no detail entry at all (e.g. `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC`, `next_agent:"architect"`) previously slipped through. Closes the 2026-07-12 near-miss where `FEAT-SEVERITY-OVERRIDE-SURFACING` (detail `next_agent:"architect"`, no `owner` field at all) defeated the NON-DEV-OWNER gate (silent on an absent `owner`) and would have been auto-promoted for a single-`developer` Tier-3 zone-detect mis-route, skipping the required ba→architect→pm relay. Regression verifier: `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (dynamic live-data fixtures, no hardcoded task IDs — see Reusable Scripts below). **PROSE-SEQUENCING GATE (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23):** a row is gated if `has_unbacked_sequencing_prose` is true — EITHER the board row OR its detail_ref'd counterpart carries any object key matching `^po_sequencing` (a PO-authored ordering note, e.g. `po_sequencing_20260722`), AND the row's `effective_depends_on` (already board-OR-detail, already unions `.depends_on`/`.depends`/`.blocked_by`) resolves to an EMPTY list — i.e. the ordering constraint exists only in prose, not machine-readable form. Conservative default (no `po_sequencing_*` key anywhere, or `depends_on` non-empty regardless of prose) = NOT gated. Deliberately does NOT parse the prose to infer a predecessor task-id (regex-mining English sentences for control flow is brittle) — it only forces the ordering to be encoded as real `depends_on` before auto-dispatch proceeds. Closes the 2026-07-22 near-miss where `UC-CDC-P5` (ordering constraint lived only in `.po_sequencing_20260722`, "must land LAST after UC-SDF-P6 and the liveness watchdog") was blind-promoted by BOUNDED-1 then had to be reverted; acutely contained by hand-installing `depends_on` on that one row. Surfaced (not silent) by `scripts/audits/bounded1-supervised-lane-report.sh`'s TERTIARY section — lists every backlog row carrying unbacked prose sequencing so PO is nudged to encode the dep. Regression verifier: `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` (SYNTHETIC unbacked/backed/detail-side/control fixtures + a LIVE dynamic discovery check, no hardcoded task IDs). Moves the picked row backlog→ready, stamps `promoted_at`/`promoted_by`/`promotion_note` + `.task_board.last_triaged_at`/`last_triaged_by`. No-op (identity) if `WIP >= 1` or nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-bounded1.jq`): moves the bounded-1-stamped ready row → in_progress, sets `.head.status="in_progress"`, `.head.active_task_id=<id>`, `.head.next_agent` (the row's own `next_agent` if set, else `"developer"` placeholder — Step 3's zone-detect skill re-resolves the real specialist from the task's `zone`/files). No-op if nothing bounded-1-stamped is waiting in `ready[]`.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite.
- **NON-CODE / DESIGN row `next_agent` gap (found 2026-07-09T17:48Z, `ARCH-HEADLESS-GATEWAY-COWORK-NOPOST`):** `.claude/skills/zone-detect/SKILL.md` only ever resolves a task to `dev-<service>` or generic `developer` (Tier 1/2 need `apps/<service>/`-shaped `zone`/`files`; Tier 3 fallback is also `developer`) — it has **no path to `agents-architect`, `architect`, `ba`, `pm`, or any non-dev-* specialist**. A BOUNDED-1-picked row whose thin board entry has no `next_agent` gets the `"developer"` placeholder above regardless of `type`. Before letting zone-detect run on the claimed row, check `docs/data/orch/archive/backlog-detail.json .items[<id>].owner` (and `.type`) — if `owner` names a non-dev-* agent (e.g. `agents-architect` for `type:"design"` root-cause/architecture asks), correct `.head.next_agent` (and the task row's own `next_agent`) to that owner via `orch-apply.sh` BEFORE dispatch, instead of routing a design/doc deliverable to `developer` through zone-detect's Tier-3 fallback. **This note is now vestigial for BOUNDED-1 itself** — the NON-DEV-OWNER/NON-DEV-NEXT_AGENT gates (2026-07-12/07-16) already exclude every row this note describes from ever reaching BOUNDED-1's own claim step. It remains true, and is now MECHANIZED (not manual-check prose), for the Supervised-Lane Sweep immediately below, which exists specifically to dispatch that excluded set.

---

### Supervised-Lane Sweep (SLS)

FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21). Reached ONLY when `$SELECTED == "sls"` this tick (§ Idle-Tick Rotation Selection above) — if a different id was selected, SKIP this entire section outright and continue to the next physically-listed section. Still inside the same head-idle fall-through as every other rotation candidate. Control flow guarantees `.head` is still idle whenever this block runs (rotation's total mutual exclusion — only ONE of the 6 sections ever executes a given tick — makes this an even stronger guarantee than the old "BOUNDED-1 declined" precondition), so SLS setting `.head` cannot collide with any other lane's claim.

**Problem this closes:** rows carrying BOTH `effective_supervised == true` AND `effective_plan_only == true` are correctly withheld from BOUNDED-1 (by design — a deliberate-dispatch, not-an-autonomous-fix class) but scripts/devteam-backlog-promote-bounded1.jq's own comments claimed they "still launch normally via the router-adjudicated path (Step 1 PO triage / manual dispatch)". CONFIRMED FALSE 2026-07-21: neither `docs/agents/po/flow/main.md` (PO's own pre-checks/No-Task-Guard read `.task_board` for blocked/pending/in-progress work and Telegram reports — never a priority-ordered sweep of `backlog[]` for supervised/plan_only rows) nor this file (before this fix) ever dispatched that set. Result: P0 rows idled 6+ days (`FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS`) purely because the promised destination did not exist. Root-cause confirmation: `scripts/po-signaldrain-20260721T16-bctcscope-cowork-loopclosure.jq` (the PO signal-drain that minted this very task) states it explicitly in its own `question` field.

**Fix — SLS spends the SECOND slot of the pre-existing WIP≤2 invariant** (`docs/agents/dev-team/flow/main.md` § Invariants) — NOT a new budget. BOUNDED-1's own header comment already names this slot: *"[WIP≤2] is the existing, separate router/PO WIP budget for supervised/manual dispatch; this auto-pickup lane [BOUNDED-1] is bounded independently and more conservatively [WIP<1]"*. SLS is the automated writer for that previously-named-but-never-used slot. The Ready-Lane Consumer immediately below shares this SAME slot (a 2nd/3rd writer, not a 3rd budget).

**WIP2 FORMULA (corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK; FURTHER corrected 2026-07-30, FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS):** same fix as BOUNDED-1's WIP above — `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`, excludes BLOCKED/TERMINAL_SET rows from the count), never a bare `.task_board.in_progress|length`, never `ready[]`. The pre-fix formula `(ready|length)+(in_progress|length)` was 37 against the live board on the exact day this sweep shipped (ready=36, in_progress=1), so `WIP2<2` was false from the moment this section was written — this sweep was dead on arrival despite its own acceptance instrument (`scripts/audits/bounded1-supervised-lane-report.sh`, lane-resolution only) showing green. See `docs/agent-memory/decisions/sprint-UNBLOCK-DEVTEAM-DISPATCH-GATE-DEADLOCK-po.md` and the satisfiability instrument `scripts/audits/devteam-dispatch-gate-satisfiability.sh`.

```bash
WIP2=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' docs/data/orch/orch-state.json)
if [ "$WIP2" -lt 2 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-promote-supervised-lane-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  # FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER (2026-07-30):
  # claim now ALSO resolves an unstamped supervised+plan_only ready[] row
  # (arrived via PO/PM/architect placement, not this sweep's own promote) —
  # needs the same --slurpfile detail/--slurpfile archive contract as promote.
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-supervised-lane-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  sls_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# WIP2>=2, or nothing eligible in the supervised+plan_only quarantine -> fall through unchanged, continue to the Ready-Lane Consumer below
```

If `sls_head_status = "in_progress"` (a row was claimed this tick):
```
# Dispatcher-wrap (mirrors S4 UNBLOCK below) then spawn the RESOLVED specialist DIRECTLY.
# Do NOT "JUMP TO execute" here — execute-tier.md's zone-detect skill only ever resolves
# dev-<service>/developer (see the NON-CODE/DESIGN gap note above); routing an SLS-claimed
# row through it would silently discard the lane this sweep just resolved and re-route a
# non-dev specialist (architect/ba/po/ops/...) back to a generic "developer" placeholder.
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"SLS\",\"spawning\":\"" + head.next_agent + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] SLS SKIP " + bare_task_id + " — held by peer session"
  # fall through to Step 1 (do NOT spawn)
else:
  try:
    Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
    # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
    # success path — see the S2 dispatcher-wrap comment above for the full rationale. ttl_seconds:3600 on
    # outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL lapse) is what re-opens resume.
  except:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
    raise
  JUMP TO end   # SLS dispatch queued this tick; do not also fall through to PO triage in the same tick
```

- **Promote** (`scripts/devteam-backlog-promote-supervised-lane-sweep.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `effective_supervised == true` AND `effective_plan_only == true` (the exact doubly-gated class, same board-OR-detail / detail-first-board-fallback `effective_*` precedence as BOUNDED-1 — no forked logic) AND NOT an epic wrapper AND `depends_on` is eligible AND NOT detail-DEFERRED*. Resolves `dispatch_lane` = `effective_next_agent` if non-empty, ELSE `effective_owner` if non-empty, ELSE `"developer"` (defensive fallback only — every live row resolves to a real specialist today, verified by the report script below). Stamps the promoted row with `promoted_at`/`promoted_by="dev-team (supervised-lane sweep)"`/`promotion_note`/`dispatch_lane` — **`supervised`/`plan_only` are carried through UNCHANGED** (still `true`); this is an ADDITIVE lane assignment, never a gate-clear. No-op if nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-supervised-lane-sweep.jq`): PRIMARY — moves the swept ready row → in_progress, sets `.head.next_agent` to a resolved specialist (never a `"developer"` fallback-of-last-resort unless `resolved_dispatch_lane` itself terminates there). **FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT (2026-08-26, scope-widened from the DRS sibling defect):** PRIMARY used to read the row's cached `dispatch_lane` verbatim; it now re-resolves `resolved_dispatch_lane($detail_items)` FRESH at claim time for every stamped candidate (same resolver the promote script and FALLBACK below already use — NOT bare `effective_next_agent`, since a PRIMARY candidate is not guaranteed a present `next_agent` the way a DRS candidate is), sorted by `[priority_rank, idx]` (same ordering fix as DRS), refusing a candidate whose resolution comes up empty (in practice never trips here, since `resolved_dispatch_lane`'s own terminal `"developer"` fallback guarantees a non-empty result — the guard is defense-in-depth, matching DRS). **FALLBACK (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30, reached only when PRIMARY finds nothing this tick):** also claims a ready[] row that is `effective_supervised && effective_plan_only` but carries NO `promoted_by="dev-team (supervised-lane sweep)"` stamp — i.e. it reached `ready[]` via PO hand-placement, PM/architect decomposition, or an earlier manual promote, never through this sweep's own promote script. **ROOT CAUSE this closed:** such a row was previously rejected by ALL FOUR pickers (BOUNDED-1 never reads `ready[]`; this claim script's own PRIMARY selector required the exact stamp only the promote script writes, and that promote script structurally cannot reach `ready[]`; RLC excludes `effective_supervised`/`effective_plan_only` unconditionally; DRS excludes the supervised&&plan_only-BOTH class and also only reads `backlog[]`) — unreachable by construction. FALLBACK applies the SAME gates the promote script already uses (`effective_supervised`, `effective_plan_only`, NOT `is_epic_wrapper`, `deps_satisfied`, NOT detail-DEFERRED*, no forked logic) and resolves `dispatch_lane` via the SAME `resolved_dispatch_lane($detail_items)` helper. **Does NOT forge `promoted_by`** (AC-2 explicit constraint — that would falsify provenance): the row's existing `promoted_by` is carried through unchanged; `claimed_by` is stamped with a distinct string (`"dev-team (supervised-lane sweep — unstamped ready fallback)"`) so PRIMARY vs FALLBACK claims stay auditable. No-op if nothing SLS-stamped AND no FALLBACK candidate is waiting in `ready[]`. Now requires `--slurpfile detail`/`--slurpfile archive` on every invocation (added to the caller above) — FALLBACK's gates need both.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Idempotency + Zod-schema + conservation dry-run verified 2026-07-21 (scratch-copy replay, never against the live file); FALLBACK path scratch-verified 2026-07-30 (positive claim + negative controls for epic-wrapper and unmet-`depends_on` exclusion, plus a PRIMARY-vs-FALLBACK-coexist ordering check).
- **Acceptance / regression instrument:** `scripts/audits/bounded1-supervised-lane-report.sh` — read-only, run live, lists every supervised+plan_only row with its resolved `dispatch_lane` and age in days; exits 1 if any such row's lane is unresolved (`none`). Also prints (informational, non-gating) the wider supervised-XOR-plan_only set for visibility into the residual NON-DEV-OWNER/NON-DEV-NEXT_AGENT-only gap noted above. **Extended 2026-07-30 (AC-5, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER) to also scan `ready[]`/`review[]`, not just `backlog[]`** — see § Lane × Gate Coverage Matrix below and the script's own new sections. **This instrument tests LANE RESOLUTION only, not gate satisfiability** — it shipped green while this sweep's own firing gate was dead (see WIP2 note above). The satisfiability instrument is `scripts/audits/devteam-dispatch-gate-satisfiability.sh`, extended 2026-07-30 with the FALLBACK claim's own positive/negative assertions (AC-6).

#### Lane × Gate Coverage Matrix (AC-1, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30)

Every `(lane × supervised × plan_only × epic-wrapper)` combination resolves to exactly one named picker or an explicit documented no-picker verdict — none may be silently uncovered. `sup`/`po`/`wrap` below are `effective_supervised`/`effective_plan_only`/`is_epic_wrapper` (`scripts/lib/devteam-eligibility.jq`); "dev-role next_agent" = matches `^dev(-|$)|^developer$`.

| Lane | sup | po | wrap | Resolution |
|---|---|---|---|---|
| `backlog[]` | F | F | F | **BOUNDED-1** (if next_agent/owner dev-role or unresolved) or **DRS** (if non-dev + allowlisted). Off-allowlist non-dev (`agent-father`/`ops*`/`qa`/`system-auditor`) = **DRS-STRANDED-OFF-ALLOWLIST**, policy exclusion, manual/PO dispatch only (documented, non-gating). |
| `backlog[]` | F | T | F | **DRS** if `next_agent` is non-dev + allowlisted; **DRS-STRANDED-OFF-ALLOWLIST** (manual/PO dispatch) if non-dev + off-allowlist. If `next_agent` is dev-role or absent: **BACKLOG-XOR-GAP** (`is_backlog_xor_gap`, `scripts/lib/po-manual-dispatch-eligibility.jq`) — folded into `docs/agents/po/flow/manual-dispatch-sweep.md`'s existing human-gated PO sweep as a 3rd candidate class (`FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER`, 2026-08-07; formerly RESIDUAL GAP/out-of-scope — resolved po_residual_measurement_20260728's sub-question 1). Surfaced non-gating by the report script's SECONDARY + new BACKLOG-XOR-GAP sections. |
| `backlog[]` | T | F | F | **DRS** if `next_agent` is non-dev + allowlisted (DRS excludes only the sup&&po-BOTH class, not `sup` alone); **DRS-STRANDED-OFF-ALLOWLIST** if non-dev + off-allowlist. If `next_agent` is dev-role or absent: **BACKLOG-XOR-GAP**, same mechanism as the row above — a MECHANICAL PO-ratify-then-BATCH sweep, not an unattended auto-dispatch predicate, so the original "auto-dispatching a `supervised:true` dev-role row would defeat the reason the flag exists" concern still holds and is honored (PO gates every dispatch via `BATCH`); what changed is that PO no longer has to notice the row incidentally — the sweep now finds it every tick. BOUNDED-1/SLS/DRS's own predicates are UNCHANGED by this fix (neither widened to an OR, per that same concern — see `is_backlog_xor_gap`'s header for why blanket gate-widening was rejected in favor of this shape). |
| `backlog[]` | T | T | F | **SLS-promote** (this section) — the named quarantine class, working as designed since 2026-07-21. |
| `backlog[]` | any | any | T | **No picker by design** (`is_epic_wrapper` excludes BOUNDED-1/SLS/RLC/DRS universally) — see AC-4 note below; children are the dispatchable unit. |
| `ready[]` | F | F | F | **RLC** (Ready-Lane Consumer), if a resolved `next_agent`/`owner` exists; a row with neither is a documented defensive-only edge case (RLC's own header: "not this consumer's target"), no live instances. |
| `ready[]` | F | T | F | **READY-XOR-SUP-OR-PLANONLY** (`is_ready_xor_gap`, `docs/agents/po/flow/manual-dispatch-sweep.md`, shipped 2026-07-31 — corrected here 2026-08-07, this matrix row was stale and still read "out of scope" a week after the mechanism landed) — RLC excludes any `sup`/`po` alone; SLS-claim's FALLBACK requires BOTH true, deliberately not widened (same rationale as the `backlog[]` XOR rows above); the PO manual-dispatch sweep is the actual, live, human-gated destination. Surfaced non-gating (§ report script's READY-XOR section) as a cross-check, not the mechanism itself. |
| `ready[]` | T | F | F | **READY-XOR-SUP-OR-PLANONLY**, same mechanism and same correction as the row above — RLC excludes it; SLS-claim's FALLBACK requires BOTH `sup` AND `po` true (deliberately not widened to sup-XOR-po, mirroring the `backlog[]` BACKLOG-XOR-GAP rationale: a human PO gate, not a wider auto-dispatch predicate). |
| `ready[]` | T | T | F | **SLS-claim PRIMARY** (stamped by SLS-promote) or **SLS-claim FALLBACK** (unstamped — THE FIX this task ships, see Claim bullet above). |
| `ready[]` | any | any | T | **No picker by design** — same as `backlog[]`; closed out by Step 4.4 Epic-Wrapper Autoclose Sweep once `all_children_terminal`, never by any of the four ready[]/backlog[] pickers (AC-4, see below). |
| `review[]` | any | any | any | **Review-Lane QA-Drain**, unconditionally, whenever `effective_next_agent == "qa"` — deliberately does NOT gate on `sup`/`po`/`wrap` (AC-3, see § Review-Lane QA-Drain below). As of FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED (2026-08-06), this set is reachable via TWO invocation sites sharing the SAME `qa[] < QA_CAP` budget and the SAME claim script — the idle-tick block below (head-idle fall-through only) AND a head-decoupled site at the Session-Gate→Step-1 anchor (§ Review-Lane QA-Drain — Head-Decoupled Invocation, reached on busy ticks too) — never two divergent gates, one shared budget. `next_agent != "qa"` = **Review-Lane SECONDARY-Drain** (FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN, 2026-08-01 — see § Review-Lane SECONDARY-Drain below), which dispatches the row's own resolved owner (or `"po"` if unresolved) for triage/sign-off; also does not gate on `sup`/`po`/`wrap`. |

**AC-4 — epic-wrapper children:** a wrapper's `children[]` are gated/swept **individually**, by their OWN `effective_supervised`/`effective_plan_only`/`effective_next_agent` — NEVER inherited from the parent wrapper row. Live-verified 2026-07-30 against `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (the one live `ready[]` wrapper, `sup:true`/`po:true`/6 children): every child carries `supervised:null`/`plan_only:null` on its own row and is independently BOUNDED-1-eligible once its own `depends_on` chain clears — the wrapper gate does NOT "eat" the subtree, only the wrapper's OWN row (by design: a decomposition container is never itself atomic dispatchable work). The wrapper row itself is never re-promoted/re-claimed by BOUNDED-1/SLS/RLC/DRS; its lifecycle ends via `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4 Epic-Wrapper Autoclose Sweep (`scripts/devteam-wrapper-autoclose.jq`), which moves it to `review[]` once `all_children_terminal($detail_items; $status_map)` — a separate closeout path, not one of the four dispatch pickers above.

---

### Ready-Lane Consumer (RLC)

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22), PO ruling item (2). Reached ONLY when `$SELECTED == "rlc"` this tick (§ Idle-Tick Rotation Selection above) — if a different id was selected, SKIP this entire section outright and continue to the next physically-listed section. Still inside the same head-idle fall-through as every other rotation candidate. Control flow guarantees `.head` is still idle whenever this block runs (same total-mutual-exclusion argument as SLS's own gate above).

**Problem this closes:** `ready[]` holds rows from three sources — BOUNDED-1's own promote script, SLS's own promote script, and PM/architect decomposition (epic children minted DIRECTLY into `ready[]`, never through either promote script — e.g. `CCATO-MCP-T1..T8`, `SYSREMAKE-P2-T1..T9`, `DESIGN-COWORK-FANOUT-T1..T8`, 25 rows live 2026-07-21, all carrying a resolved inline `next_agent`). BOUNDED-1's and SLS's own CLAIM scripts each only claim rows stamped with their OWN `promoted_by` marker — the third source has neither marker and was therefore **never claimable by anything**: not by BOUNDED-1/SLS (marker mismatch), not by PO triage (`po/flow/main.md` never sweeps `ready[]` by priority), not by any other step in this file. RLC is the missing generic consumer.

Shares the SAME WIP≤2 budget as SLS (`wip_in_progress`, per the corrected formula above) — a 3rd writer of the same named slot, not a new budget.

```bash
WIP3=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' docs/data/orch/orch-state.json)
if [ "$WIP3" -lt 2 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-ready-lane-consumer.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  rlc_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# WIP3>=2, or nothing eligible in ready[] -> fall through unchanged, continue to the Review-Lane QA-Drain below
```

If `rlc_head_status = "in_progress"` (a row was claimed this tick):
```
# Dispatcher-wrap (mirrors SLS/S4 UNBLOCK) then spawn the RESOLVED specialist DIRECTLY.
# Do NOT "JUMP TO execute" — same rationale as SLS: the claimed row's next_agent is
# already resolved (dev-* or non-dev-*), and zone-detect's dev-only Tier-3 fallback
# would silently discard that resolution.
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"RLC\",\"spawning\":\"" + head.next_agent + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] RLC SKIP " + bare_task_id + " — held by peer session"
  # fall through to Step 1 (do NOT spawn)
else:
  try:
    Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
    # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
    # success path — see the S2 dispatcher-wrap comment above for the full rationale. ttl_seconds:3600 on
    # outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL lapse) is what re-opens resume.
  except:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
    raise
  JUMP TO end   # RLC dispatch queued this tick; do not also fall through to PO triage in the same tick
```

- **Claim** (`scripts/devteam-backlog-claim-ready-lane-consumer.jq`): single script, no promote half needed (candidates are already in `ready[]`). Picks the top-priority (priority_rank, FIFO tiebreak) `ready[]` row where `status ∈ {READY, TODO}` AND NOT supervised AND NOT plan_only AND NOT an epic wrapper AND `depends_on` is satisfied (cross-lane DONE_VERIFIED-only — LOAD-BEARING: the epic children carry real sequential `depends_on` chains onto their own siblings, e.g. `SYSREMAKE-P2-T9-QA-GATE` depends on 8 other T-rows; without this gate RLC would dispatch a child before its parent lands) AND NOT detail-DEFERRED* AND carries a resolved `effective_next_agent` or `effective_owner`. Moves `ready[] -> in_progress[]`, sets `.head.next_agent` to the resolved lane directly (no `"developer"` fabrication — a row with no resolvable next_agent/owner is simply not a candidate). No-op if nothing eligible.
- Write goes through `scripts/orch-apply.sh` ONLY. Idempotency + Zod-schema + conservation dry-run verified 2026-07-22 (scratch-copy replay against the live board — confirmed it correctly excludes rows with unsatisfied `depends_on`, e.g. `CCATO-MCP-T3` before `CCATO-MCP-T1` is `DONE_VERIFIED`, and correctly excludes supervised P0 rows despite higher raw priority).
- **Acceptance instrument:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (shared with BOUNDED-1/SLS/DRS/QA-Drain — see below).

---

### Design-Router Sweep (DRS)

FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (architect brief 2026-07-29, PO-ratified 2026-07-30 — `docs/agent-memory/decisions/ruling-20260730T0906Z-po-triage-po.md` STEP po-4). Reached ONLY when `$SELECTED == "drs"` this tick (§ Idle-Tick Rotation Selection above — DRS is the 6th rotation candidate, added there because it postdates and was never covered by the original 5-id 2026-07-25 rotation brief; see that section's own "DRS gap" note) — if a different id was selected, SKIP this entire section outright and continue to the next physically-listed section. Still inside the same head-idle fall-through as every other rotation candidate. Control flow guarantees `.head` is still idle whenever this block runs (same total-mutual-exclusion argument as SLS/RLC's own gates above).

**Problem this closes:** a backlog row whose `next_agent` does not match BOUNDED-1's dev-role pattern (`^dev(-|$)|^developer$`) and that is NOT ALSO caught by SLS's doubly-gated `supervised && plan_only` class sits with NO automated pickup path at all — named verbatim as a "tracked residual gap" in the Idle-capacity backlog pickup section above. Live re-verified 2026-07-29: 122 such rows (1 P0, 55 P1, 52 P2, 13 P3), scoped BACKLOG/TODO (a prior triage tick had cited a stale 61 — see the architect brief §0).

**Agent-identity allowlist (compensating control, ratified NARROW 2026-07-30):** UNLIKE SLS (no agent-identity filter — safe because SLS's rows are already double human-vetted via the supervised+plan_only pair at mint time), DRS fires on rows carrying NO deliberate-dispatch flag at all in the majority of live cases (86/122), so it needs a DIFFERENT compensating control — restrict WHICH resolved `next_agent` values it is willing to blind-dispatch. Ratified default allowlist: **`{architect, ba, pm, po, agents-architect}`** — pure design/decision/coordination agents, zero broad production-write tool grants. `agent-father` (fleet-wide blast radius — edits the files that define every OTHER agent), `ops`/`ops-mainserver-fetch`/`ops-vps-fetch` (repeated live-infra-mutation incident history), `qa` (wrong mechanism — has its own dedicated QA-Drain lane), and `system-auditor` (0 live rows at ratification time — unfalsifiable, add only once a real row appears) are explicitly NOT on the default allowlist — see `is_design_router_allowed` in `scripts/lib/devteam-eligibility.jq` for the full per-agent reasoning. A row whose resolved `next_agent` is off-allowlist simply is not a DRS candidate this tick — it stays inert in `backlog[]`, reachable only by deliberate PO/router dispatch; DRS narrows the gap, it does not close all of it. **CORRECTED 2026-08-26 (FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH):** until this fix, the allowlist was enforced ONLY at promote time — the claim script below never called `is_design_router_allowed` at all, so a row that re-resolved off-allowlist BETWEEN promote and claim (a correction, or a stale claim-time re-resolution race) was still blind-claimed. The gate is now applied at BOTH promote AND claim (claim's own bullet below has the detail) — "off-allowlist is never a DRS candidate" is enforced at every write this section makes, not just the first.

**WIP / concurrency budget:** DRS shares the SAME WIP≤2 (`wip_in_progress`) budget BOUNDED-1/SLS/RLC already share — a 4th writer of the existing named slot, NOT a new budget (DRS's claimed rows move into the SAME `in_progress[]` lane with the SAME concurrency meaning those three already meter — unlike QA-Drain's independent `qa[] < QA_CAP` budget, which is a structurally different lane).

```bash
WIP4=$(jq 'include "scripts/lib/devteam-eligibility"; wip_in_progress' docs/data/orch/orch-state.json)
if [ "$WIP4" -lt 2 ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq --arg now "$NOW" \
    --argjson allowlist '["architect","ba","pm","po","agents-architect"]' \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-promote-design-router-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  # FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT
  # (2026-08-26): claim now ALSO requires --slurpfile detail — it re-resolves
  # next_agent via effective_next_agent($detail_items) fresh at claim time,
  # never reads the promote-time `dispatch_lane` cache.
  jq --arg now "$NOW" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-design-router-sweep.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  drs_head_status=$(jq -r '.head.status' docs/data/orch/orch-state.json)
fi
# WIP4>=2, or nothing DRS-eligible -> fall through unchanged, continue to the Review-Lane QA-Drain below
```

If `drs_head_status = "in_progress"` (a row was claimed this tick):
```
# Dispatcher-wrap (mirrors SLS/RLC) then spawn the RESOLVED specialist DIRECTLY.
# Do NOT "JUMP TO execute" — same rationale as SLS/RLC: the claimed row's
# next_agent is already resolved (allowlist-checked non-dev), and
# zone-detect's dev-only Tier-3 fallback would silently discard it.
bare_task_id = head.active_task_id
resume_key   = "task:" + bare_task_id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"DRS\",\"spawning\":\"" + head.next_agent + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] DRS SKIP " + bare_task_id + " — held by peer session"
  # fall through to Step 1 (do NOT spawn)
else:
  try:
    Agent(head.next_agent, context... + head.next_action, run_in_background=true)   # (background) — BGFAN-1
    # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
    # success path — see the S2 dispatcher-wrap comment above for the full rationale. ttl_seconds:3600 on
    # outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL lapse) is what re-opens resume.
  except:
    call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
    raise
  JUMP TO end   # DRS dispatch queued this tick; do not also fall through to PO triage in the same tick
```

- **Promote** (`scripts/devteam-backlog-promote-design-router-sweep.jq`): selects the SINGLE top-priority row from `.task_board.backlog[]` where `status ∈ {BACKLOG, TODO}` AND `is_design_router_eligible` (`scripts/lib/devteam-eligibility.jq`: non-dev-`next_agent`-unrouted AND NOT SLS's own doubly-gated `supervised && plan_only` class — an AND, so a row carrying exactly ONE of the two flags is NOT excluded here and remains DRS-eligible — AND allowlisted AND not an epic wrapper AND `depends_on` eligible AND NOT detail-DEFERRED* AND no unbacked prose sequencing). Resolves `dispatch_lane = effective_next_agent($detail_items)` directly (no owner-fallback needed — every DRS candidate already has a present, non-empty, non-dev, allowlisted `next_agent` by construction). Stamps `promoted_at`/`promoted_by="dev-team (design-router sweep)"`/`promotion_note`/`dispatch_lane` — **never clears `supervised`/`plan_only`** on rows that happen to carry one of the two flags (additive stamp only). No-op if nothing eligible.
- **Claim** (`scripts/devteam-backlog-claim-design-router-sweep.jq`): moves the DRS-stamped `ready[]` row → `in_progress[]`, sets `.head.next_agent` to a resolved specialist (never a `"developer"` fallback). **FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT (2026-08-26):** this used to read the row's cached `dispatch_lane` verbatim (stale-cache misroute + null-lane unspawnable-head incidents, both live-confirmed) — it now resolves `effective_next_agent($detail_items)` FRESH at claim time (requires `--slurpfile detail`, same resolution RLC already performs), across ALL stamped candidates sorted by `[priority_rank, idx]` (a freshly-promoted P0 no longer starves behind an older stamp at a lower array index — a live-confirmed second, separable defect fixed in the same commit), refusing (no-op, never `.head.next_agent = null`) only if every candidate's resolution comes up empty. `dispatch_lane` is still written onto the claimed row but is now purely informational — re-stamped with this claim's own fresh resolution, never read back for routing. **FIX-DRS-CLAIM-HAS-NO-ALLOWLIST-GATE-OFF-ALLOWLIST-BLIND-DISPATCH (2026-08-26):** the claim-time re-resolution above closed the stale-cache class but is what made THIS class reachable — a row promoted while its resolved agent was on-allowlist can re-resolve OFF-allowlist by claim time, and this script applied NO allowlist check at all (unlike promote, which always has). Live-confirmed pre-spawn at the 10:07Z tick: an on-allowlist P0 was correctly promoted, then claim ignored it and took a DIFFERENT DRS-stamped P0 whose claim-time `next_agent` resolved to `developer`. Fix: the `$resolvable` candidate set is now ALSO filtered through `is_design_router_allowed($detail_items; design_router_default_allowlist)` (`scripts/lib/devteam-eligibility.jq` — the SAME predicate promote already applies, never a re-derived copy); an off-allowlist candidate falls out of the claim set as a silent no-op (the next priority-ranked candidate is tried instead, same handling as the null-lane refuse case), never downgraded or dispatched. Uses the library's own default directly rather than a NEW `--argjson allowlist` CLI flag on this script's invocation — the ratified set now lives in exactly one place (see that def's doc comment) instead of needing to be re-threaded, verbatim, at every call site that wants the gate. **`.head` write uses the MANDATORY conditional guard** (`$head_free = (.head.status in {idle,done}) or .head.active_task_id == null`) — never an unconditional replace, per the ratification's hard AC (Q3) and the live `qadrain-head-slot-decouple` precedent that proved "safe by current placement" is not a durable invariant in this flow-doc. No-op if nothing DRS-stamped is waiting or every candidate refuses.
- Both writes go through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Dry-run verified against a scratch copy of the live board 2026-07-30 (never against the live file): promote correctly picked the live top-priority DRS-eligible row (a P0), claim correctly left a genuinely-busy `.head` byte-identical (negative control) while still moving the row `ready[] -> in_progress[]`.
- **Related-but-out-of-scope finding (brief §3, PO ratification Q3):** the SAME unconditional-`.head`-overwrite pattern this section's claim script deliberately avoids was found live in `scripts/devteam-backlog-claim-bounded1.jq:57`, `scripts/devteam-backlog-claim-supervised-lane-sweep.jq:66`, and `scripts/devteam-backlog-claim-ready-lane-consumer.jq:151`. PO ratified minting a separate hardening row for those three (`FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE`, already in `.task_board.backlog[]`) rather than folding that retrofit into this task — not touched here.
- **Additional gap flagged, explicitly OUT OF SCOPE for this implementation (PO's own added input, ruling STEP po-4):** 34 live backlog/ready rows (re-verified 2026-07-30, down from PO's 41 at ratification time — one, `SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD`, was separately unstranded this cycle via a `plan_only` null→true fix and no longer belongs to this set) carry `supervised:true` with `plan_only` NOT true. Of these 34: **10 already become DRS-eligible as specified above** (non-dev, allowlisted `next_agent` — DRS's exclusion clause only ever excludes the `supervised && plan_only` BOTH-true class, never `supervised` alone — this includes 2 of the P0s the ratification named, `UC-CCA-P3` and `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`, both `next_agent` on the allowlist); **5 have a non-dev `next_agent` that is off-allowlist** (all `agent-father` — deliberately excluded by the same ratified allowlist, not a new gap); **7 carry a DEV-role `next_agent`** (e.g. `FIX-SPRINT-TASK-HEARTBEAT-LOCK`, P0, `next_agent:"developer"`) — these are NOT covered by DRS (`is_non_dev_next_agent_unrouted` excludes dev-role values by construction, regardless of `supervised`), NOT covered by BOUNDED-1 (excludes `supervised:true`), and NOT covered by SLS (excludes `plan_only != true`). Auto-dispatching a `supervised:true` dev-role row to `developer` with zero PO/human gate would defeat the exact reason the `supervised` flag exists — that is a materially new risk/design decision, not an implementation-only call. Left explicitly PO-adjudicated row-by-row; NOT folded into DRS's predicate. **UPDATE 2026-08-07 (`FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER`, architect):** "PO-adjudicated row-by-row" above meant, in practice, "reachable only by incidental PO notice" — no PO flow step actually swept for this class until `docs/agents/po/flow/manual-dispatch-sweep.md`'s `BACKLOG-XOR-GAP` candidate class (added 2026-08-07, `is_backlog_xor_gap` in `scripts/lib/po-manual-dispatch-eligibility.jq`) started doing so. This does NOT reverse the ruling above — DRS's own predicate is still untouched, still excludes this class, and dispatch still requires a human PO to fold the row into `BATCH` (Step 2/3 of that sub-flow, unchanged); what changed is that PO's own tick now finds the row mechanically instead of relying on someone happening to read this paragraph. Same 7-dev-role-`next_agent` rows plus the analogous 2 `plan_only`-alone dev-role rows PO's ruling never explicitly named — 9 total at ratification-adjacent count, 39 once the wider `backlog[]` XOR set (including absent-`next_agent` rows the ratification also never measured) is included — see `is_backlog_xor_gap`'s header for the full live count.
- **Acceptance / regression instrument:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` (shared with BOUNDED-1/SLS/RLC — see below) and `scripts/audits/bounded1-supervised-lane-report.sh`'s dedicated DRS section (distinct from the pre-existing SECONDARY supervised-XOR-plan_only visibility table).

---

### Review-Lane QA-Drain

UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22), PO ruling item (3) — FOLDS `FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN` (backlog since 2026-07-12; this section + its scripts ARE that row's own SUGGESTED REMEDY, implemented). Reached ONLY when `$SELECTED == "qa_drain"` this tick (§ Idle-Tick Rotation Selection above) — if a different id was selected, SKIP this entire (idle-tick) section outright and continue to the next physically-listed section; the SEPARATE head-decoupled invocation site below (§ Review-Lane QA-Drain — Head-Decoupled Invocation) is UNCONDITIONAL and untouched by this rotation gate — see that section's own header for why. Still inside the same head-idle fall-through as every other rotation candidate.

**Problem this closes:** `review[]` is a WRITE-ONLY lane in this flow — every developer DONE pushes a row INTO `review[]`; grep-confirmed (2026-07-12, re-confirmed 2026-07-21) nothing anywhere in `docs/agents/dev-team/flow/*.md` or `docs/agents/po/flow/main.md` ever scans `.task_board.review[]` for a stranded row whose inline qa dispatch never ran (dev session died, host wedge, etc). Live 2026-07-21: 32 review rows, 10+ with `next_agent=='qa'` and `qa[]==0`, oldest frozen 11+ days.

**HARD PREREQUISITE (do not treat as separable — PO AC):** every live `review[]` row carries `branch: null` (grep-verified, all 32) — committed straight to `main` by the FIX direct-execute path, never on a `task/NNN-*` branch. QA's normal `pipeline` JUMP-TO requires `git checkout task/NNN-*` (`docs/agents/qa/flow/main.md` line ~113) and CANNOT run against these rows. This is why `docs/agents/qa/flow/main.md` now carries an additive `verify-committed` JUMP-TO entry (§ Direct-Commit Verify) — QA-drain-claimed rows MUST be spawned in that mode, never the normal `pipeline` mode.

Dedicated `qa[] < QA_CAP` cap (NOT the shared WIP≤2 in_progress budget above) — per the row's own 2026-07-12 SUGGESTED REMEDY and because this lane moves rows into a different board lane entirely. **THROUGHPUT-CAP batch shape (FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP, 2026-08-06):** raised from the original hardcoded `<1` single-claim to a named `QA_CAP=10` batch-claim — one-row/tick could never keep pace against the eligible backlog (198+ PRIMARY rows, ~34/day net inflow measured 2026-08-01, `docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md` §1). This EXACT shape (named constant + `TAKE_BUDGET` + batch-claim + `claimed_at`/`claimed_by`-correlated BGFAN-1 fan-out) is reused verbatim by the head-decoupled invocation site below (§ Review-Lane QA-Drain — Head-Decoupled Invocation) — shipping two divergent batching shapes for the same underlying claim script was flagged and rejected (`docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §1b).

```bash
QA_CAP=10   # named constant, single source — was hardcoded <1 (2026-07-22 SUGGESTED REMEDY: "WIP<=1 for
            # this lane"); raised per PO's 2026-07-29 AC-3 finding ("reachability necessary but not
            # sufficient") and this row's own 2026-07-28/08-01 measured-non-drain evidence. SAME value
            # reused by the head-decoupled invocation site below — retune BOTH occurrences together if
            # the 5-tick DoD trend (see Acceptance instrument below) under/over-shoots.
QA_WIP=$(jq '.task_board.qa|length' docs/data/orch/orch-state.json)
if [ "$QA_WIP" -lt "$QA_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TAKE_BUDGET=$((QA_CAP - QA_WIP))
  jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  picked_batch=$(jq -c --arg t "$NOW" --arg by "dev-team (review-lane qa-drain)" \
    '[.task_board.qa[] | select(.claimed_at == $t and .claimed_by == $by)]' \
    docs/data/orch/orch-state.json)
fi
# QA_WIP>=QA_CAP, or nothing eligible in review[] -> $picked_batch stays empty/unset -> fall through
# unchanged, continue to Session Gate / Step 1 PO triage
```

If `$picked_batch` is non-empty (>=1 row claimed this tick):
```
# BGFAN-1 fan-out — one independent verify-committed qa session PER row in the batch, no shared
# mutable state beyond orch-apply.sh's own CAS guard (already serializes conflicting writes).
for row in $picked_batch:
  resume_key = "task:" + row.id
  outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
    ttl_seconds: 3600,
    payload: "{\"site\":\"QA-DRAIN\",\"spawning\":\"qa\"}"
  })
  if not outer_claim.claimed:
    log "[dev-team] QA-DRAIN SKIP " + row.id + " — held by peer session, reverting lane-move"
    # FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA (architect brief
    # docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md §3):
    # the claim script above ALREADY moved this row review[]/done[] -> qa[] before this per-row
    # outer_claim ran. Without a revert, a SKIPped row strands in qa[] forever — nothing re-scans
    # qa[] for an undispatched row. Revert immediately, same tick, routed by the already-stamped
    # `drain_source_lane` field. No `redispatch_count` charge — no qa work happened.
    NOW_REVERT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg id "<row.id>" --arg now "$NOW_REVERT" \
      -f "$PROJECT_ROOT/scripts/devteam-qadrain-skip-revert.jq" \
      docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
    # do NOT `|| true` this pipe — a silently-discarded nonzero exit here would reproduce, on this
    # NEW call site, the exact defect FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-NO-RETRY is
    # chartered to fix elsewhere in this same file. Log loudly on any nonzero exit instead.
    continue   # do NOT abort the whole batch over one peer-held row
  else:
    try:
      # Spawn qa with mode=verify-committed, built DIRECTLY from row.id — never from
      # head.next_action, which only narrates ONE row of a possibly-N-wide batch (cosmetic-only
      # per Part 1's own design note; batching extends that to "narrates one of N, for all N").
      # Do NOT spawn qa's normal pipeline mode — this row has no task branch/handoff to check out.
      Agent("qa", context... + "task_id=" + row.id + " mode=verify-committed", run_in_background=true)
      # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
      # success path — see the S2 dispatcher-wrap comment above for the full rationale. ttl_seconds:3600 on
      # outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL lapse) is what re-opens resume.
    except:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      raise
JUMP TO end   # a batch was dispatched this tick; do not also fall through to Step 1/PO triage same tick
```

- **Claim** (`scripts/devteam-review-claim-qa-drain.jq`): picks up to `TAKE_BUDGET` rows, ordered `sort_by([priority_rank, age])` — PRIORITY-first, age tiebreak (changed from pure age-order, FIX-DEVTEAM-QADRAIN-THROUGHPUT-CAP 2026-08-06: this was the one lane in the whole idle-fallthrough chain still ignoring `priority_rank`, letting same-day P0 rows queue behind a 13-14 day P2/P3 FIFO wall — `docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §2) from `review[]` where `status == "REVIEW"` (excludes BLOCKED — negative control) AND `effective_next_agent == "qa"` (PRIMARY set only; the null/non-qa subset is a different, not-yet-covered owner-triage class, surfaced non-silently by the report script below, never silently treated as fine). **NOT-BEFORE TIME-GATE (FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE, architect brief `docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md` §1a):** a row carrying any known do-not-pick-before-T field (`is_gated_not_before`/`gate_not_before_keys`, `scripts/lib/devteam-eligibility.jq` — KNOWN-LIST: `qa_not_before`, `next_recheck_not_before`, `qa_new_window_earliest_d1_close`) whose value is STRICTLY LATER than `$now` is excluded from the candidate set entirely — no lane-move, no claim stamp, byte-identical skip; absent/unparseable gate values never suppress selection. This is a picker-side gate ONLY — it protects the two scripted call sites (this one and the head-decoupled site below), NOT router hand-dispatch; see `docs/agents/qa/flow/main.md` § Step 0d for the convergent backstop that also covers hand-dispatch. Moves the WHOLE batch `review[] -> qa[]`, status `REVIEW -> QA`, stamps every row in the batch with the SAME `claimed_at`/`claimed_by` (batch-correlation idiom — lets any caller regroup the batch via that stamp); `.head` write stays the Part-1 conditional guard (`FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL`, DONE_VERIFIED), narrating only the batch's own highest-ranked row (cosmetic, non-load-bearing — never used to resolve which rows to dispatch, see the batch dispatch loop above).
- Write goes through `scripts/orch-apply.sh` ONLY. Idempotency + Zod-schema + conservation dry-run verified 2026-07-22.
- **AC-3 (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30) — `review[]` supervised+plan_only rows are DELIBERATELY covered by this SAME PRIMARY selector, not a gap:** the claim script above has NO `effective_supervised`/`effective_plan_only`/`is_epic_wrapper` gate at all (grep-verified) — it fires on EVERY `status=="REVIEW" && effective_next_agent=="qa"` row regardless of those flags. This is intentional, not an oversight: the deliberate-dispatch gate governs WHO IMPLEMENTS not-yet-written code, not WHO VERIFIES already-committed code — by the time a row sits in `review[]`, the supervised/plan_only gate has already served its purpose (a human/router dispatched the implementation deliberately), and withholding QA sign-off from it would add zero safety while re-introducing exactly the review[]-write-only starvation this lane exists to close. **Empirically verified live 2026-07-30** (scratch dry-run, never against the live file): of 6 live `review[]` rows carrying `supervised:true && plan_only:true`, 5 have `next_agent=="qa"` and sit in the SAME age-ordered PRIMARY queue as ~135 non-supervised peers (oldest-first, e.g. `TE-T17` from 2026-07-23 ranks ahead of all 5) — none is excluded, none is silently invisible; they are simply queued behind older/higher-priority rows under this lane's dedicated `qa[] < QA_CAP` batch cap, the same throughput constraint every other PRIMARY row faces. The 6th (`next_agent != "qa"`) falls into the pre-existing SECONDARY/PO-triage set below, same as any other non-qa-routed review row — not a new or different exclusion.
- **Visibility instrument (non-gating):** `scripts/audits/devteam-review-lane-drain-report.sh` — read-only; PRIMARY table = the auto-dispatched set above; SECONDARY table = the null/non-qa `next_agent` subset (PO/architect triage queue, per PO AC(1) — never silently dropped).
- **Acceptance instrument:** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — shared with BOUNDED-1/SLS/RLC/DRS; asserts this lane's gate FIRES and DRAINS (`review[]` shrinks, `qa[]` grows) against the live-shaped saturated fixture (review≈32).

---

<!-- jump:session-gate -->
**Session Gate:** `docs/data/orch/orch-state.json` `.task_board` empty AND no Telegram reports AND `pendingSignals` empty → `send_telegram(channel="work", message="[dev-team] Dev loop idle.")` → JUMP TO `end`. **Unaffected by which rotation candidate `$SELECTED` this tick (§2.5, Idle-Tick Rotation Selection above):** this predicate was already independent of "did the selected lane find work" — it reads `.task_board`/reports/`pendingSignals` directly, never the selected lane's own outcome. Under rotation, a no-op turn on an otherwise-saturated board correctly evaluates this predicate `false` (task_board non-empty) and stays silent — no misleading "idle" telegram just because this tick's ONE tried lane happened to be empty, avoiding the false-idle spam a naive "assume idle because this lane found nothing" implementation would produce roughly 5 ticks out of 6.

---

<!-- jump:incident-lane-consumer -->
### Incident-Lane Consumer (ILC) — Head-Decoupled Invocation (severity/incident expedite path)

FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW (architect brief 2026-08-14, `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md` §4). Inserted immediately after the Session Gate above and **BEFORE** § Review-Lane SECONDARY-Drain — FIRST of the three unconditional Session-Gate→Step-1 blocks (ILC → SECONDARY-Drain → QA-Drain Head-Decoupled → Step 1), deliberate ordering: a P0 incident dispatch outranks review/QA-sign-off triage for the shared `.head` slot whenever both would otherwise be free (brief §4d).

**Problem this closes:** `ready[]`'s only generic consumer is the Ready-Lane Consumer (RLC) above — ONE row per invocation, reached only on the ~1-in-6 idle-fallthrough ticks the 6-way Idle-Tick Rotation Selection happens to pick `"rlc"`. Against a 68-row eligible queue (measured live 2026-08-14, brief §1) that is a throughput ceiling independent of ordering — the brief measured two already-optimally-ranked `po_expedited_at` rows still undispatched ~7h/24d after being marked, proving a comparator-only fix (expedite-field sort key, age-weighted tiebreak) cannot help (brief §3(a)/(b)): a rank-#1 row that is still starved cannot be moved any further forward. This design reuses QA-Drain's own measured-live mechanism instead — independent budget + batch-claim + head-decoupled invocation, the same shape that took PRIMARY `review[]` from 226→56 rows over 8 days (brief §2) — rather than a comparator change or a 4th priority tier.

**UNCONDITIONAL — no `head.status` gate, no rotation gate** (brief §4d: ILC strictly dominates a rotation-gated site — it fires on every tick, idle or busy, `$SELECTED` irrelevant — so unlike QA-Drain, which kept BOTH its rotation-gated site AND a head-decoupled one, ILC needs only this ONE site). Independent `INCIDENT_CAP` budget layered ON TOP OF, not instead of, the shared `WIP≤2` slot (`incident_wip_in_progress`, `scripts/lib/devteam-eligibility.jq` — counts ONLY rows carrying `claimed_by == "dev-team (incident-lane consumer)"`; `wip_in_progress` has NO `claimed_by` filter and counts these same rows too — a deliberate asymmetry documented in the jq file itself: the shared budget sees MORE load, never less) — an incident row DOES still consume a BOUNDED-1/SLS/RLC/DRS slot while in flight; `INCIDENT_CAP=2` only bounds how many `po_expedited_at` rows this lane may add on top of that, regardless of how many PO ever marks (brief §4b) — the entire answer to "must not become a 4th priority tier".

```bash
INCIDENT_CAP=2   # named constant; retune together with the DoD trend if 5-tick measurement under/over-shoots
INCIDENT_WIP=$(jq 'include "scripts/lib/devteam-eligibility"; incident_wip_in_progress' docs/data/orch/orch-state.json)
if [ "$INCIDENT_WIP" -lt "$INCIDENT_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TAKE_BUDGET=$((INCIDENT_CAP - INCIDENT_WIP))
  jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    --slurpfile archive <(bash "$PROJECT_ROOT/scripts/lib/archive-glob-cat.sh") \
    -f "$PROJECT_ROOT/scripts/devteam-backlog-claim-incident-lane-consumer.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  # READBACK — scan EVERY lane the claim script can stamp into, never name one lane on prose
  # assumption alone. The shipped script (scripts/devteam-backlog-claim-incident-lane-consumer.jq)
  # has exactly ONE destination lane today — `.task_board.in_progress[]` (confirmed by reading the
  # script: it always writes `.task_board.in_progress = (... + $batch)`, never a second lane) — but
  # this generic all-lane scan is written so a future destination-lane change there cannot silently
  # zero out this readback the same way a narrower, lane-named readback already did once for a
  # sibling consumer (Review-Lane SECONDARY-Drain's own `.task_board.review[]`-only readback missed a
  # `done[]`-origin row its own claim script correctly claimed, whose stated candidate set is
  # `review[] UNION done[]` — same class of silent-lane-miss bug, deliberately not repeated here).
  picked_batch=$(jq -c --arg t "$NOW" --arg by "dev-team (incident-lane consumer)" \
    '[.task_board | to_entries[] | select(.value | type == "array") | .value[]
       | select(.claimed_at == $t and .claimed_by == $by)]' \
    docs/data/orch/orch-state.json)
fi
# INCIDENT_WIP>=INCIDENT_CAP, or nothing po_expedited_at-eligible in ready[] -> $picked_batch stays
# empty/unset -> fall through unchanged, continue to Review-Lane SECONDARY-Drain below
```

If `$picked_batch` is non-empty (>=1 row claimed this tick):
```
# BGFAN-1 fan-out — one independent session PER row in the batch, built DIRECTLY from EACH row's own
# id/next_agent/status/claimed_by (as read back off the board above) — never from `.head.next_action`
# (cosmetic-only narration of the batch's top row, same as every sibling batch consumer) and never a
# hardcoded lane/status premise: Review-Lane SECONDARY-Drain's own spawn text hardcodes "is a stale
# review[]-lane row (status=REVIEW, branch:null)", which is false whenever that lane's claim script
# picks a done[]-origin row (status=DONE) — deliberately not repeated here. This lane's own rows are,
# by construction of the claim script above, always `status=IN_PROGRESS` resident in
# `.task_board.in_progress[]` post-claim, but the spawn text below still derives status/lane from the
# row itself rather than asserting that as a hardcoded literal.
for row in $picked_batch:
  resume_key = "task:" + row.id
  outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
    ttl_seconds: 3600,
    payload: "{\"site\":\"INCIDENT-LANE-CONSUMER\",\"spawning\":\"" + row.next_agent + "\"}"
  })
  if not outer_claim.claimed:
    # AC-1/AC-3/AC-4 RESUME-KEY KEEPALIVE — mirrors the S2 dispatcher-wrap fix above (Step 0b,
    # § FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW):
    # same rationale, same Rung-A-honest `owner_client_session` sourcing (read off THIS call's own
    # `outer_claim.current_holder`, never guessed), same unchanged `ttl_seconds:3600` (AC-4). AC-3
    # requires this call site changed independently of S2's — this loop's `resume_key` is claimed
    # once per row at THIS lane's own initial dispatch, a structurally distinct code path from S2's
    # resume-claim, so S2's own renewal cannot reach it retroactively; only a change HERE closes it
    # for a row this lane's own claim script re-encounters peer-held (e.g. a still-live prior claim
    # this same task_id). (NOTE, scoped out of this row: the batch row that does NOT win `.head`'s
    # single narration slot — INCIDENT_CAP allows up to 2 per tick — has its OWN `resume_key` left
    # unrenewed by BOTH this branch and S2's, since nothing ever re-evaluates an already-`in_progress[]`
    # row for dispatch again; that lock's eventual TTL lapse is therefore inert, never a duplicate-
    # spawn vector, unlike the `.head`-narrated row this fix and S2's both protect — flagged for a
    # future reader, not a residual gap in THIS row's own duplicate-spawn scope.)
    # AC-6 SCOPING (PO ruling 2026-08-25 — why this branch does NOT ALSO get its own
    # `.head.resume_attempts` increment): this loop's peer-held branch is reachable AT MOST ONCE per
    # row, ever — `$picked_batch` above only ever contains rows this SAME tick's claim script just
    # moved `ready[] -> in_progress[]`; a row already resident in `in_progress[]` is never again a
    # candidate for that script, so this exact code path cannot re-fire tick after tick for the same
    # row the way S2's dispatcher-wrap does for a task pinned across many ticks. There is no
    # unbounded-renewal loop here to bound. The row that DOES win `.head`'s narration slot (this
    # batch's top-ranked row — see the claim script's own `$head_picked`/`.head.active_task_id`
    # write) is, from the very next tick onward, evaluated by S2's dispatcher-wrap exactly like any
    # other head-pinned task — the increment added at the S2 call site above already covers it;
    # nothing further is needed here. Incrementing `.head.resume_attempts` in THIS branch would
    # additionally be WRONG for any non-head-narrated batch row (up to 1 more, INCIDENT_CAP=2): that
    # counter tracks whatever `.head.active_task_id` currently is, which for such a row is a
    # DIFFERENT task entirely.
    if outer_claim.current_holder:
      hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
        task_id: resume_key,
        owner_client_session: outer_claim.current_holder.owner_client_session,
        ttl_seconds: 3600
      })
      log "[dev-team] INCIDENT-LANE-CONSUMER SKIP " + row.id + " — held by peer session (renewed, hb.ok=" + hb.ok + ")"
    else:
      log "[dev-team] INCIDENT-LANE-CONSUMER SKIP " + row.id + " — held by peer session"
    continue   # do NOT abort the whole batch over one peer-held row
  else:
    try:
      Agent(row.next_agent,
            context... + "task_id=" + row.id + " is a po_expedited_at incident row (priority="
            + row.priority + "), now resident in .task_board.in_progress[] with status="
            + row.status + ", claimed_by=" + row.claimed_by + " — dispatched via the Incident-Lane"
            + " Consumer's own independent INCIDENT_CAP budget, which ALSO counts against the"
            + " shared WIP<=2 slot (deliberate asymmetry, not an exclusion — see main.md ILC"
            + " section). Take"
            + " next action per your own flow's normal judgment for this task.",
            run_in_background=true)
      # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release
      # on the success path — see the S2 dispatcher-wrap comment above for the full rationale.
      # ttl_seconds:3600 on outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL
      # lapse) is what re-opens resume.
    except:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      raise
JUMP TO end   # a batch was dispatched this tick; do not also fall through to SECONDARY-Drain/QA-Drain/Step-1 the same tick
```

- **Claim** (`scripts/devteam-backlog-claim-incident-lane-consumer.jq`, shipped + `DONE_VERIFIED` by `FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS`, commit `cd0039432` — followed verbatim here, not re-derived or duplicated; this section is ONLY the call site, per the row's own scope split, brief §4c/§5): the FULL RLC eligibility chain, UNRELAXED (not `effective_supervised`, not `effective_plan_only`, not `is_epic_wrapper`, `deps_satisfied`, not `is_detail_deferred`, resolved `next_agent`/`owner`) PLUS `is_po_expedited` — reuses the ALREADY-LIVE `po_expedited_at`/`po_expedited_by` PO convention (brief §4a, `always_extend_not_duplicate` — no new field minted). Sort: `sort_by([rank, po_expedited_at, idx])` — priority first (a P1-expedited row never jumps a P0-expedited one), then oldest-expedited-first (scoped to this small bounded pool only, never the whole `ready[]` queue), array-index as the final tiebreak. Takes up to `$take_budget` rows in one batch, moves `ready[] -> in_progress[]`, status `-> IN_PROGRESS`, stamps every row in the batch with the SAME `claimed_at` / DISTINCT `claimed_by="dev-team (incident-lane consumer)"` (the exact string `incident_wip_in_progress`'s budget-exclusion filter keys on — never vary or suffix it). `.head` write uses the SAME `$head_free` conditional guard RLC/SLS/DRS/QA-Drain already use (never an unconditional replace), narrating only the batch's top row (cosmetic only, never load-bearing — dispatch above always correlates via `claimed_at`/`claimed_by`, never `.head.next_action`).
- Write goes through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Verified 2026-08-23: `scripts/audits/devteam-dispatch-gate-satisfiability.sh` 116/116 PASS incl. 13 ILC assertions (positive priority-ordering, negative non-expedited-P0 exclusion, `INCIDENT_CAP` boundary, WIP-independence, head-busy negative control — brief §5 SCRIPTS row item 4).
- **Overlap with RLC (brief §4e) — flagged and proven benign, not silently absorbed:** on a tick where rotation selects `"rlc"` AND `WIP3<2`, RLC's own unmodified eligibility filter has no reason to skip a `po_expedited_at` row — it could claim one first, via the shared `WIP≤2` budget rather than the independent `INCIDENT_CAP` budget. RLC runs strictly earlier in the tick's control flow (Idle-Tick Rotation Selection precedes Session Gate) and `JUMP TO end`s on a successful claim, so this section either never reaches that row that same tick (already dispatched) or, if RLC's own turn found nothing, still gets its unconditional shot moments later the same tick. No double-claim is possible — same "already removed from `ready[]` by a predecessor in the same sequential `orch-apply.sh` write" argument every existing consumer's own header comment already relies on (RLC's, SLS's, DRS's).
- **Scope boundary (brief §4f):** `ready[]` only, matching this row's own `files` list. `backlog[]`-resident `po_expedited_at` rows are out of scope here (not silently ignored) — they must already be promoted into `ready[]` by BOUNDED-1/SLS/DRS's existing promote scripts, or placed there directly by PO/PM/architect, before this claim script becomes reachable.

---

### Review-Lane SECONDARY-Drain (owner-triage sweep)

FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN (architect brief 2026-08-01, `docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md` §2). Runs immediately after the Incident-Lane Consumer above (itself immediately after the Session Gate; FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW, 2026-08-25 — no longer physically first at this anchor), at the exact insertion point the SPIKE brief (`docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` §4a/§4b) already identified for QA-Drain's own head-decoupled Part 2 — immediately before the Review-Lane QA-Drain — Head-Decoupled Invocation section below (Part 2, shipped 2026-08-06), which is in turn before `## Step 1 — PO Triage`.

**Problem this closes:** the Review-Lane QA-Drain block above (PRIMARY) only ever auto-dispatches `review[]` rows where `effective_next_agent == "qa"`. Every row routed to a non-qa owner (ops/po/architect/agent-father/developer/dev-team/pm/ba/dev-mcp-server/dev-kinh-dich/cowork-refactory-expert/...) OR carrying no `next_agent` at all (null) sits in `review[]` with **no automated sweep whatsoever** — confirmed by grep (brief §2a): no agent's own flow (`po`, `architect`, `pm`, ...) ever scans `.task_board.review[]`. This is the pre-existing SECONDARY set the Review-Lane QA-Drain visibility report (`scripts/audits/devteam-review-lane-drain-report.sh`) has surfaced, non-gating, since 2026-07-22 — this section is its first automated picker.

**UNCONDITIONAL — no `head.status` gate at all** (there is nothing to gate: this mechanism never writes `.head`, see Claim bullet below). Runs on EVERY tick that reaches this point: idle ticks where nothing above claimed anything, AND — the materially more common case while backlog/head activity is ongoing — busy ticks where Step 0b's S2 resume-claim failed (`resume_key` still peer-held, TTL not lapsed). This gives SECONDARY-Drain materially better reachability than PRIMARY QA-Drain has today, without needing PRIMARY's own Part 2 (head-decoupled invocation, now shipped as the section immediately below) at all — SECONDARY-Drain's own design never depended on Part 2 landing.

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# AC-6(iii) pre-check (FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY, PO ruling
# 2026-08-25T1612Z): count eligible candidates BEFORE running the claim pipe, reusing the SAME
# shared predicate the claim script itself includes (scripts/lib/devteam-eligibility.jq
# effective_next_agent — read-only here, never re-derives/duplicates the script's own selection or
# stamp logic; same include-and-reuse shape the Incident-Lane Consumer's own INCIDENT_WIP pre-check
# above already uses). This is the ONLY way to tell "genuinely nothing eligible" (iii) apart from
# "something WAS eligible but the post-write readback below still came back empty" (ii) — an exit-0
# apply plus an empty readback are, on their own, indistinguishable between those two causes.
CANDIDATE_COUNT=$(jq -r --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" '
    include "scripts/lib/devteam-eligibility";
    (detail_items_from($detail)) as $detail_items
    | ( [ (.task_board.review // [])[] | select(.status == "REVIEW") ]
      + [ (.task_board.done // [])[]   | select(.status == "DONE") ] )
    | map(select((. | effective_next_agent($detail_items)) != "qa"))
    | length
  ' docs/data/orch/orch-state.json)
jq --arg now "$NOW" \
  --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
  -f "$PROJECT_ROOT/scripts/devteam-review-claim-secondary-drain.jq" \
  docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
apply_exit=$?
# AC-6(i): CAPTURE the exit code instead of discarding it with a trailing `|| true` — the old
# `|| true` made a genuine orch-apply ABORT (exit 1 = real validation/conservation/stamp/ceiling
# failure; exit 2 = CAS mtime mismatch, a benign concurrent-writer collision the caller should just
# retry next tick — scripts/orch-apply.sh's own EXIT CODES header) byte-identical, in this block's
# own transcript, to "nothing was eligible this tick". PO measured 2026-08-25T16:05Z that this exact
# pipeline is GREEN AT HEAD (read-only replay against a live-board scratch copy: exit 0, stamped a
# row) — so a run of ticks producing zero stamps of any origin can no longer be assumed
# "nothing eligible" without this signal. Sibling row FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-
# NO-RETRY carries the identical `|| true` swallow on the OTHER lane (QA-Drain — Head-Decoupled
# Invocation's own orch-apply pipe) — cited, NOT fixed here (out of this row's own `files` scope);
# this exit-classify + candidate-count shape (no retry loop — this lane's own single-row-per-tick +
# always-falls-through design already tolerates a miss next tick) is meant to be directly adoptable
# there too.
if [ "$apply_exit" -eq 2 ]; then
  printf '[dev-team] SECONDARY-DRAIN ORCH-APPLY CAS-ABORT exit=2 (candidates_pre_pipe=%s) — benign peer-write collision, retry next tick\n' "$CANDIDATE_COUNT"
elif [ "$apply_exit" -ne 0 ]; then
  printf '[dev-team] SECONDARY-DRAIN ORCH-APPLY REAL-ABORT exit=%s (candidates_pre_pipe=%s) — live file untouched, investigate\n' "$apply_exit" "$CANDIDATE_COUNT"
fi
# READBACK — scan EVERY `.task_board` lane the claim script can stamp into (review[] UNION done[],
# per the claim script's own header), never name one lane on prose assumption alone (same generic
# all-lane shape the Incident-Lane Consumer above already uses, copied verbatim here rather than
# reinvented — FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY, 2026-08-25). Fixes a
# reproduced-live defect: this readback used to name `.task_board.review[]` only, so a done[]-origin
# claim (the script's own union candidate set legitimately produces one whenever the oldest eligible
# row happens to sit in done[]) stamped the board correctly but read back as EMPTY here — `picked`
# silently stayed unset and the row was never dispatched, no error surfaced. `.key as $lane` is kept
# on each row (as `_lane`) so the spawn text below can name the row's actual originating lane
# instead of hardcoding "review[]" (AC-7).
picked=$(jq -c --arg t "$NOW" --arg by "dev-team (review-lane secondary-drain)" \
  '[.task_board | to_entries[] | select(.value | type == "array") | .key as $lane
     | .value[] | select(.secondary_claimed_at == $t and .secondary_claimed_by == $by) | . + {_lane: $lane}]
   | first // empty' \
  docs/data/orch/orch-state.json)
# AC-6(ii)/(iii): classify an empty readback using the pre-pipe candidate count above — this is
# the entire fix. Before, an empty `picked` was ONE undifferentiated silence regardless of cause
# (peer-collision SKIP below was the only log line this block ever emitted); now a genuinely empty
# candidate set, a stamped-but-not-found anomaly, and an aborted pipe (logged above) are three
# distinct, greppable lines.
if [ -z "$picked" ] || [ "$picked" = "empty" ] || [ "$picked" = "null" ]; then
  if [ "$apply_exit" -eq 0 ] && [ "$CANDIDATE_COUNT" -gt 0 ]; then
    printf '[dev-team] SECONDARY-DRAIN STAMPED-BUT-NOT-READ-BACK — orch-apply exit 0, %s candidate(s) eligible pre-pipe, but no row matched claimed_at=%s claimed_by="dev-team (review-lane secondary-drain)" on readback — investigate, do NOT assume nothing-eligible\n' "$CANDIDATE_COUNT" "$NOW"
  elif [ "$apply_exit" -eq 0 ]; then
    printf '[dev-team] SECONDARY-DRAIN NOTHING-ELIGIBLE — 0 candidates pre-pipe, orch-apply exit 0 no-op, readback empty as expected\n'
  fi
  # apply_exit != 0 already classified above (CAS-ABORT / REAL-ABORT) — no redundant line here.
fi
```

If `picked` is non-empty (a row was claimed this tick):
```
resume_key   = "task:" + picked.id
outer_claim  = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: resume_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
  ttl_seconds: 3600,
  payload: "{\"site\":\"SECONDARY-DRAIN\",\"spawning\":\"" + picked.secondary_dispatch_target + "\"}"
})
if not outer_claim.claimed:
  log "[dev-team] SECONDARY-DRAIN SKIP " + picked.id + " — held by peer session"
else:
  Agent(picked.secondary_dispatch_target,
        context... "task_id=" + picked.id + " is a `.task_board." + picked._lane + "[]`-resident "
        + "row (status=" + picked.status + ", branch:null — direct-commit, no task branch/handoff, "
        + "same precondition as the PRIMARY qa-drain lane) claimed via the Review-Lane SECONDARY-"
        + "Drain sweep, awaiting your own sign-off/triage. Read whatever note/detail fields are "
        + "actually present on the row itself (e.g. status_note, review_note — do not assume either "
        + "exists; a done[]-origin pick may carry neither) and take next action per your own flow's "
        + "normal judgment: DONE_VERIFIED sign-off, request rework, reassign next_agent, or "
        + "escalate BLOCKED.",
        run_in_background=true)
  # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
  # success path — mirrors SLS/RLC/DRS/QA-Drain (see the S2 dispatcher-wrap comment above); ttl_seconds:3600
  # on outer_claim is the lock's lifetime bound.
# ALWAYS falls through to Step 1 — PO Triage below regardless of outcome (picked empty, peer-collision
# SKIP, or a successful dispatch) — this lane NEVER JUMPs to end. Single-row cap per tick + fall-through
# IS the throttle (brief §2b AC) — unlike SLS/RLC/DRS/QA-Drain, which JUMP TO end on a successful claim.
```

- **Claim** (`scripts/devteam-review-claim-secondary-drain.jq`): picks the OLDEST (same `updated_at // reviewed_at // created_at` age key as `devteam-review-claim-qa-drain.jq`, missing timestamp treated as oldest) `review[]` row where `status == "REVIEW"` (excludes BLOCKED — same negative control as PRIMARY, PO AC(4)) AND `effective_next_agent($detail_items) != "qa"` (SECONDARY set — a single predicate covering null/absent AND every other non-qa value, identical partition the visibility report script already uses). Resolves `dispatch_target = resolved_secondary_dispatch_target($detail_items)` (`scripts/lib/devteam-eligibility.jq`): effective `next_agent` if present-non-empty AND not `"dev-team"`, ELSE `"po"` — a reasoned default, not `"architect"` (of the live SECONDARY rows, several already resolve to `next_agent=="architect"`; routing null rows there too would concentrate load on the one agent already carrying the largest single non-null share — PO is this system's designated triage/decision role for a "no resolvable owner" row). `next_agent=="dev-team"` falls to `"po"` too (FIX-DEVTEAM-SECONDARY-DRAIN-NO-SELF-TARGET-RESOLVER-CASE, architect, 2026-08-05): `"dev-team"` is this dispatcher flow's own id, not a spawnable individual agent — this file's Team Boundary section (top of this file) already carries a hard, non-negotiable "NEVER spawn the `cowork-team` or `dev-team` dispatcher flows" guard, so a row resolving to `"dev-team"` could never actually be dispatched and would strand claimed-but-refused forever, re-picked every tick (live-confirmed on `OPS-BCTC-BANK-2025Q4-ENRICH-0ROW-REPARSE`, PO hand-repointed as a symptom patch before this resolver-level fix landed). Stamps `secondary_claimed_at`/`secondary_claimed_by="dev-team (review-lane secondary-drain)"`/`secondary_dispatch_target` **in place inside `.task_board.review[]` — deliberately does NOT move the row to a new lane** (`TaskBoardSchema` is `.strict()` with exactly the 9 enumerated lanes; adding a 10th is a real schema change, out of scope; `TaskSchema` itself is `.passthrough()` so new fields are schema-safe) and **never writes `.head`** (the load-bearing design choice — carries none of PRIMARY QA-Drain's own Part 1/2 head-coordination risk, ships head-decoupled from day one). Exactly ONE row claimed per invocation (MVP — this lane's DoD bar is "exists + drained ≥1 row," not PRIMARY's 5-tick throughput trend). No-op if nothing eligible.
- Write goes through `scripts/orch-apply.sh` ONLY (Zod + dup-key gated, CAS-guarded, atomic rename) — NEVER raw `mv`/`cp`/`>`/full-doc overwrite. Scratch-copy dry-run verified 2026-08-01 (never against the live file): correctly claims the single oldest SECONDARY row, leaves `.head` byte-identical, leaves `.task_board.review` array length unchanged (in-place stamp, no lane move).
- **Known, accepted, flagged residual (brief §2b, not mitigated here):** no numeric concurrency cap beyond the single-row-per-tick claim — two SECONDARY rows resolving to the SAME `dispatch_target` on adjacent ticks could spawn two concurrent sessions of that agent before the first resolves; because this script never removes a claimed row from `review[]`, the SAME oldest row is re-picked every subsequent tick until its own `next_agent`/status changes — this is expected throttle-by-design, not a bug. Fast-follow if observed live: reuse the existing `task:on-demand:<agent>:<date>` mutex pattern (same posture as every other "measure before adding a 2nd mutex layer" call already made elsewhere in this file).
- **Visibility instrument (existing, unchanged):** `scripts/audits/devteam-review-lane-drain-report.sh` — its pre-existing SECONDARY table IS this lane's own candidate set; a row's disappearance from that table over successive ticks is this lane's DoD evidence (brief §4).

---

<!-- jump:qa-drain-headdecoupled -->
### Review-Lane QA-Drain — Head-Decoupled Invocation (busy-tick reachability)

FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED (Part 2 of `SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE`, agents-architect 2026-07-29, `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md` §4a/§4b — batch shape unified and re-anchored by `docs/architecture-briefs/2026-08-06-review-lane-qadrain-throughput-unblock.md` §1b/§3). Runs immediately after the Review-Lane SECONDARY-Drain block above, still at the head-decoupled Session-Gate→Step-1 anchor, before `## Step 1 — PO Triage`.

**Problem this closes:** the Review-Lane QA-Drain block above (idle-tick site) sits INSIDE the same `head.status`-idle-only fall-through as BOUNDED-1→SLS→RLC→DRS (§ Idle-capacity backlog pickup above) — but its own `qa[] < QA_CAP` budget has nothing to do with the shared WIP≤2 `in_progress` budget those four lanes meter, so it is never even EVALUATED on a busy tick. Every head-busy exit in Step 0b (WF-1 BLOCKED, S2 resume-claim-failed-peer-held) and every SLS/RLC/DRS outer_claim-failure converges, by sequential top-to-bottom control flow, at THIS Session-Gate→Step-1 boundary — the same anchor Review-Lane SECONDARY-Drain already occupies (07-29 brief §4a, zero byte overlap with the idle-fallthrough chain above, independently reconfirmed live 2026-08-06: `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION`, the row this section's own `depends_on` used to name as a coordination safeguard, is still untouched `BACKLOG` — dropped as obsolete, see 08-06 brief §1a). **Requires Part 1 (`FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL`, `.head`-write-conditional guard) already `DONE_VERIFIED`** — otherwise this site would clobber a genuinely busy `.head`, exactly as PO's 2026-07-29 dry-run demonstrated against the OLD unconditional-replace shape.

Runs on EVERY tick that reaches this point — a safe, idempotent no-op if the idle-tick block above already drained `review[]` down to `qa[] >= QA_CAP` or emptied the PRIMARY set this same tick (it re-reads live state, never assumes the idle-tick block ran); the actual gap this closes is the busy-tick case where control never reached the idle-tick block at all this tick. Reuses the SAME `--slurpfile detail`/`--argjson take_budget` claim script (`scripts/devteam-review-claim-qa-drain.jq`) and the SAME batch/`claimed_at`/`claimed_by` correlation idiom as the idle-tick block above — deliberately NOT the older single-claim (`qa[]<1`) shape the 2026-07-29 brief originally illustrated for this site, which would have shipped two divergent batching behaviors (10-wide idle-tick vs 1-wide busy-tick) for the same underlying lane (08-06 brief §1b).

```bash
QA_CAP=10   # SAME value as the idle-tick Review-Lane QA-Drain block above. This section is an
            # independent tick-reachability path — it may fire on ticks where the idle-tick block
            # above never ran at all (head busy from Step 0b onward) — so it re-declares the named
            # constant rather than assuming a shell variable carried over; retune BOTH occurrences
            # together if the 5-tick DoD trend under/over-shoots.
QA_WIP=$(jq '.task_board.qa|length' docs/data/orch/orch-state.json)
if [ "$QA_WIP" -lt "$QA_CAP" ]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  TAKE_BUDGET=$((QA_CAP - QA_WIP))
  jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" \
    --slurpfile detail "$PROJECT_ROOT/docs/data/orch/archive/backlog-detail.json" \
    -f "$PROJECT_ROOT/scripts/devteam-review-claim-qa-drain.jq" \
    docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh" || true
  picked_batch=$(jq -c --arg t "$NOW" --arg by "dev-team (review-lane qa-drain)" \
    '[.task_board.qa[] | select(.claimed_at == $t and .claimed_by == $by)]' \
    docs/data/orch/orch-state.json)
fi
# QA_WIP>=QA_CAP, or nothing eligible -> $picked_batch stays empty/unset -> fall through to Step 1 unchanged
```

If `$picked_batch` is non-empty (>=1 row claimed this tick):
```
# BGFAN-1 fan-out — one independent verify-committed qa session PER row in the batch. Built DIRECTLY
# from each row's own id — NEVER from `.head.next_action`, which may legitimately still describe a
# different genuinely-busy task this tick (the whole reason this call site exists).
for row in $picked_batch:
  resume_key = "task:" + row.id
  outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: resume_key, task_kind: "sprint-task",
    owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED
    ttl_seconds: 3600,
    payload: "{\"site\":\"QA-DRAIN-HEADDECOUPLED\",\"spawning\":\"qa\"}"
  })
  if not outer_claim.claimed:
    log "[dev-team] QA-DRAIN-HEADDECOUPLED SKIP " + row.id + " — held by peer session, reverting lane-move"
    # FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA — same revert as the
    # idle-tick site above (§ Review-Lane QA-Drain, its SKIP branch), same script, same reasoning:
    # this row is already sitting in qa[] before this outer_claim ran. Revert it, same tick.
    NOW_REVERT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    jq --arg id "<row.id>" --arg now "$NOW_REVERT" \
      -f "$PROJECT_ROOT/scripts/devteam-qadrain-skip-revert.jq" \
      docs/data/orch/orch-state.json | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
    # do NOT `|| true` this pipe — see the idle-tick site's identical comment above.
    continue   # do NOT abort the whole batch over one peer-held row
  else:
    try:
      Agent("qa", context... + "task_id=" + row.id + " mode=verify-committed", run_in_background=true)
      # LOCK-LIFETIME (FIX-DEVTEAM-BACKGROUND-SPAWN-LOCK-RELEASED-AT-SPAWN-NOT-COMPLETION): NO release on the
      # success path — see the S2 dispatcher-wrap comment above for the full rationale. ttl_seconds:3600 on
      # outer_claim is the lock's lifetime bound; head leaving in_progress (or TTL lapse) is what re-opens resume.
    except:
      call_tool(server="vn-market", tool="task_release", arguments={ task_id: resume_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
      raise
JUMP TO end   # a batch was dispatched this tick; do not also fall through to Step 1/PO triage same tick
```

- **Claim, mutation, `.head`-safety:** identical script and behavior to the idle-tick Review-Lane QA-Drain block above (`scripts/devteam-review-claim-qa-drain.jq` — see its Claim bullet for full selection/priority-ordering/mutation detail, **including the NOT-BEFORE TIME-GATE** — same shared predicate, same known-list, this site inherits it for free since it is the same script). This site adds NO new selection logic, NO new script, NO new predicate — only a SECOND, head-decoupled CALL SITE sharing the same `qa[] < QA_CAP` budget. The two sites cannot double-claim past `QA_CAP` in the same tick: the shared script re-reads live `.task_board.qa|length` on each invocation, so whichever site runs first this tick consumes the shared headroom the other then sees.
- **Regression coverage (07-29 brief §6):** `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — negative control: pre-seed `.head` with an unrelated genuinely-busy `in_progress` task before invoking this site, assert `.head` stays byte-identical throughout (mechanizes PO's 2026-07-29 dry-run finding, which the OLD unconditional-`.head`-replace shape failed); positive control: `picked_batch`'s row ids resolve correctly via the `claimed_at`/`claimed_by` correlation query regardless of `.head`'s own state.
- **AC-2 (idle-tick priority ordering preserved):** this section fires ONLY after Step 0b's head-busy branches, or the exhausted head-idle fall-through, reach the Session-Gate→Step-1 boundary — it never runs BEFORE or IN PLACE OF BOUNDED-1/SLS/RLC/DRS's own idle-tick ordering above, so it cannot aggravate `FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION` (the same non-goal the 07-29 brief §4a already committed to).

---

<!-- jump:po-triage -->
## Step 1 — PO Triage

**Rotation gate (FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION):** this section's physical position is UNCHANGED from before rotation — it must stay reachable from the busy-tick "fall through to Step 1" paths in Step 0b (WF stale-crash reset, S2 resume-claim peer-collision), which bypass the whole idle-tick rotation block above and never set `$SELECTED` at all — as well as from the idle-tick path where it is now one of the 6 rotation candidates (`step1_triage`, stamped-but-not-dispatched by the rotation block above when it wins).
```bash
if [ -n "$SELECTED" ] && [ "$SELECTED" != "step1_triage" ]; then
  log "[dev-team] Step 1 PO Triage SKIP — not this tick's rotation turn (\$SELECTED=$SELECTED)"
  JUMP TO end   # a different rotation candidate had this tick's turn (dispatched, or a no-op — either way, no cascade, see § Idle-Tick Rotation Selection §2.4); do NOT also run PO triage in the same tick
fi
# $SELECTED == "step1_triage" (this rotation cycle's turn), OR $SELECTED is unset/empty (reached via a
# busy-tick Step-0b bypass path that never evaluated rotation at all) -> proceed exactly as before, unchanged:
```

**Stamp (§2.3) cross-reference — no write HERE:** `dev_team_idle_chain.rotation.step1_triage.last_served_tick` is already written, unconditionally, BEFORE dispatch, by the Idle-Tick Rotation Selection section's own "Stamp update" block above, whenever `$SELECTED == "step1_triage"` won this tick's rotation. This section performs NO stamp write of its own — a second write here would double-stamp the same key for no benefit. On the busy-tick bypass path (`$SELECTED` unset), no rotation stamp is written for `step1_triage` this tick either — by design, unchanged by this task: Step 0b's bypass paths never evaluate rotation at all (see the Rotation gate paragraph above), so there is nothing to stamp.

**Durable-inbox read (FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION — brief §3.2, `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md`):** `pendingSignals[]` is read directly from the durable inbox instead of the tick-local in-memory array Step 0a's own drain builds (`drain-signals.md` §0a-1 step 4 / §0a-D append `pendingSignals[]` — that append stays informational/local-only per FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN's own comment, exactly BECAUSE this section now supersedes it as Step 1's actual data source). May contain entries carried over from N prior ticks where `step1_triage` was not this tick's rotation winner, not only this tick's fresh drain (brief §3.2). **Ownership correction (FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ, 2026-08-22):** this read is now used ONLY to gate the no-op short-circuit below (is there anything worth spawning PO for) and as an eager convenience value passed into the PO prompt — it is no longer treated as PO's authoritative source (PO's own `docs/agents/po/flow/triage-signals.md` § Step 0-SIG does its own fresh read of this same inbox as SSOT, since PO can also be spawned directly by the router per the dispatch table's "queue / triage" row, a path that never reaches this section at all) and dev-team no longer performs the CLEAR write after PO returns — see that note below, at the old CLEAR call site:
```bash
pendingSignals=$(jq -c '.dev_team_idle_chain.pending_triage_inbox // []' docs/data/orch/orch-state.json)
pending_n=$(echo "$pendingSignals" | jq 'length')
```

**No-op short-circuit (brief §3.2 — "same as today's 'PO returns NOTHING -> idle EXIT'"):** if the durable inbox AND both report sources are empty, skip the PO spawn entirely (no S3 claim attempted) rather than pay for a spawn only to have PO's own flow immediately return `NOTHING`:
```
if pending_n == 0 AND read_telegram_reports(status="new") is empty AND list_unresolved_reports() is empty:
  log "[dev-team] Step 1 PO Triage no-op — durable inbox + reports/unresolved all empty"
  JUMP TO end
# else: at least one source is non-empty -> proceed to spawn PO, unchanged from here down:
```

```
# S3 dispatcher-wrap — dedup guard before PO spawn:
triage_key  = "task:po-triage-" + $(date -u +"%Y%m%d")   # e.g. task:po-triage-20260521
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: triage_key, task_kind: "sprint-task",
  owner_agent: "dev-team", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds: 1800,
  payload: "{\"site\":\"S3\",\"spawning\":\"po\"}"   // JSON-encoded STRING passed via call_tool arguments — DRAIN-INJECTION-SAFE (no shell exposure)
})
if not outer_claim.claimed:
  log "[dev-team] SKIP PO triage — already running in peer session"
  JUMP TO end   # do NOT spawn po
# Claim succeeded — spawn PO:
```
→ Spawn `po` with: `pendingSignals[]` (durable-inbox-sourced, see above), `read_telegram_reports(status="new")`, `list_unresolved_reports()`, `docs/data/orch/orch-state.json .task_board`, `git log --oneline -30`, `git branch` — `run_in_background=true` (background) — BGFAN-1; await task notification, then release triage_key
→ PO contract: `docs/agents/po/flow/main.md` § Role in dev-team flow
→ Return: `NOTHING` (→ idle EXIT) | `BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`
```
# After PO spawn returns:
# Durable-inbox CLEAR ownership moved OFF this call site (FIX-TRIAGE-INBOX-CLEAR-OWNERSHIP-PO-SELF-READ,
# 2026-08-22 — supersedes FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR's
# dev-team-owns-it assignment below, which a same-day router-direct PO dispatch (bypassing this whole
# Step 1 body — `.claude/skills/dispatch/SKILL.md`'s "queue / triage" dispatch-table row) contradicted,
# because that path never reaches this line at all: the CLEAR write used to live HERE, gated on THIS
# session having been the one that spawned PO in-tick, which is exactly what a router-direct dispatch
# is NOT). PO's own flow now owns the CLEAR unconditionally, on every invocation path, as the last step
# of its own `docs/agents/po/flow/triage-signals.md` § Step 0-SIG — see that doc for the executable
# block. dev-team performs NO write here any more; do not re-add one without also re-solving the
# router-direct-dispatch reachability gap above.
call_tool(server="vn-market", tool="task_release", arguments={ task_id: triage_key, owner_client_session: $CLAUDE_CODE_SESSION_ID })
```

---

<!-- jump:planning -->
## Step 2 — Planning

| Type | Tag emitted | Sequence | Notes |
|---|---|---|---|
| FIX | — | (skip) | direct to Step 3 |
| SPIKE | — | (skip) | direct to developer with `feature-spike.md`; throwaway branch, findings doc only |
| SPRINT-S | — | architect → pm | each reads own flow |
| SPRINT-M | — | ba → architect → pm | sequential |
| SPRINT-L | — | ba → architect → pm; post-merge architect review | sequential |
| NEW-SERVICE | `BUILD-STANDARD: full` | ba → architect → pm → dev-`<svc>` → qa | Full relay + G1–G12 + three-level dashboard. dev-`<svc>` loads standard at Step 0c. |
| NEW-FEATURE | `BUILD-STANDARD: lean` | pm → dev-`<svc>` | One dev-`<svc>` agent, no relay. Fence + sandbox/replay DoD mandatory. dev-`<svc>` loads standard at Step 0c. |
| UNBLOCK | — | S4: see dispatch block below | `send_telegram(channel="work", message="[dev-team] Unblocked: [brief]")` → EXIT |
| CLEAN | — | S4: see dispatch block below | qa flow handles cleanup → EXIT |

**S4 UNBLOCK dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:" + batch_id,
  task_kind:            "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600
})
if result.claimed:
  spawn {route_to} run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # Worker writes journal entry; if absent, router writes STEP via skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id].
  # Gate: grep docs/agent-memory/decisions/sprint-${SPRINT_ID}-*.md (active sprint id ONLY —
  # matches agent-chaining-protocol.md's canonical PATTERN, TE-T33: excludes archive/ by
  # construction since a non-recursive glob never descends into docs/archive/decisions/) for
  # "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
else:
  log "[dev-team] SKIP UNBLOCK " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

**S4 CLEAN dispatch:**
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:" + batch_id,
  task_kind:            "sprint-task",   # live enum: cowork-slot|sprint-task|dashboard-row|commit-mutex — "dev-team" is NOT valid (verified 2026-06-05)
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          3600
})
if result.claimed:
  spawn qa with branch list run_in_background=true   # (background) — BGFAN-1
  # DJ-GATE-1 (journal-before-DONE — canonical gate → docs/protocols/agent-chaining-protocol.md § Journal-before-DONE Gate):
  # CLEAN auto-close: router is sole actor → run skill .claude/skills/decision-journal/SKILL.md § Write Entry [task_id: batch_id] directly before flip.
  # Gate: grep docs/agent-memory/decisions/sprint-${SPRINT_ID}-*.md (active sprint id ONLY —
  # matches agent-chaining-protocol.md's canonical PATTERN, TE-T33: excludes archive/ by
  # construction since a non-recursive glob never descends into docs/archive/decisions/) for
  # "task-id:** {batch_id}" — absent → run skill, then flip.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + batch_id, owner_client_session: $CLAUDE_CODE_SESSION_ID })
else:
  log "[dev-team] SKIP CLEAN " + batch_id + " — held by " + result.current_holder.owner_agent
  EXIT
```

Architect MUST set `ZONE: apps/<service>/` in RETURN — PM propagates into handoff/RETURN per task. Step 3 zone-routes by this field. Agent contracts: each agent's `flows/<agent>/main.md` § Role in dev-team flow.

---

<!-- jump:execute -->
## Step 3 — Execution

<!-- SF-1 heartbeat: renew singleton session lock at Step 3 entry to cover long sprint ticks beyond initial 5400s TTL -->
<!-- P2-PRESENCE heartbeat: renew presence row alongside SF-1; update current_task to active task id -->
```
call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "dev-team-cron-singleton", owner_client_session: $CLAUDE_CODE_SESSION_ID })
# ok=false → lock stolen (peer recovered after stall) → log BUG + exit cleanly; do NOT fight the steal.

# P2-PRESENCE: heartbeat presence row (renews TTL; payload.current_task advisory update via release+reclaim if desired)
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false → presence row expired between PREFLIGHT and Step 3 (long tick) → non-fatal; reclaim on next tick
```

**Fallback — `mcp__gateway__call_tool` Claude-tool absent from session (not a transport error, the tool
itself isn't loaded):** every `call_tool(server="vn-market", ...)` in this file and `execute-tier.md`
(heartbeats, dispatcher-wrap `task_claim`/`task_release`, `send_telegram`, `read_telegram_reports`, etc.)
has an equivalent bash/curl path via `scripts/agents-flow/mcp-call.sh`'s `mcp_call()` function — the same
stateless vn-market HTTP bridge `dev-team-tick-preflight.sh` already uses for its own lock claims. `source
scripts/agents-flow/mcp-call.sh` then call `mcp_call "<tool_name>" "<json_args>"` (note: `task_claim` via
this path requires `owner_client_session` explicitly in the args — it is not implicit). If a tick hits this
absence, do a single clean check (not a retry loop) before falling back to this bridge; live-confirmed
2026-07-09T17:07Z after the 16:37Z tick parked at this exact step for a full cycle.

→ Run sub-flow: `docs/agents/dev-team/flow/execute-tier.md`

Covers: tier grouping, zone routing (3-tier resolution: explicit → infer → report), parallel spawn rules, conflict check, merge gate.

> Status-flip = lane-move (MUST, no exceptions) — any agent flipping a task `.status` to a terminal/review token (REVIEW/QA/DONE/DONE_VERIFIED/BLOCKED/etc.) MUST move that task's array-membership into the matching `.task_board.<newlane>[]` (and sync `.head` if it was the active task) in the SAME `orch-apply.sh` write — never patch `.status` in place → full clause + FORBIDDEN statement: `docs/agents/dev-team/flow/execute-tier.md` § MUST — Status-Flip = Lane-Move (CANONICAL:SSOT-STATUSFLIP-LANEMOVE).

---

<!-- jump:post-cycle -->
## Step 4 + 4.5 — Scan + Compact

→ Run sub-flow: `docs/agents/dev-team/flow/post-cycle.md`

Covers: post-execution checks (4.0–4.1), cold-eviction backstop (4.2), stranded machine-state sweep (4.3), epic-wrapper autoclose sweep (4.4), Compact Checkpoint (4.5), doc self-heal.

---

## Reusable Scripts

- `scripts/devteam-session-trace.py` — extract compact workflow trace from a dev-team session `.jsonl` transcript; audits agent spawns, lock contention, Telegram narration, and workflow-smell hits. Usage: `devteam-session-trace.py <session.jsonl>`.
- `scripts/router-d1-claim.jq` — router board claim: moves a task from `ready[]` to `in_progress[]` with gate-guard; sets `.head` for unambiguous dispatch on resume. Usage: `jq --arg now "$NOW" -f scripts/router-d1-claim.jq docs/data/orch/orch-state.json`.
- `scripts/devteam-backlog-promote-bounded1.jq` + `scripts/devteam-backlog-claim-bounded1.jq` — generalized (no hardcoded task IDs), idempotent BOUNDED-1 backlog→ready→in_progress pickup for the Idle-capacity backlog pickup step above (SYSREMAKE-P2-DEVTEAM-BACKLOG-PICKUP-BOUNDED1); promote applies a depends_on eligibility gate (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE, 2026-07-08) plus the detail-DEFERRED / non-dev-owner / plan-only / non-dev-next_agent gates (FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE + FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE, 2026-07-12; plan-only + non-dev-next_agent generalized to effective board-OR-detail by FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE, 2026-07-16, subsuming FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE) — see step description above. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-backlog-promote-bounded1.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then the claim script the same way (claim script unchanged, no `--slurpfile` needed). `--slurpfile archive` (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING, 2026-07-28): threads cold-archive month docs into `dep_status_map($archive)` so a depends_on entry whose predecessor was cold-evicted to `docs/data/orch/archive/YYYY-MM.json` (DONE_VERIFIED) resolves SATISFIED instead of permanently MISSING — see `scripts/lib/devteam-eligibility.jq` header.
- `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` — read-only regression verifier for the FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE + PLAN-ONLY-GATE + DETAIL-NEXTAGENT-NONDEV-GATE + EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE gates above; builds synthetic/dynamic single-row fixtures from live `docs/data/orch/orch-state.json` + `backlog-detail.json` data (discovered dynamically where possible, no hardcoded task IDs; never writes back, no `orch-apply.sh` call) and asserts a detail-DEFERRED* row, a non-dev-owner+null-next_agent row, a plan_only row (board-inline or detail), a non-dev-next_agent row (board-inline or detail, with or without a null board next_agent), are NEVER promoted while a clean/dev-routable row still is. Usage: `bash scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh` (exit 0 = pass).
- `scripts/devteam-backlog-promote-supervised-lane-sweep.jq` + `scripts/devteam-backlog-claim-supervised-lane-sweep.jq` — generalized (no hardcoded task IDs), idempotent Supervised-Lane Sweep (SLS) backlog→ready→in_progress pickup for the doubly-gated `effective_supervised == true AND effective_plan_only == true` class (FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, 2026-07-21) — see § Supervised-Lane Sweep above. Promote resolves + stamps `dispatch_lane` (`effective_next_agent` → `effective_owner` → `"developer"`) WITHOUT clearing `supervised`/`plan_only`; claim sets `.head.next_agent` to that resolved lane directly (no zone-detect indirection). Shares the pre-existing WIP≤2 invariant's second slot with human/router dispatch — never raises it. **Claim EXTENDED 2026-07-30 (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, AC-2):** now ALSO claims an unstamped `ready[]` row matching the same doubly-gated predicate (arrived via PO/PM/architect placement, not this sweep's own promote) — resolves `dispatch_lane` itself via `resolved_dispatch_lane`, does NOT forge `promoted_by`. Claim now requires `--slurpfile detail`/`--slurpfile archive` (previously did not). **PRIMARY path FIXED 2026-08-26 (FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT, scope-widened from the DRS sibling defect):** PRIMARY used to read the row's own cached `dispatch_lane` verbatim (same stale-cache/null-lane defect shape as the pre-fix DRS claim script); it now re-resolves `resolved_dispatch_lane($detail_items)` fresh at claim time, sorted `[priority_rank, idx]`, same as FALLBACK already did. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then the claim script the same way (`--slurpfile detail`/`--slurpfile archive` now REQUIRED, not optional).
- `scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` — read-only regression verifier for the PROSE-SEQUENCING GATE above (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE); SYNTHETIC fixtures assert a `po_sequencing_*`-carrying row with empty `depends_on` is NEVER promoted, the same row IS promoted once `depends_on` is populated (dep `DONE_VERIFIED`), the detail-side variant of the prose key is equally caught, and a clean row (no `po_sequencing_*` key) is unaffected; a LIVE dynamic-discovery check (no hardcoded task IDs) confirms any current row shaped like `UC-CDC-P5` (prose key + non-empty-but-unsatisfied `depends_on`) stays held by `deps_satisfied`, not spuriously double-gated. Usage: `bash scripts/audits/devteam-bounded1-prose-sequencing-gate-verify.sh` (exit 0 = pass; never writes back).
- `scripts/audits/bounded1-supervised-lane-report.sh` — read-only acceptance/regression instrument for FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER; replays the same `effective_supervised`/`effective_plan_only`/`effective_owner`/`effective_next_agent` predicates against live data, lists every supervised+plan_only backlog row with its resolved `dispatch_lane` + age in days, and exits 1 if any such row's lane is `none`. Secondary (non-gating) section lists the wider supervised-XOR-plan_only set for visibility. TERTIARY (non-gating, FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23) lists every backlog row where `has_unbacked_sequencing_prose` is true, so a prose-only-sequenced row does not silently idle forever. **EXTENDED 2026-07-30 (AC-5, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER)** to scan EVERY lane, not just `backlog[]`: READY-PRIMARY (gates exit code, same predicate applied to `ready[]`, non-wrapper), READY-WRAPPER (informational — AC-4 no-picker-by-design class, closed by Step 4.4 instead), READY-XOR (informational — out-of-scope sup-XOR-po residual, ready[]-lane analog of SECONDARY), REVIEW-SUP-PO (informational — confirms AC-3: review[] supervised+plan_only rows with `next_agent=="qa"` are already covered by the pre-existing QA-Drain PRIMARY selector, which has no supervised/plan_only gate). Exit code now FAILS if EITHER backlog PRIMARY OR ready PRIMARY has an unresolved row. Usage: `bash scripts/audits/bounded1-supervised-lane-report.sh` (exit 0 = pass). **Tests LANE RESOLUTION only — NOT gate satisfiability**; see the satisfiability instrument below.
- `scripts/lib/devteam-eligibility.jq` — UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22): shared `include`-able eligibility/detail-resolution predicate library (`effective_supervised`, `effective_plan_only`, `effective_owner`, `effective_next_agent`, `effective_depends_on`/`deps_satisfied`/`dep_status_map`, `is_epic_wrapper`, `is_detail_deferred`, `is_non_dev_owner_unrouted`, `is_non_dev_next_agent_unrouted`, `has_unbacked_sequencing_prose`, `priority_rank`, `wip_in_progress`, `resolved_dispatch_lane`, `is_bounded1_eligible`, `detail_items_from`) consolidating what was previously 3 independently hand-copied def sets (`devteam-backlog-promote-bounded1.jq`, `devteam-backlog-promote-supervised-lane-sweep.jq`, `bounded1-supervised-lane-report.sh`) per the design principle adopted from SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW. `include "scripts/lib/devteam-eligibility";` resolves relative to CWD — every caller in this repo already runs from the project root (verified empirically, jq 1.8.1). Used by BOUNDED-1's, SLS's, RLC's, and QA-Drain's scripts plus both report scripts below. `has_unbacked_sequencing_prose` (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE, 2026-07-23) is wired as a conjunct into `is_bounded1_eligible` only (the mis-promote it closes was a BOUNDED-1 incident) — defined here, not in that one caller, so SLS/RLC can adopt the same predicate later without re-copying it, per the file's own one-shared-contract principle.
- `scripts/lib/devteam-eligibility.jq` `rotation_selected($doc)` + `scripts/devteam-idle-chain-stamp.jq` — FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION (schema/utilities shipped by `TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES`, DONE_VERIFIED) — the 5-id (`bounded1`/`sls`/`rlc`/`qa_drain`/`step1_triage`) aged-round-robin selection function + its per-tick stamp writer, `.dev_team_idle_chain.rotation.<id>.last_served_tick` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts` `dev_team_idle_chain: z.record(z.unknown()).optional()`). **NOT called directly by § Idle-Tick Rotation Selection above** — that section needs a 6th candidate (`drs`, added to the fixed chain 2026-07-30, five days after these two shipped) and `scripts/` sits outside agent-father's `commit_zone.allowed`, so the selection algorithm and stamp-write are INLINED in main.md with `"drs"` added to both id lists, rather than editing these two files directly. **Fast-follow flagged, not yet minted as a tracked row:** extend `rotation_selected($doc)`'s candidate array and `devteam-idle-chain-stamp.jq`'s `$known_ids` to the same 6-id set so main.md can drop the inline duplicate and `include` these directly — same class of split as `scripts/lib/devteam-eligibility.jq`'s other predicates (developer/dev-mcp-server zone, not agent-father's). Usage (current, 5-id, superseded in main.md by the inline 6-id version above): `jq -r 'include "scripts/lib/devteam-eligibility"; rotation_selected(.)' docs/data/orch/orch-state.json`; stamp: `jq --arg now "$NOW" --arg c "$SELECTED" -f scripts/devteam-idle-chain-stamp.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-backlog-claim-ready-lane-consumer.jq` — Ready-Lane Consumer (RLC), UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22) — see § Ready-Lane Consumer above. Claims the top-priority `ready[]` row (any source — BOUNDED-1/SLS/PM-decomposition) carrying a resolved next_agent/owner, not supervised/plan_only/epic-wrapper, `depends_on`-satisfied. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-backlog-claim-ready-lane-consumer.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-backlog-claim-incident-lane-consumer.jq` — Incident-Lane Consumer (ILC), FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (2026-08-23, shipped by developer, commit `cd0039432`) — see § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation above. Same file shape as `scripts/devteam-backlog-claim-ready-lane-consumer.jq` (no promote half — candidates already in `ready[]`), ADDS `select(.value | is_po_expedited)` to RLC's own unrelaxed eligibility chain and sorts `[rank, po_expedited_at, idx]`; batch-claims up to `$take_budget` rows, stamps `claimed_by="dev-team (incident-lane consumer)"` (the DISTINCT marker `incident_wip_in_progress` counts, excluding this lane from the shared `WIP≤2` slot). `is_po_expedited` + `incident_wip_in_progress` live in `scripts/lib/devteam-eligibility.jq`. Usage: `jq --arg now "$NOW" --argjson take_budget "$TAKE_BUDGET" --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-backlog-claim-incident-lane-consumer.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-backlog-promote-design-router-sweep.jq` + `scripts/devteam-backlog-claim-design-router-sweep.jq` — generalized (no hardcoded task IDs), idempotent Design-Router Sweep (DRS) backlog→ready→in_progress pickup for the non-dev-`next_agent`-unrouted class not already caught by SLS (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE, architect brief 2026-07-29, PO-ratified 2026-07-30) — see § Design-Router Sweep above. Promote resolves + stamps `dispatch_lane = effective_next_agent($detail_items)` directly (no owner-fallback — every candidate already has one by construction) restricted to the ratified allowlist `{architect, ba, pm, po, agents-architect}` (`is_design_router_allowed` / `is_design_router_eligible`, `scripts/lib/devteam-eligibility.jq`), WITHOUT clearing `supervised`/`plan_only`; claim sets `.head.next_agent` to a resolved specialist using the MANDATORY conditional guard (`$head_free` check — never an unconditional `.head` replace, per the ratification's hard AC and the live `qadrain-head-slot-decouple` precedent). Shares the pre-existing WIP≤2 invariant (4th writer) — never raises it. **FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT (2026-08-26):** claim no longer trusts the promote-time `dispatch_lane` cache — it now REQUIRES `--slurpfile detail` and re-resolves `effective_next_agent($detail_items)` fresh at claim time for every stamped candidate (sorted `[priority_rank, idx]`; refuses rather than writing `head.next_agent=null` if no candidate resolves) — see § Design-Router Sweep above for the two live incidents this closed. Usage: `jq --arg now "$NOW" --argjson allowlist '["architect","ba","pm","po","agents-architect"]' --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-backlog-promote-design-router-sweep.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` then `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-backlog-claim-design-router-sweep.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh` (claim now REQUIRES `--slurpfile detail`; `--argjson allowlist`/`--slurpfile archive` remain promote-only).
- `scripts/devteam-review-claim-qa-drain.jq` — Review-Lane QA-Drain, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (2026-07-22), FOLDS FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN — see § Review-Lane QA-Drain above. Age-ordered claim of the oldest `review[]` row with `status==REVIEW && next_agent=='qa'`, moves review[]→qa[]. **NOT-BEFORE TIME-GATE added 2026-08-26 (FIX-DEVTEAM-QADRAIN-SELECTION-BLIND-TO-QA-NOT-BEFORE-TIME-GATE):** candidate pipeline now excludes any row `is_gated_not_before($now)` (shared predicate, `scripts/lib/devteam-eligibility.jq`) — see § Review-Lane QA-Drain's Claim bullet above for full detail. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-review-claim-qa-drain.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-qadrain-skip-revert.jq` — FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA (2026-08-26, architect brief `docs/architecture-briefs/2026-08-26-qadrain-shared-hop-timegate-conservation-skipstrand.md` §3) — invoked from BOTH Review-Lane QA-Drain SKIP branches (idle-tick + head-decoupled, above) when a per-row `outer_claim` fails AFTER the batch claim script already moved that row into `qa[]`. Reverses the ONE row back to its `drain_source_lane` (`review`/`done`, already stamped on every batch-moved row) with matching status, clearing `claimed_at`/`claimed_by`/`drain_source_lane`; no-op (defensive) if the row is no longer present in `qa[]` or no longer `status==QA` (a peer already progressed it further). No `redispatch_count` charge. Deliberately NOT piped through `|| true` — a silently-discarded nonzero exit here would reproduce `FIX-DEVTEAM-QADRAIN-PIPE-SWALLOWS-CAS-ABORT-NO-RETRY`'s exact defect on a new call site; log loudly instead. Usage: `NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg id "<row.id>" --arg now "$NOW" -f scripts/devteam-qadrain-skip-revert.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/audits/devteam-review-lane-drain-report.sh` — read-only visibility instrument (non-gating) for the Review-Lane QA-Drain's PRIMARY (auto-dispatched, `next_agent=='qa'`) vs SECONDARY (null/non-qa `next_agent`, PO/architect triage queue — PO AC(1), never silently dropped) split. Usage: `bash scripts/audits/devteam-review-lane-drain-report.sh [STALE_DAYS=3]`.
- `scripts/devteam-review-claim-secondary-drain.jq` — Review-Lane SECONDARY-Drain, FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN (2026-08-01, architect brief `docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-secondary-sweep.md` §2) — see § Review-Lane SECONDARY-Drain above. Age-ordered claim of the oldest `review[]` row with `status==REVIEW && next_agent!='qa'` (the pre-existing SECONDARY set); stamps `secondary_claimed_at`/`secondary_claimed_by`/`secondary_dispatch_target` IN PLACE — never moves the row to a new lane, never writes `.head`. New shared predicate `resolved_secondary_dispatch_target` lives in `scripts/lib/devteam-eligibility.jq`. Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json -f scripts/devteam-review-claim-secondary-drain.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/devteam-eligibility-resolved-secondary-dispatch-target.test.sh` — regression test for `resolved_secondary_dispatch_target()`'s self-target case (FIX-DEVTEAM-SECONDARY-DRAIN-NO-SELF-TARGET-RESOLVER-CASE, architect, 2026-08-05): asserts `next_agent=="dev-team"` resolves to `"po"` (never passes through as `"dev-team"`, which the caller's own anti-recursion guard could never dispatch), alongside the pre-existing null/absent-fallback and every-other-value-passthrough cases (no-regression controls). Usage: `bash scripts/devteam-eligibility-resolved-secondary-dispatch-target.test.sh` (exit 0 = pass; never writes to the live file).
- `scripts/audits/devteam-dispatch-gate-satisfiability.sh` — **THE DoD/acceptance instrument for UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK.** Builds a live-shaped saturated fixture (pads to ready≈36/review≈32 if the live board has already drained, forces in_progress=1) and replays the REAL promote/claim scripts end-to-end, asserting each gate FIRES and DRAINS (row counts move between lanes) — not lane-resolution. Includes a negative control (in_progress padded to the WIP≤2 cap — confirms SLS/RLC would not be invoked). **EXTENDED 2026-07-30 (AC-6, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER):** § SLS-claim FALLBACK adds isolated single-row fixtures asserting the new unstamped-ready[]-row claim path (AC-2's fix) actually fires — positive claim + `dispatch_lane` resolution + `promoted_by` NOT forged (AC-2's explicit constraint) — plus negative controls (epic-wrapper exclusion per AC-4, unmet-`depends_on` exclusion) and a PRIMARY-vs-FALLBACK coexistence ordering check (at most one claim per invocation). **EXTENDED 2026-08-26 (FIX-DRS-CLAIM-TRUSTS-CACHED-DISPATCH-LANE-NOT-EFFECTIVE-NEXT-AGENT):** new § after AC-DRS-HEAD-GUARD adds isolated single-row fixtures for BOTH DRS-claim and SLS-claim's PRIMARY path — a stale cached `dispatch_lane` superseded by a later `next_agent` claims to the later agent (AC-1/AC-2); `dispatch_lane:null` with a resolvable `next_agent` still claims correctly, and with NO resolvable `next_agent`/owner the script REFUSES rather than writing `head.next_agent=null` (AC-3, both positive and negative controls); a freshly-stamped P0 at a higher array index outranks an older stamp at a lower index (the second, separable ordering defect, fixed in the same commit for both scripts). Usage: `bash scripts/audits/devteam-dispatch-gate-satisfiability.sh` (exit 0 = pass; never writes to the live file). **Known live-data-dependent flake (pre-existing, unrelated to the 2026-08-26 fix):** the "SLS gate ... SLS claims a row" positive-path assertion vacuously fails whenever the LIVE board happens to carry zero `effective_supervised && effective_plan_only` BACKLOG/TODO rows at run time (reproduces identically against the pre-fix HEAD copy of both claim scripts) — a live-board-drift artifact of the shared saturated fixture, not a regression; compare the failing assertion NAME, not the exit code, against a clean run before attributing a red run to any specific change.
- `scripts/devteam-wrapper-autoclose.jq` — FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (2026-07-29) — see `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4. Single-script sweep (no separate promote/claim halves — candidates are already in `ready[]`/`in_progress[]`, same "no promote half needed" shape as `devteam-backlog-claim-ready-lane-consumer.jq`): moves EVERY row in `.task_board.ready[]` UNION `.task_board.in_progress[]` whose `is_epic_wrapper($detail_items)` is true AND whose `all_children_terminal($detail_items; $status_map)` is true (every child id resolves, in ANY hot task_board lane OR cold-archived `docs/data/orch/archive/YYYY-MM.json` `.done_tasks[]`, to a case/separator-normalized member of TERMINAL_SET = `{DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED}` — SSOT `apps/mcp-server/src/infrastructure/orchStateSchema.ts`, mirrored by `scripts/orch-cold-evict.sh` `TERMINAL_TASK_STATUSES`) AND NOT carrying `hold_reason` (inline or detail) — into `review[]`, status `→ REVIEW`, `next_agent = resolved_dispatch_lane($detail_items)`, stamps `autoclosed_at`/`autoclosed_by`/`status_note`. Conditionally syncs `.head` to idle per CANONICAL:SSOT-STATUSFLIP-LANEMOVE(b) ONLY if `.head.active_task_id` equals a swept row's id. New shared predicates `is_epic_wrapper`'s sibling `all_children_terminal`, `is_terminal_task_status`, `normalize_task_status`, `has_hold_reason` live in `scripts/lib/devteam-eligibility.jq` (appended, no existing def order disturbed). NEVER gated on WIP (moving OUT of `ready[]`/`in_progress[]` can only shrink `.task_board.in_progress|length`, never compete with BOUNDED-1/SLS/RLC's budgets) and sweeps ALL eligible rows in one write (administrative housekeeping, not a new-work concurrency decision — unlike BOUNDED-1's single-pick discipline). Distinct from `FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE`'s `is_epic_wrapper` (that gate prevents auto-PROMOTE of a wrapper as atomic work; this script is the CLOSEOUT direction once a wrapper legitimately finished — never conflate the two). Usage: `jq --arg now "$NOW" --slurpfile detail docs/data/orch/archive/backlog-detail.json --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) -f scripts/devteam-wrapper-autoclose.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh`.
- `scripts/audits/devteam-wrapper-autoclose-verify.sh` — read-only regression verifier for the above (ALL SYNTHETIC fixtures — no live `ready[]`/`in_progress[]` row currently carries `children[]`, verified 2026-07-29). Asserts: all-terminal wrapper (hot+cold mix) IS swept with correct status/next_agent stamps; one non-terminal child blocks the sweep; case/separator-drifted cold-archive status strings (`"done_verified"`, `"DONE-VERIFIED"`) still resolve terminal; a child id absent from BOTH hot and cold archive is conservative-skip (never assumed done); `hold_reason` blocks the sweep even with all children terminal; a plain non-wrapper row is byte-identical untouched; `.head` syncs to idle ONLY when it pointed at the swept row (negative control: untouched when it pointed elsewhere); `in_progress[]` source rows are swept same as `ready[]`; re-running against the sweep's own output is idempotent (no-op). Usage: `bash scripts/audits/devteam-wrapper-autoclose-verify.sh` (exit 0 = pass; never writes to the live file).
- `scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh` — read-only regression verifier for FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-LANE-BLIND (WF-1b TERMINAL-LANE check above); mirrors `execute-tier-branchnull-review-headidle-verify.sh`'s pattern (SYNTHETIC fixtures only, zero live `docs/data/orch/orch-state.json` I/O). Asserts: (AC-4, positive) a `.head` pinned `in_progress` at a row present ONLY in `done[]` (status `DONE`) idle-resets `.head` to `{status:idle, active_task_id:null, next_agent:null}` and the S2 spawn branch is never reached, repeated for `done_verified[]`/`DONE_VERIFIED`; (AC-3, negative) a `.head` pinned at a row genuinely resident in `in_progress[]` (status `IN_PROGRESS`) resolves non-terminal/non-BLOCKED and the S2 dispatcher-wrap path is unchanged; (AC-3, negative) a `.head` pinned at a `BLOCKED` row still takes the pre-existing BLOCKED carve-out unchanged (idle reset + lane-move to `backlog[]`), proving `is_terminal_task_status("BLOCKED")==false` by construction so the new branch cannot shadow/reorder the BLOCKED carve-out. Usage: `bash scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh` (exit 0 = pass).
- **PENDING (companion developer row, FIX-DEVTEAM-RESUME-GATES-OMIT-READY-LANE AC-4/AC-5 — `scripts/` is outside agent-father's `commit_zone.allowed`, split precedent TE-T02/TE-T12):** extend `scripts/audits/devteam-pipeline-resume-terminal-lane-verify.sh` (or a sibling) with a positive control (`.head.status=in_progress` naming a `ready[]` row → assert S2 dispatch never reached, WF-1c fires instead) + a negative control (same fixture, row in `in_progress[]` → assert normal S2 resume unaffected) for the WF-1c READY-LANE check above; plus extend `scripts/audits/po-goahead-producer-verify.sh` (or a new drift-guard script) to mechanically diff the WF-2 `should_hold` jq filter text between this file (§ WF-2 SUPERVISED-HOLD check above) and `docs/agents/po/flow/supervised-goahead.md` § Step 1, asserting byte-identical — the invariant both files already claim in prose but neither enforces (root cause of the AC-3 drift this same task fixed).
- **PENDING (companion developer row, FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE §7/§8, architect brief `docs/architecture-briefs/2026-08-07-devteam-head-pin-stale-threshold-resume-bound.md` — optional, non-blocking, not spawned this cycle, `scripts/`+`orchStateSchema.ts` outside agent-father's `commit_zone.allowed`, same split precedent as the two PENDING bullets above):** (a) explicit `HeadSchema` typing for `resume_attempts: z.number().int().nonnegative().optional()` / `last_resume_at: z.string().optional()` (`apps/mcp-server/src/infrastructure/orchStateSchema.ts:232-245` — both `HeadSchema`/`TaskSchema` are `.passthrough()`, so WF-3/WF-4 above already validate today with zero schema change; this is polish, not a correctness gap); (b) new `scripts/audits/devteam-head-pin-resume-bound-verify.sh`, mirroring `devteam-pipeline-resume-terminal-lane-verify.sh`'s SYNTHETIC-fixture-only pattern (zero live `orch-state.json` I/O): AC-4 positive (`resume_attempts=3` → row flips BLOCKED, `.head` idle-resets, S2 spawn branch never reached) + AC-4 negative (`resume_attempts=2` → WF-3 does not fire) + AC-1 positive (`claimed_at`=3h ago, no matching stubbed git-log commit → WF-4 fires) + AC-1 negative/corroboration (same fixture WITH a matching stubbed commit → WF-4 does NOT reset) + the AC-1/WF-2 false-positive regression guard (synthetic `effective_supervised=true` row, no `po_goahead_*`, `claimed_at`=3h ago past the 2h threshold → WF-2's `should_hold` short-circuits BEFORE WF-4 ever evaluates, `.head` byte-unchanged) + AC-3 positive (`.head.resume_attempts`/`last_resume_at` increment on a successful S2 `outer_claim`, stay flat when `outer_claim.claimed==false`).
- **PENDING (companion developer row, FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW AC-5 — `scripts/` is outside agent-father's `commit_zone.allowed`, same split precedent as the two PENDING bullets above):** `scripts/audits/devteam-dispatch-gate-satisfiability.sh`'s own methodology (§ header, Method) replays the REAL promote/claim `.jq` SCRIPTS against a scratch board fixture — it has no way to exercise the S2/ILC resume-key keepalive fix above, because that fix is `call_tool(task_claim/task_heartbeat)` sequencing interpreted live by whichever LLM agent runs this flow's tick against `coordination.db`, written INLINE in this file's own prose (§ Step 0b S2 dispatcher-wrap, § Incident-Lane Consumer), not a `.jq` transform of `orch-state.json` — unlike BOUNDED-1/SLS/RLC/DRS/QA-Drain, whose claim logic this harness already calls directly, there is no dedicated `.jq` file for either resume-claim call site to invoke. This class is provable ONLY by control-flow inspection of this file itself (same verification standard already applied to § Idle-Tick Rotation Selection's single-writer guarantee) — not by this harness, by construction. Ready-to-apply companion-row content (draft, not applied here): a NEW, STANDALONE `scripts/audits/devteam-resume-key-keepalive-verify.sh` — SYNTHETIC fixtures only, stubs `task_claim`/`task_heartbeat` responses (never touches live `coordination.db`) — asserting (i) a `claimed:false` + `current_holder` response drives exactly one `task_heartbeat` call whose `owner_client_session` argument equals `current_holder.owner_client_session` (never `$CLAUDE_CODE_SESSION_ID` of the caller) and `ttl_seconds:3600` (never a raised value — AC-4 regression guard); (ii) a `claimed:false` response with NO `current_holder` drives zero `task_heartbeat` calls (F3/F5 degraded-mode negative control); (iii) a `claimed:true` response drives zero `task_heartbeat` calls and the pre-existing spawn path is byte-unchanged (negative control — this fix touches only the `claimed:false` branch); identical triple for both the S2 and ILC call sites, proving AC-3's "both call sites, independently."

## Invariants

- WIP ≤ 2 (`wip_in_progress`, `scripts/lib/devteam-eligibility.jq` — corrected 2026-07-22, UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK, FURTHER corrected 2026-07-30, FIX-DEVTEAM-WIP-BUDGET-COUNTS-BLOCKED-INPROGRESS-ROWS: excludes BLOCKED/TERMINAL_SET rows from `in_progress[]`, never a bare array length; `ready[]`/`review[]` are staging lanes, never counted toward concurrency) | `docs/data/orch/orch-state.json` `.task_board.active_sprints[].tasks` count ≤ 80 per sprint | project-stats.json updated each sprint
- **Two independent concurrency budgets, named together here so a future reader auditing them sees both in one place — but they are NOT symmetric with the shared WIP≤2 slot above:** `qa[] < QA_CAP` (`QA_CAP=10`, Review-Lane QA-Drain — both its idle-tick and head-decoupled invocation sites share this ONE budget) genuinely sits OUTSIDE `wip_in_progress` — a claimed row moves into the separate `qa[]` board lane, never `in_progress[]`, so it never competes with BOUNDED-1/SLS/RLC/DRS for their slot. `INCIDENT_CAP` (`=2`, dev-team incident-lane consumer — `incident_wip_in_progress`, § Incident-Lane Consumer (ILC) — Head-Decoupled Invocation above, FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW 2026-08-25) does NOT: an incident row stays in the SAME `in_progress[]` lane, and `wip_in_progress` (`scripts/lib/devteam-eligibility.jq`) has no `claimed_by` filter, so it counts these rows too — a deliberate asymmetry (the shared budget sees MORE load, never less), not an oversight. `INCIDENT_CAP` only bounds how many of those rows the incident lane itself may add; it does not exempt them from the WIP≤2 ceiling BOUNDED-1/SLS/RLC/DRS also compete for.
- **`resume_key` (`"task:" + active_task_id`) never organically lapses while `.head` still legitimately shows that task `in_progress` AND dev-team keeps ticking** (FIX-DEVTEAM-RESUME-KEY-TTL-3600-LAPSES-UNDER-LIVE-AGENT-REOPENING-DOUBLE-SPAWN-WINDOW, 2026-08-25 — § Step 0b S2 dispatcher-wrap + § Incident-Lane Consumer, both keepalive-renew on their own `claimed:false`/peer-held branch). `ttl_seconds:3600` is UNCHANGED (never raised — AC-4) and remains the crash-recovery backstop for a dispatcher that genuinely stops ticking; WF-3 (resume-attempt-bound)/WF-4 (2h stale-age + git-log corroboration) remain the sole, independent authority for deciding a pinned task is abandoned, unaffected by this keepalive.
- Docker restart: after final sprint merge only
- Branch deleted by QA post-merge
- Notify WORK at: fix shipped | sprint complete | blocker resolved | idle
- **DRAIN-INJECTION-SAFE (FLEET-HOST-SAFETY):** NEVER interpolate a signal/payload/DASHBOARD field into a `/bin/sh` command line. Safe patterns only: (a) `jq --arg` bound variables for any bash JSON/SQL step; (b) structured JSON object passed directly to `call_tool` MCP gateway `arguments` (no shell exposure); (c) write SQL to a tmp file then `sqlite3 db < file`. ALL `task_claim` payload fields in this flow and sub-flows MUST use pattern (b) — never a concatenated shell string. Reference: `feedback_signal_payload_shell_injection`. Violation = WORK alert + halt.

---

<!-- jump:end -->
## Session Exit

All JUMP TO `end` paths converge here.

```
# SF-1 release — always run on clean exit (TTL expiry is fallback for crash path)
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "dev-team-cron-singleton", owner_client_session: $CLAUDE_CODE_SESSION_ID })
# ok=false is acceptable (TTL already expired after a long tick, or SF-1 was never claimed on SKIP path)

# P3-FIRE-ELECTION release (TASK_1994) — run ONLY if fire-election was won (FIRE_TICK is set).
# FIRE_TICK is not set when we reach jump:end via the SF-1 skip path (early exit before Step [3]).
# On fire-election loss: we EXIT before jump:end (SF-1 released inline, fire-election not claimed).
# All other jump:end paths (HEAD.lock, session-gate, post-cycle) have FIRE_TICK set.
if FIRE_TICK is set:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id:              "cron:dev-team:" + FIRE_TICK,
    owner_client_session: $CLAUDE_CODE_SESSION_ID
  })
  # ok=false acceptable (TTL=600s expired after long tick — crash-safety backstop served its purpose)
```
