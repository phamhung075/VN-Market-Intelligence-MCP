# BA Spec — FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS

**Task:** FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS · P0 · zone `cross-service/` · supervised:true · plan_only:true
**BA date:** 2026-07-23
**Occurrence lineage:** 3 confirmed live occurrences — 2026-07-15 chef-evening/unified-agent MARKET double-publish (ids 932+933); 2026-07-15 tnb-audit/tran-ngoc-bau dual c110 audit; 2026-07-21 tnb-audit RAW session-log proof (occurrence 3, timestamps below). `detail_ref`: `docs/handoffs/2026-07-15-tnb-audit-double-dispatch-unreachable-marker-gate.md`.
**Verdict:** Spec complete. **Zero PO blockers** — PO's own board note already resolved priority, scope-vs-sibling boundary, and narrowed the fix to two named candidate directions, explicitly leaving the choice ("ba/architect own HOW") plus the multi-slot resolution rule to this decomposition. **NEXT: architect.**

---

## 0. Root cause — confirmed, with literal `task_id` formats

Four distinct locks exist across the two dispatch paths. `task_claim`/`task_list_held` match by **exact string equality** on `task_id` — there is no prefix-aware or fuzzy matching in the coordination store. None of the four literal formats below share a common string, so a claim on one is invisible to the other three.

| # | Path | Owning doc | Literal `task_id` | `task_kind` | TTL | Held for |
|---|---|---|---|---|---|---|
| 1 | Router intent PRE-CLAIM | `CLAUDE.md` §"BEFORE spawning any agent" + `.claude/skills/dispatch-claim/SKILL.md` § Pattern (Router-Scope Dispatch Wrap) | `"intent:" + <agent> + ":" + <intent-key>` | `intent` | 600s | Only the router's own dispatch attempt — released in `finally` right after `Agent()` returns, NOT while the spawned agent runs |
| 2 | Cowork fire-election (tick leader) | `docs/agents/cowork-team/flow/leader-lock.md` Step 0b.2 | `"cron:cowork:" + TICK` (TICK = floor-to-15min ISO-8601 UTC) | `cowork-slot` | 600s | Released explicitly at `telemetry.md` Step 6, end of dispatch tick (~seconds) |
| 3 | Cowork per-slot idempotent token | `docs/agents/cowork-team/flow/slot-claim.md` Step 4.6 | `"cowork-slot:" + slot_id` (suffix-free) | `cowork-slot` | 180s | Released immediately after each spawn attempt (`spawn-fanout.md` Step 5.2 try/finally) — sub-second to a few seconds, NOT the spawned agent's runtime |
| 4 | Published marker (cross-work-window dedup) | `spawn-fanout.md` § Published marker gate (FR-P2-7); claimed **inside each spawned agent's own flow** (verified live in `tran-ngoc-bau/flow/main.md` Step G) | `"published:" + slot_id + ":" + work_date` (daily, TTL 100800s/28h) OR `"published:" + slot_id + ":" + periodKey` (weekly, TTL 691200s/8d, via `get_week_period`) | `cowork-slot` | 28h / 8d | The **only** lock that spans the actual work window — but only from the moment the spawned agent's own flow reaches its gate step, not from spawn time |

**RAW proof (occurrence 3, 2026-07-21 — both timestamps read live from `task_list_held`, not agent self-report):**
- `20:24:33Z` — cowork dispatcher session `9f4a6bfc-b001-4349-8a44-545f24c1b0ac` (owner_agent `tran-ngoc-bau`) holds `published:tnb-audit:2026-07-20/2026-07-26`.
- `20:25:14Z` — a **second, independent router session** `8def3b83-8326-4a26-a663-2f2616dfc38e` calls `task_claim(task_id="intent:tran-ngoc-bau:tnb-audit")` → returns `claimed:true`. 41 seconds into a live, actively-held cowork run of the identical slot — the router path never queried key #4, the only key the cowork path was holding at that instant.

