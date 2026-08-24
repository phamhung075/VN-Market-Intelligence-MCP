# UC-SDF-P2 — BA spec: Step 6.0 snapshot-advance hardening (PLAN-ONLY)

**Row:** `UC-SDF-P2` · **Author:** ba · **Date:** 2026-08-24 · **Scope:** SCOPE=verifier leg only
(the "why does `emit_pressure_state` return success + `stale_warning:false` while `latest.json` is
stale" question, plus the ~10L `telemetry.md` Step 6.0 hardening it asks for).
**Explicitly out of scope:** the "Step 4.7 stopped 07-07" leg (queued under
`FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK`) and the actual filename-contract fix
(still an open architect design call — see §7 sequencing guard).

---

## 1. Confirmed root cause

`emit_pressure_state` reports `success:true` with `cycle_snapshot_promoted:false` and
`stale_warning:false` because **that is the literal return value of the file-not-found branch**, and
nothing downstream distinguishes it from "nothing needed promoting".

Producer / consumer disagree on the snapshot filename key:

| side | file:line | key used |
|---|---|---|
| producer | `docs/agents/cowork-team/flow/tick-snapshot.md:34,37` — `FILE_TICK=$(date -u +%H:%M)`, `SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"` | **wall-clock fire minute** |
| consumer | `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts:398-401` — `tickId.match(/T(\d{2}:\d{2}):/)` off the **nominal** `tick_id`; used at `:263` `join(dataDir, \`cycle-snapshot-${tickHHMM}.json\`)` | **nominal tick minute** (`:00/:15/:30/:45`) |

The miss is silent because of `emitPressureStateTool.ts:264`:

```ts
if (!existsSync(snapPath)) return { promoted: false, stale: false };
```

`stale:false` flows to `pressureState.stale_warning` (`:448`) and the tool still returns
`success:true` (`:470-475`). The freshness gate at `:291-293` — the only thing that can set
`stale:true` — is never reached, because it sits **downstream** of the `existsSync` guard.

**Live evidence, measured this session (not relayed):**

- `docker logs vn-market-intelligence-mcp-mcp-server-1 --since 24h | grep emit_pressure_state`:
  21 consecutive ticks, **every one** `cycle_snapshot_promoted=false`; 20 of 21 also
  `stale_warning=false`.
- Current tick `2026-08-24T03:00:00Z`: tool looked up `docs/data/cycle-snapshot-03:00.json`
  (absent); the file Step 4.7 actually wrote is `docs/data/cycle-snapshot-03:02.json`
  (`created_at` `2026-08-24T03:02:24Z`).
- On-disk names this session: `00:01 01:33 02:01 02:17 02:31 02:47 03:02 09:03 09:23 12:03 13:16
  13:46 15:02 16:02 16:39 17:31 18:01 19:47 20:02 20:18 21:01` — not one on a 15-minute boundary.
- `docs/data/cycle-snapshot-latest.json` content `created_at` = `2026-08-23T00:07:50Z`
  (≈27 h stale at time of writing), against per-tick snapshots minutes old.
- The container writes through to the host path — `docker-compose.yml:17`
  `./docs/data:/app/docs/data` — so host-side mtimes are a valid observation surface.

**Latent 4th failure mode found while verifying (new, not previously filed):**
`scripts/agents-flow/cowork-tick-preflight.sh:203` emits the nominal tick as
`date -u +"%Y-%m-%dT%H:%MZ"` — **no seconds**. `emitPressureStateTool.ts:399`'s regex
`/T(\d{2}:\d{2}):/` requires a trailing colon, so if any dispatcher ever forwards the preflight
verdict's `.tick` verbatim as `tick_id`, `tickHHMM` is `null`, `:414-416` short-circuits to
`{promoted:false, stale:false}`, and the signature is byte-identical to the filename miss. Today the
dispatcher happens to re-render it with seconds (live `pressure-state.json` has
`tick_id:"2026-08-24T03:00:00Z"`), so this is latent, not active. The check in §4 detects it as its
own branch.

---

## 2. Verdict on the three prior hypotheses

**H1 — wall-clock vs nominal filename divergence. CONFIRMED.** File:line evidence in §1. Also
confirms the earlier PO reading in the row's `po_corroboration_20260725` note.

**H2 — not inert; a prior-day same-`HH:MM` residue trips the 4 h gate → `stale_warning:true` →
next tick forced to legacy cadence; the 24 h prune misses the residue by ~4 minutes. CONFIRMED,
and reproduced live.**

- `emitted_at=2026-08-24T00:03:33.672Z tick_id=2026-08-24T00:00:00Z ... stale_warning=true` — the
  single `true` in the whole 24 h log window.
- Mechanism: a `cycle-snapshot-00:00.json` residue written `2026-08-23T00:07:50Z` was still on
  disk. Step 4.7's prune is `find … -mmin +1440 -delete` (`tick-snapshot.md:58`, mirrored at
  `scripts/agents-flow/cowork-tick-postflight.sh:112`). At the 00:01 Step 4.7 run the residue was
  ≈1434 min old and at the 00:03 lookup ≈1436 min — **4 minutes short of the +1440 threshold**, so
  it survived, matched the nominal name, and was refused as >4 h old
  (`emitPressureStateTool.ts:291-293`).
