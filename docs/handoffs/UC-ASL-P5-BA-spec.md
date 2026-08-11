# UC-ASL-P5 — Canonicalize Signal Types and Statuses — BA Rescope Spec

**Task ID:** UC-ASL-P5 (P1, size=S, zone=multi)
**Agent:** ba · **Date:** 2026-08-11
**Sprint:** ULTRACODE-AUDIT-FIXALL
**Source:** `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#auditor-signal-loop-P5` (created 2026-07-13)
**Dispatch:** PO manual-dispatch-sweep 2026-08-11T15:54Z flagged this row `po_rescope_required` — "DISPATCH WITH RESCOPE — DO NOT IMPLEMENT AS WRITTEN," delegated the re-verification to BA rather than deciding it inline.

---

## 0. Recap — why the row needed re-verification (not just re-trust)

The row's 4-part note has been amended twice already (2026-07-21 orch-sentinel urgency pass, 2026-08-11 PO manual-dispatch pass) and both amendments turned out to rest on premises that live re-checking this cycle refutes further. I independently re-verified all 4 parts against current code/live data (not the note text, not PO's restatement of it). Result: **2 of 4 parts survive with corrected justification; 2 are declined outright** — different split than PO's own preliminary read (PO tentatively kept parts 1+3, declined 2+5; my independent check confirms that split but for a different — and in part 1's case, materially different — reason than PO's note gives).

---

## 1. Requirements (surviving parts)

### FR-1: Differentiate Tier-1 `signal_queue` row `type` by finding class (was brief item 1)

**Original justification REFUTED, not just stale.** The brief claimed the mistyping matters because "container-down CRITICALs never bridge" to `anomaly-task-bridge` (ATB) due to its type filter. Verified live: ATB's own `ATB-0 — Scope gate` (`.claude/skills/anomaly-task-bridge/SKILL.md:26`) reads `AUDIT_TIER = 1 → log "[ATB] Tier-1: skip" → EXIT` — **Tier-1 rows are categorically excluded from ATB regardless of type**, and this gate predates the brief itself (`git log`: commit `4fb46f684`, 2026-06-02, vs brief date 2026-07-12). The type mismatch was never the reason Tier-1 CRITICALs don't reach ATB; a type fix would not change that.

**Corrected justification (verified live, still real):**
- `scripts/emit-audit-signal.sh`'s own header comment says of the `--category-type` passthrough: *"enum is OPEN per-site... I3 is a separate, out-of-scope task"* — I3 = `auditor-signal-loop-I3`, the exact issue this row addresses. This is the codebase's own acknowledgment that the mismatch is real, known, and was deliberately left for this row to close.
- Tier-1 is the only audit tier that emits ONE hardcoded `signal_feedback` category-type across every one of its ~7 distinct check classes, while sibling Tier-2/3 templates in `main.md` differentiate (`data_stale`, `db_integrity_breach`, `improvement_proposal`, `cron_fire_gap`, ...).
- `docs/agents/po/flow/triage-signals.md`'s own Pipeline-B routing table dispositions `microservice_degraded` rows via a service-persistence-aware rule (mint only on `severity=CRITICAL` OR ≥2-consecutive-tick recurrence) that is distinct from the generic `signal_feedback` rule (mint on any CRITICAL/HIGH single occurrence). Today every Tier-1 finding — including genuine per-service degradation — gets routed via the generic rule, never the service-aware one. (Practical severity overlap is currently thin since Tier-1 only ever emits CRITICAL/WARN/INFO, never HIGH, so this is a precision/observability improvement, not a live routing failure — see Risk below.)

**Scope correction (file:line citations in the original brief are stale):** the brief cited `tier1-probe.md:162`/`:104` implying inline `"type": "signal_feedback"` JSON edits. The file was restructured under `UC-ASL-P2` since — inline emits were replaced by 3 shared call sites to `scripts/emit-audit-signal.sh --category-type "signal_feedback"`:
- `tier1-probe.md:91` — A-20 pdf-extractor multi-probe override
- `tier1-probe.md:310` — A-33 hook-enforcement-liveness
- `tier1-probe.md:337` — general "Emit per failure" catch-all, shared by A-01–A-11 (container liveness), A-12–A-19 (health endpoint), A-21 (restart cadence), A-30 (memory reclamation), A-32 (disk)