This is the confirmed root cause, not a hypothesis: **`task_claim` provides zero mutual exclusion across the router-intent path and any of the three cowork sub-locks by construction** (disjoint keyspaces), independent of any race-window timing.

---

## 1. DDD layer mapping

**Interface layer** (dispatch protocol documents — the decision surface; no runtime code touched by the fix as currently scoped):
- `CLAUDE.md` § "BEFORE spawning any agent — MANDATORY" — embeds the Phase B claim pattern **inline**, duplicating the SKILL.md copy below. Any procedural change must land in both files in the same commit (see FR-6).
- `.claude/skills/dispatch-claim/SKILL.md` § "Pattern — Router-Scope Dispatch Wrap" — canonical Phase B PRE-CLAIM logic.
- `docs/agents/cowork-team/flow/leader-lock.md` Step 0b.2 (fire-election), `slot-claim.md` Step 4.6 (per-slot token), `spawn-fanout.md` § Published marker gate (documents the contract; the dispatcher itself never claims it — the spawned agent owns it).
- Each of the 9 cowork-slot agents' own marker-claim step (`tran-ngoc-bau/flow/main.md` Step G verified line-by-line this cycle; `unified-agent/flow/chef.md`, `digest-predict`, `fb-market-poster`, `market-watcher`, `alert-commander`, `news-scout`, `bctc-analyst`, `refine_bctc_md` implement the same FR-P2-7 pattern per `spawn-fanout.md`'s own "6 copy-paste sites" language — architect should re-verify each is actually reachable, not assume, per the tnb precedent where this exact gate was dead code for 14 cycles).
- `docs/data/cowork-schedule.json` — SSOT for the agent→slot_id mapping the fix needs (CLAUDE.md "System Data — Never Hardcode" applies; there are 9 agents / 23 slots as of this cycle).

**Infrastructure layer:**
- `apps/mcp-server` `coordinationStore.ts` / `coordinationTools.ts` (`task_claim`/`task_list_held`) — the underlying keyed-mutex primitive. BA finds **no evidence this layer needs a code change** for either candidate direction below (both are pure calling-protocol changes); flag to architect only if the chosen direction needs a new server capability (e.g. resolving one key against multiple aliases server-side).

**Domain layer:** none — 100% orchestration/coordination mechanics, no market-data business logic.

---

## 2. Requirements

### FR-1 — Recognize cowork-slot agents at router PRE-CLAIM time
**DDD:** interface (`dispatch-claim/SKILL.md` + `CLAUDE.md`)
Before Phase B PRE-CLAIM proceeds, the router must determine whether `<agent>` in the about-to-be-claimed `intent:<agent>:<intent-key>` is one of the known cowork-slot agents (currently 9: `unified-agent`, `digest-predict`, `tran-ngoc-bau`, `bctc-analyst`, `news-scout`, `market-watcher`, `refine_bctc_md`, `fb-market-poster`, `alert-commander` — read from `docs/data/cowork-schedule.json` `.slots[].agent`, never hardcoded). If not a cowork-slot agent → behavior unchanged.

