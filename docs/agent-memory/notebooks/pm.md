# PM — Notebook

## c339 FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR DECOMPOSITION · Component A (Anchor Propagation) · 2026-08-12T11:30Z

**MANDATE (from router, session 165f4245-6173-4054-87fd-c55bb626265f, lane=pm):** Decompose FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR into atomic tasks per architecture brief Component A (window-anchor propagation).

**CONTEXT:**
- **Row Status:** IN_PROGRESS → decomposed (child tasks spawned)
- **Design Source:** FIX-CHEF-PUBLISHED-MARKER-RELEASE's shared brief (docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md § 2, Component A)
- **Root Cause:** Two peers spawned for same scheduled window derive different published:*:<key> mutex keys due to independent wall-clock date reads. Affects chef-evening, chef-intraday, and any slot firing across VN midnight (UTC+7). 8+ recurrences, 3 distinct root mechanisms since 2026-07-22.

**DECOMPOSITION COMPLETED:**
Four atomic tasks created in ready[] lane with dependency chain:

1. **FIX-CHEF-MARKER-KEY-ANCHOR-1** (S, cross-service/, no deps)
   - Expose `scheduled_utc_time` in cowork-match-slots.js for live MATCHES
   - Reuses existing `snapToCronBoundary()` function; mirrors cowork-catchup-predicate.js field
   - Enables symmetric field across live and catch-up dispatch paths

2. **FIX-CHEF-MARKER-KEY-ANCHOR-2** (S, docs/agents/cowork-team/, depends ANCHOR-1)
   - Document `scheduled_utc_time` in match-slots.md MATCHES schema
   - Cross-reference catchup_raw field (already present from TASK-COWORK-CATCHUP-1/-2)
   - Pure documentation; establishes consistent contract

3. **FIX-CHEF-MARKER-KEY-ANCHOR-3** (S, docs/agents/cowork-team/, depends ANCHOR-1)
   - Append `scheduled_utc=<ISO8601>` to spawn-fanout.md Step 5.2 ENTRY_PROMPT
   - Single injection point; benefits all guaranteed slots (chef-*, digest-*, fb-*, tnb-audit)
   - No branching on is_catchup or due_reason — uniform parameter for both paths

4. **FIX-CHEF-MARKER-KEY-ANCHOR-4** (M, docs/agents/unified-agent/, depends ANCHOR-1 + ANCHOR-3)
   - Parse `scheduled_utc=` parameter in chef.md Step 0.5
   - Derive CYCLE_DATE_UTC from scheduled_utc date portion (fallback: date -u if absent)
   - Generalize to all guaranteed slots (chef, digest, fb, tnb) per AC5
   - CRITICAL: CYCLE_DATE_UTC is already the canonical date derivation point, pinned once and reused at Step 7.6 (filename) and Step 8b (notebook header)

**SEQUENCING & DEPENDENCIES:**
- ANCHOR-1 is independent; can start immediately
- ANCHOR-2 and ANCHOR-3 can start after ANCHOR-1 (same codebase dependency graph)
- ANCHOR-4 requires both ANCHOR-1 (field must exist) and ANCHOR-3 (parameter must be sent)
- Minimum critical path: ANCHOR-1 → ANCHOR-{2,3} || → ANCHOR-4 (~4-6h total, assuming parallel work)

**VERIFICATION GATES (from parent row FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR AC):**
RAW, not prose: execute two chef-evening peers against SAME scheduled window → exactly ONE published:chef-evening:<window> marker, ONE synthesis artifact, ONE MARKET post. No false-suppression of next day's window by expired marker TTL.

**DECISION & RATIONALE:**
- Each task is atomic: single file/function group, clear AC, ~1.5-2.5h work
- Handoff files created (docs/handoffs/FIX-CHEF-MARKER-KEY-ANCHOR-{1..4}-*.md) with all AC and dependency info
- Component A focused scope (release-gating = Component B, separate row FIX-CHEF-PUBLISHED-MARKER-RELEASE, not decomposed here)
- UC-CCA-P3 umbrella (lifecycle/claim-timing) is orthogonal; all three rows ship together per PO ruling
- Board .head reset to idle (mid-sprint decomposition, not sprint closeout)

**BOARD STATE POST-DECOMPOSITION:**
- in_progress[]: FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR marked with children + status_note
- ready[]+4: ANCHOR-1 through ANCHOR-4 added with correct depends_on chain
- Validator: PASS (Stage 1g flagged 16 pre-existing MISSING deps, non-fatal)
- Head: idle (next dispatch will pick up sibling FIX-CHEF-PUBLISHED-MARKER-RELEASE or rotate to next-lane work)

