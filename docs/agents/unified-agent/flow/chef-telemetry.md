<!-- size-justification: 129L — telemetry scaffolding extracted from chef.md (S1 split); ENTRY/CLOSE/FAILED/SILENT/RETURN block specs + try/catch boundary declarations are operationally dense and non-reducible. FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (architect brief 2026-08-07, FOLLOW-UP-1, agent-father 2026-08-13): +51L (78→129, header's own prior "55L" was already stale pre-edit — corrected here) — new § Degraded-Floor Recovery + § True-Abort Fallback sections (this is the single reachable target every chef.md/chef-dish.md Checkpoint pointer jumps to; splitting it further would break the single-enforcement-point guarantee the whole anti-bail spec depends on) plus Try/Catch Boundary widened to start at Step 0.5 (was ENTRY Telemetry) and a new budget-pressure-self-detected failure mode. No new sub-flow extraction candidate — in-place growth + 2 new sections, same file this whole spec is designed to centralize into. -->
> Parent: [./chef.md](./chef.md)

# Unified Agent — Chef Telemetry Spec

Defines all telemetry events emitted during a chef cycle. Referenced from chef.md at ENTRY, CLOSE, FAILED, and SILENT paths.

**CRITICAL: send_telegram call contract (FIX-CHEF-SENDTELEGRAM-ARGSHAPE)**
Every `send_telegram(...)` call below MUST use the named-parameter record form: `send_telegram(channel="<channel>", message="<message_text>")`. Never bare-string. Pattern: `send_telegram(channel="work", message="[chef] <event>")` — the `channel=` and `message=` parameter names are mandatory.

---

## ENTRY Telemetry

Immediately after Bootstrap, before any GATHER reads:

1. Construct `cycle_id = chef-{$DISH_TYPE}-{YYYYMMDDTHHmmZ}` from `$DISH_TYPE` and slot fire time (not wall-clock). Example: `chef-morning-20260519T0523Z`.
2. Emit:
   ```
   send_telegram(channel="work", message="[chef] START {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id}")
   ```
3. Store `cycle_id` and `slot_utc` in session state — reused verbatim in CLOSE and FAILED messages.

---

## Try/Catch Boundary

<!-- FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (architect brief 2026-08-07, FOLLOW-UP-1 §2.4): start point
     pinned to Step 0.5 (the marker claim, the earliest possible state-changing action of the
     cycle) — a failure between the marker claim and ENTRY Telemetry was previously invisible to
     this boundary by construction. End point extended from Step 7 to the Degraded-Floor Recovery
     attempt below, so the catch is reachable from ANY partial state, Steps 0.5 through 8, not just
     a bail after Step 7. -->

> **try block begins at Step 0.5 (the published-marker claim, `chef.md`) — wraps Steps 0.5 through 7 inclusive.** ENTRY Telemetry fires immediately after Bootstrap, still inside this block.
> Any unhandled exception first attempts **§ Degraded-Floor Recovery** below (never a silent exit); only if that recovery attempt itself cannot complete does the try block truly end — emit FAILED (see below), then EXIT non-zero. No MARKET dish. No Step 8.
>
> **Failure modes that must produce FAILED telemetry or trigger Degraded-Floor Recovery (never a silent exit):**
> - `tool-error` — MCP tool raised an exception after 1 retry
> - `signal-read-fail` — docs/signals/ unreadable or empty when signals expected
> - `self-abort-no-exception` — agent chose to stop mid-flow without an exception (e.g. English self-refusal prose). Emit `FAILED` with `reason="self-abort-no-exception"`. This is a PO-defined violation; it must be observable on WORK channel.
> - `budget-pressure-self-detected` (NEW, FIX-CHEF-MIDFLOW-BAIL-DETERMINISM) — the agent's own assessment that it cannot complete remaining steps within its remaining budget. Soft/self-reported by construction; not a guarantee that this condition is ever named explicitly before a bail — this is why every step boundary below also carries its own Checkpoint pointer rather than relying solely on this named branch.

> **try block ends at the Degraded-Floor Recovery attempt (§ Degraded-Floor Recovery below), not at Step 7.** Step 8 runs outside the try block — its errors fall through to cowork-boundary default rule (1 retry → BUG Telegram → EXIT).

---

## § Degraded-Floor Recovery

<!-- FIX-CHEF-MIDFLOW-BAIL-DETERMINISM (architect brief 2026-08-07 §2.3, FOLLOW-UP-1): generalizes
     chef.md Step 1's pre-existing source-down-only Degraded-dish floor into a universal,
     checkpoint-driven recovery procedure reachable from every step boundary in chef.md AND
     chef-dish.md (Steps 0.5 through 8), not just the one named branch the first two real-world
     occurrences hit (2026-07-16, 2026-07-17 chef-eod) — widened after a 3rd occurrence
     (2026-07-29 chef-intraday) proved the bail can also be triggered by resource exhaustion at
     ANY step, not only the named 'scope clarification' branch. Reads only already-named session
     variables — nothing new invented. -->

**Entry condition (ANY of):**
- `self-abort-no-exception` (Try/Catch Boundary above)
- `tool-error` after 1 retry (Try/Catch Boundary above)
- `signal-read-fail` (Try/Catch Boundary above)
- Supplementary source down (`chef.md` Step 1's Degraded-dish floor trigger — folded in here)
- `budget-pressure-self-detected` (Try/Catch Boundary above)
- Any other uncaught exception reaching this catch boundary, at any step from 0.5 through 8
- Any `chef-dish.md` **Checkpoint** pointer (after Steps 1.5, 2, 3, 4, 5, 6, 6.5, 6.7) or `chef.md` Step 1's checkpoint firing because execution cannot continue past that point

**Procedure (reads directly from the flow's own already-named session-state variables — nothing new invented):**
1. Read whatever of these already exist this cycle: qualifying clusters (`chef.md` Step 1), `MACRO_HEALTH` (`chef-dish.md` Step 1.5), any Layer 2/3/4 narrative fragments composed so far, `conviction_calls[]` (`chef-dish.md` Step 4, partial), `$L5_GAP_TOKEN` / `$L6_GAP_TOKENS` (`chef-dish.md` Steps 5/6, if reached).
2. For every TNB layer **not yet reached**, append `[gap:<layer>_not_reached_partial_cycle]` — a new reason-suffix on the *existing* gap-token vocabulary (`chef-dish.md` Step 7.5 already has `[gap:L2_...]`, `[gap:L3_...]`, `[gap:business_context_absent]`, etc.).
3. Force `$QUALITY_VERDICT = degraded` (`chef-dish.md` Step 7.5's gate already computes this once gap tokens exist — no new scoring logic).
4. Compose a **minimal** Block A (2-3 sentences, clusters + whatever narrative exists, omit unreached layers cleanly — reuses the exact "omit cleanly" rule `chef.md` Step 1's degraded floor already specifies) and Block B (WORK detail, all gap tokens + a `partial_cycle_recovery: true` marker).
5. Enter `chef-dish.md`'s existing Step 7 → 7.5 → 7.6 → 8 machinery with this minimal content as input. No new publish/persist/log code path — this is the same pipe every dish already uses, just fed a thin payload.
6. **Only if step 4/5 itself cannot complete** (e.g. `send_telegram` is erroring, or session state is empty because the cycle died before Step 1 ever ran) — this is the genuine, unrecoverable abort case. Go to **§ True-Abort Fallback** below.

---

## § True-Abort Fallback (Degraded-Floor Recovery itself failed)

Emit FAILED telemetry (below) AND attempt a release call — but **gated, never a raw `task_release`**.

**Release-call gate (no-op/log-only stub until UC-CCA-P3's Release Gate ships):** the ONLY sanctioned release mechanism for a `published:*` marker is UC-CCA-P3's Published Marker Release Gate (`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md`, to live in `docs/agents/cowork-team/flow/spawn-fanout.md`). That gate is **NOT YET SHIPPED**. Until it ships:
- Do **NOT** call `task_release` on the `published:*` marker claimed in `chef.md` Step 0.5 — the following is a no-op/log-only stub, never a real release call.
- Log only: `[chef] ABORT no-release marker={MARKER_KEY} reason={failure_reason} — release deferred to UC-CCA-P3 Release Gate (not yet shipped); marker self-heals via TTL`
- This is not a weaker stopgap invented for this fix — it is *already* the documented safe practice in this system (a raw, ungated release has previously caused both a double-publish, 2026-07-02, and a leaked-marker-suppresses-legit-dish regression, 2026-07-03; `UC-CCA-P3`'s 2026-07-29 corroboration note independently confirms the dispatcher correctly did NOT release for the same reason).
- Once UC-CCA-P3's Release Gate ships, this stub is replaced with a real call into that gate — cross-reference by name only; do not reimplement the gate's own delivery-evidence check here.

EXIT non-zero after logging. No partial MARKET dish beyond whatever § Degraded-Floor Recovery already sent before this fallback triggered.

---

## SILENT Telemetry (intraday, 0 clusters)

```
send_telegram(channel="work", message="[chef] SILENT intraday | slot={slot_utc} | cycle={cycle_id} | clusters=0")
```

`slot_utc` and `cycle_id` are from ENTRY session state. The try block ends here for the silent path — EXIT after this send.

---

## CLOSE Telemetry (success)

After notebook append in Step 8, emit:

```
send_telegram(channel="work", message="[chef] SENT {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id} | clusters={N} | convergence={true|false}")
```

Fields:
- `cycle_id` and `slot_utc` — from ENTRY session state (verbatim, no reconstruction)
- `N` — count of clusters that qualified in Step 1
- `convergence` — `true` if ≥1 cluster qualified in Step 1, `false` if 0 clusters (Morning/EOD/Evening publish with 0 clusters is still a SENT, not SILENT)

---

## FAILED Telemetry

Catch block (handles any unhandled exception from Steps 0–7):

1. ```
   send_telegram(channel="work", message="[chef] FAILED {$DISH_TYPE} | slot={slot_utc} | cycle={cycle_id} | reason={failure_reason}")
   ```
   `failure_reason` = exception message or tool name that raised, one line, no newlines.
2. ```
   send_telegram(channel="bug", message="[chef] {failure_reason}")
   ```
   Per cowork-boundary on_error rule.
3. EXIT non-zero. No partial MARKET dish. Do NOT proceed to Step 8.
