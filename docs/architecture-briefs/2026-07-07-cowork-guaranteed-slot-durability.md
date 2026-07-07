# Cowork Guaranteed-Slot Durability — Architecture Brief

**Date:** 2026-07-07T20:44:10Z · **Author:** agents-architect · **Type:** REPAIR, HIGH severity
**Triggers:** `docs/signals/repair-cowork-guaranteed-slot-durability-20260707T203223Z.json` (PO root-cause triage) · queued row `docs/data/orch/orch-state.json` `.signal_queue.rows[]` id `atb-cowork-guaranteed-slot-durability-20260707T203223Z` (status NEW) · TNB finding `F-CHEF-MULTIDAY-OUTAGE-0706-0707` (`docs/handoffs/tnb-audit-latest.md`, `docs/signals/tnb-20260707T201700Z.json`)
**PLAN-ONLY.** No file outside `docs/architecture-briefs/` and `docs/signals/` is touched by this brief. Nothing installed, nothing loaded.

---

## 1. Problem (accepted as-is from PO's triage — re-verified, not re-derived)

The cowork `*/15 * * * *` master `CronCreate` dispatcher is **session-scoped**: it evaporates the instant the Claude Code CLI session ends (`.claude/skills/cron-cowork-team/SKILL.md`: `durable:true` survives process restarts within a session, never survives session-end). No CLI session was live 2026-07-04T16:05:03Z → 2026-07-07T17:30Z (~73h). Every guaranteed slot due in that window was silent: chef-evening ×3 (07-04/05/06), chef-morning + chef-eod ×2 each (07-06/07), digest-sunday ×1 (07-05), fb-daily ×2 (07-06/07). This is a **recurring** failure class (prior instance: fb-daily, 2026-06-30 — memory `project_cowork_guaranteed_slot_needs_live_cli_session`), which per `feedback_recurring_bug_escalation` requires a durable architectural fix this time, not another symptom patch.

## 2. Independent re-verification (this brief, 2026-07-07T20:3x–20:4xZ)

I did not take PO's evidence on faith — re-checked the live system directly:

- `launchctl list | grep -i vn-market` → only `com.vn-market.docker-events`, `com.vn-market.fleet-push`, `com.vn-market.docker-cleanup`. **`com.vn-market.fb-daily-firer` is NOT loaded**, and neither is `com.vn-market.mcp`. Confirms PO's "dormant, not loaded" claim independently.
- `docs/data/cowork-schedule.json` — every guaranteed slot (chef-morning/eod/evening, digest-sunday, fb-daily/weekend) carries `_superseded_by: "cowork-dispatcher"` on its old `trigger_id`, consistent with the RemoteTrigger retirement.
- **New finding not in PO's payload:** `docs/agent-memory/sessions/fb-daily-firer.log` shows the launchd firer **was loaded and firing correctly** 2026-07-01 → 2026-07-04 (4 successful invocations, including a correctly-deduped fb-weekend Sunday run). It went dark after 2026-07-04T17:44:35Z with no unload event logged anywhere. **The mechanism works — something silently unloaded it, and nothing detected the unload.** This is a second, independent gap on top of PO's root cause: a launchd-based backstop is not self-verifying. Any fix must include a monitor, or this exact outage recurs even after Option A ships.
- `docs/protocols/cowork-master-cron-runbook.md` (owner: agent-father, last updated 2026-06-13) still documents "Layer A — RemoteTriggers... **permanently active and MUST COEXIST**" and a `layer_a_deletion_locked: true` gate requiring 2 session-restart survivals before deletion is even allowed. This is now **stale and actively misleading**: Layer A was functionally retired by the STANDING `feedback_no_remote_trigger_all_local` directive without the runbook being updated or the deletion-lock being formally cleared. Anyone following this runbook during a future incident will misdiagnose ("check RemoteTrigger recovery §5") a layer that no longer does anything. Flagged as a required companion doc-fix (§6).
- `scripts/agents-flow/cowork-match-slots.js` (the exact matcher the live `*/15` dispatcher uses) is a pure, already-tested, already-shipped Node module — `matchSlots()`/`cronMatches()` exported, CLI-runnable (`node scripts/agents-flow/cowork-match-slots.js` → `{slots:[...], drift_min:N}`). Each returned slot object already carries `trigger_prompt` verbatim from `docs/data/cowork-schedule.json` (e.g. `"run docs/agents/unified-agent/flow/chef.md  slot=chef-morning"`). This is directly reusable — see §4.

