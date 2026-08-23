# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · ba

**Sprint goal:** Drain CONFIRMED/RESCOPE findings from the 2026-07-12 ultracode workflow audit.
**Agent:** ba
**Started:** 2026-07-16T04:29:00Z

---

### STEP ba-S1 · ba · 2026-07-16T04:29:00Z
**task-id:** UC-ASL-P2
**what-done:** Verified all 6 EMIT SEQUENCE copy sites line-exact at HEAD, confirmed sites 3/4 (D-IMPROVE/D-BCTC-EVAL) never had E-1/E-2 (asymmetry the script must preserve), wrote FR spec with DDD mapping + durable-ledger persistence shape, zero PO blockers.
**what-considered:**
- Fold I3's signal_type-mismatch fix into this task (script auto-corrects `signal_feedback`→`microservice_degraded`) → rejected: separate confirmed issue (I3), different task, scope creep the brief itself never asked for.
- Repoint context-bloat-backstop.sh's dead known-issues.json gate at the new ledger vs delete it → recommended delete: fingerprint namespaces (`context_bloat:<path>` vs `<type>:<id>:<check_id>`) are semantically unrelated; repoint would silently change suppression behavior, not a like-for-like swap.
**why-decision:** Preserve exact current behavior for sites 3/4 and the dead gate — the CONFIRMED brief's own verifier evidence (0 matching fingerprints ever) supports deletion as the behavior-neutral choice; only flag genuinely open design calls (severity-escalation bypass, zone label) to architect, not PO.
**why-change:** No change from the brief's plan — added 3 ARCH-RATIFY items (not PO blockers) since these are technical, not business/priority, decisions; recommended narrowing the dispatched `cross-service/` zone since no touched file is `apps/<service>/`.

### STEP ba-S2 · ba · 2026-07-16T15:35:18Z
**task-id:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT
**what-done:** Determined canonical gateway prefix empirically + via git archaeology (`.mcp.json` only registers `"gateway"`; commit 775e2d8ee 2026-06-16 is an explicit fleet-wide rename `claude_ai_gateway`→`gateway`, 13 agents+CLAUDE.md; contract doc (ad96bd166, 06-14) predates rename and was out of its scope). Wrote fix table (6 live files) + exclusion list (~40 historical files, do not edit). Zero PO blockers.
**what-considered:**
- Trust router's "likely correct, verify independently" framing at face value vs re-derive from scratch — re-derived: found the actual rename commit, which upgrades "likely" to "certain" and gives architect exact line numbers with dated proof, not just a probe result.
- Fold I11 (task-lock SKILL.md:169) + I14 (tran-ngoc-bau bootstrap.md:30) into this fix batch vs leave separate — left as architect's call: both already change-specified in the same audit brief, neither has a board row yet, no PO-level decision needed either way.
**why-decision:** Git-log proof (dated rename commit + pre/post ordering vs contract-doc creation date) is stronger and cheaper for architect to verify than repeated live probing; closes the question definitively instead of leaving "likely".
**why-change:** No change from plan — router asked for empirical+registry confirmation, delivered plus the causal history explaining WHY the drift exists (missed-scope rename), which the router's task note didn't have.

