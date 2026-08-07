# Signal-Queue Receiver Delivery Contract — unified-agent / alert-commander

**Task ID:** FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT (P1, plan_only) · **Sibling (lands after this one, per po_ordering_ruling):** FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT
**Agent:** architect · **Date:** 2026-08-07

---

## 1. Verified premise (repro re-checked, one correction)

Confirmed independently (`grep -rln "signal_queue\|signal-dashboard" docs/agents/unified-agent/ docs/agents/alert-commander/` → **zero hits**, and neither `init.md`'s `inter_agent.receives_from` declares a `signal_queue`/dashboard mechanism at all — only `signal_bus`/`docs/signals/*.json`). Both flows are real: `unified-agent/flow/main.md` dispatches strictly by UTC cron window into `chef.md`'s fixed 8-step recipe; `alert-commander/flow/cycle.md` is a thin, deliberately minimal (`no_cycle_headers: true`) dispatcher into 3 sub-flows. Neither has, or references, a `.signal_queue.rows[]` read anywhere. The Receivers table promise is a structural no-op for both `to` values exactly as reported.

**Correction to the repro fixture:** `po-20260720T052606` is **no longer `status=NEW`** — PO triaged it 2026-07-22T15:13:06Z (`triaged_by: "po"`) to `status: "triaged"`, disposition `"FOLD -> FIX-CHEF-L6-GOLD-FALSE-PREDICATE (BACKLOG, high) + FIX-CHEF-L6-TOKEN-PERSISTENCE-RECURRING (BLOCKED, P3) ... durable enforcement is the code fix, not a standing NEW ask."` (both fold targets confirmed still open, `jq` verified). The task-board row's own `po_repro_case`/`po_status_decision` fields (dated 2026-07-21) are **stale** — superseded by PO's own later action and never written back onto this row. This does **not** weaken the finding; it sharpens it: PO's disposition text is itself evidence of the structural gap — faced with an undeliverable channel, PO gave up on the signal reaching unified-agent at all and routed the fix through a separate code-level task instead of trusting delivery. A working receiver contract is what would let PO rely on the channel for the next methodology-flag rather than always minting a side-channel FIX task.

## 2. Decision: **Hybrid** — SSOT-flagged push (cowork-team) + minimal no-op-default consumption step (leaf flow). Rejects pure-(a), rejects (c).

**Why not pure-(a) (full pull/READ step added independently inside `chef.md` and `cycle.md`):**
- Both agents' tool packages mark `task_claim`/`task_heartbeat`/`task_release` **"Phase 2 Ready... not yet active in cycle.md"** — a genuine pull-and-claim step (mirroring dev-team's `0a-D`) would need to newly activate that wiring in two leaf flows that explicitly deferred it. Pure-(a) is a bigger footprint than this row needs.
- It duplicates the CAS-guarded read+claim+mark-READ dance across two more flows — the exact **"documented consumer, no documented producer"** defect class already flagged **5 times** in `spawn-fanout.md`'s own changelog (identity-preamble, session-id-line, flowpath/trigger_prompt consistency, etc.). Centralizing the mechanic once, where the tooling is already active, is the established fix pattern in this codebase, not a new one.
- Both flows are deliberately narrow: `unified-agent/flow/main.md` — *"This dispatcher MUST NOT do synthesis work itself"*; `chef.md` executes a fixed step list; `alert-commander` is *"no cycle headers... silent exit"*. A mandatory per-cycle orch-state.json read (even when empty) works against that minimalism on every one of alert-commander's **every-15-min** fires.
- **Counter-evidence pure-(a) is even viable as designed:** `tran-ngoc-bau` (also cowork-team-fired, `tnb-audit` slot) already implements (a) correctly — `docs/agents/tran-ngoc-bau/flow/bootstrap.md` Step 0b-DASH, loading `signal-dashboard/SKILL.md` § READ, scan `## tran-ngoc-bau`, mark READ. This proves (a) is *possible*; it does not make it the *right* choice for these two agents given the constraints above, and it creates a second hazard below.

