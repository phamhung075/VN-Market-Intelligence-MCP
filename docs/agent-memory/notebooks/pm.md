# PM — Notebook

## c333 FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING · Phase-1 Decomposition + PO Amendments · 2026-08-07T06:00Z

**MANDATE:** Decompose architect brief (7 FR/NFR, 3 EC) into atomic dev tasks, incorporating 3 binding PO amendments:
  - **Amendment 1 (FR-4 DESCOPE):** tran-ngoc-bau write-serialization descoped (folded onto GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS)
  - **Amendment 2 (EC-2 FOLLOWON):** chef-intraday UTC-hour migration descoped as separate row (FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION, BLOCKED, minted by PO this tick)
  - **Amendment 3 (FR-1 CORRECTION):** WINDOW_KEY fallback branch 2 corrected — select nearest CRON_HOUR:00Z to live_mcp_fetched_at (not today's UTC date + cron hour), 2 new unit test cases mandated

**PRE-CONDITIONS VERIFIED:**
- Architect design READY_FOR_PM: docs/architecture-briefs/2026-08-07-cowork-signal-filename-cycleid-keying.md (10 sections, verified live source refs)
- BA spec READY_FOR_PM: docs/handoffs/FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING-BA-spec.md (po_goahead 2026-08-07T04:41:31Z)
- PO amendments BINDING: po_architect_signoff_20260807T0545 field in parent row (3 amendments, all acceptance-bearing)
- Parent row status: in_progress[next_agent=pm, plan_only=true, supervised=true]

**DECOMPOSITION APPLIED (4 atomic tasks):**

1. **TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY** (Size S, ~1.5h)
   - Shared pure function `derive_window_key(prompt_text, slot_id, cowork_schedule_json, live_mcp_fetched_at)`
   - 3 branches: scheduled_utc (Phase 2), slot→cron fallback (ACTIVE day 1, Amendment 3 corrected), ad-hoc
   - **Amendment 3 binding:** Branch 2 implements nearest-CRON_HOUR:00Z logic; 4 unit test cases per spec
   - No Bash dependencies (NFR-2), single-derivation per cycle (NFR-3)
   - Blocked_by: none; Blocks: TASK-002, TASK-003

2. **TASK-COWORK-SIGNAL-BCTC-REKEY** (Size M, ~2h)
   - Files: cycle.md (Step 0c), stage-analyze.md (line 114 + FR-7), stage-consolidate.md (line 64), stage-log-notify.md (§5d-1)
   - Rekey filename `{YYYYMMDD}` → `{WINDOW_KEY}` (FR-2)
   - Pin WINDOW_KEY at Step 0c before signal write (FR-2 sequencing)
   - Add explicit routine-mode emit line (FR-7, doc-debt)
   - Correct cross-reference in stage-consolidate.md (doc-debt)
   - Blocked_by: TASK-001; Blocks: TASK-004

3. **TASK-COWORK-SIGNAL-CHEF-INTRADAY** (Size S, ~1h)
   - Files: chef-dish.md (Step 7.6), chef.md (Step 0.5 cross-ref only)
   - Intraday filename extension: add `-{VN_HOUR}` (FR-3, Phase 1 only; single-fire slots untouched)
   - HOUR_COMPONENT sourced from existing VN_HOUR (NFR-3 invariant with mutex key)
   - Explicit non-promotion of cycle_id (binding caution, PO 2026-07-22)
   - EC-2 timezone-basis hazard documented (Phase 2 follow-on, depends_on FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR)
   - Blocked_by: TASK-001; Blocks: TASK-004

4. **TASK-COWORK-SIGNAL-NAMING-CONTRACT** (Size XS, ~30 min)
   - Files: mcp-tools.md (Naming Contract subsection, FR-5), drain-signals.md (one-liner, FR-6)
   - New subsection documenting ticker-keyed (bctc_signal_*) and dish-keyed (unified-agent-synthesis-*) families
   - Content verbatim from architect brief §6 (NFR-3 and NFR-5 guidance included)
   - drain-signals.js: no code change (NFR-4 closure by construction)
   - Blocked_by: TASK-002, TASK-003; Blocks: none

**BOARD MUTATIONS APPLIED:**
1. Updated parent row FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING: status=in_progress→BLOCKED, next_agent=pm→po, added decomposed_tasks array and decomposition_note
2. Added 4 new tasks to backlog (TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY..NAMING-CONTRACT), all:
   - status=BACKLOG (correct lane for these decomposed subtasks)
   - plan_only=true, supervised=true (inherit parent's flags; no code ships without PO re-adjudication)
   - priority=P1, sprint=COWORK-RELIABILITY
   - owner=unassigned, next_agent=developer (routed by PM/PO before dispatch)
   - ba_handoff fields populated with docs/handoffs/TASK-*.md paths

**HANDOFF FILES CREATED (4 total):**
- docs/handoffs/TASK-COWORK-SIGNAL-DERIVE-WINDOWKEY.md (detailed AC, 4 unit test cases per Amendment 3, NFR compliance notes)
- docs/handoffs/TASK-COWORK-SIGNAL-BCTC-REKEY.md (6 AC, 4 files, test strategy, dependency notes)
- docs/handoffs/TASK-COWORK-SIGNAL-CHEF-INTRADAY.md (5 AC, cycle_id non-promotion, EC-2 hazard doc)
- docs/handoffs/TASK-COWORK-SIGNAL-NAMING-CONTRACT.md (4 AC, FR-5/FR-6, no-code-change verification)

**AMENDMENT INCORPORATION VERIFICATION:**
- **Amendment 1 (FR-4 DESCOPE):** Zero tnb files touched across all 4 tasks; FR-4 mechanism owned by separate rows (GUARD-NOTEBOOK-*, FIX-NOTEBOOK-WRITE-*, FIX-NOTEBOOK-WRITE-AC7-SKILL). ✓
- **Amendment 2 (EC-2 FOLLOWON):** Phase 1 ships VN_HOUR verbatim (no UTC basis migration in TASK-003); EC-2 hazard documented for Phase 2 follow-on (separate row FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION already minted, status=BLOCKED, depends_on=FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR). ✓
- **Amendment 3 (FR-1 CORRECTION):** TASK-001 implements nearest-CRON_HOUR:00Z selection logic; 4 mandatory unit test cases added (slot-4 early fire D 23:57Z→(D+1)T0000Z, slot-3 late fire (D+1) 08:00Z→(D)T2100Z, ad-hoc, same-hour exact). ✓

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total: 769→773, signal_total: 218 stable), atomic rename applied ✓
- Post-apply jq confirms: parent row status=BLOCKED/next_agent=po, 4 child tasks added to backlog with correct status/sprint/flags ✓
- Handoff files staged in docs/handoffs/ (4 files copied and verified) ✓

**BOARD STATE AFTER:**
- in_progress: parent FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING now BLOCKED (was IN_PROGRESS), next_agent=po (awaiting re-adjudication)
- backlog: +4 new tasks (TASK-COWORK-SIGNAL-*), all status=BACKLOG, plan_only/supervised inherited
- WIP usage: unchanged (parent is now BLOCKED, not in-progress; no new active work queued)

**NEXT STEPS:**
1. **PO review cycle (mandatory):** Verify amendment incorporation, approve decomposition plan, clear plan_only/supervised flags (or deny and route back to architect)
2. **Developer dispatch (conditional on PO approval):** Router routes TASK-001 first (no dependencies), then TASK-002/TASK-003 in parallel (both depend on TASK-001), then TASK-004 (depends on 002+003)
3. **Expected duration (serial critical path if single developer):** ~4-5h total (~1.5h + 2h + 0.5h, with TASK-003 in parallel)

**DECISION JOURNAL:**
- Amendment 1 rationale: FR-4 mechanism (write-serialization on tnb notebook) is already owned by 3 separate rows (GUARD-NOTEBOOK-*, FIX-NOTEBOOK-WRITE-*); commissioning it here would duplicate design + create coordination overhead. Correct disposition: fold, don't re-design.
- Amendment 2 rationale: EC-2 (UTC-hour migration) reopens scope that FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR explicitly excluded; Phase 2 follow-on is the structurally correct place (once scheduled_utc_time reaches live-match path). Blocking producer was the missing link (PO minted it this tick).
- Amendment 3 rationale (FR-1 correction): Architect brief's fallback branch 2 had a latent defect (today's UTC date + cron hour unconditionally). Nearest-window selection is the deterministic rule that works for both early-fire (bctc slot-4 cron=00:00Z at 23:57Z prev day) and late-fire (slot-3 cron=21:00Z at 08:00Z next day) cases.