- Downstream chain confirmed end-to-end: `stale_warning` → `scripts/agents-flow/cadence-policy.js:123`
  `isStale()` returns true on the flag alone → `docs/agents/cowork-team/flow/pressure-read.md:8,36-42`
  (AC-P1-6-3) downgrades `PRESSURE_MODE` to `legacy` and skips Steps 4.3–4.5.
- **Bound, stated honestly:** exactly **one** tick runs legacy. The next emit rewrites
  `stale_warning:false` (log line `00:16:35.414Z ... stale_warning=false`), and the residue is
  pruned ~15 min later. It is not a sticky state.
- **Reachability caveat:** in steady state this branch is nearly unreachable, because wall-clock
  names (`02:17`, `13:46`, …) can never equal a nominal minute. It fired here only because a
  `cycle-snapshot-00:00.json` existed at all — an anomalous nominal-named file (see §3).

**No tension with the row's `stale_warning:false` premise.** H1 and H2 are two different branches of
the same function: H1 is `:264` (`{promoted:false, stale:false}`, the ~99 % case the row observed),
H2 is `:291-293` (`{promoted:false, stale:true}`, the rare residue case). The row and H2 were both
right about different ticks. H1 is strictly upstream: with no candidate file, the gate never runs.

**H3 — `calendar_status` fixed server-side; `last_regime` is a wrong-key bug not an absent producer.
HALF CONFIRMED, HALF REFUTED.**

- `calendar_status` fixed: CONFIRMED. `emitPressureStateTool.ts:334` wires
  `isVnTradingDay(getTodayVnDate()).session_status`; `:426-434` honours only in-domain overrides.
  Live `pressure-state.json` reads `"open"`.
- `regime_status` absent at every path: CONFIRMED. `jq '[paths(scalars)|join(".")]'` over
  `cycle-snapshot-latest.json` returns exactly one regime-ish path,
  `.macro_snapshot.data.signals.carry.regime`. `telemetry.md:18` tells the dispatcher to read
  `regime_status`. Wrong-key bug, as claimed.
- **REFUTED for the sibling field:** `telemetry.md:19` reads `volatility_level` from the same file,
  and `volatility` matches **zero** paths in the snapshot — there is no analogue, no wrong key to
  fix, and no producer anywhere (`grep -rn "volatility_level" apps/ scripts/` returns only
  consumers: `emitPressureStateTool.ts:444` defaulting to `"unknown"`, and
  `cadence-policy.js:101`). So `last_volatility_level` is a genuinely absent producer.
  Consequence: `cadence-policy.js:101-102` pins `volatility_tier` to `"low"` permanently, exactly as
  the row's widen note (item 4) says. Fixing the `regime_status` key alone does **not** revive the
  adaptive layer.

