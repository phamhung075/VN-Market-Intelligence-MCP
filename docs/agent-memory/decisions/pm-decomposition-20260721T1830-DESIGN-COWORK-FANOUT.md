# Decision Journal — PM Decomposition · DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING

**Sprint goal:** Decompose architecture brief into 8 atomic tasks following PO sequencing directive (T6 first)
**Agent:** pm
**Started:** 2026-07-21T18:30:00Z

---

### STEP pm-decomposition · DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING · 2026-07-21T18:30:00Z

**what-done:** 
- Decomposed DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING into 8 atomic tasks (T1–T8)
- Created handoff files for all 8 tasks with acceptance criteria, file paths, dependencies, zone assignments
- Updated orch-state.json: moved parent row from ready → in_progress, added 8 subtasks to ready lane
- Structured tier sequencing per PO instruction: T6 ships first (market-facing DATA LOSS), T1/T5 parallel with T6, T2 after T1, T4 after T2+T3, T8 after T1+T2+T4+T6

**what-considered:**
1. Order of T6 vs T1-T5: PO explicitly instructed T6 first because (a) it is market-facing data loss, not latency; (b) no dependency on T1-T5; (c) T3 blocks on qa full-suite, so T1-T5 cannot complete promptly anyway
2. Whether to keep T1-T5 together or parallelize: PO said "parallelize T6 against T1/T2/T5 if two developers available" — decomposed to allow two developers to work independently, with T1/T5 as parallel entry points
3. Whether to mint a separate row for R3 (market-watcher slot routing) or fold into this row: PO explicitly ruled to fold T6 into this row (brief §9 T6/T7) rather than split one root cause (receiving flow discarding slot identity) across two owners
4. Whether T7 (match-slots clarify) should be READY or TODO: Marked as TODO + optional/low-priority per brief §9 T7, can defer if schedule tight

**why-decision:**
- **T6 first:** PO's stated reasoning: "T6 is the only strand that is market-facing DATA LOSS (missing EOD deliverable) rather than detection latency (~20min recheck)." The 2026-07-21T16:00Z incident shows market-watcher EOD slot fired late (16:08–16:13Z outside 15:55–16:05 window) and main.md's wall-clock check silently routed it to offhours instead of eod.md — a lost artifact, not just duplicate compute. Chef's 08:37Z EOD dish depends on that output. This is worse than alert-commander missing a 20-minute recheck, and T6 is unblocked (doc-only flow change) while T3 must wait for qa full-suite.
- **Parallel tiers T1/T5 with T6:** Both T1 and T5 have zero internal dependency. T1 feeds T2 (bootstrap extraction). T5 feeds T4 (alert-commander reading config). But both can start immediately with T6 if two developers are available. Sequencing reflects this.
- **T3 after qa:** Brief §9 names T3 as the only touch to apps/mcp-server/. PO ruled "must be sequenced behind the live qa full-suite run" — keeping all three (T1, T2, T5) as TODO even though they are independent, because the overall row's critical path includes T3 (T4 depends on T3). Dev-team will pick them up as capacity allows.
- **R3 fold-in:** Brief §5 and PO ruling: one root cause (market-watcher discarding its slot= and re-deriving from clock), one owner (market-watcher). Splitting it across two rows would create maintenance headache and obscure the root cause. T6+optional T7 belong here, not in a separate row.

