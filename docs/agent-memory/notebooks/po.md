# PO Notebook

## c · 2026-06-02T03:11Z — TRIAGE (dev-team :09 fire) — 4th notebook breach → prune + ESCALATE root-cause to architect SPIKE

**Inputs:** orch head idle/WIP0. Telegram RAW-verified via gateway: 0 new reports, 0 unresolved (not relayed). 1 signal: context_bloat_breach HIGH unified-agent.md (CHEF). RAW `wc -l`=223 vs cap 200 (+23).

**RAW root-cause (NOT relaying — opened the file myself):** This is the **4th notebook breach in 3 days** (news-scout 219L, bctc-analyst 201L, now unified-agent 223L) DESPITE the NB-PRUNE-FIX sprint already shipping its supposed root-cause fixes: NB-PRUNE-1 (widen prune anchor to `^## `) DONE + NB-BLOAT-FLOW-OVERWRITE DONE. The fixes shipped, the breaches continue → recurring-bug-escalation policy TRIGGERED (≥2 fix commits same module → architect root-cause rethink, not another symptom prune).
- `grep -n "^## " unified-agent.md` → 6 headings but they are NOT prunable cycle-blocks: `## This session`, `## Prior cycles` (ONE 145L block L28–172), `## Convergence rule reference`, `## System state`, `## Next session`. CHEF uses `## ` as PERMANENT reference scaffolding.
- The notebook-write SKILL prune (AC-2/3) deletes whole OLDEST `## ` blocks keeping last-3 — but here the oldest blocks are the MUST-KEEP reference sections, and the bloat lives INSIDE the single `## Prior cycles` heading the algorithm structurally cannot reach. Anchor-widening (NB-PRUNE-1) is inert against intra-section accumulation.
- SKILL L95 TODO (po-overwrite ≤50L vs developer-append) is the unresolved contract; NB-NOTEBOOK-WRITE-FLEET-ALIGN already names "resolve skill SSOT contract FIRST, needs architect/skill-owner — NOT a blind rewrite."