## 3. Ruling: Option A (extended + generalized), not Option B

**Option B (move generation to the always-on VPS) is rejected for this fix.** The Vinahost VPS (`docs/references/vps-setup*.md`) runs 5 systemd Python/bash *data-fetch* services only (price, BCTC, news, SBV, foreign-flow) — no LLM runtime, no Claude CLI, no Anthropic credential, no access to this repo's `docs/agents/*` flow definitions. Standing up guaranteed-slot generation there means shipping an Anthropic API key to an internet-facing third-party box, syncing/mirroring the flow-doc tree, and rebuilding the exact same "headless one-shot invocation" pattern Option A already has *working* — for a security-surface increase, not a reduction. Nothing in the evidence points to the VPS as the right host for LLM-judgment work; it is the right host for browser/HTTP scraping behind Vietnamese geo-blocks, which is an unrelated problem. Revisit only if a future need requires 24/7 sub-15-min guaranteed cadence that a laptop cannot provide (not the case here — the tightest guaranteed slot is daily).

**Option A is correct and is mostly already built and field-proven** (§2). The remaining gap is narrower than PO's framing suggested: not "build a new firer," but "generalize the one that already works, and make it self-verifying."

**Recommended shape — generalize, don't hardcode a 5th if-block:**

Do **not** copy `scripts/cowork-fb-daily-firer.sh`'s hardcoded UTC-window `if` chain and add 4 more branches for chef/digest. That repeats the exact hardcode-accretion pattern CLAUDE.md's global instruction ("detect then reduce debt... hardcode") flags, and guarantees the *next* new guaranteed slot repeats this outage. Instead:

1. New script `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` (or in-place generalization of the existing one) calls `node scripts/agents-flow/cowork-match-slots.js`, filters the returned `slots[]` to `guaranteed === true`, and for each match invokes `claude --dangerously-skip-permissions -p "<trigger_prompt>"` — where `trigger_prompt` is read directly off the matched slot object, not hardcoded per-agent.
2. This **reuses the same matcher the live `*/15` dispatcher uses**, so the OS-level backstop and the live dispatcher can never drift on "what counts as due" — one SSOT (`docs/data/cowork-schedule.json`), one matching implementation.
3. Any future slot added to `cowork-schedule.json` with `guaranteed: true` is automatically covered — zero script edits required. This is the durable fix the recurrence flag (§1) calls for.
4. This generalized script **subsumes** `cowork-fb-daily-firer.sh` (fb-daily/fb-weekend are already `guaranteed: true` rows) — retire the fb-only script/plist into the generalized one rather than running two overlapping launchd jobs polling the same 900s cadence.
5. Scope discipline: filtering to `guaranteed === true` deliberately **excludes** sub-hourly market slots (news-scout-market, market-watcher-market, alert-commander-market) — those stay Layer-B-only by design, matching their non-guaranteed severity classification. This also directly bounds `F-GATHERER-OFFHOURS-STALL-0704` (§7).
6. Dedup: **no new mechanism needed.** Every guaranteed-slot flow (`chef.md` Step 0.5, `digest-predict/flow/main.md` pre-D gate, `fb-market-poster/flow/main.md`'s own gate) already implements the published-marker `task_claim` gate (FR-P2-7 pattern). The firer log's 2026-07-04 fb-weekend entry is live proof this already works correctly under double-fire (Layer A backstop + would-be Layer B).
7. Hardening from the observed anomaly (§2): wrap the `claude -p` call in `timeout 1800` — the 2026-07-04 fb-weekend invocation took ~4.5h wall-clock between invoke-log and exit-log with no bound on the process; an unbounded headless invocation risks pile-up under launchd's 900s re-fire cadence. Verify empirically during implementation whether launchd already serializes same-Label runs; do not assume it.
8. **Self-verification (closes the newly-found gap in §2):** extend the already-shipped, already-READ-ONLY `scripts/agents-flow/auditor-tier1-probe.sh` (TOKEN-ECONOMY-TICK-PREFLIGHT WU-3) with one more check in the same style as its existing 5: `launchctl list | grep -q com.vn-market.cowork-guaranteed-slot-firer` (and the other vn-market LaunchAgents) → FAILURE verdict + bug-channel alert if a required label silently disappears. This is the only way the July-1-to-4 silent-unload pattern gets caught before it causes another multi-day outage, since nothing today watches the watcher.

## 4. Token-cost estimate

PO flagged the worst-case risk directly: "≈160k/day if a full CLI session is spawned per tick" (memory `project_session_start_token_bloat_80k`, latent-risk note on `fb-daily-firer.plist`). That worst case **does not apply** to the design above, for two structural reasons already proven elsewhere in this repo (`docs/architecture-briefs/2026-07-01-token-economy-tick-preflight.md`):

- **The `claude` binary is never invoked on a no-match tick.** `cowork-match-slots.js` is pure Node, no LLM call; ~96 ticks/day (StartInterval=900s) cost ≈0 tokens — this mirrors the WU-1/WU-2/WU-3 "deterministic pre-gate" pattern already shipped for cowork/dev-team/auditor ticks.
- **Every firing is a cold, isolated one-shot process** (`claude -p`), not an accumulating interactive session. The 80k/hour figure was driven by cache-miss-over-full-accumulated-history inside one long-lived session (confirmed root cause of that separate finding); a fresh `-p` process each time cannot compound that way — this is stated explicitly as the intended benefit in the token-economy brief's own "out of scope" section ("kills the cache-miss-over-full-history problem entirely").

Net effect, by case:
- **No-op ticks (~90%+ of the day):** ~0 tokens — bash/node gate only.
- **Backstop fires redundantly alongside a live Layer B session** (the common case — most days a CLI session is up): the flow's own published-marker gate short-circuits at Step 0.5 with a small claim-check + clean exit (comparable to the 2026-07-04 fb-weekend example) — low hundreds to low thousands of tokens, not a full dish generation. Estimated **~5–15k tokens/day incremental** in the common case (4–5 guaranteed slots/weekday × short-circuit cost).
- **Backstop is the only firer** (Layer B genuinely dead, the exact scenario this fix targets): cost = one full dish generation, identical in size to what the live dispatcher would have spent producing that same deliverable anyway. **Not incremental** — it is the deliverable being produced either way; the alternative is not "spend fewer tokens," it is "produce nothing," which is the outage being fixed.

No new persistent/accumulating cost is introduced. This directly answers PO's flagged tradeoff.

## 5. Concrete next steps (implementation — NOT done by this brief)

| # | Action | Owner | Files |
|---|---|---|---|
| 1 | Generalize firer: `scripts/agents-flow/cowork-guaranteed-slot-firer.sh` (calls `cowork-match-slots.js`, filters `guaranteed===true`, invokes `trigger_prompt` per match, `timeout`-bounded). Write test-first (sibling `.test.sh`, mirroring `auditor-tier1-probe.test.sh` pattern — mock `claude`/`node`, zero real invocations in tests). Retire `scripts/cowork-fb-daily-firer.sh` into it. | `developer` | new script + test; `scripts/cowork-fb-daily-firer.sh` (retire) |
| 2 | Generalize plist: single `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` (StartInterval=900, RunAtLoad=false, KeepAlive=false — same shape as today's fb-only plist) replacing `com.vn-market.fb-daily-firer.plist`. | `developer` | `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist`; retire old plist |
| 3 | Extend Tier-1 self-check (§3.8): add the LaunchAgent-loaded assertion to `scripts/agents-flow/auditor-tier1-probe.sh` + its test file. | `developer` | `scripts/agents-flow/auditor-tier1-probe.sh` + `.test.sh` |
| 4 | Install: symlink new plist into `~/Library/LaunchAgents/`, `launchctl unload` the old fb-only entry, `launchctl load` the new one, verify via `launchctl list \| grep com.vn-market.cowork-guaranteed-slot-firer`. Per `feedback_user_gates_delegate_to_ops` (2026-07-03 OVERRIDE), this is a gated local swap ops may execute without waiting for further user gate. | `ops` | (no repo files — local machine state) |
| 5 | Doc fix: correct `docs/protocols/cowork-master-cron-runbook.md` §1 — RemoteTrigger Layer A is retired (STANDING `feedback_no_remote_trigger_all_local`), replace with the new generalized launchd firer as the session-independent layer; formally clear or rewrite `docs/data/cowork-schedule.json._notes.layer_a_deletion_locked`. Runbook owner is agent-father per its own header. | `agent-father` (doc owner) | `docs/protocols/cowork-master-cron-runbook.md`, `docs/data/cowork-schedule.json._notes` |
| 6 | QA sign-off gate (§6) before this signal is marked resolved. | `qa` | n/a (verification only) |

Sequencing: 1 → 2 → 3 can be developed in parallel (independent files) but 4 depends on 1+2 landing; 6 depends on 4. 5 is independent, can run any time, does not block 1–4.

## 6. QA — session-down survival test (mandatory DoD, per PO's own decision gate)

1. Confirm plist loaded: `launchctl list | grep com.vn-market.cowork-guaranteed-slot-firer` shows an entry.
2. Force Layer B dead: end/kill the live Claude Code CLI session (or delete the master `*/15` cron via `CronDelete` and confirm `CronList` shows no cowork-team entry) — assert no live session exists for the remainder of the test.
3. Trigger a guaranteed slot's due window without waiting for real wall-clock: either (a) wait for a real occurrence, or (b) reuse the existing `ctx`-injection test seam already proven in `cowork-match-slots.js`/`cowork-tick-preflight.test.sh` to simulate a due slot deterministically, then manually invoke the firer script once to confirm end-to-end wiring.
4. Assert: (a) the firer's log shows a `claude -p` invocation, (b) the target flow completed and produced its real deliverable (dish file / notebook entry / Telegram post) with NO live CLI session present, (c) no fabricated or duplicate content — published-marker gate behaved correctly.
5. Regression: confirm fb-daily/fb-weekend still fire correctly post-consolidation (no behavior change from the retired script).
6. Scope check: confirm a non-guaranteed slot (e.g. news-scout-market) is NOT fired by the backstop while Layer B is down — this is by design (§3.5), not a bug.
7. Injected-fault test for the Tier-1 extension (§3.8, per `feedback_fence_false_green` discipline): temporarily unload/hide the plist, confirm `auditor-tier1-probe.sh` returns FAILURE + bug-channel alert; restore and confirm it returns to ALL_GREEN.

Only after all 7 pass should PO mark `docs/data/orch/orch-state.json` `.signal_queue.rows[]` id `atb-cowork-guaranteed-slot-durability-20260707T203223Z` resolved.

## 7. `F-GATHERER-OFFHOURS-STALL-0704` — explicit scope statement

**No separate fix.** `news-scout-offhours`, `market-watcher-offhours`, and `alert-commander-critical` all froze at the identical `2026-07-04T16:05:03Z` timestamp — the last tick of the same dead session that this brief's fix addresses. These are **not** `guaranteed: true` slots (confirmed against `docs/data/cowork-schedule.json`), so by design (§3.5) the generalized OS-level firer intentionally does not cover them — they remain Layer-B-only, same as before this fix. That is correct: their severity is MED (not HIGH) precisely because they are sub-guaranteed slots where a bounded gap during session-down is accepted. This fix restores Layer B durability indirectly only in the sense that once a session is live again, these resume normally (as they already did — `market-watcher.md`/`news-scout` resumed once the session revived at 17:30Z 07-07, no data corruption, no separate defect found). PO/router should close `F-GATHERER-OFFHOURS-STALL-0704` as "same root cause as F-CHEF-MULTIDAY-OUTAGE-0706-0707, resolved together, no incremental work item" — no new task should be opened for it.

## 8. Explicitly not in scope

- `F-MCP-SUBAGENT-SYSTEMIC` (session-wide gateway-blind) — separate, already-ESCALATED (`docs/signals/unified-agent-20260707T194500Z-gateway-blind.json`), unrelated mechanism (tool-access defect within a live session, not session absence).
- `F-CHEF-EVENING-0707-FAILED` — same gateway-blind defect, not this brief's concern.
- Retiring the (already largely dormant) RemoteTrigger objects server-side — no delete action exists via the RemoteTrigger MCP tool per `docs/agent-memory/notebooks/po.md`/`spike_1951a` residual note; this is a claude.ai workspace-side cleanup, not blocking this fix, tracked separately.

## 9. RETURN

DONE: Brief authored, PO's two options ruled on (A, generalized + hardened; B rejected), token-cost estimate delivered, concrete owner-mapped next steps, QA survival-test spec, F-GATHERER-OFFHOURS-STALL-0704 scope closed explicitly.
NEXT: po — sign off, then route build (developer), install (ops), doc-fix (agent-father), verify (qa) per §5.
HANDOFF: `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md`
PIPELINE: continue