### FR-2 — Resolve intent-key → slot_id
**DDD:** interface
When `<agent>` **is** a cowork-slot agent, resolve which `slot_id` the intent-key corresponds to via `cowork-schedule.json`. **Edge case:** several agents own multiple slots (chef→4, digest-predict→2, bctc-analyst→4, news-scout→2, market-watcher→2, refine_bctc_md→4, fb-market-poster→2, alert-commander→2). The mapping is unambiguous only when the intent-key already equals the slot_id (true for `tnb-audit`, occurrence 3's case) — a generic intent-key like `"chef"` for `unified-agent` is ambiguous across 4 slots. Architect must specify the resolution rule (reject ambiguous dispatch / require intent-key to encode slot_id / time-of-day heuristic).

### FR-3 — Cross-path collision check before dispatch (the fix mechanism — two candidates, architect selects)
**DDD:** interface

**Candidate A (read-only probe, non-atomic):** after intent PRE-CLAIM succeeds but before spawning, additionally probe (`task_list_held`, read-only) `published:<slot_id>:<period>` (and optionally `cowork-slot:<slot_id>`) for a live peer holder. If held by a peer session → collision: log + `send_telegram(work)` + EXIT, no spawn. *Con:* probe-then-act is not atomic (TOCTOU gap).

**Candidate B (shared namespace, atomic):** when `<agent>` is a cowork-slot agent, the router's PRE-CLAIM `task_id` for that dispatch becomes `cowork-slot:<slot_id>` (or `published:<slot_id>:<period>`) **instead of** `intent:<agent>:<intent-key>`, so `task_claim` gives genuine atomic mutual exclusion against the cowork dispatcher's own claim on the same key.

**BA finding (narrows the choice):** cowork's own per-work-window guard is `published:<slot_id>:<period>` — NOT `cowork-slot:<slot_id>`, which by cowork's own explicit design comment (`slot-claim.md:5-20`) is intra-dispatch-only and released within seconds of spawn. Occurrence 3's raw timestamps confirm this: at collision time cowork held `published:...`, not `cowork-slot:...`. **Either candidate must ultimately gate on the `published:` key to cover the actual multi-minute work window** — this narrows FR-3 to (A) router read-probes `published:<slot_id>:<period>`, or (B) router's PRE-CLAIM key becomes `published:<slot_id>:<period>` itself (requiring the router to compute the identical VN-date/`periodKey` the target agent would — see EC-4). Architect rules between A and B, and must explicitly bound the residual spawn-to-first-gate-checkpoint race window that **neither candidate closes** (see EC-3 / NFR-1).

### FR-4 — Symmetric collision response (reuse existing pattern)
**DDD:** interface
On collision detection, reuse the identical response already codified for router-vs-router peer collision (`CLAUDE.md` Phase B / `dispatch-claim/SKILL.md` § Pattern): one log line, `send_telegram(channel="work", ...)`, EXIT. Do not invent a new response shape for this class.

### FR-5 — Non-cowork agents unaffected
**DDD:** interface
The 9-agent cowork-slot list is the only new gate. All other router intent dispatches (`ba`, `architect`, `po`, `developer`, `qa`, `ops`, etc.) must see byte-identical behavior to today. Strict additive superset over the existing Phase B PRE-CLAIM — same backward-compat discipline as the sibling `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` spec's NFR-2.

### FR-6 — Update both copies of the Phase B pattern in lockstep
**DDD:** interface
`CLAUDE.md` § "BEFORE spawning any agent" embeds the Phase B claim pattern inline, duplicating `.claude/skills/dispatch-claim/SKILL.md` § Pattern. Any change to the PRE-CLAIM procedure must land in **both files in the same commit**, or `CLAUDE.md` silently reverts router behavior to the no-op-mutex path the next time an agent reads it fresh. Recommend the same structural fix as `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` FR-4 used for its copy-paste-drift risk: make `CLAUDE.md`'s block a pointer to `SKILL.md` as SSOT rather than a re-pasted copy, if architect is touching this file anyway.

### FR-7 — Verification / reproduction harness
**DDD:** infrastructure (test/verification layer)
Verify by reproducing the exact occurrence-3 sequence: (1) simulate a cowork-dispatcher session claiming `published:tnb-audit:<periodKey>`, (2) attempt a router-path claim for `intent:tran-ngoc-bau:tnb-audit` targeting the same slot within the peer's hold window, (3) assert the router path now detects the collision and exits **without spawning** (previously: `claimed:true`, spawn proceeds). Recommend a `scripts/agents-flow/*.test.sh` exercising live `task_claim`/`task_list_held` against the coordination store — matches existing convention (`cowork-match-slots.test.js`, `cowork-guaranteed-slot-firer.test.sh`) — not a mocked unit test, since the bug is fundamentally about live cross-session state.

---

## 3. Edge cases

- **EC-1:** Multi-slot agents (chef, digest-predict, bctc-analyst, news-scout, market-watcher, refine_bctc_md, fb-market-poster, alert-commander) make intent-key→slot_id resolution ambiguous unless the intent-key already **is** the slot_id (true only for `tnb-audit` today). Architect must rule (FR-2).
- **EC-2:** Non-cowork agents must see zero behavior change (FR-5).
- **EC-3:** The spawn-to-first-gate-checkpoint race window (between the cowork dispatcher spawning an agent and that agent's own flow reaching its `published:` claim step) is **not closed by either candidate alone** — flag to architect as an accepted residual risk to document explicitly, not silently ignore.
- **EC-4:** Weekly vs daily slots compute their `published:` key differently (`work_date` vs `periodKey` via `get_week_period`). Any router-side check must branch identically to the target agent's own flow, or it probes/claims the wrong key and silently fails to detect a real collision. Reuse `get_week_period` for weekly slots — never derive locally (same precedent already cited in `tran-ngoc-bau/flow/main.md`'s own header comment, FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP).
- **EC-5:** `tran-ngoc-bau` (and any cowork agent lacking Bash/gateway tools) cannot itself run a new check — this fix lives entirely on the **router** side, so it does not depend on the target agent's own tool grants (distinct from the already-partially-fixed unreachable-marker-gate issue this row's own history notes positively).
- **EC-6:** Sibling row `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE` (single-session same-tick self-refire, BACKLOG) is explicitly **out of scope** — a namespace/probe fix here does not close it; per this row's own `sibling_note`, do not conflate or claim it closed on this row alone.

