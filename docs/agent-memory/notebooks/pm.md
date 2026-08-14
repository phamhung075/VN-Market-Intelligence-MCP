# PM — Notebook

## c343 UC-CDC-P1 CALENDAR_STATUS COMPUTE + ENUM GATE 3-WAY ZONE-SPLIT · 2026-08-15T00:22Z

**MANDATE (from dev-team dispatcher, architecture-complete handoff):** Decompose architect-ratified 3-way zone-split design (apps/mcp-server + scripts + docs/agents/cowork-team/flow/) for calendar_status server-side computation, injectable-deps wiring, SESSION_STATUSES SSOT, and fail-loud enum enforcement.

**DESIGN CONTEXT:**
- **Parent Task:** UC-CDC-P1 (P1, SPRINT-M, multi-zone decomposition now, status IN_PROGRESS)
- **Architect Handoff:** docs/handoffs/UC-CDC-P1-BA-spec.md § [Architect] Brownfield Findings (WP-A ratified READY with 3 design refinements; WP-B blocked on UC-SDF-P2)
- **Root Problem:** Self-recycling calendar_status loop (emitPressureStateTool.ts writes caller-supplied literal; cowork-tick-preflight.sh reads it back out and writes it straight in; telemetry.md does the same on WORK path). No authoritative producer, out-of-domain values ("closed"/"off_market") persist forever, live weekend cadence fires at wrong rates.
- **Live Defect Status:** calendar_status currently "closed" (not "unknown"), detected 2026-07-24T17:37Z, measured impact on weekend slots (3 agents per-tick over-firing at 6x rate due to unmatched cadence rule, fallback to 240-min default instead of declared 1440-min weekend rate).
- **Architect Solution (3-way split, 0 inter-dependencies):**
  1. **FR-A1+A2 (dev-mcp-server zone):** Wire calendar_status through injectable-deps (matches existing pattern for signal_backlog/dev_queue_depth), add SESSION_STATUSES const to vnTradingCalendar.ts as SSOT, implement WARN+recompute enforcement inside runEmitPressureState (not hard Zod boundary, preserves never-throws contract on mandatory telemetry.md Step 6.0 WORK-path call).
  2. **FR-A3 (developer zone):** Stop cowork-tick-preflight.sh Step 8 reading calendar_status from pressure-state.json and writing it back (delete L150 read, drop cal arg/key from L162-164 emit_args).
  3. **FR-A4+A5 (agent-father zone):** Delete telemetry.md Step 6.0 L15 circular arg line; add fail-loud + send_telegram(channel="bug") to pressure-read.md Step 4.3 on out-of-domain values (defense-in-depth for legacy on-disk files predating fix).