**why-change:**
No change from the architecture brief's own §9 decomposition plan — all 8 tasks (T1–T8) are minted exactly as brief named them, with dependencies as brief specified. The only adaptation: explicit tier sequencing (tier 1 = T6; tier 1b = T1/T5; tier 2 = T2; tier 2b = T3/T4; tier 3 = T7; tier 4 = T8) to honor PO's sequencing directive that T6 ships first. No scope creep, no task merging, no scope-hold violations (row's standing: "does NOT own get_alerts(type=price) detector question; FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 remains un-refiled"). Scope hold REAFFIRMED.

**post-decomposition-corrections-applied-20260721T1832Z:**

1. **Owner and next_agent assignment (blocking fix, first pass then corrected):**
   
   **Initial assignment (incorrect):** All 8 task rows initially lacked owner/next_agent fields. Attempted generic "developer" for flow/config tasks (T1, T2, T4, T5, T6, T7) and explicit "qa" for T8. **Rationale was flawed:** "developer" IS the code-developer team lead, exactly what I was trying to avoid for flow-doc work (T6).
   
   **Board precedent correction (20260721T1836Z):** Agent flow-doc lifecycle tasks (editing docs/agents/*/ flows) route to `agent-father`, not `developer`. Evidence: all pre-existing agent-flow task rows (FIX-COWORK-SIBLING-WINDOW-CACHE-FAIL-OPEN, GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST, SYSREMAKE-P2-T8-FLOW-DOC-WIRING) route to agent-father. Dispatch/SKILL.md line 48: "Agent | agent-father | All agent-file lifecycle" — T6's work (market-watcher main.md flow editing) is part of agent-file lifecycle.
   
   **Final assignment (corrected):**
   - T1, T4, T6, T7: owner="agent-father", next_agent="agent-father" (agent flow-doc lifecycle, per board precedent)
   - T2: owner="developer", next_agent="developer" (skill-file routing undefined, escalated to PO; left as-is)
   - T3: owner="dev-mcp-server", next_agent="dev-mcp-server" (code work, Tier-1 routable by zone)
   - T5: owner="developer", next_agent="developer" (config work)
   - T8: owner="qa", next_agent="qa" (QA work, not routable by zone-detect, must be explicit)

2. **WIP count correction (blocking restatement):** Initial report stated "1 in_progress (parent), within limit of 2 max concurrent." Actual state: **2 in_progress at cap**
   - DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (this row, added by decomposition)
   - SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD (ops, created 2026-07-16T21:00:34Z, in_progress for 5 days)
   - **Dispatch readiness:** Nothing can enter in_progress until one row clears. Subtasks remain in ready lane (correct), but dev-team cannot dispatch any into in_progress until one of the two in_progress rows graduates to done/review.
   - **Convention vs. Invariant:** head.wip and head.wip_max are both null in live orch-state — the "limit of 2" is convention per standing dev-team protocol, not an encoded invariant in the schema.

3. **Stale-gate observation (non-blocking, for PO escalation):** The ops SPIKE row (BCTC-EXTRACTION-DORMANT) has `created_at: 2026-07-16T21:00:34Z` but **no `updated_at` field at all**. Main.md:491's stale-crash reset logic (age comparison, `now - updated_at > threshold`) cannot fire on a row with no updated_at timestamp — the gate is permanently disabled for that row. This is the sixth instance of this failure class found this session (others: tier-1 heartbeat freshness gate dead, plus three on SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP row itself). Belong on SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP for PO triage, not this row's scope. Noted for context only.

**additional-context:**
- Signal evidence: `docs/signals/dev-team-20260721T181610Z-signals-inbox-undeliverable-floor.json` (HIGH, to po, at time of writing) corroborates R3 from a second plane: price_anomaly_v1 file dated 2026-07-21T16:13Z describes the same selloff (GAS -6.98%, RSI 29.3), and its own market_context.note reads "First EOD pass since 2026-07-17 — slot did not fire for 4 days (17th, 20th, 21st EOD gap; 18-19 weekend)." That signal also carries undeliverable files (no from/type fields) — a separate problem unfixed by reordering alone (different strand, address separately via signal-shape enum or inbox structure redesign, not in this row).
- Price_anomaly_v1 writer unconfirmed: Router grep found no source writer, only docs. Likely market-watcher eod.md per dish_window field + R3 overlap (inference, not verified). Correctly un-minted per "confirm writer at source first" standard.
- Handoff file naming: consistent with codebase pattern (DESIGN-COWORK-FANOUT-T<N>-<kebab-summary>).
