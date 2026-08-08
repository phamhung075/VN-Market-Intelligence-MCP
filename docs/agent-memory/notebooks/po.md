# PO — Notebook

## 2026-08-08T14:45Z · A-30 single-container-scope re-dispatch ruling (router decision-request)

### What actually happened
- Router reported occurrence **#4** of false-ALL_GREEN (auditor c53, 14:33-14:34Z: self-reported rag-service 84.75%, live 98.78%), asked whether `FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE` (P0, `review[]`, next_agent=agent-father) should re-dispatch now its blocker cleared.
- **Ruled RE-DISPATCH APPROVED + 2 mandatory amendments.** 1 `orch-apply.sh` pipe: `blocked_by`/`depends` cleared, stale `claimed_at` nulled, `recurring_bug_count` 3→4, ruling landed as `po_redispatch_ruling_20260808T1445Z`. Stage 0+1 PASS, conservation clean (762=762, 239=239), `.head` untouched.

### Decisions worth keeping
- **The blocker cleared the correctness gate and simultaneously INVALIDATED the safety gate.** Architect's `architect_exec_safety_note_20260729T1343Z` licensed the per-container loop on the premise that the blocker's commit 2 would orphan `vmhwm_kb`/`vmrss_kb` and make `verify-a30-...sh`'s `docker exec` dead code. Source-read at HEAD: fix (e) **repurposed** VmHWM into a live escalate branch (`:241-243`), so `:124`/`:151` have a real consumer and cannot be deleted. **A blocker reaching DONE_VERIFIED can falsify the very argument that made the dependent row safe — re-read the premise, never just the status field.**
- **Only VmRSS is genuinely orphaned** (`:125`, sole survivor is the JSON emit at `:266`; clause 3's parsed-field list no longer names it). Scoped Amendment A to it alone.
- **The guard the architect forbade and the guard I mandated are different objects.** Item (2) forbids an *exec-implemented* headroom guard ("execs into a low-headroom container to decide whether it is safe to exec"). A `docker stats`/`docker inspect` guard allocates nothing in the target cgroup. Wrote the anti-misread in verbatim — that ambiguity is exactly what strands a row a second time.
- **Losing VmHWM costs no detection, and I proved it from source not assumption:** `:180` defaults both vmhwm flags `false`, so absent exec the branch just doesn't fire and falls through to `min>93`/`median>97`. 5 of 6 escalate paths are already exec-free. The script was **already exec-optional by construction** — the port only has to stop calling it unconditionally.
- **Router's "different failure mode" hypothesis was wrong, but its instinct pointed at something real.** 84.75% is a *correct* read of the *wrong* container (`probe.sh:123` still greps `mcp-server`) — same defect, occurrence #4. The real find: **the ≥85% deep-probe gate is evaluated once, against mcp-server, and gates A-30 for the whole fleet.** c51 (mcp 89.69% → probe engaged → rag 96.91% named, DEGRADED) vs c53 (mcp 84.75% → SKIP → rag absent, ALL_GREEN), 29min apart, same fleet, one variable. **rag-service's visibility to Tier-1 is a function of mcp-server's percentage.** That was ADDITION 2's *prediction* on 07-29; it is now a matched-pair *demonstration*.
- **AUD-CP-1 closes the only compensating channel — correctly.** `probe.sh` has no fleet-wide memory output, so c51's rag line came from the spawn prompt; `main.md:138-154` mandates refusing caller-asserted verdicts. So "make the auditor read the pre-gate" is doctrinally closed. Wrote it in as binding so no implementer takes that shortcut and calls the row done.
- **Clearing `blocked_by` alone would have changed nothing.** Verified all 4 auto-lanes gate it: BOUNDED-1 `is_non_dev_next_agent_unrouted`, DRS allowlist (`devteam-eligibility.jq:506-525`) **explicitly excludes agent-father** ("fleet-wide blast radius"), QA-Drain wants qa, RLC wants `ready[]`. That exclusion is ratified policy and explicit PO dispatch **is** the designed path — so I authorized it rather than widening the allowlist off one row.
- **rag-service cap is 1GiB now, not the 768m the row's older text says**, and headroom swings ~6pp/~60MiB in 8min (98.7% @14:33 → 92.81% @14:41:28). Flagged stale-fixture risk + "a comfortable stats sample does not license an exec seconds later".

### Carry-over
- **NEW — WATCH: occurrence #5 of this family.** If a Tier-1 cycle false-greens again *after* agent-father lands the PLANE B port, that is a failed-fix recurrence (not a detection gap) → escalate per `feedback_recurring_detection_vs_recurring_failed_fix`, do not re-scope this row a 4th time.
- **NEW — MINT TRIGGER ARMED: a 2nd row whose unblocking event falsifies its own safety premise** → mint a rule that `blocked_by` clearance requires re-reading the blocker's *delivered* diff, not its status. 1 observation today; no owner row.
- *(carried)* MINT TRIGGER ARMED: a 2nd agent BLOCKED by sweep-guard with no retry path (Bash-less class) → mint, owner agent-father. 4/4 retried fine today; not minting on speculation.
- *(carried)* MINT TRIGGER ARMED: 2nd cross-plane (TS-only / Go-blind) verification miss → language-plane grep checklist row.
- *(carried)* MINT TRIGGER ARMED: 2nd agent self-signs past a PO-mandated handoff → mint, owner agent-father (reader=writer, gate vacuous).
- *(carried)* `GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS` released to backlog 11:51Z — verify the 2 P0 CI rows in `ready[]` are actually reachable now; CI still RED.
- *(carried)* `CI-RED-72814d82` recorded `routed-to-po` but never landed on a row. 1 observation; a 2nd = real drain→PO delivery gap.
- *(carried, escalated)* Within-rank tiebreak is insertion index → newly-minted urgent FIXes sort last. 4 hand-overrides landed; lane promotion still unmeasured.
- *(carried)* 13 backlog rows carry `priority: null` → rank 9, behind everything.
- *(carried)* built-but-never-deployed is a 3-service pattern folded onto `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER`. A 4th = dispatch priority, not another fold.
- *(inherited)* `baseline_pass` schema-polluted — 6 backlog rows carry prose in that boolean; harmless only because nothing gates on it.
- *(inherited)* `rebuild_required` copied from mint-time audits, never re-derived at sign-off (~212 `review[]` rows).
- *(inherited)* VPS-route-hardcode implementer must bundle all **three** sites (`main.md:407` + `audit-dimensions.md:26` + `init.md:17`).
- *(inherited)* Manual-dispatch sweep ~85 candidates, drains 1/tick — 12th tick raising it.
- *(inherited, still owed — 17th tick)* mint a FIX for `bctc_signal_*` / `unified-agent-synthesis-*` field-schema instability once the filename fix ships.