---

## c334 GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS · WIP Slot Freeing (Out-of-Band PO Triage) · 2026-08-08T00:00Z

**MANDATE:** Out-of-band escalation from po's triage (agent a99c6a355831656ef): Parent row GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS was occupying 1 of 2 WIP slots despite already being decomposed (head.status=idle, 2026-08-07T03:30Z). WIP cap blocked 2 P0 CI-sizelint rows from dispatch; CI-RED-83bb4359 and CI-RED-a20cbf56 stalled for >23h.

**VERIFICATION (independent):**
- Row in_progress[0]: id=GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS, status=IN_PROGRESS, claimed_by=null
- Children verified: 3 live on board (FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION, FIX-NOTEBOOK-AUTO-PRUNE-STALENESS-GUARD, FIX-NOTEBOOK-WRITE-AC7-SKILL, all in backlog/blocked states)
- Note: po's claim of "zero children" was factually incorrect; row has 3 children. Core issue remains valid: parent decomposition complete but still occupying WIP slot.
- WIP usage before: 2/2 (GUARD row + FIX-CHEF-USDVND row), blocking ready[] dispatch

**ACTION TAKEN:**
- Relocated GUARD row from task_board.in_progress[] to task_board.backlog[]
- Status IN_PROGRESS → BLOCKED, added blocked_reason: "Parent decomposition task completed: 3 children decomposed as of 2026-08-07T03:30Z (head.status=idle). Row occupied WIP unnecessarily. Reactivate after children complete."
- orch-apply.sh: Stage 0+1 PASS, conservation check OK (task_total: 767→767, stable)

