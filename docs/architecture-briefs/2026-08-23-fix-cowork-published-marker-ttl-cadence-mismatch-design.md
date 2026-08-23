# Architecture Brief — FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE

**Date:** 2026-08-23 · **Architect** · **Zone:** cross-service (`.claude/skills/dispatch-claim/SKILL.md` only —
no `apps/mcp-server` change, no `docs/agents/**` change)
**Board row:** `FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE` (P0)
**Mode:** ruling + file-level design (not plan_only — board `supervised`/`plan_only` both null, no
supervisor hold in effect).
**Predecessor rulings this brief extends, not re-litigates:**
`docs/architecture-briefs/2026-07-29-fix-cowork-dispatch-router-intent-mutex-bypass-design.md`
(Candidate A refined — ruled the prefix match at Step 2.4 in the first place) and
`docs/architecture-briefs/2026-08-06-cowork-marker-lifecycle-anchor-and-release.md` (Component A
window-anchor / Component B release-gating — a **different** defect, key AGREEMENT, not key STALENESS;
its children `FIX-CHEF-MARKER-KEY-ANCHOR-1..4` are in flight and are NOT a dependency of this row).

---

## 1. Where the defect actually lives — one function, one file

Confirmed by direct read, not the reporter's framing. There are **two independent gates** in this
system and only ONE of them is defective:

1. **Each cowork flow's own exact-match Phase-1 probe** (`chef.md` Step 0.5, `tran-ngoc-bau/main.md`
   Step G, `digest-predict/main.md` Step pre-D/Sunday gate) — compares `task_id == MARKER_KEY`
   (exact string). Because each period gets a **different** exact key
   (`published:chef-evening:2026-08-22` vs `...:2026-08-23`), this gate is **not** the source of the
   false block — two different exact keys never collide by construction. This gate, and the
   `MARKER_TTL=100800` (28h) constant it uses, is correctly untouched by this fix (see §3 — the 28h
   value is deliberately sized for the catch-up flow and must not be shortened).
2. **The router's Step 2.4 cross-path collision probe**
   (`.claude/skills/dispatch-claim/SKILL.md:638-650`) — compares `task_id starts_with "published:" +
   slot_id + ":"` (**prefix**, deliberately, per the 07-29 ruling, precisely so the router never has to
   duplicate the 4 different per-flow date-basis computations — `utc_date` / `vn_date` /
   `iso_week_period` / `vn_date_saturday_anchor`, `docs/data/cowork-schedule.json` `.slots[].publish_date_basis`).
   **This is the actual defect surface.** A prefix match has no notion of "which period" — it treats
   *any* live `published:<slot_id>:*` row as a collision, so yesterday's still-TTL-live marker blocks
   today's fire for the full overlap window (TTL − cadence).

The reporter's recommended fix (make Step 2.4 exact-match) attacks the right file but the wrong
property — it would force the router to compute the exact key, reintroducing the 4-way date-basis
duplication the 07-29 brief explicitly eliminated, and — per PO's `root_cause` — regressing the case
prefix-match exists for. **Ruling: keep the prefix match. Add an age bound instead** (§3).

---

## 2. New finding — the weekly slot has the identical latent defect, just not yet observed

PO's `root_cause`/`axis_analysis` frame "the weekly case" only as a reason *not* to break exact-match
avoidance. Direct read of `digest-predict/flow/main.md:101` shows something stronger: **the weekly
slot has the SAME overlap-window defect as the daily slots, at weekly scale.**