**Also refuted — a load-bearing claim inside the row itself.** `po_corroboration_20260725T0948`
asserts a "SECOND independent failure mode … the on-grid file … carries none of
`fetchedAt`/`created_at`/`macro_snapshot.fetchedAt`, so the freshness gate treats it as
Infinity-stale". Measured false: `jq '{tick,created_at}' docs/data/cycle-snapshot-00:01.json` →
`{"tick":"00:01","created_at":"2026-08-24T00:01:33Z"}`, and `macro_snapshot.fetchedAt` is present
too. `tick-snapshot.md:53` has passed `--arg created_at` since before the freshness gate landed
(`git show 1df7802d0^:docs/agents/cowork-team/flow/tick-snapshot.md`), and the gate's fallback chain
at `emitPressureStateTool.ts:274-279` reads `created_at` second. **Fixing the filename alone WOULD
promote.** Implementers should not budget for a second fix here.

---

## 3. One more measured fact the implementer needs

Two nominal-named files have existed recently (`cycle-snapshot-00:00.json` created `00:07:50Z`,
`cycle-snapshot-21:00.json` created `21:07:37Z`) and the 00:00 one **did** promote — that is where
today's `cycle-snapshot-latest.json` came from. Their origin is **not** `cowork-tick-postflight.sh`'s
`FILE_TICK` override (`:42,92`): that script has **zero live call sites** — `grep -rn
"cowork-tick-postflight" .claude/ launchd/ docs/agents/` returns nothing; the only hits are
`docs/policies/dev-standards.md:1896` (a pointer) and its own test. The realistic origin is the LLM
dispatcher substituting a value into Step 4.7's fence instead of running `date -u`. The same
substitution drift is visible in `cycle-snapshot-03:02.json`, whose `tick` field is
`"2026-08-24T03:00:00Z"` (a full nominal tick_id) while its filename is the wall-clock minute.

**Design consequence, and the reason §4 is a script and not an inline fence:** any hardening that
relies on the dispatcher interpolating shell variables correctly inherits this drift. The check
below takes **no** LLM-supplied values — it derives everything from `pressure-state.json` and the
filesystem.

---

## 4. The Step 6.0 hardening — design

Add **Step 6.0b**, immediately after the Step 6.0 `emit_pressure_state` call and before Step 6.1.

### 4a. Artifact split

| what | where | owner |
|---|---|---|
| ~10L invocation + rationale | `docs/agents/cowork-team/flow/telemetry.md` (new Step 6.0b) | **agent-father** (`docs/agents/**` is its exclusive zone) |
| the check itself | **new** `scripts/agents-flow/cowork-snapshot-advance-check.sh` | developer |
| its test | **new** `scripts/agents-flow/cowork-snapshot-advance-check.test.sh` | developer |
| 1 line for the dedup marker | `.gitignore` | developer |
| pointer entry | `docs/policies/dev-standards.md` § Script Persistence | developer |

### 4b. Facts the script reads (zero arguments, zero LLM interpolation)

From `docs/data/pressure-state.json` — written by the tool moments earlier, so it is the
authoritative record of what the tool actually did:

- `.tick_id` — the exact string whose `HH:MM` the tool used as the lookup key
- `.emitted_at` — the instant the tool ran
- `.stale_warning` — whether the freshness gate refused
- `.calendar_status` — server-computed since TASK_2008a; the only authoritative producer

From the filesystem in `docs/data/`:

- `LATEST_M` = mtime of `cycle-snapshot-latest.json` (0 if absent)
- `NEWEST_M`, `NEWEST_F` = max mtime and basename over `cycle-snapshot-*.json`
  **excluding** `cycle-snapshot-latest.json`
- `EXPECT` = `cycle-snapshot-<HH:MM from .tick_id>.json`, and whether it exists

Portability: use the two-form idiom already proven in this repo —
`stat -f "%m" "$f" 2>/dev/null || stat -c "%Y" "$f" 2>/dev/null`
(`scripts/agents-flow/cowork-tick-postflight.sh:141`, `dev-team-tick-preflight.sh:370`,
`stranded-state-sweep.sh:84`), and for ISO→epoch
`date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null || date -u -d "$iso" +%s`
(`scripts/agents-flow/auditor-tier1-probe.sh:898`). `emitted_at` carries milliseconds — strip the
fraction (`${iso%%.*}` + re-append `Z`) before parsing.

### 4c. Which mtimes to compare — exactly

Two predicates, both required. Neither alone is sufficient.