A blanket single-literal swap (the brief's literal instruction) is now **wrong**: the catch-all at `:337` serves check classes that are not all "microservice degraded" in nature (A-32 disk is host-level, not per-service; A-33 hook-liveness is an enforcement-mechanism finding, not a running-service finding, and already has its own dedicated call site at `:310` — decouple it explicitly).

**Proposed AC (default; architect to finalize the A-12–A-19 boundary — see Open Questions):**
- A-01–A-11 (container liveness) and A-20/A-21/A-30 (service-specific degradation checks) → `--category-type "microservice_degraded"`.
- A-32 (disk) and A-33 (hook liveness) → stay `--category-type "signal_feedback"` (neither represents a degraded microservice).
- `post_agent_signal` E-1 call (`emit-audit-signal.sh:391`, hardcoded `--arg st "signal_feedback"`) stays **frozen, untouched** — matches the `CLEAN-AUDITOR-DOC-SIGNAL-TYPES` (`bab66a03`) precedent the original brief already correctly preserved.

**DDD layer:** infrastructure (shell-script call-site parameters + the flow doc that invokes them — no server code, no schema).

**Risk:** LOW. Literal-string edits at 2 of 3 named line ranges in one flow-doc; zero schema/rebuild. Verify by forcing one Tier-1 FAIL and confirming the emitted `signal_queue` row carries the corrected `type`.

---

### FR-2: Close the dedup-skip loop in `po/flow/triage-signals.md` (was brief items 3+4)

**Verified live — the phrases are dead prose, and the gap is worse than the brief characterized.** `docs/agents/po/flow/triage-signals.md` still contains, verbatim, on the DUPLICATE-found (dedup-skip) branches:
- `:22` (`repair_task_request`) — "...mark signal DONE, skip."
- `:23` (`ci_red`) — "...mark signal DONE, skip that file."
- `:18` (`zone_missing_tier3`) — "...mark signal processed."

None of these three phrases maps to any concrete, defined action. Repo-wide search confirms the **only** systematic (non-ad-hoc-jq-script) mechanism that ever flips a `.signal_queue.rows[]` row's `status` to `RESOLVED` is `docs/agents/pm/flow/task-archive.md:118-131`, and it fires **only** on `done_verified[]` rows carrying `origin_signal_id` — i.e. only when a NEW task was minted from the signal and later verified DONE. It **cannot** fire on a dedup-skip disposition, because no task is minted there.

**The live gap this creates:** when an incoming Pipeline-A signal (`repair_task_request`/`ci_red`/`zone_missing_tier3`) whose originating id traces to a real `.signal_queue.rows[]` row hits its dedup-skip branch, that source row is **never** closed — it sits at `NEW`/`READ` indefinitely. (`zone_missing_tier3` is file-bus-sourced and usually has no row to resolve; `repair_task_request`/`ci_red` more often do, per `triage-signals.md:22`'s own `origin_signal_id` resolution rule.)

**Fix:** on each of the 3 dedup-skip branches, resolve the originating row id via the SAME rule `triage-signals.md:22` already documents (`payload.id` if the signal JSON carries one; else the drained `signal_queue.rows[].id` per `drain-signals.md` §0a-D `row.id`). If resolvable → flip that row `RESOLVED` via the standard `orch-apply.sh`-gated write (same CAS/Zod-guarded path `task-archive.md` already uses — no new write mechanism). If not resolvable → no-op, log-and-skip (mirrors the existing `origin_signal_id` "omit if neither resolvable — never blocks task creation" guard at the same line). Also correct `:27` "SHOULD stamp" → "MUST stamp" for `origin_signal_id` on newly-minted rows (original brief item 4 — unchanged, still accurate, still unfixed) and fix `:27`'s anchor citation from `"§ CLOSE"` to `"## ACK / CLOSE"` — **verified `"§ CLOSE"` does not exist** as a heading in `signal-dashboard/SKILL.md`; the real section is `## ACK / CLOSE` (`SKILL.md:78`).

**DDD layer:** interface/application (flow-doc procedural fix, reusing the write path `task-archive.md` already proves — no new server code, no schema change).

**Risk:** LOW-MEDIUM. Reuses a proven write pattern; the one open design point is the status-guard value to check before flipping — `task-archive.md`'s own guard only flips when `status=="READ"` (not `NEW`), and a Pipeline-B row may still be at `NEW` at dedup-skip time if it hasn't been separately ACK'd — flagged for architect (see Open Questions).

---

## 2. Declined (verified live — no genuine problem to solve; do not respec)

### Part 2 — `signal-dashboard/SKILL.md` §Signal types table — CONFIRMED already consciously declined
The file's own size-justification header (`FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES`, 2026-08-01) states the table is *"deliberately left as-is... non-exhaustive quick-reference to respect the ≤120L cap,"* with the full live type list intentionally relocated to `triage-signals.md`'s own "Live `.signal_queue.rows[]` inbox" section — confirmed present (5 high-volume + 11 long-tail types, `guard_signal_type_coverage()` regression-guarded, verified live PASS). No live gap. PO's read on this part was correct.

### Part 5 — `orchStateSchema.ts` `SignalRowSchema.status` enum tighten — DECLINED, not deferred
`status` is currently `z.string()` (fully open); there is **no observed live malfunction** from this. Live-measured this cycle: `.signal_queue.rows[]` = 22 rows, of which **18 (82%) carry `status:"triaged"`** (lowercase). The brief's own "CORRECTED" rescoped enum — `z.enum(["NEW","READ","TRIAGED","RESOLVED","SUPERSEDED","ACUTE-RESOLVED-ROOT-TRACKED"])` — **omits lowercase `"triaged"` and `"RETRACTED"` entirely**, both confirmed still-live, doc-admitted statuses (`signal-dashboard/SKILL.md:83` § ACK/CLOSE "Extended statuses", decided 2026-08-01; both also present in `orch-cold-evict.sh:150`'s live `TERMINAL_SIGNAL_STATUSES` default). Shipping that enum verbatim today would immediately Zod-reject 18/22 live rows and hard-wedge every subsequent `orch-state.json` write (`project_mcp_server_write_wedge` class) — strictly worse than today's unenforced state. If ever revisited, the enum must cover the full live 8-value vocabulary (`NEW/READ/TRIAGED/triaged/RESOLVED/SUPERSEDED/ACUTE-RESOLVED-ROOT-TRACKED/RETRACTED`) gated behind a fresh hot-file assertion immediately before the mcp-server rebuild it requires — but there is no live problem it closes today, so it is not worth an ops-gated off-market deploy slot. **Recommend leaving this out of scope entirely** (not merely BACKLOG'd for later) unless a future live incident demonstrates an actual invalid-status write.