| Slot | Cadence (cron period) | Marker TTL | Overlap window (TTL − cadence) |
|---|---|---|---|
| chef-morning/eod/evening, tnb-audit, fb-daily | 86400s (1d) | 100800s (28h) | **14400s (4h), every single day** — confirmed live, 5/5 slots (row `blast_radius_20260814`) |
| digest-daily | 86400s (1d) | 86400s (24h) | 0s nominally, but TTL == cadence exactly — "marginal-not-safe" (row's own words): any fire even 1s early re-triggers it |
| **digest-sunday** | 604800s (7d) | **691200s (~8d)** (`digest-predict/flow/main.md:101`) | **86400s (1d), every single week** — same defect class, not yet incident-confirmed only because a once-weekly 24h window is harder to observe than a daily 4h one |
| fb-weekend | 604800s (7d, `vn_date_saturday_anchor`) | 100800s (28h) | none — TTL well under cadence, safe |

This matters because it proves the fix must be **cadence-relative**, not a single constant, and it
retroactively validates PO's instinct to protect "the weekly case" — just not for the reason PO's own
note gives (key-agreement); the real reason is that weekly slots need the **same** relief this row is
fixing for daily ones, on their own period length. Flagging `digest-sunday`'s latent 24h/week window to
PM as an item to confirm is covered by this same fix (§3 AC table) rather than opened as a fresh row.

---

## 3. Ruling — Axis D: cadence-bounded prefix match at Step 2.4 (supersedes AC-5 as the interim; ships in the same commit, not "separately")

PO's `axis_analysis_po_20260814` names three axes (A exact-match — rejected; B shorten TTL — risks the
catch-up flow's legitimate prior-period re-run; C stale-owner/presence, already speced as AC-3/AC-5) and
records that C is the only one that fits both live occurrences **without regressing documented
behaviour** — but does not choose. Reading the actual mechanism (`published:<slot>:<period>`'s
`owner_client_session` is the *dispatching* session's `$CLAUDE_CODE_SESSION_ID`, propagated into the
spawned leaf agent's `Coordination:` prompt line — `docs/agents/cowork-team/flow/spawn-fanout.md:302`,
confirmed by the row's own `occurrence_2` evidence: one dead session `0454e9d8...` held **both**
`chef-evening:2026-08-13` **and** `chef-morning:2026-08-14`, i.e. one dispatcher session spanning
multiple slot fires) surfaces a gap in axis C alone: **a healthy, long-lived dispatcher session that is
still heartbeating would show as "present" for a marker whose underlying slot-work finished hours ago** —
presence liveness answers "is the *dispatcher* alive," not "is *this marker's period* still current."
Axis C is a correct, cheap signal for the *dead-session* case (both confirmed occurrences were exactly
that) but is not a complete, unconditional fix for AC-1's "can never block" — it degrades to "never
blocks, provided the claiming dispatcher happened to have died," which is not deterministic.

**Ruling: land a 4th axis — Axis D, cadence-bounded prefix match — together with axis C (AC-3/AC-5) in
the same Step 2.4 revision, in the same commit.** Axis D closes AC-1 unconditionally and
deterministically; axis C remains as a complementary, cheap, already-designed check for the distinct
case AC-3 actually names (a *current-period* marker whose claiming session died mid-work). Neither axis
alone satisfies the full AC set; together they do, with zero new `apps/mcp-server` code (same convention
as the 07-29 brief) and zero shortening of any flow's own `MARKER_TTL` (axis B's catch-up risk fully
avoided — nothing about the marker's own lifecycle changes, only the ROUTER's advisory pre-check).

### 3.1 Design