1. **Actuation (did `latest.json` advance on THIS tick?)**
   `ADVANCED := LATEST_M + 2 >= epoch(.emitted_at)`
   `emitted_at` is captured at `emitPressureStateTool.ts:382`, *before* the promote at `:414`, so a
   real promote always stamps `latest.json` at or after it. The 2 s slack absorbs whole-second
   mtime truncation. This is a direct measurement of the write — it cannot be satisfied by the tool
   merely returning `success:true`, which is the exact tautology that let this hide for 7 weeks.

2. **Suppressor (was there anything to promote?)**
   `CANDIDATE := NEWEST_M > 0 AND NEWEST_M > LATEST_M`
   False on a silent tick where Step 4.7 never ran and the pointer is already current, and false on
   a fresh tree with no per-tick files. Prevents alarming when there is genuinely no work.

`STALLED := NOT ADVANCED AND CANDIDATE`.

### 4d. Branch discriminator (names the exact tool branch, for the signal payload)

| condition | branch | tool line |
|---|---|---|
| `.tick_id` does not match `/T(\d{2}:\d{2}):/` | `TICK_ID_UNPARSEABLE` | `:398-401` → `:414-416` |
| `EXPECT` absent | `FILENAME_MISS` | `:264` |
| `EXPECT` present and `.stale_warning == true` | `FRESHNESS_REFUSAL` | `:291-293` |
| `EXPECT` present, not stale | `PROMOTE_PATH_OK` (copy/rename failure or race) | `:297-304` |

### 4e. The `calendar_status` gate — exactly, and a correction to the row's wording

**The row asks for `calendar_status != closed`. Implement it as `calendar_status ∈ {open, half_day}`
instead.** `!= "closed"` is a **no-op today**: `SESSION_STATUSES` in
`apps/mcp-server/src/domain/services/vnTradingCalendar.ts:30` is
`["open","holiday","half_day","weekend","unknown"]` — `"closed"` is not a member, and
`emitPressureStateTool.ts:426-434` discards any out-of-domain override, so the field can never hold
`"closed"` again. The row's wording was written in July against the pre-TASK_2008a self-recycled
junk literal (documented on the `UC-CDC-P1` row, `po_impact_evidence_20260725T0948`). Shipping the
literal gate would let the alarm fire on every off-hours and weekend tick — precisely the noise the
gate exists to prevent.

- fire only when `.calendar_status` is `open` or `half_day`
- suppress (log line only, no signal) on `weekend`, `holiday`, `unknown` — `unknown` means the
  calendar oracle is itself degraded, and stacking a second alarm on that is noise
- out-of-domain literal → log a WARN naming the value, treat as `unknown`, suppress. Mirrors the
  FR-A5 defence-in-depth already in `pressure-read.md`.

**Rationale for accepting the loss of off-hours coverage:** the stall condition is monotone — a
stalled pointer does not un-stall itself — so the first `open` tick after any off-hours breakage
fires. Detection is delayed, never lost.

### 4f. Rate limiting — mandatory, not optional

At 15-min ticks across the 02:00–08:59 UTC session this would emit ~28 files/day for **one**
persistent condition, into an inbox already carrying 31–43 undrained signals. The drain's own dedup
cannot help: `scripts/agents-flow/drain-signals.js` fingerprints
`sha256(from + type + payload + createdAt)` and `createdAt` differs every tick, so every copy is a
distinct "new" signal. Writer-side dedup is therefore load-bearing.

- marker file `docs/data/.cowork-snapshot-stall-marker` holding the last emission epoch
- emit only when `now - marker >= 86400` (≤1 signal/day); always write the one-line log regardless
- add `docs/data/.cowork-snapshot-stall-marker` to `.gitignore` (the existing
  `docs/data/.cycle-snapshot-*.stage` pattern at line 34 does not cover it; naming it
  `.cycle-snapshot-stall.stage` to reuse that pattern is a viable zero-`.gitignore`-change
  alternative but reads dishonestly — prefer the explicit line)

### 4g. Signal shape