**BOARD STATE AFTER:**
- in_progress: 1 actual IN_PROGRESS (FIX-CHEF-USDVND row, claimed by dev-team), WIP capacity freed (1/2)
- ready[0:1]: 2 P0 CI-sizelint rows now dispatchable (FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-*, FIX-CI-SIZELINT-COORDINATIONSTORE-*)
- backlog: +1 row (GUARD-NOTEBOOK row, status=BLOCKED), conservation verified

**NEXT STEP:** Dispatch the 2 freed P0 CI rows to dev-mcp-server per normal PM flow (both in same zone, parallel-dispatchable).

---

## ERROR-CORRECTION · FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED · review-triage · 2026-08-06T15:35Z

**INCIDENT:** PM review-triage for FIX-SYSTEM-AUDITOR-CYCLE-FINDINGS-NOT-SELF-PERSISTED (parent task, plan_only decomposed into 4 child tasks) detected what appeared to be a missing child task (FIX-AUDITOR-DURABILITY-STEP0B-DETECTION) from task_board and added a fresh backlog[] entry.

**ROOT CAUSE OF ERROR:** Board-existence check only scanned backlog[], ready[], and todo[] lanes — did NOT scan in_progress[]. The task was actually already resident in in_progress[] (status=IN_PROGRESS, owner=developer), actively claimed+resumed by a peer dev-team session (session 24817246-8a3f-4511-95f7-1b4385797bee, resume lock, claimed ~15:11Z). 

**CONSEQUENCE:** Created a genuine duplicate key: FIX-AUDITOR-DURABILITY-STEP0B-DETECTION now existed in BOTH backlog[] (fresh, status=BACKLOG) AND in_progress[] (pre-existing, status=IN_PROGRESS, live, peer-owned). Double-dispatch risk: BOUNDED-1 auto-pickup on next tick could scan backlog[] and spawn a second developer onto already-in-flight work.

**REMEDIATION:** (1) Removed the backlog[] duplicate immediately (orch-apply.sh applied, 2026-08-06T15:35:15Z). (2) Verified in_progress[] copy remains intact, peer session unaffected. (3) Recording this error here for future decompose cycles.

**LESSON:** Board-existence verification MUST scan ALL task_board lanes (backlog, ready, in_progress, qa, review, done) before concluding "missing" and minting a fresh entry. A single-lane scan is insufficient and risks collision with actively in-flight work from peer sessions. Recommend: future PM decompose cycles should use a full-board search (`jq '.task_board | to_entries[] | .value[]? | select(.id == "<id>")'`) to verify non-existence across all lanes before adding.

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