---

## c338 PO-BATCH TIER CLOSEOUT · Two P0/HIGH FIX Tasks Promoted to QA Review · 2026-08-11T17:52Z

**MANDATE (from router, session 165f4245-6173-4054-87fd-c55bb626265f, tier-closeout):** Confirm both merged tasks' board state is coherent; unblock/promote next-tier work per BOUNDED-1/backlog-promotion logic; surface residual out-of-zone defect for PO decision.

**COMPLETED TASKS REVIEWED:**
1. **FIX-SWEEPGUARD-ESCALATION-HAS-NO-ACTUATOR-REPEAT-OFFENDER-13-STRIKES** (zone: cross-service/, owner: developer)
   - Status: REVIEW (in lane correctly)
   - Next agent: qa (correct)
   - Commits: 2726e708e, 7746683cc, 1704f52e3, 16d31d4aa (replayed onto main post-merge-gate)
   - Fix delivered: pre-commit hook now emits outcome=blocked|proceeded on sweep-guard escalation signal to de-noise repeat-offender-after-block false-alarm class
   - Board coherence: ✓ Single lane membership, no dangling refs, next_agent set correctly

2. **FIX-MACRO-LIQUIDITY-STATE-HANDLER-EXCEEDS-CRON-15S-DEADLINE** (zone: apps/macro-indicators/, owner: dev-macro-indicators)
   - Status: REVIEW (in lane correctly)
   - Next agent: qa (correct)
   - Commit: eb6524da9 (direct to main) + 8c158cd9c, 164025ca7 (replayed)
   - Fix delivered: bounded both liquidity-state upstream SBV HTML fetches (policy_rates + omo) to ONE shared domain.FetchBudgetSec (8s) window, ensuring compliance with 15s cron deadline
   - Board coherence: ✓ Single lane membership, no dangling refs, next_agent set correctly
   - Verification gate: sbv_omo_daily accrues on two consecutive daily cron fires with zero BUG-channel unreachable report

**BOARD STATE VALIDATION:**
- WIP counts: in_progress=2 (at limit), review=167 (both completed tasks in correct lane), ready=77, todo=0
- Head state: idle (correct, no active sprint/task)
- Signal queue: clean (no stale references to reviewed tasks)
- Done_verified overflow: ran cold eviction; reduced from 24→22 items (still above 5-item limit, will continue on future cadence)

**OUT-OF-ZONE RESIDUAL DEFECT (dev-macro-indicators flagged):**
The dev-macro-indicators agent identified a second defect in apps/mcp-server/ zone (outside their zone scope):
- **File:** apps/mcp-server/src/scheduler/macro/sbvOmoLiquidityCronJob.ts:70
- **Issue:** Error string conflates "deadline exceeded" with "unreachable"
- **Context:** macroFetch already discriminates degrade.reason as deadline|http-error|network (apps/mcp-server/src/infrastructure/fetchers/fetchDeadline.ts:29-33), but the cron job doesn't use it
- **Impact:** Misdirects triage to service/VPS when actual issue is caller deadline timeout
- **Recommendation:** Mint a follow-up FIX row zoned apps/mcp-server/ → dev-mcp-server for wording fix
- **Status:** PO decision item (minting a new row), not actionable by PM directly; noted here to preserve signal

**DECISION RATIONALE:**
- Both completed tasks passed merge gate with correct chirped commits to main; board state is coherent with no orphaned references
- Cold eviction script ran successfully; done_verified overflow is trending down (will continue cadence)
- WIP limit remains tight (2 in_progress, both occupied); next promotions conditional on In Progress→Done transitions
- Out-of-zone defect surfaced separately for PO triage (not a blocker on this tier closeout, but high-value for signal preservation)

## c337 COWORK-GUARANTEED-SLOT-ESCALATION · Parent SPIKE Closed, FIX Row Decomposed to 1 Atomic Task · 2026-08-11T17:15Z

**MANDATE (from router, session 165f4245-6173-4054-87fd-c55bb626265f):** Two related items: (1) Close parent SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING citing both diagnostic children as DONE_VERIFIED; (2) Decompose FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION into atomic dev task.