**ZONE DISTRIBUTION (corrected from dispatch note's assumed 2-way):**
- `apps/mcp-server/` (FR-A1, FR-A2) → **dev-mcp-server**
- `scripts/` (FR-A3) → **developer**
- `docs/agents/cowork-team/flow/` agent-instruction prose (FR-A4, FR-A5) → **agent-father** (per po_routing_ruling_20260721 precedent; agent-father's commit_zone.allowed includes docs/agents/, developer's does not)
- **NOT 2-way as dispatch assumed:** routing as single developer task would hand FR-A4/A5 to an agent with no commit-zone grant for docs/agents/ files

**DECOMPOSITION COMPLETED:**

### TASK_2008a: Calendar_Status Injectable-Deps + Session_Statuses SSOT (dev-mcp-server specialist)
- **Zone:** apps/mcp-server/
- **Size:** M
- **Priority:** P1
- **Dependencies:** none
- **Status:** TODO (ready now, no blockers)
- **Scope:** FR-A1 new computeCalendarStatusFn field on EmitPressureStateDeps, FR-A2 add SESSION_STATUSES const to vnTradingCalendar.ts + WARN+recompute enforcement inside runEmitPressureState, blast-radius fix in 4 test-construction sites (buildDeps, makeRunDeps, 2 standalone literals)
- **Handoff:** docs/handoffs/TASK_2008a.md
- **Files affected:** emitPressureStateTool.ts, vnTradingCalendar.ts, emit-pressure-state.test.ts
- **Blast radius note:** 4 test sites must be updated (not hidden); no new field added to output shape (only computation path changes), L827 length assertion unaffected

### TASK_2008b: Preflight Stop Calendar Recycling (developer specialist)
- **Zone:** scripts/
- **Size:** S
- **Priority:** P1
- **Dependencies:** none
- **Status:** TODO (ready now, no blockers)
- **Scope:** FR-A3 remove L150 calendar_status read from pressure-state.json, drop --arg cal and calendar_status:$cal key from L162-164 emit_args build; SILENT-path emit becomes shape-identical to WORK path (both omit calendar_status, server computes fresh)
- **Handoff:** docs/handoffs/TASK_2008b.md
- **Files affected:** cowork-tick-preflight.sh, cowork-tick-preflight.test.sh (add negative assertion for key absence)
- **Explicitly out of scope:** last_regime/last_volatility_level recycling (same mechanism, same lines, intentional degrade-gracefully default per script's R3 comment; UC-SDF-P2 WIDEN clause addresses separate producer gap)

### TASK_2008c: Telemetry Delete + Pressure-Read Fail-Loud (agent-father specialist)
- **Zone:** docs/agents/cowork-team/flow/
- **Size:** M
- **Priority:** P1
- **Dependencies:** none
- **Status:** TODO (ready now, no blockers)
- **Scope:** FR-A4 delete telemetry.md L15 (circular arg line), FR-A5 add enumeration + fail-loud + send_telegram(channel="bug") to pressure-read.md Step 4.3 on out-of-domain calendar_status values; refresh stale file-size-justification headers
- **Handoff:** docs/handoffs/TASK_2008c.md
- **Files affected:** telemetry.md, pressure-read.md
- **Test strategy:** LLM-narrated prose has no unit test; verify via live-tick notebook observation post-deploy (legacy on-disk values surface via telegram anomaly alert, then self-heal within one tick once FR-A1+FR-A2 land)

**DEPENDENCY TIERS:**
- **Tier 1 (ready now, parallel):** TASK_2008a, TASK_2008b, TASK_2008c (zero inter-dependencies per architect spec; all 3 are independent, no blocking edges)

**BLOCKED WORK (not part of WP-A decomposition, forwarded notes to PO):**
- **WP-B (UC-CDC-P1's own decouple stale_warning clause):** Verified live this cycle — UC-SDF-P2 still BACKLOG/plan_only/not claimed, its own sequencing note says UC-SDF-P2 must land first (promoteResult.stale provably always false today due to filename-key mismatch unfixed in UC-SDF-P2). Recommend PO prioritize UC-SDF-P2 dispatch (P1, un-dispatched 3+ weeks despite explicit next_agent:"ba").
- **Co-ship flag (not implemented here):** FIX-COWORK-CADENCE-DANGLING-POLICY-ID (BACKLOG) — title still carries superseded 15/240 instance clause; commit 8c2acb44c (CADRAT-1) already delivered real fix (verified live in cadence-policy.json: both policy_ids now carry 10 calendar_status-keyed rows, matching architecture brief). PM/PO: strip stale clause before dispatch.

**ORC-STATE UPDATE:**
- UC-CDC-P1 status: IN_PROGRESS → IN_PROGRESS (kept, added status_note for decomposition cross-reference)
- Added to task_board.ready[]: TASK_2008a, TASK_2008b, TASK_2008c (all TODO, all P1)
- Metadata: _updated_at 2026-08-15T00:22:32Z, _updated_by "pm"

**CRITICAL NOTES:**
1. **Never-throws contract binding:** FR-A2's WARN+recompute enforcement must run INSIDE runEmitPressureState, not at Zod boundary. telemetry.md Step 6.0 is a MANDATORY, un-skippable WORK-path call documented as "never throws" — Zod rejection at schema boundary risks breaking that contract. Enforcement inside (console.warn on override && !valid) satisfies FR-A2 intent (bad literal never written) without risking the documented invariant.
2. **Line number drifts noted:** Architect's own re-verification cycle flagged minor drift (FR-A3 lines ~2-3L off from BA's read); all re-verified live this cycle against actual file state at 2026-08-14. No blockers, both flagged.
3. **Sequencing note:** WP-B (decouple stale_warning from cycle-snapshot-promotion-refusal) depends on UC-SDF-P2 — do NOT implement WP-B until UC-SDF-P2 lands. WP-A ships independently, requires no UC-SDF-P2 prerequisite.

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
