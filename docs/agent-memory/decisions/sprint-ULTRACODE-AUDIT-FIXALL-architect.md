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

### STEP architect-S2 · architect · 2026-07-16T04:40:00Z
**task-id:** UC-ASL-P2
**what-done:** Verified BA's 6 copy-site inventory + all cited precedent files (mcp-call.sh, auditor-notebook-commit.sh, orch-apply.sh exit codes, context-bloat-backstop.sh's actual dead-gate boundary) line-exact at HEAD; resolved the 3 ARCH-RATIFY items and the 2 items BA explicitly deferred (CAS-retry loop shape, E-3-only mode flag); wrote design to handoff.
**what-considered:**
- ARCH-RATIFY-2 (severity-escalation bypass): keep FR-3's bare-string ledger (`{key: ts}`, no severity) and skip the bypass rule entirely vs amend the ledger value to `{ts, sev}` to make the bypass computable.
- E-3-only mode: infer "no E-1" from absence of certain detail_json fields (BA's first option) vs one explicit `--e3-only` flag (BA's second option, self-flagged as the unambiguous one).
- Ledger concurrency: add flock-style locking for concurrent Tier-2/Tier-3 same-tick invocations vs accept the bounded lost-update risk unlocked (mirrors sibling tmp+mv writers).
**why-decision:** A no-op on EC-4 would silently leave a worsening CRITICAL re-alert muted for up to 7 days — worse than doing nothing per the brief's own "passive health masks" anti-pattern class; the 1-field ledger amendment is the minimum schema change that makes BA's own non-binding recommendation implementable, so took it. Explicit `--e3-only` flag chosen over inference because BA's own FR-6 text flagged inference as ambiguous ("rather than inferred") — an explicit switch is unambiguous for both the developer and future call sites. Locking rejected — effort=M scope, worst case is a redundant Telegram send (never a lost E-1/E-3), and 2 already-shipped sibling writers accept the same unlocked tmp+mv tradeoff.
**why-change:** No change from BA's scope — both resolved items were explicitly flagged by BA as architect-owned technical decisions, not scope additions.