Written with the **same** atomic temp→validate→rename pattern Step 6.1 already uses
(`telemetry.md:34-45,87-91`) — do not invent a second write style. Path
`docs/signals/cowork-team-${ISO}-snapshot-advance-stall.json`, temp
`docs/signals/.cowork-team-${ISO}-snapshot-advance-stall.json.tmp.$$`.

```json
{
  "from": "cowork-team",
  "to": "po",
  "type": "cowork-error-boundary",
  "priority": "high",
  "createdAt": "<ISO>",
  "payload": {
    "dedup_key": "cowork-snapshot-advance-stall",
    "boundary": "cycle-snapshot-promotion",
    "branch": "FILENAME_MISS|FRESHNESS_REFUSAL|TICK_ID_UNPARSEABLE|PROMOTE_PATH_OK",
    "root_row": "UC-SDF-P2",
    "tick_id": "<pressure-state .tick_id verbatim>",
    "emitted_at": "<pressure-state .emitted_at>",
    "calendar_status": "open|half_day",
    "stale_warning": false,
    "expected_lookup": "docs/data/cycle-snapshot-<HH:MM>.json",
    "expected_exists": false,
    "newest_tick_snapshot": "cycle-snapshot-03:02.json",
    "latest_created_at": "<created_at inside cycle-snapshot-latest.json>",
    "pointer_age_minutes": 1613,
    "pointer_lag_seconds": 96775,
    "note": "emit_pressure_state returned success but cycle-snapshot-latest.json did not advance"
  }
}
```

Routability checked against the live consumers, not assumed:

- `drain-signals.js:86` `isDrainableShape()` requires `from` **or** `type` — both present.
- `drain-signals.js:187-202` `ROUTING_TABLE` / `computeRoutedTo()` has no `cowork-error-boundary`
  row, so it takes the table's own documented last row, `→ PO Step 0-SIG`. Correct destination; no
  allowlist edit needed.
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts:287` — `SignalRowSchema.type` is
  `z.string().optional()`, an **open** namespace. No Zod rejection.
- `cowork-error-boundary` is a skill name (`.claude/skills/cowork-error-boundary/SKILL.md`), not a
  registered enum; using it as the `type` string is a naming convention, and that is exactly what
  the row asked for.

### 4h. The ~10L that lands in `telemetry.md` (agent-father to place verbatim)

```markdown
### Step 6.0b — Snapshot-advance check (MANDATORY, runs after 6.0, before 6.1)

Step 6.0 returning `success:true` is NOT evidence the promote happened. On a filename miss
`promoteCycleSnapshot` returns `{promoted:false, stale:false}` (emitPressureStateTool.ts:264),
so `cycle_snapshot_promoted:false` + `stale_warning:false` IS the silent-failure signature —
measure the file, never trust the return value.

    bash scripts/agents-flow/cowork-snapshot-advance-check.sh