`docs/data/cowork-schedule.json` `.slots[].publish_date_basis` is **already** the live SSOT for period
length — set on exactly the 7 slots that carry this class of marker (`utc_date`/`vn_date` → daily,
`iso_week_period`/`vn_date_saturday_anchor` → weekly; confirmed by direct read of all 23 slots, §2
table). Reusing it (rather than re-deriving cadence from cron fields) is a straight application of the
DRY invariant this codebase already enforces for exactly this kind of drift
(`FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON`'s own words, `tran-ngoc-bau/flow/main.md:35-36`:
*"a published-marker dedup key period MUST equal the slot's cron period... the config declaring the key
basis must never drift from the code deriving the key"*). No new field, no new schema, no
`apps/mcp-server` change — `task_list_held`'s row already returns `claimed_at`
(`coordinationStore.ts:1000-1001`, confirmed live) which is all the age check needs.

**Revised `Step 2.4` FR-3 block** (`.claude/skills/dispatch-claim/SKILL.md`, replaces lines 638-650):

```
CADENCE_SEC_BY_BASIS = {
  "utc_date": 86400, "vn_date": 86400,
  "iso_week_period": 604800, "vn_date_saturday_anchor": 604800
}

held = call_tool(server="vn-market", tool="task_list_held", arguments={ kind: "cowork-slot", expired: false })
now  = <current unix time — same source discipline as every other epoch read in this file>

collision = null
for slot_id in TARGET_SLOTS:
  SLOT_RECORD = jq --arg s "$slot_id" '.slots[] | select(.slot_id==$s)' docs/data/cowork-schedule.json
  CADENCE_SEC = CADENCE_SEC_BY_BASIS[SLOT_RECORD.publish_date_basis]   # null if basis absent

  for row in held:
    if row.task_id == "cowork-slot:" + slot_id: collision = row; break

    if row.task_id starts_with "published:" + slot_id + ":":
      if CADENCE_SEC == null:
        # No known cadence for this slot (the 16 non-guaranteed / non-publish-gate slots) —
        # byte-identical PRE-FIX behavior. Fix is scope-bound to the 7 slots this row's
        # evidence covers; do not silently relax slots never analyzed for this defect.
        collision = row; break

      AGE_SEC = now - row.claimed_at
      if AGE_SEC >= CADENCE_SEC:
        continue   # AXIS D — prior-period marker; structurally cannot describe the CURRENT
                   # window (AC-1/AC-6). No date/timezone/period-string computed — pure
                   # arithmetic on an already-returned field. Keep scanning: a genuinely
                   # current-period marker for this same slot, if one exists, must still block.

      # AGE_SEC < CADENCE_SEC — marker IS within the current period (AC-2, no regression).
      if row.owner_client_session not in roster_session_ids:   # `roster` = Phase A.5's own
        continue   # AXIS C / AC-3 — current-period marker, but the claiming dispatcher
                   # session is absent from the presence roster already read this cycle
                   # (zero extra round trip) → treat as abandoned, not live.

      collision = row; break
  if collision: break

# FR-4 (unchanged): symmetric peer-collision response, EXIT before Phase B.
```

### 3.2 Why this satisfies the row's full AC set

- **AC-1** (never blocks on a stale prior-period marker, daily AND weekly): the age check is
  cadence-relative and covers both `86400` and `604800`, deterministically — not contingent on a dead
  session, closes the `digest-sunday` latent case from §2 for free.
- **AC-2** (genuinely-live current-period marker still blocks): `AGE_SEC < CADENCE_SEC` branch is
  unchanged from today's collision behavior when the owner is also presence-live.
- **AC-3** (stale-owner never blocks): explicit second check, reusing Phase A.5's roster read.
- **AC-4** (fixture: daily 4h-overlap + weekly case): both are now first-class, table-driven cases —
  see §4.
- **AC-5** (interim, ship-first, presence-only): superseded, not skipped — folded into the same
  commit as axis C above rather than shipped as a separate earlier patch, since the full design carries
  no additional cost or risk beyond AC-5's own scope (one extra `jq` lookup + one integer comparison per
  candidate row).