**Why not (c) (remove from Receivers table):** both `to` values are live and multi-sender per the table itself (`unified-agent` ← market-watcher/news-scout/digest-predict; `alert-commander` ← market-watcher/news-scout) — removing without a replacement target strands every future methodology-flag/market-signal aimed at either agent with no valid `to`, reproducing the same undeliverable-class problem one level up (senders would have nowhere correct to address a correction). Rejected.

**Why hybrid, not pure-(b):** a push that only appends payload text to the spawn prompt and stops there fixes the *mechanical* problem (row leaves `NEW`) but not the *behavioral* one this row's own cost statement names ("ongoing wrong output, not just a stuck row") — `chef.md` follows a fixed recipe with no step that says what to *do* with unsolicited prompt content. Pure-(b) risks the exact shape PO's disposition already lived through: a directive that is *visible* but never *applied*. The hybrid closes both: push guarantees delivery reaches the agent's context at its next real invocation; a **minimal, no-op-by-default** consumption step gives it exactly one thing to do with it.

**Why the push is *scoped* (SSOT flag), not generic-for-every-`slot.agent`:** `tran-ngoc-bau` is also fired via `cowork-team/spawn-fanout.md` (`tnb-audit` slot) **and already pulls correctly (§ above)**. A generic "push to whatever `slot.agent` matches `row.to`" would create a second, redundant delivery path racing its own working one. The push therefore applies only to slots explicitly flagged for it — see §3.

## 3. Design — Component A: push (`docs/agents/cowork-team/flow/spawn-fanout.md`)

**SSOT flag (no hardcoded agent-name list in the flow file — CLAUDE.md § System Data):** add `"signal_queue_push": true` to the `chef-morning`/`chef-intraday`/`chef-eod`/`chef-evening` and `alert-commander-market`/`alert-commander-critical` slot objects in `docs/data/cowork-schedule.json`. Absent/false (default) for every other slot — `tnb-audit` stays unset since it already self-drains.

**New Step 5.2b**, inserted in `spawn-fanout.md` right after `SESSION_ID_LINE` is composed and **before** `ENTRY_PROMPT` is finalized (same site, same resolve-once-inject-literal pattern already used for `IDENTITY_PREAMBLE`/`SESSION_ID_LINE`):

```
if slot.signal_queue_push == true:
  MATCHED = [r for r in .signal_queue.rows[] if r.to == slot.agent and r.status == "NEW"]
    .sort_by(ts).take(5)                      # oldest-first, bounded — payload-pointer discipline
  CROSS_TEAM_SIGNAL_BLOCK = ""
  for row in MATCHED:
    row_key = "dash:signal_queue:" + row.id
    claim = task_claim(task_id: row_key, task_kind: "dashboard-row", owner_agent: "cowork-team",
                        owner_client_session: $CLAUDE_CODE_SESSION_ID, ttl_seconds: 1800,
                        payload: JSON.stringify({row_id: row.id, from: row.from, type: row.type}))
      # SAME lock namespace/kind dev-team's drain-signals.md §0a-D already uses on this plane —
      # not a new lock class. Never collides in practice (disjoint `to` sets) but forecloses it.
    if not claim.claimed: continue           # held by a peer — skip, leave NEW, log (0a-D semantics)
    mark row NEW -> READ (orch-apply.sh, batched with the existing per-tick orch-state.json write
      this file already performs for its own claim bookkeeping)
    CROSS_TEAM_SIGNAL_BLOCK += "\n- id=" + row.id + " from=" + row.from + " type=" + row.type +
      " severity=" + row.severity + " :: " + row.summary
    task_release(task_id: row_key, owner_client_session: $CLAUDE_CODE_SESSION_ID)

  if CROSS_TEAM_SIGNAL_BLOCK != "":
    CROSS_TEAM_SIGNAL_BLOCK = "\n\n## CROSS-TEAM SIGNAL\n" + CROSS_TEAM_SIGNAL_BLOCK
  # else: append nothing — zero token cost on the (common) empty case, no new call surface
  #   for the leaf agent either way.
```

