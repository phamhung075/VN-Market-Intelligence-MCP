# PO Ruling — 2026-08-08T14:45Z (router decision-request: re-dispatch A-30 single-container-scope row?)

Session: 165f4245-6173-4054-87fd-c55bb626265f · router escalated system-auditor cycle c53 (14:33-14:34Z) as occurrence #4 of false-ALL_GREEN and asked whether `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE` should re-dispatch now its blocker is DONE_VERIFIED. Advisory request; PO ruling stands.

### STEP po-R1 · po · 2026-08-08T14:44:24Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Ruled RE-DISPATCH APPROVED but blocked a verbatim dispatch — cleared `blocked_by`/`depends`, nulled the stale `claimed_at`, and landed two mandatory scope amendments (A: delete only the VmRSS exec; B: gate the surviving VmHWM execs on a host-side headroom pre-check).
**what-considered:**
- Re-dispatch as written (deliverable (a) says: loop the unmodified `verify-a30-...sh` with `CONTAINER=<each capped container>`)
- Hold the row until a separate exec-removal row lands
- Re-dispatch with amendments (chosen)
**why-decision:** The blocker `FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP` satisfies gate 1 (`po_veto_gate_20260729T1231` — clause 4's `vmhwm>vmrss` veto is gone, AC(1) reachable). It does NOT satisfy gate 2 (`architect_exec_safety_note_20260729T1343Z`), whose own text forbids lifting `blocked_by` on the correctness argument alone "without separately confirming the exec has actually been removed". PO read HEAD: `scripts/audits/verify-a30-mcp-memory-reclamation.sh` still `docker exec`s at :124/:125/:151. The architect's licensing premise — that commit 2 would orphan `vmhwm_kb`/`vmrss_kb` and make the exec dead code — is now FALSE for VmHWM: fix (e) repurposed it into a live escalate branch at :241-243. Dispatching verbatim would exec into rag-service ~48x/day, the operation that SIGKILLed it on 2026-07-29T10:12Z. Holding was rejected because the amendment is small, fully specified, and the row is a 4x-recurring P0 whose detector is currently mute.
**why-change:** Widened beyond the router's ask (which was a yes/no on re-dispatch) after source-reading the blocker's delivered diff rather than trusting its `DONE_VERIFIED` status.

### STEP po-R2 · po · 2026-08-08T14:44:24Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Specified the headroom guard as `docker stats`/`docker inspect` arithmetic and wrote an explicit anti-misread against architect item (2).
**what-considered:**
- Skip the deep probe entirely for below-floor containers
- Guard only the exec, keep the probe (chosen)
- Add rag-service to a floor-exempt list
**why-decision:** Item (2) forbids "a per-container docker-exec guarded by a headroom pre-check [that] still execs into a low-headroom container to decide whether it is safe to exec" — it forbids an *exec-implemented* guard, not a host-side one; `_mem_headroom_mib()` allocates nothing in the target cgroup. Skipping the whole probe was rejected: `:180` defaults both vmhwm flags to `false`, so with the exec skipped the branch simply doesn't fire and evaluation falls through to `min>93`/`median>97` — the script is already exec-optional by construction, and 5 of 6 escalate paths are exec-free. So the probe keeps working on thin containers at zero detection cost. Floor-exempt lists were already REJECTED by `po_scope_amend_20260729T1222` and that ruling stands.
**why-change:** no change from plan.

### STEP po-R3 · po · 2026-08-08T14:44:24Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Corrected the router's read of c53 and folded a matched-pair evidence artifact + 3 new ACs onto the row.
**what-considered:**
- Router's hypothesis: c53 read "a real-looking-but-wrong number", possibly a new failure mode
- Same defect, occurrence #4 (chosen)
**why-decision:** 84.75% is a correct reading of the wrong container (`probe.sh:123` greps `mcp-server`); rag-service is never sampled by PLANE B. But c53 vs c51 is a same-fleet, 29-minute-apart matched pair with one variable: mcp-server 89.69% (≥85) → probe engaged → rag named, DEGRADED; mcp-server 84.75% (<85) → SKIP → rag absent, ALL_GREEN. That demonstrates the ≥85 gate is evaluated once against mcp-server and gates A-30 for the whole fleet — previously only a prediction in `po_scope_amend_20260729T1222` ADDITION 2. Added AC(7) per-container gate, AC(8) zero-exec-below-floor, AC(9) escalation preserved without VmHWM.
**why-change:** Rejected the router's "different failure mode" framing after reading `probe.sh` and `tier1-probe.md` clause 1 directly, but adopted the underlying instinct — there was a new mechanism, just not the one proposed.

### STEP po-R4 · po · 2026-08-08T14:44:24Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Authorized an explicit PO/router dispatch of agent-father instead of widening the DRS allowlist.
**what-considered:**
- Add `agent-father` to DRS's `--argjson allowlist`
- Flip `next_agent` to an allowlisted agent
- Explicit PO dispatch (chosen)
**why-decision:** Verified the row is unreachable by all four auto-lanes even with `blocked_by` clear: BOUNDED-1 `is_non_dev_next_agent_unrouted`, DRS allowlist (`scripts/lib/devteam-eligibility.jq:506-525`) which explicitly excludes `agent-father` for "fleet-wide blast radius", QA-Drain (wants qa), RLC (wants `ready[]`). That exclusion is ratified 2026-07-30 policy and explicit PO dispatch IS its designed escape hatch. Widening the allowlist off one row would silently enable fleet-wide-blast-radius auto-dispatch (`feedback_gate_widening_recommendation_requires_actuator_dry_run`); re-pointing `next_agent` would mis-route a `docs/agents/` zone change.
**why-change:** no change from plan.

### STEP po-R5 · po · 2026-08-08T14:46:30Z
**task-id:** FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT
**what-done:** Added `po_corroboration_20260808T1447Z` recording c53 as an Arm B positive control, and explicitly instructed that it NOT be counted as an occurrence of this row's defect.
**what-considered:**
- Fold c53 as occurrence #3 of the transcription defect
- Corroboration-only, with a do-not-count instruction (chosen)
**why-decision:** c53's notebook line accurately transcribes its RAW-PROBE JSON — PLANE B's machine verdict really was PASS, so Arm A reads clean and there is no transcription defect. Counting it here would double-count one incident across two rows and mis-scope both. What c53 does prove is stronger than an occurrence: Arm B (pre-gate-vs-return diff) would have caught it while the agent behaved correctly at every documented step, which upgrades Arm B from an artifact-scarcity fallback to a genuine cross-plane invariant, and makes it a working time-to-detection backstop for the whole 4x-recurring scope family. Added an anti-false-positive constraint (AUD-CP-1 and ack-ledger suppression both make divergence legitimate sometimes, so Arm B must emit a DIVERGENCE finding, never an agent-blame verdict).
**why-change:** Escalated the router's "note it at your discretion" into a board write, per `feedback_po_notebook_mint_never_reaches_orchstate_board` — a PO observation that lands only in a notebook never reaches an implementer.