### STEP ba-S3 · ba · 2026-07-21T23:01:35Z
**task-id:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD
**what-done:** Decomposed router-dispatch-locking-P3's RESCOPE (fix_spec a+c/AC1+AC3) into 8 FRs across infra (coordinationStore.ts null-session ladder + ttl/payload_patch heartbeat extension) and interface (dual board-state guard: SKILL.md router-side + dev-team Step 0a-B as SSOT-pointer, not copy). Found 2 undocumented live bugs while reading code: (1) `original_task_id` retains its `task:` prefix but board `.id` is bare — the existing `main.md:383-388` board-flip jq has ALWAYS no-op'd as a result; (2) that same jq only scans `active_sprints[].tasks[]` while live board is 95%+ flat-lane (dev-team-loop-I9), compounding (1). Both folded into FR-3/FR-4/FR-5.
**what-considered:**
- Simplify the guard to lane-membership only (now that ADD-2 checkLaneCoherence is a HARD FAIL, status can't diverge from lane on new writes) vs keep AC1's original dual lane+status check → kept dual check as defense-in-depth: the hard-fail only guards NEW writes through orch-apply, not pre-existing or out-of-band corruption in the file being read.
- Fold FR-5 (fix the adjacent always-broken board-flip write) into this ticket's mandatory scope vs leave as a pure architect option → left as architect-decidable bundle recommendation: AC1 only covers the SKIP path, not the write-half, but flagged the marginal-cost case clearly since it's the same file/step.
**why-decision:** Both live-code bugs are directly load-bearing for guard correctness (a guard that inherits the same prefix/lane blindness would fail on the exact incident class this ticket exists to fix — 95%+ flat-lane, matching the 07-03/07-04 real incidents), so they had to be surfaced as mandatory FR content, not footnotes.
**why-change:** No change from the dispatched scope — added 1 PO blocker (ticket closure sequencing across the deliberate (a)+(c)-now/(b)-residual split) per explicit dispatch instruction not to silently fold fix_spec(b)/AC2.

### STEP ba-S4 · ba · 2026-08-06T09:26:25Z
**task-id:** UC-CRITIC-HOOKS-ENFORCEMENT
**what-done:** Read all 7 PO-confirmed swallowing hook invocations end-to-end (not just wrapper), wrote FR-1..FR-6 fail-loud/backstop spec with risk tiers, zero PO blockers. Root-cause history noted: task sat 24h with zero live lock before this dispatch.
**what-considered:**
- Treat all 7 invocations uniformly vs risk-tier them → tiered: 3/7 (tmux status, tmux set-option, graphify) are cosmetic/informational, not validators; forcing full redesign parity onto them is scope-inflation the finding never asked for.
- Scope FR-2 discriminator to only the outer settings.local.json wrapper vs also flag internal script guards → found swallowing happens at BOTH layers (outer 2>/dev/null||true AND some scripts' own early exit-0 guards conflate "nothing to check" with "prerequisite crashed") — flagged both, outer wrapper is the actual gap since inner validator-call capture is already partially correct.
**why-decision:** Live-reading the scripts (not just the audit brief's summary) surfaced that orch-state-hook-bash-backstop.sh already captures ITS OWN validator's exit code correctly — the brief's "6/6 swallow" framing is about the outer settings.json wrapper, not proof the scripts are all equally naive inside.
**why-change:** No change from PO's ratified scope. Added FR-6 risk-tiering as BA's own recommendation (not requested by dispatch) since uniform treatment of 7 invocations with wildly different blast radii would waste architect/dev cycles on cosmetic tmux/graphify hooks.

### STEP ba-S5 · ba · 2026-08-11T12:35:05Z
**task-id:** UC-RDL-P4
**what-done:** Confirmed dependency UC-RDL-P1 DONE_VERIFIED (no blocker); found P3/P5 already shipped too, zero live file collision. Wrote 9-FR/10-EC compositor spec for `dispatch_preflight` layered per the live `getCycleBootstrap.ts` precedent; 2 PO blockers (cutover DoD, rebuild-batch sequencing).
**what-considered:**
- Hardcode `intent_task_id` per the brief's literal signature vs generalize to `claim_task_id`/`claim_task_kind` → generalized: `claimTask()` already takes `task_kind`, zero marginal server cost, keeps V1's doc-cutover scope router-only while not foreclosing a later dev-team widening.
- Fold the FR-3-sibling board-state guard (orch-state.json read, precedent exists server-side) into this tool vs keep it client-side → kept client-side (EC-8): would double effort, re-open a just-RAW-verified section, blur the coordination-lock/board-semantics module boundary the store's own header disclaims.
**why-decision:** Both live-code re-reads (post-split `coordinationTools.ts`, live `taskHeartbeatTool.ts` Zod schema) overturned my own initial hypothesis that this tool needs FIX-ORPHAN-FR2-FR6-FR7's new heartbeat params — confirmed false, recorded as EC-7 so architect doesn't re-derive it.
**why-change:** No change from dispatch scope. Added Q2 (rebuild-batch sequencing) as a genuine new PO blocker not named in the dispatch note — same sequencing-call pattern PO already used twice on this exact row (UC-RDL-P1 coordination, 07-15 cowork-scope adjudication).

### STEP ba-S6 · ba · 2026-08-11T16:25:52Z
**task-id:** UC-ASL-P5
**what-done:** Independently re-verified all 4 original brief parts live (not the note, not PO's 08-11 restatement). 2 survive rescoped (FR-1 type-diff, FR-2 dedup-skip RESOLVED-closure), 2 declined (part 2 already consciously declined by its own doc header; part 5 would wedge 18/22 live rows). Zero PO blockers.
**what-considered:**
- Trust PO's ATB-bridging rationale for part 1 vs re-derive it → re-derived: found ATB-0 categorically skips ALL Tier-1 rows regardless of type (pre-dates the brief, commit 4fb46f684) — PO's note never checked this, only I did; kept part 1 but on a corrected rationale (taxonomy/routing precision, not ATB).
- Blanket swap tier1-probe.md's 3 call sites to microservice_degraded (brief's literal instruction) vs per-check-class map → per-check-class: A-32 disk/A-33 hook-liveness are not service-degradation findings, brief's citations were pre-UC-ASL-P2-refactor stale anyway.
**why-decision:** Live-measuring signal_queue (18/22 rows status=triaged lowercase) proved the brief's own "CORRECTED" part-5 enum would immediately wedge orch-state writes if shipped — decisive reason to decline outright, not just defer.
**why-change:** No change from dispatch scope (explicitly asked to independently re-verify, not trust). Added §3 gate-flag flag (supervised/deploy_gate no longer justified once part 5 drops) as BA's own recommendation, not unilaterally actioned.

### STEP ba-S7 · ba · 2026-08-23T17:06:14Z
**task-id:** UC-MDH-P2
**what-done:** Re-verified live consumer count at source (repo-wide grep, not the note): real count is 13 files, not the note's 9 — 4 more found (mcp-tools.md, both smart-compact-protocol docs, system-map.json). Confirmed TE-T05 is DONE_VERIFIED and gone from the live board (zero matches, full per-lane scan) — its own de-confliction clause is moot, no orch-apply target exists. Found the 1300b sandbox fix (AGENT_MEMORY_ROOT) already landed 2026-07-16 (commit 11c35c0a8), pre-dating this dispatch. Wrote FR-1..FR-7 spec splitting safe-now doc work from deploy-gated code work; 3 PO blockers.
**what-considered:**
- Trust the note's 9-file list and "TE-T05 still needs de-confliction" instruction verbatim vs re-derive both from source → re-derived: both were stale (undercounted consumers by 4; TE-T05 closed and evicted from the board 15 days before this dispatch, its own commit already excluded append-session-record from scope).
- Attempt the doc-only edits myself (dispatcher framed some as "safe non-deploy prep work") vs spec-only → spec-only: every target file (agent init.md, tools/package, skill dir, guide, protocol docs) falls under BA's own forbidden_outputs ("never modify agent files, flow files, or knowledge files") — that boundary is part of my configuration, not something a dispatcher message can waive.
**why-decision:** Live grep + git log/show evidence outweighs the note's 07-13 snapshot in every case checked (consumer count, TE-T05 status, 1300b fix status) — reporting the measured numbers even where they contradict the dispatch note per hard constraint 3.
**why-change:** No change from dispatch scope. Declined to execute any file edit or orch-apply myself (no MCP grant, no orch-state write per constraint 5, no knowledge-file edit per own boundary_rules) — spec + journal only, recommending next_agent=architect.