---

## 4. Blockers

**Zero PO-level blockers this cycle.** PO's own board note already resolved priority (P0, priority-inversion rationale — not "damage this time"), the scope boundary vs the sibling refire row and vs `UC-CCA-P3`, and narrowed the fix direction to two named candidates ("probe" vs "shared namespace"), explicitly deferring the choice between them plus the multi-slot resolution rule to "ba/architect own HOW." Nothing in this decomposition surfaced a new business/priority question only PO can answer.

---

## 5. Recommended fix-set for architect (file : section : change)

| # | File | Section | Change |
|---|---|---|---|
| 1 | `.claude/skills/dispatch-claim/SKILL.md` | § Pattern — Router-Scope Dispatch Wrap | Add FR-1..FR-4 cowork-slot recognition + collision check before spawn |
| 2 | `CLAUDE.md` | § "BEFORE spawning any agent — MANDATORY" | Mirror the same change (FR-6) — pointer-to-SSOT recommended over re-paste |
| 3 | `docs/data/cowork-schedule.json` | (read-only input) | No edit — used as the agent→slot_id SSOT (FR-1/FR-2) |
| 4 | `docs/agents/cowork-team/flow/spawn-fanout.md` | § Published marker gate | Verify/annotate — no logic change expected, cross-reference only |
| 5 | `scripts/agents-flow/*.test.sh` (new) | — | FR-7 reproduction harness |

No `apps/mcp-server` code file in scope unless architect's chosen candidate needs a new server capability (see § 1 infrastructure-layer note). No domain-layer file in scope.

---

## 6. Coordination / dedup note

No duplicate row exists. Confirmed via the 2026-07-15 handoff's own §6 prior-art table (checked before that handoff was written) and a fresh board grep this cycle for cowork cross-path/namespace-mutex terms, which returned nothing new. This row is the mint-worthy item that handoff called for; this spec decomposes it, it does not re-open the dedup question.

---

## RETURN
DONE: BA spec complete, zero PO blockers.
NEXT: architect — rule on Candidate A vs Candidate B (FR-3), the multi-slot resolution rule (FR-2/EC-1), and produce brownfield file-level design.
HANDOFF: docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md
PIPELINE: continue (supervised — do not auto-advance past architect without supervisor go-ahead per this row's `supervised_note`)
