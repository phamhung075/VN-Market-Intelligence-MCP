# PM — Notebook

## c341 FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT PLAN-ONLY DECOMPOSITION · 2026-08-14T01:45Z

**MANDATE (from router, session 632721c2-41e4-4aff-8d06-a47cf80dc0d7, dev-team dispatcher, FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT REVIEW lane):** Decompose architect-ruled HYBRID design (signal-queue receiver-delivery contract) into 4 atomic implementation tasks per component breakdown + dependency tier. This is a plan-only row where architect has already ruled; PM decomposes the ruling into concrete developer work.

**DESIGN CONTEXT:**
- **Parent Task:** FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (P1, plan_only:true, supervised:true, architect_reviewed 2026-08-07T19:11:59Z)
- **Architect Brief:** docs/architecture-briefs/2026-08-07-fix-signalqueue-receiver-delivery-contract.md (complete, ruling: HYBRID)
- **Architect Ruling:** HYBRID approach — SSOT-flagged push (Component A: cowork-team spawn-fanout Step 5.2b) + minimal no-op-default consumption (Component B: unified-agent chef.md + alert-commander cycle.md) + docs update (Component C: signal-dashboard)
- **Origin Issue:** Receiver delivery contract gap — unified-agent and alert-commander listed as valid 'to' targets in signal-dashboard Receivers table but neither flow has a signal_queue READ step; rows addressed to them are structurally undeliverable
- **Repro Case (superseded):** po-20260720T052606 (was status=NEW, now status=triaged, folded into FIX-CHEF-L6-GOLD-FALSE-PREDICATE by PO 2026-07-22T15:13:06Z) — evidence that undeliverable channel forces workarounds

**COMPONENT BREAKDOWN (per architect brief):**
1. **Component A (Push):** cowork-team/spawn-fanout.md Step 5.2b + cowork-schedule.json SSOT flag (6 slots: chef-morning, chef-intraday, chef-eod, chef-evening, alert-commander-market, alert-commander-critical)
2. **Component B (Consumption):** unified-agent/chef.md Step 0.3 + alert-commander/cycle.md equivalent (both parse CROSS-TEAM SIGNAL block, apply methodology-flag overrides)
3. **Component C (Docs):** signal-dashboard/SKILL.md Receivers table annotation + reference.md new section (explain push vs pull split, lock-plane statement)

**DECOMPOSITION COMPLETED:**

### FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM (Tier1)
- **Zone:** cowork-team
- **Size:** M
- **Dependencies:** none (blocks: tasks 3, 4)
- **Scope:** Architect Component A. Add signal_queue_push SSOT flag to 6 cowork-schedule slots, implement Step 5.2b claim/mark-READ/release logic using existing dashboard-row lock (reuse dev-team drain-signals.md §0a-D lock namespace)
- **Handoff:** docs/handoffs/FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM.md

### FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS (Tier1, parallel)
- **Zone:** docs
- **Size:** S
- **Dependencies:** none
- **Scope:** Architect Component C. Update Receivers table with one-line delivery-mechanism annotation, add reference.md § Receiver Delivery Mechanism section (explain push injection at spawn-fanout Step 5.2b, latency bounds per receiver, lock-plane statement)
- **Handoff:** docs/handoffs/FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS.md

### FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER (Tier2)
- **Zone:** unified-agent
- **Size:** S
- **Dependencies:** FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM
- **Scope:** Architect Component B Part 1. Add chef.md Step 0.3 (parse CROSS-TEAM SIGNAL, apply methodology-flag corrections, log); update init.md inter_agent.receives_from entry (documents signal_queue_push reception)
- **Handoff:** docs/handoffs/FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER.md

### FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER (Tier2, parallel with task 3)
- **Zone:** alert-commander
- **Size:** S
- **Dependencies:** FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM
- **Scope:** Architect Component B Part 2. Add cycle.md consumption block before Firing Gate (parse CROSS-TEAM SIGNAL, apply methodology-flag corrections, log); update init.md inter_agent.receives_from entry (documents signal_queue_push reception)
- **Handoff:** docs/handoffs/FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER.md

**DEPENDENCY TIERS:**
- **Tier 1 (parallel, ready now):** FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM + FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS (no blockers)
- **Tier 2 (after tier 1):** FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER + FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER (both depend_on tier1 task 1)

**CRITICAL SEQUENCING NOTE:**
Both Component A (push) and Component B (consumption) should land together or in quick sequence to avoid intermediate state where push fires but no consumer listens. Architect brief §6 lock-plane statement (DB-plane only, file-plane unchanged) is mandatory and must ship with Component A to avoid contradicting FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD. Component C (docs) can land anytime but should be in place before or with Component A for developer reference.

**BOARD STATE POST-DECOMPOSITION:**
- Parent task moved: review[] → done[]
- New tasks added: ready[] += 4 (FIX-SIGNALQUEUE-*)
- WIP: unchanged (no in_progress impact, parent was plan_only, not executing)
- Validator: PASS (Stage 1g: 16 pre-existing MISSING deps in backlog/ready/closed_sprints, non-fatal; no new blockers introduced)

**DECISION RATIONALE:**
- Architect ruled on delivery mechanism (HYBRID, not pure-pull or pure-push or removal); PM role is to decompose ruling into atomizable developer tasks
- Each task is single zone, ~1-2h, clear AC, testable in isolation
- Tier structure preserves push-before-consume semantics (tier1 implements push mechanism, tier2 implements consumers that depend on mechanism existing)
- Multi-zone split (4 zones: cowork-team, unified-agent, alert-commander, docs) allows parallel developer dispatch per zone routing
- No new code/tooling complexity — reuses existing dashboard-row lock, minimal consumption steps (no-op default), lightweight docs updates

**HANDOFF FILES CREATED:**
1. docs/handoffs/FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM.md (AC-1 through AC-8, 8 criteria)
2. docs/handoffs/FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS.md (AC-1 through AC-7, 7 criteria)
3. docs/handoffs/FIX-SIGNALQUEUE-UNIFIED-AGENT-CONSUMER.md (AC-1 through AC-8, 8 criteria)
4. docs/handoffs/FIX-SIGNALQUEUE-ALERT-COMMANDER-CONSUMER.md (AC-1 through AC-8, 8 criteria)

**NEXT:**
- Router to dispatch tier1 tasks (1, 2) to cowork-team and docs specialist agents (parallel)
- Once tier1 tasks land, tier2 tasks (3, 4) unblock for unified-agent and alert-commander specialists (parallel after tier1)
- All 4 tasks should land before sibling task FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT (depends on this row's lock-plane contract being settled)

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