---

## 3. Gate-flag consequence (flagged, not actioned by BA)

The row's `supervised: true` / `deploy_gate: "user-approved-off-market"` fields exist **solely** because part 5 (schema enum tighten) required an `apps/mcp-server` rebuild (`supervised_note`: "the code fix may be authored by dev, but it takes effect ONLY after a user-approved off-market deploy"). Part 5 is now out of scope; the surviving FR-1 (flow-doc + script-flag literal edit) and FR-2 (flow-doc procedural fix, reused write path) require **no schema change and no rebuild**. Recommend Architect/PO clear `supervised`/`deploy_gate` on this row once the rescoped note lands — BA is not unilaterally flipping a supervised gate, but the sole stated reason for it no longer applies to the surviving scope.

---

## 4. Blockers (PO-only)

None. The scope-narrowing decisions above follow directly from verified live evidence (ATB gate pre-dates the brief; dedup-skip has no closure mechanism; enum tighten would wedge writes on 18/22 live rows) — no business-priority judgment remains open.

---

## 5. Open Questions for Architect (HOW-level)

- **Q-A12-A19-boundary:** should A-12–A-19 (generic health-endpoint transport failures, e.g. `CLIENT_TIMEOUT`/`CONN_REFUSED`) emit `microservice_degraded` or stay `signal_feedback`? Default proposed above is `signal_feedback` (a transport-probe fact is not yet a confirmed service-degradation verdict — the file's own A-12 debounce logic exists specifically to avoid over-interpreting a single transport blip). Architect to confirm or override.
- **Q-status-guard:** FR-2's dedup-skip RESOLVED-flip — should it require `status=="READ"` (mirroring `task-archive.md`'s existing guard exactly) or also accept `status=="NEW"` (a Pipeline-B row may not have been separately ACK'd to READ before a same-tick duplicate is detected)? Getting this wrong either silently no-ops on the common case (`NEW`-only rows never close) or risks flipping a row PO hasn't actually looked at yet.
- **Q-emit-script-signature:** does differentiating `--category-type` per A-xx class inside the shared "Emit per failure" catch-all (currently ONE hardcoded literal serving ~6 check classes) require a new script parameter (e.g. `--category-type` computed by the caller per check, already true today — just needs the flow-doc call sites to stop hardcoding the same string) or a code change inside `emit-audit-signal.sh` itself? Verified: the script already passes `--category-type` through verbatim per-call — this is a **flow-doc-only** change (each call site picks its own literal), not a script change. Confirm no script edit is needed.

---

## 6. Edge Cases

- A `repair_task_request`/`ci_red` signal with NO resolvable origin row (pure file-bus signal, e.g. `signals.db`-only origin with no `signal_queue.rows[]` counterpart) — FR-2 must no-op cleanly, never block task-creation/dedup-skip logging.
- A Tier-1 finding that later gets manually re-typed by a human/PO triage sweep (several `scripts/po-s*.jq` one-off scripts do ad-hoc `status`/`type` rewrites) — FR-1's per-check-class type assignment must not conflict with or be silently overwritten by those; out of scope to audit every historical `.jq` script, flagged for awareness only.
- Concurrent Tier-1 emit + PO triage tick both touching the same row window — both already route through `orch-apply.sh`'s CAS-guard; FR-1/FR-2 introduce no new concurrent-writer class beyond what's already handled.

---

## RETURN
DONE: Rescope spec complete for UC-ASL-P5. Independently re-verified all 4 original parts against live code — 2 survive with corrected justification (FR-1 type differentiation, ATB-bridging rationale refuted and replaced; FR-2 dedup-skip RESOLVED-closure, a real gap worse than originally described), 2 declined outright (part 2 already consciously declined by its own doc header; part 5 would wedge 18/22 live rows if shipped as brief-specified, no live problem it closes today).
ZONE: multi (`docs/agents/system-auditor/flow/tier1-probe.md`, `docs/agents/po/flow/triage-signals.md`)
NEXT: architect | technical design for FR-1 + FR-2 only (no server/schema work — see Open Questions for the 3 HOW-level decisions)
HANDOFF: docs/handoffs/UC-ASL-P5-BA-spec.md
PIPELINE: continue