Always exits 0; never blocks the tick. Emits one JSON line on stdout — copy its `verdict` and
`branch` into Step 6.1's `payload.note`. The script owns every path, threshold, the calendar
gate and the 24h dedup marker: do NOT inline its logic and do NOT pass it interpolated values.
It derives the tick from `docs/data/pressure-state.json` `.tick_id` — the value the tool
actually used for the lookup — never from dispatcher narration.
```

### 4i. Placement invariants

- After Step 6.0, before Step 6.1 and before the P3 fire-election release.
- **Happy path only.** Do NOT add it to the Error Guard. `telemetry.md:106-116` documents why a
  tick that dies before Step 6.0 must re-run on its next fire; adding steps there reopens
  `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE`. Step 6.0b calls no MCP tool and writes no
  `pressure-state.json`, so it cannot itself disturb the tombstone.
- Independent of the `SILENT` guard, same as Step 6.0.

---

## 5. Acceptance criteria

- **AC-1** On the live tree as of 2026-08-24T03:00Z the check returns
  `verdict:"SIGNAL", branch:"FILENAME_MISS", expected_lookup:"cycle-snapshot-03:00.json",
  expected_exists:false, newest_tick_snapshot:"cycle-snapshot-03:02.json"`.
  *(Already demonstrated — see §6.)*
- **AC-2** Negative control: a fixture where `latest.json` mtime ≥ `emitted_at` returns `OK` and
  writes **no** signal file.
- **AC-3** Negative control: a fixture with no per-tick snapshots returns `OK_NOTHING_TO_PROMOTE`
  and writes no signal file.
- **AC-4** Calendar gate: the AC-1 fixture with `calendar_status:"weekend"` returns
  `SUPPRESSED_OFF_SESSION` and writes no signal file. A test asserts the string `"closed"` appears
  nowhere in the script (guards against reintroducing the row's no-op wording).
- **AC-5** Dedup: two consecutive `SIGNAL` runs produce exactly one file; a third run with the
  marker backdated >24 h produces a second.
- **AC-6** Branch discriminator covers all four rows of §4d, including `TICK_ID_UNPARSEABLE` fed a
  seconds-less `tick_id` (`2026-08-24T03:00Z`).
- **AC-7** The emitted file passes `drain-signals.js --count-drainable` as drainable and
  `jq empty`.
- **AC-8** `shellcheck -S warning` clean. No `apps/**` file is modified by this change set.

---

## 6. Prototype evidence

A prototype of §4b–4e was written to the session scratchpad (not committed — this row is
`plan_only`) and run against the live tree and against fixtures:

- live tree, tick `2026-08-24T03:00:00Z` → `{"branch":"FILENAME_MISS","advanced_this_tick":false,`
  `"promote_candidate_exists":true,"in_session":true,"verdict":"SIGNAL",`
  `"pointer_lag_seconds":96775}`
- fixture, `latest.json` mtime == `emitted_at` → `{"branch":"PROMOTE_PATH_OK",`
  `"advanced_this_tick":true,"verdict":"OK"}`
- fixture, 24 h residue + fresh per-tick file + `stale_warning:true` →
  `{"branch":"FRESHNESS_REFUSAL","verdict":"SIGNAL"}`; same fixture with
  `calendar_status:"weekend"` → `SUPPRESSED_OFF_SESSION`
- fixture, seconds-less `tick_id` → `{"branch":"TICK_ID_UNPARSEABLE","verdict":"SIGNAL"}`
- fixture, no per-tick files → `OK_NOTHING_TO_PROMOTE`
- fixture, `latest.json` absent + one per-tick file → `SIGNAL`

One drafting trap found and fixed by these controls: a first version used only
`NEWEST_M > LATEST_M` as the alarm predicate and returned `OK` on genuine `FRESHNESS_REFUSAL` /
`TICK_ID_UNPARSEABLE` fixtures. The `emitted_at`-based actuation predicate in §4c(1) is what closes
that hole — an implementer must not simplify it back to a pure mtime comparison.

---

## 7. What this does NOT fix — read before scheduling

This hardening makes the failure **loud**. It does not make the promote work.
`cycle-snapshot-latest.json` stays stale until the filename contract is fixed.

That fix is still an **open architect design call** (rename in Step 4.7 vs. glob/most-recent lookup
in the tool), and the row's own SEQUENCING GUARD binds it into a 4-unit change set that must land
together: (1) unify the snapshot key + put a date in it; (2) author the missing cadence-policy rows;
(3) `calendar_status` → `vnTradingCalendar` (**already delivered** by TASK_2008a, verify before
re-doing); (4) restore a writer for `regime_status` / `volatility_level` **and** a test that fails
when a reader's source field has no writer.

**Step 6.0b is safe to land alone, and is the only piece of UC-SDF-P2 that is:** it changes no
promote behaviour, no cadence behaviour, and no file the guard is about. It adds one read-only
observation and one rate-limited signal. Landing it first also gives the 4-unit change set a
ready-made regression detector.

Two follow-ups this spec deliberately leaves to architect rather than smuggling in:

- `telemetry.md:18` reads a non-existent `regime_status`; the real path is
  `.macro_snapshot.data.signals.carry.regime`. A 1-line key fix — but it belongs to unit (4), not
  here, because it is half of a pair.
- `telemetry.md:19` reads `volatility_level`, which has **no** producer at any path. There is no
  key to correct; unit (4) must create the writer. Any "fix" that only repoints the regime key will
  leave `volatility_tier` pinned `low` at `cadence-policy.js:101-102` and the adaptive layer still
  dark.
