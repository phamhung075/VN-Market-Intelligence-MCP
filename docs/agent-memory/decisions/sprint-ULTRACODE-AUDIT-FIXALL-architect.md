# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · architect

**Sprint goal:** Drain CONFIRMED/RESCOPE findings from the 2026-07-12 ultracode workflow audit.
**Agent:** architect
**Started:** 2026-07-13T20:00:00Z

---

### STEP architect-S1 · architect · 2026-07-13T20:00:00Z
**task-id:** UC-RDL-P1
**what-done:** Adjudicated the mint's framing before designing; split it into two separate claims and verified each independently against server code + live flows (not trusted from the critic's one-liner or the prior audit brief alone).
**what-considered:**
- Treat `intent:` vs `task:` as the drift (as literally worded in the mint) → falsified: coordinationTools.ts's 7-kind enum, its own task_id format describe(), and tasksMdJanitorJob.ts's KNOWN_LEGIT_PREFIXES allowlist all treat `intent:` as a deliberately separate, board-row-less category.
- Treat `sprint-task:` (doc) vs `task:` (100% of live flows + server) as the drift → confirmed: zero live call sites use `sprint-task:` as a task_id value; the SKILL's own "mismatch = no protection" warning is self-refuting given its own example.
**why-decision:** Empirical live evidence (this cycle's own dispatch lock was `task:UC-RDL-P1`, not `intent:architect:...`) plus server-code enum/allowlist proof outweighs the mint's prose framing — REJECT the intent:/task: merge, CONFIRM the sprint-task:/task: doc fix (already independently verified in the 07-12 audit's own verifier pass).
**why-change:** Mint conflated two SKILL.md sections (generic Phase B intent: pattern vs Sprint-Task Outer Wrap section) into one claim; scoped the fix to the section that's actually wrong.

### STEP architect-S4 · architect · 2026-07-21T23:57:05Z
**task-id:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD
**what-done:** Ruled the 3 architect-decidable calls BA deferred (FR-5 bundle, backlog+BLOCKED classification, I10 batching); ratified DDD layers + FR-1/FR-2 file-level design; wrote blueprint.
**what-considered:**
- FR-5: bundle now (shared resolver, same commit) vs spin `dev-team-loop-I9` standalone — chose bundle: identical defects, same file/lines, not container-rebuild-gated, and un-bundling would leave FR-4's widened guard produce zero-board-trace adoptions.
- backlog+BLOCKED: route to active (symmetric with in_progress+BLOCKED) vs terminal — chose terminal, grounded in a live board example (TASK_2005 in_progress→backlog+BLOCKED on new depends_on) showing the real meaning is "paused pending external precondition," plus asymmetric safety cost (wrong-active risks the MATERIALIZED incident repeating; wrong-terminal only delays, self-heals via existing promote gate).
- I10: leave for successor to fix in any order vs sequence as hard precondition — chose precondition-first: successor's own heartbeat-loop deliverable cannot function without I10's owner_client_session binding landing first at the same claim call; also found the :64 release call shares the same defect (BA only flagged :42-48).
**why-decision:** Each call resolved by grounding in live evidence (line-exact code read, a real board row, the Zod-required-field schema) rather than the abstract framing alone — matches the standing "ratify BA's judgment call with independent verification" pattern from S2/S3.
**why-change:** No change from BA's scope — all 3 were explicitly flagged as architect-owned engineering calls, not PO/business calls.

### STEP architect-S2 · architect · 2026-07-16T04:40:00Z
**task-id:** UC-ASL-P2
**what-done:** Verified BA's 6 copy-site inventory + all cited precedent files (mcp-call.sh, auditor-notebook-commit.sh, orch-apply.sh exit codes, context-bloat-backstop.sh's actual dead-gate boundary) line-exact at HEAD; resolved the 3 ARCH-RATIFY items and the 2 items BA explicitly deferred (CAS-retry loop shape, E-3-only mode flag); wrote design to handoff.
**what-considered:**
- ARCH-RATIFY-2 (severity-escalation bypass): keep FR-3's bare-string ledger (`{key: ts}`, no severity) and skip the bypass rule entirely vs amend the ledger value to `{ts, sev}` to make the bypass computable.
- E-3-only mode: infer "no E-1" from absence of certain detail_json fields (BA's first option) vs one explicit `--e3-only` flag (BA's second option, self-flagged as the unambiguous one).
- Ledger concurrency: add flock-style locking for concurrent Tier-2/Tier-3 same-tick invocations vs accept the bounded lost-update risk unlocked (mirrors sibling tmp+mv writers).
**why-decision:** A no-op on EC-4 would silently leave a worsening CRITICAL re-alert muted for up to 7 days — worse than doing nothing per the brief's own "passive health masks" anti-pattern class; the 1-field ledger amendment is the minimum schema change that makes BA's own non-binding recommendation implementable, so took it. Explicit `--e3-only` flag chosen over inference because BA's own FR-6 text flagged inference as ambiguous ("rather than inferred") — an explicit switch is unambiguous for both the developer and future call sites. Locking rejected — effort=M scope, worst case is a redundant Telegram send (never a lost E-1/E-3), and 2 already-shipped sibling writers accept the same unlocked tmp+mv tradeoff.
**why-change:** No change from BA's scope — both resolved items were explicitly flagged by BA as architect-owned technical decisions, not scope additions.

### STEP architect-S3 · architect · 2026-07-16T15:50:00Z
**task-id:** UC-CRITIC-GATEWAY-CONTRACT-DRIFT
**what-done:** RAW-verified all 6 BA fix-table lines + FR-3's §6 no-other-hit claim at exact line numbers (all matched byte-for-byte); ruled on BA's 3 open questions; ratified canonical-binding + historical-exclusion.
**what-considered:**
- Q1 (I11/I14 fold-or-separate): discovered via grep that these are NOT bare unfiled findings — they're already sub-bullets P9/P12 inside two live BACKLOG SPIKE rows (`UC-RDL-UNVERIFIED-BATCH`, `UC-CCA-UNVERIFIED-BATCH`), each an 8-9 item PLAN-ONLY umbrella awaiting a future full BA-spike-then-decompose cycle before ANY bullet ships.
- Q2 (settings symmetry): checked `.claude/settings.local.json` tracking status directly.
- Q3 (historical exclusion): spot-checked the frozen audit brief + po-decisions.md rolling-log edge case; no repo policy doc explicitly codifies "never rewrite dated records" but the audit brief's own P9 note ("git history IS the audit trail") is a live precedent for the same principle.
**why-decision:** Q1 FOLD IN — same mechanical 1-line class already being batched 6x in this task, near-zero marginal risk, and waiting for the two P2 SPIKE batches to individually clear would duplicate the verification work already done this cycle; flagged for PM to have those 2 batch rows' notes struck (P9/P12) post-ship so a future spike doesn't re-investigate shipped work. Q2 LEAVE AS-IS — `.claude/settings.local.json` is globally gitignored (`~/.config/git/ignore:1`), zero commit surface exists in this repo for it, and global `~/.claude/settings.json` is outside repo control entirely; `defaultMode:"auto"` already covers the gap functionally (BA-confirmed live this session). Q3 RATIFY BA's exclusion list as-is — no exceptions found on spot-check.
**why-change:** No change from BA's scope — all 3 were explicitly flagged by BA as non-blocking architect judgment calls.