**DECISION → BATCH (2/2):**
1. **NB-PRUNE-UNIFIED-AGENT** (CLEAN, route_to=claude-manager-helper, zone docs/agent-memory/notebooks/) — clear the live breach THIS cycle (CHEF notebook, written every dish-cycle; over-cap risks next backstop fire + chef-read bloat). Because prune-by-`## `-block CANNOT reach the bloat, instruct helper to compress the `## Prior cycles` block (L28–172) in-place: keep most-recent 2–3 dish/cycle entries verbatim + any next-CHEF carry-over (`## Next session`, `## Convergence rule reference`, `## System state` preserved untouched), summarize/drop older cycle prose. AC: `wc -l` ≤200, reference sections + last-2 cycles + Next-session carry-over intact. baseline_pass: wc -l ≤200.
2. **NB-PRUNE-ROOTCAUSE-SPIKE** (SPIKE, route_to=agents-architect, zone cross-service, timebox 120) — PROMOTE NB-NOTEBOOK-WRITE-FLEET-ALIGN from backlog to an investigation NOW (4th recurrence = enough data; the shipped fixes provably don't hold). Question: why does the notebook-write SKILL prune fail to keep notebooks ≤200 — specifically (a) intra-section accumulation inside non-cycle `## ` headings (CHEF `## Prior cycles`), (b) the L95 po-overwrite-vs-append contract contradiction, (c) AC-5 ≤200L guard apparently not firing at write time across ≥3 agents. Output: a brief deciding the SSOT contract (is overwrite intentional for small notebooks? does the prune need a per-section line budget, not whole-block delete?) + which flows align — THEN agent-father implements. NOT a blind append+prune rewrite. baseline_pass: brief written w/ contract decision + named flow-edit list.

Rationale for SPIKE-not-SPRINT: the backlog item itself says "needs architect/skill-owner decision before any fleet rewrite" — dispatching a dev SPRINT now would be the same symptom-fixing that already failed twice. A timeboxed architect SPIKE produces the contract decision that makes the eventual fix correct. The reactive prune (slot 1) keeps the fleet healthy meanwhile.

**Carry-over (deferred, valid):** FU-FIXER-NO-FORCE (HIGH) · FU-BCTC-TOOL-PARAMS + BCTC-CTG-ATTACHMENT-FETCH + BCTC-TABLE-2 (DHG/EIB promote candidate) + FU-BANK-CODECOL · FU-ORCH-HEAD-CAS · FU-SIGNAL-DASHBOARD-CAP + RE-CAP-1 · DRAIN-INJECTION-SAFE-2 · AUDITOR-SLA-CADENCE + A-01b · MSG-1/3 · EI-P2-* · CHEF-FLOW-CAP-REFACTOR + CHEF-ATTN-1. Next live tick = claude-manager-helper NB-PRUNE-UNIFIED-AGENT + agents-architect NB-PRUNE-ROOTCAUSE-SPIKE.

## c · 2026-06-02T01:09Z — TRIAGE (dev-team :09 fire) — bctc-analyst 3-blocker escalation (FPT ESC-3 10cy / CTG / DHG+EIB)

**Inputs:** orch head idle/WIP0 (nb-bloat family CLOSED last cycle). Telegram: no new reports (verified RAW via gateway). 0 NEW signal_queue po rows. Primary = HIGH bug-escalation from cowork on behalf of bctc-analyst c010, payload_ref bctc-analyst.md. 3 distinct lanes, NEVER routed before (0 prior po rows confirmed via notebook+git grep).

**RAW-VERIFY (router policy — not relaying analyst verdict):**
- FPT `get_bctc_full`: REAL data, conf 81%, NI 2,476.8 ty. BUT OperatingProfit/EBITDA/Cash all =0 (extraction artifacts). OCF −2,847,813 (from cashflow pass, not in summary). OCF/NI=−1.15 ESC-3 is plausible-but-needs-Opus to confirm it's structural vs a cashflow-extraction artifact. Escalation REAL, 10 cycles (c001–c010).
- DHG + CTG `get_bctc_full`: both "Chưa có dữ liệu BCTC" — no data in system. Real blockers.
- `deep-dive-opus.md` EXISTS (frontmatter model: claude-opus-4, ESC-3 handler L57–65). bctc-analyst cron runs on Sonnet → CANNOT self-promote model mid-cycle. Flow SAYS "Invoke sub-flow deep-dive-opus" on ESC-3 (main.md L75) but the runtime has NO seam to spawn a model-pinned Opus sub-agent. grep dev-team/flow + dispatch SKILL = 0 opus-dispatch wiring → confirmed ARCHITECTURE gap, not a one-off.

**Backlog dedup:** CTG → BCTC-CTG-ATTACHMENT-FETCH (exists, cover-letter-only PDF). DHG/EIB → BCTC-TABLE-2 (exists, multi-ticker) + FU-BANK-CODECOL. NO new dup created — folded.

**DECISION → BATCH (2/2) = 1 UNBLOCK now + open 1 SPRINT-S for the recurring gap. The 2 extraction lanes are SPRINT-sized → backlog, NOT half-fixed this cycle.**
1. **FPT-OPUS-DEEPDIVE** (UNBLOCK, route_to=main-terminal direct spawn — NOT dev-team code, model=claude-opus-4, zone n/a/read-only). Clears the 10-cycle-overdue ESC-3 backlog NOW: spawn a bctc-analyst running flow/deep-dive-opus.md with trigger_id=ESC-3, ticker=FPT, quarter=2026-Q1, context={ocf_total:-2847813, net_profit_total:2476800, divergence_ratio:2.15}. AC: deep_dive_result JSON emitted (verdict + recommended_action), appended to FPT signal. Files: docs/agents/bctc-analyst/flow/deep-dive-opus.md (read), docs/signals/bctc_signal_FPT_*.json (append). baseline_pass: deep_dive_result block present w/ non-zero confidence.
2. **ESC-OPUS-DISPATCH-SEAM** (SPRINT-S, route_to=agents-architect→agent-father, zone docs/agents/bctc-analyst/ + docs/agents/dev-team/flow/, PLAN-ONLY agent-def). Root-cause the recurring-bug (≥2 cy → root-cause policy; this is 10): wire a real seam so ESC-* auto-dispatches a model=opus sub-agent instead of silently no-op'ing under Sonnet. Needs architect (cross-agent dispatch design: who spawns Opus — cron self-spawn vs dev-team-mediated vs a queued signal PO drains). AC: an ESC-3 fire mechanically results in an Opus deep-dive without manual PO intervention; documented seam in dispatch SKILL. baseline_pass: design brief + 1 proven dry-run.

**Extraction lanes → BACKLOG (explicitly NOT dispatched — multi-ticker extraction root-cause is SPRINT-M, needs ba/architect, won't close in one dev cycle):**
- CTG 24h+ lag → BCTC-CTG-ATTACHMENT-FETCH (priority bumped normal→ raise to address: real-attachment fetch + size/page sanity gate). Transport recovered (HNX `-k` e22427aa) but this is the attachment-selection defect downstream.
- DHG+EIB 9cy DATA_INSUFFICIENT (PDFs on disk, get_bctc_full empty) → BCTC-TABLE-2 + FU-BANK-CODECOL. Note in backlog: 9-cycle persistence = promote BCTC-TABLE-2 to next-sprint candidate.

**Carry-over (deferred, valid):** AUDITOR-SLA-CADENCE + A-01b-DASHBOARD-HEALTH-FILTER · FRONTEND-BCTC-TAB · BCTC-TABLE-2 (PROMOTE — 9cy DHG/EIB) + BCTC-CTG-ATTACHMENT-FETCH + FU-BANK-CODECOL · NB-NOTEBOOK-WRITE-FLEET-ALIGN (skill SSOT contract first) · FU-SIGNAL-DASHBOARD-CAP + RE-CAP-1 · FU-FIXER-NO-FORCE (HIGH) · MSG-1 · 662 stale cowork-heartbeats housekeeping. Next live tick = main-terminal FPT-OPUS-DEEPDIVE + agents-architect ESC-OPUS-DISPATCH-SEAM.

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