- **AC-6** (chef-evening fixture at 19:45Z with yesterday's marker TTL-live): at the exact 24h mark,
  `AGE_SEC == CADENCE_SEC` → `AGE_SEC >= CADENCE_SEC` is true → not a collision. In practice execution
  jitter pushes `AGE_SEC` slightly past `CADENCE_SEC` by the time the probe actually runs, so this is
  not a knife-edge dependency on `>=` vs `>`; either is safe here, `>=` chosen for determinism at the
  boundary itself.

### 3.3 Explicitly NOT changed (residual scope discipline)

- `chef.md`/`tran-ngoc-bau/main.md`/`digest-predict/main.md`'s own `MARKER_TTL` constants (100800 /
  691200 / 86400) — unchanged. The catch-up flow's legitimate re-use of a prior period's exact key
  (axis B's stated risk) is fully preserved because nothing about the marker's own lifecycle or the
  flow's own exact-match gate changes.
- `digest-sunday`'s 86400s/week overlap and `digest-daily`'s TTL==cadence marginal case (§2 table,
  rows 2 and 3) are **flow-level TTL-sizing** issues, a different file-ownership and a different
  mechanism (exact-match gate, not the router's prefix probe) than this row's fix. Do not fold a TTL
  resize into this commit — flag both to PM as a fast-follow candidate (new row or amend to
  `FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR`'s open children if in scope there), since Axis D already makes
  them harmless at the ROUTER level regardless of whether their own TTL constants are ever tightened.
- The 2 residual race windows the 07-29 brief already accepted (probe-to-spawn TOCTOU; cowork
  spawn-to-first-gate window) — unaffected by this change, still bounded and accepted.

---

## 4. Fixture design (extends `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh`, AC-4)

Four new live cases, same conventions as the existing 3 (live coordination store, `task_release` in a
`finally`/trap):

1. **Daily 4h-overlap, must NOT block (AC-1/AC-6):** `task_claim(task_id="published:chef-evening:<D-1
   date>", ..., claimed_at backdated 24h+1s, ttl_seconds=100800)` → run Step 2.4 for
   `agent=unified-agent, intent-key=chef-evening` → assert `collision == null`, Phase B's `intent:`
   claim proceeds.
2. **Daily, within-cadence, must still block (AC-2, no regression):** same claim but `claimed_at =
   now`, presence roster contains the claiming session → assert collision detected, EXIT taken (byte-
   identical to today's behavior for a genuinely-live marker).
3. **Weekly 24h-overlap, must NOT block (AC-1, closes §2's latent case):**
   `task_claim(task_id="published:digest-sunday:<prior periodKey>", claimed_at backdated 7d+1s,
   ttl_seconds=691200)` → assert no collision.
4. **Stale-owner, current period, must NOT block (AC-3/AC-5):** `task_claim(task_id="published:tnb-
   audit:<today>", claimed_at = now, owner_client_session="sim-dead-session")` with NO matching
   `session-presence:sim-dead-session` row in the roster → assert no collision.

Cleanup identical to existing fixture (release all simulated claims in a trap).

---

## 5. File-level design (who owns what)

| # | File | Change | Owner |
|---|---|---|---|
| 1 | `.claude/skills/dispatch-claim/SKILL.md` § Step 2.4 | Replace FR-3 block (lines 638-650) per §3.1. | `developer` (matches 07-29 precedent — same file, board `zone: cross-service/`, not a `docs/agents/**` change) |
| 2 | `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` | Add the 4 cases in §4. | `developer` |
| 3 | `docs/data/cowork-schedule.json` | **No edit** — `publish_date_basis` already present on all 7 relevant slots (confirmed live, §2). | n/a |
| 4 | `apps/mcp-server/**` | **No change** — `claimed_at` already returned by `task_list_held` (`coordinationStore.ts:1000-1001`), confirmed by direct read. | n/a |

Single-file logical change (item 2 is test-only, same commit per dev-standards test-first convention,
not a separate lockstep-risk pair like the 07-29 `SKILL.md`+`CLAUDE.md` diff was — no `CLAUDE.md` edit
needed here, Step 2.4's own phase-list entry is unchanged, only its internal FR-3 logic changes).

---

## RETURN
DONE: Root-caused to Step 2.4's prefix-only match (not chef.md's own exact-match gate, not any
`MARKER_TTL` constant). Ruled Axis D (cadence-bounded prefix match, keyed on the already-live
`publish_date_basis` SSOT, zero date-basis duplication, zero new backend code) landed together with
Axis C (AC-3/AC-5 stale-owner check) in one Step 2.4 revision — Axis D closes AC-1 deterministically
where Axis C alone would only close it contingent on the claiming dispatcher session having died. New
finding: `digest-sunday` carries the identical latent overlap defect at weekly scale (691200s TTL vs
604800s cadence = 86400s/week window), not yet incident-confirmed but closed for free by the same fix.
Full AC-1..AC-6 satisfied by the single revised FR-3 block; `MARKER_TTL` constants and the catch-up
flow's prior-period-key re-use are explicitly untouched (axis B's risk fully avoided).
NEXT: developer (dev-team pipeline) — single-file design, no PM decomposition needed (contrast the
larger 07-29 design). Board row moved `in_progress[] → ready[]`, `next_agent: developer`.
HANDOFF: this brief + `scripts/agents-flow/cowork-dispatch-collision-probe.test.sh` (existing harness to
extend, not replace).
PIPELINE: continue
