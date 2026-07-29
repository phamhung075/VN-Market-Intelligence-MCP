# Architecture Brief — FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS

**Date:** 2026-07-29 · **Architect** · **Zone:** cross-service (`.claude/skills/dispatch-claim/SKILL.md`, `CLAUDE.md`, `scripts/agents-flow/`, `docs/agents/cowork-team/flow/spawn-fanout.md` annotation only)
**Input:** `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` (7 FR, 6 EC, zero PO blockers) + board row `po_corroboration_20260729T0858` (4th data point, both-sides-captured near-miss)
**Mode:** plan_only — design/ratification only, no production code in this cycle.
**BUILD-STANDARD:** not-applicable (protocol/flow-doc change + one new test script; no `apps/mcp-server` code required — confirmed by reading the live tool surface, §4).

---

## 1. Ruling — Candidate A (refined), Candidate B rejected

**Decision: Candidate A, refined into a kind-scoped, prefix-matched read probe — NOT BA's literal Candidate A (exact period-key probe) and NOT Candidate B (shared namespace).**

### Why Candidate B is rejected despite its cleaner atomicity

`task_claim`/`task_list_held` match by **exact string equality** on `task_id` (BA's own confirmed root-cause finding). Candidate B requires the router to construct the *exact* `published:<slot_id>:<period>` string as its own outer-wrap `task_id` — which means the router must reproduce, for all 9 cowork agents, the same date-basis computation each flow currently owns:

- 4 distinct `publish_date_basis` values already in the schema (`vn_date`, `utc_date`, `iso_week_period`, `vn_date_saturday_anchor` — `docs/data/cowork-schedule.json` `_dish_type_catchup_config`/per-slot fields).
- `chef.md` alone has a THIRD axis on top of that: single-fire slots key on `CYCLE_DATE_UTC` (pinned once, reused at 3 downstream surfaces) while the multi-fire `chef-intraday` slot keys on `WORK_DATE + VN_HOUR` — a per-window, not per-day, key (`docs/agents/unified-agent/flow/chef.md:67-100`).
- `tnb-audit`'s basis was moved from weekly ISO-`periodKey` to daily **as recently as today** (`FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON`, `docs/agents/cowork-team/flow/spawn-fanout.md` published-marker-gate comment).

This exact computation has changed **3 times in the last two weeks** (chef-evening dup-date mislabel, chef-intraday marker cadence, tnb-audit weekly-vs-daily). Candidate B would force every one of those future changes to land in **two places simultaneously** (the owning flow AND the router's shadow copy) or silently reintroduce the class of bug FR-6 already names for `CLAUDE.md`/`SKILL.md` drift — a DDD layering violation on top of the drift risk: date-basis computation is domain-specific to each cowork flow, not router/interface-layer business. Candidate B buys atomicity at the cost of duplicating fragile, agent-specific logic at the one layer (`CLAUDE.md`/`dispatch-claim/SKILL.md`) explicitly designed to be agent-agnostic.

### The refinement that makes Candidate A cheap-AND-correct

BA's Candidate A assumed the router still needs to compute the exact `published:<slot_id>:<period>` string to probe it. **It does not.** Read live: `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:794-835` (`listHeldTasks`) and `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts:220-241` (`task_list_held` Zod schema) — the tool already supports `kind` + `owner_agent` + `expired` filters and returns the **full row set** (`task_id`, `owner_client_session`, `expires_at`, …) for a `kind` match; there is no server-side task_id-prefix filter, but the caller gets every currently-live row back and can filter client-side by string prefix.

Confirmed from BA's own table (§0): `cron:cowork:<TICK>`, `cowork-slot:<slot_id>`, and `published:<slot_id>:<period>` **all three share `task_kind: "cowork-slot"`.** One call — `task_list_held(kind="cowork-slot", expired=false)` — returns every live cowork-side lock in one round trip. The router then filters client-side for:
- `task_id == "cowork-slot:" + slot_id` (exact), or
- `task_id` starts with `"published:" + slot_id + ":"` (prefix — deliberately NOT the exact period string, so daily/weekly/per-window keys all match without the router ever computing a date, hour, or ISO week).

Zero date/timezone/cadence logic duplicated. Zero new `apps/mcp-server` code (the `expired` param already exists — the tool doc at `docs/agents/tools/list/task_list_held.md` is stale and under-documents it; flagging as a 1-line doc-sync gap, non-blocking). This is also **not a new primitive** — it generalizes a pattern already ratified in this exact SKILL file: the Orphan-Adoption Probe's own resume-contract table already reads `cowork-slot → probe published:<kind>:<period> via task_list_held → if present, skip` (`dispatch-claim/SKILL.md` § Resume contract summary). This brief extends that same read-only-probe idea from "orphan-resume only" to "every fresh cowork-slot intent dispatch," rather than inventing a second mechanism.

### Residual risk — bounded, not silently ignored (EC-3)

Two distinct race windows remain, both explicitly accepted (neither Candidate A nor B closes either — BA flagged this and asked for an explicit bound, not a fix):

1. **Probe-to-spawn TOCTOU** (new, inherent to any read-then-act check): the gap between the `task_list_held` read and the router's own subsequent Phase B claim + `Agent()` call. Bounded to two sequential tool calls — sub-second, vs. the 33s/41s windows observed in all 3 confirmed incidents. Not zero, but 1-2 orders of magnitude smaller than every incident this row exists to close.
2. **Cowork spawn-to-first-gate window** (BA's EC-3, pre-existing, not created by this fix): between cowork's dispatcher releasing its own `cowork-slot:<slot_id>` token (right after the backgrounded `Agent()` call returns — `slot-claim.md` Step 4.6 try/finally) and the spawned agent's own flow reaching its `published:` claim step (chef.md Step 0.5, tran-ngoc-bau Step G, etc.), **neither `cowork-slot:` nor `published:` is held**, so this probe (like Candidate B) would see no collision and let a peer router dispatch through. This window is bounded by each target flow's time-to-first-gate-step (near-immediate for chef.md — Step 0.5 runs right after bootstrap). **Not observed in any of the 3 confirmed occurrences** (all 3 confirmed cases had `published:`/equivalent already held at collision time) — this is a theoretical residual, correctly out of scope for this row's AC. Recommended (not required) follow-up: have each spawned flow claim `published:`/an interim in-flight marker as literally its first action, shrinking this window toward zero — flag to PM as an optional future row, do not fold into this one.

---

## 2. Multi-slot resolution rule (FR-2 / EC-1)

**Rule: intent-key-IS-slot_id is the required convention for cowork-slot agents; ALL-SLOTS conservative fallback when it isn't.**

```
AGENT_SLOTS = jq --arg a "<agent>" '[.slots[] | select(.agent==$a) | .slot_id]' docs/data/cowork-schedule.json

if <intent-key> ∈ AGENT_SLOTS:
    TARGET_SLOTS = [<intent-key>]     # unambiguous — mirrors the EXISTING cowork trigger_prompt
                                       # convention "run <flow_path> slot=<slot_id>" already used by
                                       # all 23 live slots (docs/data/cowork-schedule.json .slots[].trigger_prompt)
else:
    TARGET_SLOTS = AGENT_SLOTS         # generic/manual intent-key (e.g. "run market-watcher now",
                                        # dispatch/SKILL.md's own documented exceptional-manual-spawn case)
                                        # → conservative superset: check EVERY slot this agent owns
```

Why this resolves EC-1 without new schema or new inference logic:
- `tnb-audit` (single-slot) already satisfies the first branch today — this is why occurrence 3's RAW proof shows `intent:tran-ngoc-bau:tnb-audit` naming the slot directly; the rule simply formalizes and generalizes the pattern that already works for the one agent where it happens to be unambiguous.
- For the 8 multi-slot agents, the router is not being asked to *guess* which slot a free-text intent-key means (BA's ambiguity concern) — it is being told: if you don't know, don't guess, check all of them. A false-positive block (e.g., a manual `market-watcher` dispatch blocked because `market-watcher-eod` — not `market-watcher-offhours` — happens to be live) costs one skipped manual spawn with a clear telegram + log line; a false negative reproduces the exact defect class this row exists to close. Given `dispatch/SKILL.md` itself frames manual cowork-agent spawns as "exceptional cases," a conservative bias toward blocking is the correct asymmetry here (same cost-asymmetry reasoning as the sibling `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` brief's Ruling 2, §3 of that doc).
- **Recommended convention going forward (not a schema change, a discipline note for FR-6's doc update):** whenever the router or any agent composes a *deliberate* cowork-slot dispatch, it should name a real `slot_id` as the intent-key whenever one is determinable (e.g. nearest-cron-match for "run market-watcher now"), so the common case stays on the unambiguous branch and the ALL-SLOTS fallback is rare in practice.

---

## 2.5 Assumptions this ruling depends on (falsifiable)

Documented in case a future breaking change to any of these invalidates the whole design (fail-loud principle — better named than silently trusted):
- `task_list_held`'s `expired` param continues to exist and behave as read live (`coordinationTools.ts:234-240`) — if removed, the probe must fall back to filtering `expires_at` client-side (trivial, no design change, just an extra comparison).
- All three cowork-side locks continue to share `task_kind: "cowork-slot"` — if a future change splits them into distinct kinds, the probe must issue N calls instead of 1 (still cheap, still no date-basis duplication — the design does not depend on them sharing a kind for *correctness*, only for round-trip efficiency).
- `docs/data/cowork-schedule.json` remains the live SSOT for `.slots[].agent` / `.slots[].slot_id` (already mandated by `CLAUDE.md` § System Data — Never Hardcode).

---

## 3. File-level design (who owns what)

| # | File | Change | Owner (dev-chain role) |
|---|---|---|---|
| 1 | `.claude/skills/dispatch-claim/SKILL.md` | New `## Step 2.4 — Cowork-Slot Cross-Path Collision Probe` section, inserted between existing `§ Phase A.5 — Presence Roster Read` and `§ Pattern — Router-Scope Dispatch Wrap (Phase B)`. Implements FR-1 (recognize cowork-slot agent via `cowork-schedule.json`), FR-2 (resolution rule above), FR-3/FR-4 (probe + symmetric log/telegram/EXIT reusing the EXACT peer-collision response text already in Phase B). | `developer` (generic dev-chain, not a microservice zone — matches board row's own `zone: cross-service/`) |
| 2 | `CLAUDE.md` § "BEFORE spawning any agent — MANDATORY" | **1-line diff.** This file is already a thin pointer post `aef457f38` ("shrink CLAUDE.md step 2.5 to pointer + 3-outcome table") — no re-paste risk to reintroduce. Change line 2.5's phase list from `"...Phase A.5 (presence roster, advisory) + Phase B (claim gate)"` to `"...Phase A.5 (presence roster, advisory) + Step 2.4 (cowork-slot collision probe, cowork-slot agents only) + Phase B (claim gate)"`. No new outcome-table row needed — Step 2.4's own EXIT path reuses the identical 3rd row ("Peer collision" → log → telegram → EXIT) already in the table, just against a different lock namespace. | `developer` (same commit as #1 — same logical change, split across 2 files, must land together per FR-6) |
| 3 | `docs/data/cowork-schedule.json` | **No edit.** Read-only SSOT input for FR-1/FR-2 (already confirmed: 9 agents, 23 slots, `.slots[].agent`/`.slots[].slot_id` fields exist and are queryable via `jq` today). | n/a |
| 4 | `docs/agents/cowork-team/flow/spawn-fanout.md` § Published marker gate comment | **Cross-reference annotation only**, no logic change (matches BA's fix-set item 4 exactly): add one comment line pointing at the new `dispatch-claim/SKILL.md § Step 2.4` so a future maintainer editing the marker-key logic here knows a router-side probe reads the same key namespace and needs no update (prefix-match, not exact-key — cheapest form of "this doesn't need touching, here's why"). | `developer` |
| 5 | `scripts/agents-flow/<new>.test.sh` (name: `cowork-dispatch-collision-probe.test.sh`, mirrors `cowork-guaranteed-slot-firer.test.sh` naming) | **New.** FR-7 live reproduction harness — see §4. | `developer` |
| 6 | `apps/mcp-server/**` | **No change.** `task_list_held`'s `expired` filter and `owner_client_session` field are already live and correctly wired (`coordinationTools.ts:220-263`, `coordinationStore.ts:794-835`) — confirmed by direct read, not assumed. | n/a |

No domain-layer file in scope. No `dev-*` microservice zone touched — this is core router/dispatch-constitution work, consistent with the board row's own `zone: cross-service/`.

---

## 4. FR-7 verification harness — design

Live, not mocked (same convention as `cowork-match-slots.test.js`, `cowork-guaranteed-slot-firer.test.sh` — the bug is fundamentally about live cross-session coordination-store state, per BA's own framing). Three cases, each against the real coordination store:

1. **Reproduce occurrence 3 exactly (must now BLOCK, previously did not):**
   `task_claim(task_id="published:tnb-audit:<today>", task_kind="cowork-slot", owner_agent="tran-ngoc-bau", owner_client_session="sim-cowork-A", ttl_seconds=100800)` → then run the new Step 2.4 probe logic as `owner_client_session="sim-router-B"` for `agent=tran-ngoc-bau, intent-key=tnb-audit` → assert: collision detected, EXIT taken, Phase B's `task_claim(intent:tran-ngoc-bau:tnb-audit)` is **never invoked** (previously: `claimed:true`, spawn proceeded).
2. **Ambiguous multi-slot case:** claim `cowork-slot:market-watcher-eod` as `sim-cowork-A` → run the probe for `agent=market-watcher, intent-key="market-watcher"` (not a real slot_id) → assert `TARGET_SLOTS` resolves to both `market-watcher-offhours` and `market-watcher-eod`, and the collision on the latter blocks the dispatch.
3. **Negative control (byte-identical-behavior guard, FR-5):** no live cowork-side lock held → assert the probe finds nothing and falls through to Phase B unchanged; separately assert a **non-cowork** agent (e.g. `ba`) never enters the probe at all (Step 2.4's own `<agent> not in COWORK_AGENTS` short-circuit).

Cleanup: release all simulated claims via `task_release` in a `finally`/trap, matching existing test-script convention.

---

## 5. Risk flags

- **Doc-sync gap (non-blocking, cheap to fix in the same commit):** `docs/agents/tools/list/task_list_held.md` does not document the `expired` param that this design relies on — 1-line addition, bundle into #1's commit so the tool doc doesn't lag behind a design that now depends on it being known/discoverable.
- **FR-6 lockstep discipline still applies** even though the diff is now tiny (1 line in `CLAUDE.md` + new section in `SKILL.md`) — both must land in the **same commit**, not sequenced, or a fresh router session reads a `CLAUDE.md` pointer to a phase list that doesn't yet exist in `SKILL.md` (or vice versa: `SKILL.md` gains Step 2.4 but `CLAUDE.md`'s own phase-list line still says "Phase A.5 ... Phase B", silently skipping it — this is the exact single-point-of-truth violation this row exists to close, just relocated one layer down if not disciplined here too).
- **Do not conflate closure with the sibling rows** (per this board row's own note, restated for PM): `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` (single-session same-tick self-refire) and `FIX-ROUTER-COWORK-SLOT-DEMAND-DISPATCH-BLIND` (router demand-dispatch bypassing the tick election entirely, distinct code path from the `intent:` PRE-CLAIM this row fixes — plausibly the actual mechanism behind the `po_corroboration_20260729T0858` chef-eod near-miss, since that incident's winning claim came from a "router" session reaching `chef.md` directly rather than via a mismatched `intent:` key) are NOT closed by this fix and must not be marked resolved on this row's strength alone.

---

## RETURN
DONE: Ruled Candidate A (refined: kind-scoped `task_list_held(kind="cowork-slot", expired=false)` + client-side prefix match, zero date-basis duplication) over Candidate B (rejected — forces router to duplicate fragile, 3x-recently-changed per-flow date-basis logic, a DDD layering violation) and over BA's literal Candidate A (which assumed exact period-key computation was required — it is not, confirmed by reading the live tool surface). Multi-slot resolution rule: intent-key-IS-slot_id required convention (mirrors existing `trigger_prompt` convention), ALL-SLOTS conservative fallback when it isn't. File-level design confirmed for all 6 fix-set items; zero `apps/mcp-server` code required (confirmed live, not assumed). 2 residual race windows bounded and explicitly accepted per EC-3 (not silently ignored, not fixed in this row).
NEXT: pm — decompose into atomic dev tasks per §3 (items 1+2 same commit, mandatory; item 5 test-first per dev-standards). SUPERVISED HOLD in effect (board `supervised:true`) — do not auto-dispatch past architect without supervisor go-ahead.
HANDOFF: `docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md` (BA spec, unchanged) + this brief.
PIPELINE: continue (supervised — do not auto-advance past architect per board `supervised_note`)
