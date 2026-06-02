# PO Notebook

## c · 2026-06-01T23:14Z — TRIAGE (dev-team :09 fire) — dispatch DRAIN-INJECTION-SAFE; triage 12 loose signals

**Inputs:** orch-state head idle/WIP0 (A-01-EXPECTED-SET shipped fa02735e last cycle). 0 NEW signal_queue rows (all dispositioned). TNB handoff = SAME c85 already ACK'd 22:34Z — Step 0-TNB no-op. 12 loose docs/signals/ files for triage.

**12 loose files dispositioned → all to processed/:**
- tnb-c85 (untracked): SAME c85 already disposed last cycle; loose file fed the queue row → plain move.
- bctc_signal_{ACB,CTG,DHG,EIB,FPT} ×5 (untracked): routine/release BCTC outputs, cowork-consumed, NO-ACTION → plain move.
- context-bloat self-critique-SKILL (untracked): SELF-CURED — now 118L ≤120 cap (was 147 at breach) → plain move, no task.
- context-bloat signal-dashboard SKILL (133L,+13) + dashboard-protocol (180L,+60): STILL over cap → folded into FU-SIGNAL-DASHBOARD-CAP backlog (measured figures written in); overlaps RE-CAP-1. Route to claude-manager-helper/agent-father when scheduled. Plain move.
- brief agent-self-critique-detect (TRACKED): Phase-1 COMPLETE + shadow LIVE (39639d2b/7818b4d4/92f52421), all 5 conditions closed — STALE → TRACKED MOVE (dev-team commits).
- brief orch-state-consolidation (untracked): sprint CLOSED (OSC-1..5 DONE) — STALE → plain move.
- brief frontend-bctc-inspect-tab (TRACKED): brief LOCKED (FBT-ARCH A2, dev-frontend, apps/frontend only) — REAL open work, NOT in task_board → added FRONTEND-BCTC-TAB to backlog; deferred behind host-safety (pairs with A-01b dev-frontend zone). TRACKED MOVE (dev-team commits).

**PICK (single, highest-value, WIP 1/2): DRAIN-INJECTION-SAFE** (FLEET-HOST-SAFETY, FIX/agent-father, S, zone docs/agents/dev-team/flow/, PLAN-ONLY). Rationale: priority order = host-danger first. This is the LIVE injection-side trigger — drain string-concats signal/payload fields into /bin/sh (drain-signals.md L31, execute-tier.md L42, main.md L29/172/202); a backtick payload once command-substituted `docker compose up -d`, near host-panic (feedback_signal_payload_shell_injection). AUD-ND-1 (destructive-stop) + A-01-EXPECTED-SET both DONE → this is the still-open half of the same class. Outranks frontend-bctc-tab (UX) + A-01b (cosmetic false-RED, auditor-severity path already SSOT-gated) + 1967b (exploratory). AC: backtick/$() payload drains DB correctly + docker ps unchanged (no spawned container).

**Wrote head atomically (Edit, fresh-read-my-section, WIP 1/2):** dispatched agent-father DRAIN-INJECTION-SAFE; task→in-progress; narrative.current_sprint refreshed; FU-SIGNAL-DASHBOARD-CAP + FRONTEND-BCTC-TAB backlog updated. JSON re-validated.

**Carry-over (deferred, valid):** AUDITOR-SLA-CADENCE + A-01b-DASHBOARD-HEALTH-FILTER (FLEET-HOST-SAFETY remaining) · FRONTEND-BCTC-TAB (dev-frontend, brief ready) · FU-SIGNAL-DASHBOARD-CAP + RE-CAP-1 (collapse into one cap-fix) · 1967b architect audit · MSG-1 foreign-flow · AUD-ND-1-REGRESSION watch · housekeeping: 662 stale cowork-heartbeats in processed/ + tnb c85 cites deleted DASHBOARD.md (cowork evidence-gathering references retired surface — CW-STEP47-HYGIENE adjacent). Next live tick = agent-father DRAIN-INJECTION-SAFE.

## c · 2026-06-02T00:13Z — TRIAGE (dev-team :09 fire) — recurring nb-bloat: PRUNE + root-cause pair

**Inputs:** orch head idle/WIP0 (DRAIN-INJECTION-SAFE DONE 4cd55d01 — all 3 dev-team-side destructive+injection host-danger triggers now CLOSED). Telegram: no new reports, 0 unresolved (verified RAW via gateway, not relayed). 1 actionable signal + 9 informational (5 bctc cowork + 4 heartbeat, dispatcher-curated, no dev action).

**Signal disposed (Step 0-SIG → context_bloat_breach):**
- `context_bloat_breach` news-scout.md (HIGH, to=claude-manager-helper): VERIFIED RAW `wc -l`=219 vs cap 200 (+19). NOT a one-off — this is the LIVE symptom of the KNOWN recurring append-not-overwrite defect family (news-scout.md was 1198L before; "notebook-bloat rows persisted 3+ ticks"). Per priority order recurring bugs FIRST + recurring-bug-escalation (≥2 fixes same module → root-cause). Root cause already tracked = NB-BLOAT-FLOW-OVERWRITE (agent-father, "make overwrite unambiguous in flow"). Disposed as a PAIR (symptom + root cause).

**DRAIN-INJECTION-SAFE-2:** assessed NORMAL/low, stays backlog. Dispatcher EMPIRICALLY confirmed the 6 residual sites feed call_tool JSON args (JSON-correctness, NOT a real shell) → NOT a host-danger trigger; the dangerous shell-concat half (dev-team dispatcher) is the one already closed by DRAIN-INJECTION-SAFE. No escalation.

**PICK (BATCH 2/2, WIP→2/2):**
1. **NB-CLEAN-NEWSSCOUT** (CLEAN, claude-manager-helper, zone docs/agent-memory/notebooks/) — prune news-scout.md 219→≤200 via notebook-write skill (delete oldest cycle block, keep last 3). Immediate symptom relief. AC: `wc -l` ≤200, last-3 cycles intact, preamble untouched. baseline_pass: wc -l ≤200.
2. **NB-BLOAT-FLOW-OVERWRITE** (FIX/root-cause, agent-father, zone docs/agents/system-auditor/flow/) — make the overwrite/prune step mechanically unambiguous so notebooks stop re-breaching fleet-wide. PLAN-ONLY agent-def/flow edits. AC: news-scout (+ fleet) stays ≤200 across 7d, no new context_bloat_breach for agent-notebook class.

Rationale: pairing cures the live breach AND stops the recurrence — outranks AUDITOR-SLA-CADENCE (SLA refinement, no active recurrence) + A-01b (cosmetic false-RED, severity path already SSOT-gated). Both S, both PLAN-ONLY-ish (no docker), fits WIP 2/2.

**Carry-over (deferred, valid):** AUDITOR-SLA-CADENCE + A-01b-DASHBOARD-HEALTH-FILTER · FRONTEND-BCTC-TAB · RE-CAP-1 + FU-SIGNAL-DASHBOARD-CAP (collapse SKILL+protocol cap-fix) · MSG-1/MSG-3 · EI-P2-* env-guard chain · SIG-FOLLOWUP-DRYRUN · LF-EXTRACT/LF-OVERLAY · DRAIN-INJECTION-SAFE-2 (NORMAL) · FU-FIXER-NO-FORCE (HIGH) · 662 stale cowork-heartbeats housekeeping. Next live tick = claude-manager-helper NB-CLEAN-NEWSSCOUT + agent-father NB-BLOAT-FLOW-OVERWRITE.