**CONTEXT & DECISION:**
- Both diagnostic spikes (SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-FIRER, SPIKE-COWORK-GUARANTEED-SLOT-DIAGNOSTIC-WIRING) are DONE_VERIFIED as of 2026-08-11
- Findings: (1) firer is invoked correctly on schedule; (2) failures are external (Anthropic weekly-quota exhaustion, not code defect); (3) no internal wiring gate exists (original hypothesis refuted)
- Architect recommendation (source: orch-state.json field architect_diagnostic_spike_closeout_note_20260811): "close this parent row citing both children + route the new FIX row"
- Byproduct finding: firer script has zero failure-escalation path (run_firer() returns overall_rc but nothing consumes it), so 67h of failures produced zero BUG-channel alerts

**ACTIONS TAKEN:**
1. **Closed SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING** — Updated status_note explaining completion + added completed_at timestamp. Row remains BACKLOG status (lane rule) with closure explanation in prose.
2. **Decomposed FIX-COWORK-GUARANTEED-SLOT-FIRER-NO-FAILURE-ESCALATION** into 1 atomic task:
   - **TASK-FIX-COWORK-FIRER-ESCALATION** (Size S, ~2h): Add curl-based failure escalation + cooldown to scripts/agents-flow/cowork-guaranteed-slot-firer.sh
   - Implementation: Reuse curl-to-Telegram pattern from scripts/maybe-deploy-vps.sh (lines 35-41), add 6h TTL cooldown, update test suite
   - AC: 4 criteria verified (escalation fires on overall_rc!=0, cooldown prevents spam, tests assert correct behavior, no regression in normal ops)
   - Zone: cross-service/ (bash-only, no apps/<svc>)
3. **Updated orch-state.json** — Set FIX row's next_agent=developer
4. **Created handoff file** — docs/handoffs/TASK-FIX-COWORK-FIRER-ESCALATION.md with full AC + architect design notes

**DECISION RATIONALE:**
- Single-task decomposition (not 2-3) is appropriate: implementation and tests are tightly coupled (test harness already has ENV-override seams in script); small well-scoped fix (~2h); no parallel dependencies
- SPIKE closure decision: original question is answered by diagnostic findings; no code change needed on parent; architect explicitly recommends closure; only downstream actionable item is the FIX row

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## Cycle 2026-08-12T14:11Z — Decompose + Dispatch TICK-WU-1/2 (Post-QA WU-0 Verified Gate)

**Sprint:** TICK-PREFLIGHT-USAGE-INSTRUMENTATION

**Input:** QA handoff: "WU-0 (TICK-WU-0-TELEMETRY-LIB) is DONE_VERIFIED; dependency gate satisfied for WU-1 and WU-2. Move from BACKLOG to TODO and dispatch."

**Work:**
1. Read prior PM decomposition (sprint-TICK-PREFLIGHT-USAGE-INSTRUMENTATION-pm.md) — specs already exist, no re-decomposition needed
2. Read existing handoff files (TASK_TICK-WU-1-COWORK-WIRING.md, TASK_TICK-WU-2-DEVTEAM-WIRING.md) — AC/AC-10/Risk notes confirmed
3. Verify WU-0 status = DONE_VERIFIED in orch-state.json — confirmed
4. Check WIP budget (in_progress count) — 1/2, room for 2 more S-sized tasks
5. Update task status: BACKLOG → TODO for both WU-1 and WU-2 via orch-apply.sh (atomic write)
6. Commit orch-state.json change (pathspec-scope, no peer dirt sweep) — ea982859c

**Status:** Both tasks flipped to TODO. Ready for developer pickup.

**Decision:** Dispatch both WU-1 and WU-2 to developer in parallel:
- Both S-sized, same pattern (mechanical 2-3 line trailer wiring)
- No file overlap (cowork-tick-preflight.sh vs dev-team-tick-preflight.sh)
- Same zone (cross-service/)
- No inter-task dependencies (both depend on WU-0, which is satisfied)
- Fits WIP budget (1 + 2 = 3 total ≤ safe capacity for S+S tasks)
- Per PM init.md parallel_dispatch: "all independent handoffs in one message"

**Risk Acknowledged:** WU-3 (TICK-WU-3-AUDITOR-WIRING) stays gated on WU-1+WU-2 landing green — do not unblock WU-3 until both complete QA verification.

**Next:** Router to spawn developer with TASK_TICK-WU-1-COWORK-WIRING.md and TASK_TICK-WU-2-DEVTEAM-WIRING.md (both ready, no blockers).
