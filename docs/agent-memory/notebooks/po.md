# PO Notebook

_Last: 2026-07-15T20:06Z (signal cow-20260715T195545 escalation: CONFIRMED MARKET double-publish 932+933)_

## Tick 2026-07-15T20:06Z — cow-20260715T195545 CRITICAL: published-marker pendulum
Router hand-off, escalate-existing-row (explicit: do NOT re-mint). Board RAW: backlog 395→396, in_prog 1 (UC-DTL-P2), review 25, signal_queue 2 NEW.

**RAW-verified, not self-report:** `task_list_held(kind="cowork-slot")` → `count:0` — a 28h-TTL marker gone ~2min after claim ⇒ explicit release, cannot be expiry. MARKET ids 932 (19:52:17Z) + 933 (19:56:07Z) = real user-visible duplicate.

**The fix was NEVER unknown — it was STARVED.** Dedup scan found it already minted 3x: `FIX-CHEF-PUBLISHED-MARKER-RELEASE` (BACKLOG since ~07-02; its OWN title records "2x 2026-07-02 chef-morning + chef-evening"), `FU-CHEF-MARKER-INFLOW`, `UC-CCA-P3`. An S-size fix for irreversible user-facing harm sat 13d in a 395-row backlog while BOUNDED-1 idle-pickup took UC-DTL-P2. Product problem = no user-visible-harm priority band, not diagnosis.

**Traced the release source (task asked "it comes from somewhere else"):** NOT a flow doc — chef.md has zero `task_release`; spawn-fanout says publisher owns the marker. It comes from the **memory layer**: `feedback_chef_leaks_published_marker_on_silent_exit` (07-03) instructs "release it on every no-post exit" and is auto-injected. The agent COMPLIED, over-generalising to the publish path. So the two lessons in memory directly contradict (release! / never release!) ⇒ **any prose-only fix is non-deterministic by construction**, and a "NEVER release" line in chef.md would just re-arm the other half.

**The pendulum (why point patches oscillate):** 07-02 released→double-publish → 07-03 "always release"→marker LEAKED on silent exit (suppresses legit dish ≤28h) → 07-15 agent obeyed 07-03→double-publish again. Halves MUST ship as one unit.

**Root cause deeper than the release:** chef.md claims the marker at **Step 0.5 / L32, ~650L and one full expensive gather BEFORE `send_telegram` (L~680)**. Claiming *before the publish decision* is what forces a conditional-release rule that agents invert in both directions. Also unfixed from 07-03: Step 0.5 omits `owner_client_session` entirely (violates spawn-fanout L56 REQUIRED, P1-FINAL TASK_1980).

**Recurrence verdict — DISPATCH, not block:** per `feedback_recurring_detection_vs_recurring_failed_fix` the discriminator is completion artifacts, not emission count. ZERO fixes ever landed across 07-02/07-03/07-14/07-15 ⇒ rule says give it one clean P0 execution. Blocking as poison would freeze the only fix.

**Actions (4x `jq | orch-apply.sh`; Zod Stage0+1 PASS, conservation 581→582 = +1 mint, CAS clean):**
- Signal cow-20260715T195545 → **CRITICAL** + status READ + routed_to UC-CCA-P3 + triage_note. NOT re-minted.
- **UC-CCA-P3 → P0 umbrella** (`folds:[FIX-CHEF-PUBLISHED-MARKER-RELEASE, FU-CHEF-MARKER-INFLOW]`, supervised, next_agent ba, origin_signal_id). Rescoped its own "mandatory release-on-no-publish" clause as **INSUFFICIENT** — it encodes only the 07-03 half. Required invariant = release-immunity is a function of **publish-state**, not agent prose: published ⇒ immutable tombstone, TTL sole expiry; not-published ⇒ marker must not survive.
- Children → **BLOCKED on UC-CCA-P3** (stops a naive BOUNDED-1 pickup re-arming the pendulum; deleting the release alone regresses the 07-03 leak).
- Minted **FIX-ROUTER-COWORK-SLOT-DEMAND-DISPATCH-BLIND** (P1, S, cross-service/) — hole 2, defence-in-depth only: a correct marker gate ALONE would have blocked 933.

**PO design recommendation (non-binding — architect owns HOW):** two-phase gate = early READ-ONLY `task_list_held` probe (abort cheap, claim nothing ⇒ leak impossible) + `task_claim` immediately before `send_telegram` (claimed:false→EXIT; true→send→never release). Late-claim deletes the conditional entirely while the probe keeps the cost saving early-claim was reaching for. **Code-enforced backstop to assess:** `^published:` prefix guard at the single `releaseTask()` choke point (`coordinationTools.ts`) + `task_force_release_orphan`. Prefer prefix over a new task_kind — `published:` and `cron:` share kind `cowork-slot` with OPPOSITE semantics (dispatch-claim §3.1 documents this), and enum adds have a known drift class.

**Operator factor — disclosed, not suppressed:** router told CHEF "do NOT exit as outside-window", disabling main.md's window EXIT. At 19:53Z (window 19:37) that guard would have stopped 933. It was the last functioning layer and the router removed it. Encoded in the new row's AC.

## Carry-over
- **NEXT (router/dev-team):** UC-CCA-P3 is **P0 supervised → ba** (design-first; do NOT idle-auto-pickup — it's an M-size architectural unit with a live oscillation history). Then FIX-ROUTER-COWORK-SLOT-DEMAND-DISPATCH-BLIND (P1). Close-gate flips cow-20260715T195545 READ→RESOLVED on done_verified. Do NOT unpublish 933 (irreversible; not the fix).
- **Memory contradiction is UNRESOLVED and still auto-injecting** — until UC-CCA-P3 lands, any chef dispatch can re-release the marker. The 07-03 lesson needs reconciling (its "release on every no-post exit" is only correct under early-claim), else the pendulum survives the code fix.
- **Systemic (own row candidate):** 395-row backlog has no user-visible-harm band; a P0-class irreversible-harm fix starved 13d. Matches memory "churn >2 ticks→groom rank-1 band". Recommend PO grooming pass, not another point row.
- **Untriaged:** signal cow-20260715T195340 (MED, cycle-snapshot-latest.json 8d stale promotion never fires) — left NEW, out of this task's scope.
- **Prior carry (still open):** FIX-COWORK-PREFLIGHT-PRESENCE-CLAIM-GAP done_verified 19:02Z tick. RAG-FTS-BUILD-MEMORY-BOUND WITHHELD → ALPHA-S2-RAG-FTS-REBUILD-CRON retune. SYSREMAKE-P2 RC cascade = separate supervised architect dispatch. Gateway /gateway 502 still USER-escalated. UC-RDL-P4 awaits deliberate SPRINT-M kickoff.