`ENTRY_PROMPT = IDENTITY_PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE + CROSS_TEAM_SIGNAL_BLOCK` (appended last — never disturbs the existing first-line `trigger_prompt`/`flow_path` consistency check, same ordering rationale already documented for `SESSION_ID_LINE`).

`payload_ref` is passed as a literal path string only — cowork-team never dereferences it; that stays the receiving agent's own concern if it chooses to open it (methodology-flag's canonical `payload_ref` is a notebook path per the Signal types table, not large).

## 4. Design — Component B: consumption step (no-op default)

**`docs/agents/unified-agent/flow/chef.md`**, new **Step 0.3 — Cross-team signal consumption**, between Step 0 (Bootstrap) and Step 0.5 (Published Marker Gate):
> If the entry prompt contains a `## CROSS-TEAM SIGNAL` block: for each row with `type=methodology-flag`, treat its text as an authoritative correction overriding any conflicting hardcoded rule for this cycle (e.g. a literal threshold token must be recomputed live per the flag, not pasted) — log `"[unified-agent] applied cross-team signal <id> from <from>"` in the Step 8b notebook append. Other types: log receipt only (no handler defined yet — extend per-type as needed, same extensibility precedent as `reference.md § Docs to read per signal type`). Block absent → no-op, zero cost, proceed to Step 0.5 exactly as today.

**`docs/agents/alert-commander/flow/cycle.md`**, equivalent block inserted before the Firing Gate section: same `## CROSS-TEAM SIGNAL` parse, log via the existing Step 5 notebook append, no-op when absent.

Neither leaf flow gains a new MCP tool call or activates the dormant `task_claim`/`task_release` wiring — all orch-state.json access/locking stays centralized in `cowork-team`, which already performs it live (published-marker claims, `0a-D`-style per-row locks).

## 5. Design — Component C: doc/registry updates

- `.claude/skills/signal-dashboard/SKILL.md` (already at its documented ≤120L hot-path cap — do not grow it): Receivers table gains one line — *"Delivery mechanism: `po`/`tran-ngoc-bau` self-pull (own flow Step 0b-DASH/pre-check); `unified-agent`/`alert-commander` receive by push injection at scheduled spawn — see reference.md § Receiver Delivery Mechanism."* Full explanation relocates to `reference.md` (the file's own established pattern for anything beyond the hot path).
- `.claude/skills/signal-dashboard/reference.md`: new `## Receiver Delivery Mechanism` section documenting the pull vs push split, the `signal_queue_push` schedule flag, and the latency bound per receiver (unified-agent: next scheduled dish window; alert-commander: ≤15 min during market hours per its cron).
- `docs/agents/unified-agent/init.md` / `docs/agents/alert-commander/init.md`: add `inter_agent.receives_from: {agent: cowork-team, mechanism: signal_queue_push, signal_type: methodology-flag (+ table types), trigger: scheduled_slot_fire}` — closes the frontmatter gap found in §1 (currently neither declares this path at all).

## 6. Lock-plane statement (mandatory per PO's fileplane-split ruling — must not contradict FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD)

**DB plane** — `docs/data/orch/orch-state.json` `.signal_queue.rows[]`: guarded by the existing per-row `dash:signal_queue:<row.id>` `task_claim`/`task_release` lock (`task_kind: "dashboard-row"`, ttl 1800s), first established by dev-team's `drain-signals.md` §0a-D. This contract adds a **second writer to the same plane, using the identical lock namespace/kind** (cowork-team, Component A) — not a new lock class. The two writers never race on the same row in practice (`0a-D` matches `to == po | dev-team-addressed`; Component A matches `to == slot.agent` for `signal_queue_push`-flagged slots — disjoint `to` sets), and the shared lock forecloses even an accidental future overlap.

**File plane** — `docs/signals/*.json` (`mv` from inbox → `processed/`, in `drain-signals.md` §0a-1/0a-2): **unchanged and out of scope.** Component A reads/writes only the single CAS-guarded `orch-state.json` document via `orch-apply.sh`; it never touches `docs/signals/*.json`, never calls `mv`. `router_fileplane_lock_asymmetry_20260721T1946`'s unguarded peer-collision gap on that plane is exactly what `FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD` owns — this contract does not touch, fix, or contradict it.

## 7. Acceptance criteria

1. A `.signal_queue.rows[]` row with `to=unified-agent` (or `alert-commander`) and `status=NEW` transitions to `READ` within one scheduled fire of that agent after this ships — bounded by that agent's own cron cadence (alert-commander: ≤15 min market hours; unified-agent: up to next dish window), never structurally undeliverable again.
2. Live/test verification: post a test row `to=unified-agent`; confirm the next `chef-*` slot's composed `ENTRY_PROMPT` (observable in cowork-team's own dispatch log) contains a `## CROSS-TEAM SIGNAL` block and the row flips `NEW→READ` in the same tick.
3. Empty-case cost: a cycle with zero matching `NEW` rows adds **no** new MCP tool call inside `chef.md`/`cycle.md` and **no** text to `ENTRY_PROMPT` — verified by inspecting a clean-cycle spawn prompt.
4. `tran-ngoc-bau`'s existing Step 0b-DASH pull path is untouched and never receives a duplicate push (its slot carries no `signal_queue_push` flag).
5. §6's lock-plane statement ships verbatim (or materially equivalent) in the shipped doc set, so `FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD` is not blocked by an apparent contradiction.
6. `.claude/skills/signal-dashboard/SKILL.md` stays ≤120 lines (current: 120 — any net addition must be offset by relocating existing text to `reference.md`, matching this file's own established discipline).

## 8. Files

- `docs/data/cowork-schedule.json` — add `signal_queue_push: true` to the 6 named slots.
- `docs/agents/cowork-team/flow/spawn-fanout.md` — new Step 5.2b (push + reused dashboard-row lock + mark READ), `ENTRY_PROMPT` composition extended.
- `docs/agents/unified-agent/flow/chef.md` — new Step 0.3 (no-op-default consumption block).
- `docs/agents/alert-commander/flow/cycle.md` — equivalent minimal consumption block before the Firing Gate.
- `docs/agents/unified-agent/init.md`, `docs/agents/alert-commander/init.md` — `inter_agent.receives_from` entry.
- `.claude/skills/signal-dashboard/SKILL.md` — Receivers table: one-line delivery-mechanism annotation (no net growth — offset by relocation below).
- `.claude/skills/signal-dashboard/reference.md` — new `§ Receiver Delivery Mechanism` section.
- **Unchanged, confirmed out of scope:** `docs/agents/dev-team/flow/drain-signals.md` (its `§0a-D` pull-drain for `po`/dev-team-addressed rows is untouched); `docs/agents/tran-ngoc-bau/flow/bootstrap.md` (existing correct pull path, untouched); `FIX-DRAIN-FILEPLANE-PEER-COLLISION-GUARD`'s own scope (file-plane lock, separate row, separate owner).

## 9. DDD / zone

Zone: `cross-service/` (multi: `docs/agents/cowork-team/flow/`, `docs/agents/unified-agent/flow/`, `docs/agents/alert-commander/flow/`, `.claude/skills/signal-dashboard/`). **BUILD-STANDARD: not-applicable** — bug-fix/contract-fix on existing flow docs + one JSON schedule flag; no new service, no new primitive, no application code. Not plan_only downstream — PM should decompose into developer-owned subtasks (flow-doc edits, no code); recommend landing `FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT` (ordered after this one per PO) only once Component A's lock-reuse pattern here is settled, since that sibling touches the same `0a-D`/dashboard-row lock family.
