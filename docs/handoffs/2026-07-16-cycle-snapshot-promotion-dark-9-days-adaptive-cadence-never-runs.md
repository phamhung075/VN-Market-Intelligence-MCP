# cycle-snapshot promotion has been DARK for 9 days — the freshness gate false-positives on fresh data, and adaptive cadence never runs on the ticks that matter

> ## ⚠️ 2026-07-16T01:05Z — THIS WAS LARGELY ALREADY KNOWN. Read this box before the body.
>
> **This document is NOT a discovery. It re-derives work that already existed**, filed ~5 h earlier
> and tracked in the backlog. I wrote the body below unaware of all three:
>
> | Prior art | Status | Overlap |
> |---|---|---|
> | `docs/handoffs/2026-07-15-cycle-snapshot-latest-promotion-dark.md` (committed `f5b700ec1`, 19:51Z) | filed | Same root, same consequence, same `stale_warning`→legacy compounding |
> | `UC-SDF-P2` — *"Diagnose: cycle-snapshot-latest.json promotion silently dead since 2026-07-07"* | **BACKLOG** | Literally this |
> | `SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED` — *"stale since 06-17 — genuinely inert"* | **BACKLOG** | Same surface |
>
> **Signal row `cow-20260716T005400` has been downgraded MED→INFO, type `defect`→`diagnosis`, and
> re-pointed to fold into UC-SDF-P2.** Do not triage it as a new defect. Second time in one session
> I minted a row without a pick-time backlog pre-verify (cf. the `FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE`
> P1 minted this morning on an already-fixed premise) — `project_bounded1_first_pickup_stale_backlog_hygiene_debt`.
>
> **What survives as genuinely additive — three things:**
> 1. **The diagnosis UC-SDF-P2 asks for is now CLOSED.** The 07-15 handoff explicitly says *"Do not
>    treat the hypothesis as diagnosed… the tool's promotion source path was not read."* I read it.
>    §2 below confirms it at source: the gate joins `cycle-snapshot-${tickHHMM}.json` with `tickHHMM`
>    from `tick_id`; `tick-snapshot.md:40,43` names by `FILE_TICK=$(date -u +%H:%M)` — actual fire
>    time. They agree only at zero drift. **Hypothesis → confirmed.**
> 2. **The no-date-in-key bug (§2 Bug 2)** — nobody else had this. It is why the miss is *silent*
>    rather than merely absent: a 43-day-old `00:00` file is found and aged past 4 h.
> 3. **§4-NEW below — a scope-breaker that falsifies BOTH handoffs.**
>
> **What the 07-15 handoff has that I lacked:** it *answers* my §7 "not measured: what else reads
> `-latest.json`". Its §30-31 enumerates them — cowork agents read `cycle-snapshot-<HH:MM>.json`, not
> `-latest.json` (`.claude/skills/cycle-bootstrap/SKILL.md:59`). **Published market content is not
> serving stale data.** My §7 open item is closed, and the blast radius is *smaller* than I implied.

**Detected:** 2026-07-16T00:50Z by the cowork-team dispatcher, chasing an unexplained `stale_warning`
pattern across 7 consecutive emits.
**Status:** PLAN-ONLY. **Severity: MED-HIGH → INFO/diagnosis** (duplicate; folds into UC-SDF-P2).

## 1. CONFIRMED — `cycle-snapshot-latest.json` has not been promoted since 2026-07-07

```
docs/data/cycle-snapshot-latest.json    .tick = 19:45   .created_at = 2026-07-07T19:47:26Z
```
**9 days stale.** Not an I/O problem — the bind mount is live and verified: the server reported
`emitted_at=00:48:56Z` and the host file's mtime is `02:48:56 CEST` (= 00:48:56Z), an exact match.

## 2. Root cause — TWO independent bugs, stacked

`emitPressureStateTool.ts`:

```ts
// L216:  @param tickHHMM  "HH:MM" extracted from tick_id
const snapPath = join(dataDir, `cycle-snapshot-${tickHHMM}.json`);
if (!existsSync(snapPath)) return { promoted: false, stale: false };
// ... reads .fetchedAt ?? .created_at ?? .macro_snapshot.fetchedAt → snapshotAgeMs
if (snapshotAgeMs > SNAPSHOT_MAX_STALENESS_MS) return { promoted: false, stale: true };  // 4h
return { promoted: true, stale: false };
```

**Bug 1 — the gate reads a different key than the dispatcher writes.** The gate derives `tickHHMM`
from **`tick_id`**. `tick-snapshot.md` writes `cycle-snapshot-<HH:MM>.json` keyed by the **snapshot
assembly time**. These agree **only at zero drift**. Observed at tick 00:00Z (drift 5):

| | key | file | age at emit |
|---|---|---|---|
| dispatcher wrote | `00:05` | `cycle-snapshot-00:05.json` | **1.7 min** — never opened |
| gate read | `00:00` | `cycle-snapshot-00:00.json` | **43 days** (`created_at 2026-06-03T00:04:00Z`) |

**Bug 2 — the key has no date component.** `cycle-snapshot-<HH:MM>.json` recurs every day and
nothing prunes it. **101 files** are on disk. The gate found the June 3rd `00:00` file, aged it past
the 4-hour threshold, and refused.

**Net: the freshness gate is a FALSE POSITIVE generator.** It refuses *fresh* snapshots because it is
looking at the wrong file. It has never seen the data it is meant to gate.

## 3. The consequence that matters — adaptive cadence is dark on exactly the ticks it exists for

`cadence-policy.js:124` — `isStale()` Gate 1 short-circuits on the flag alone (OR, not AND):

```js
if (pressure_state.stale_warning === true) return true;   // → PRESSURE_MODE = "legacy"
```

And `stale_warning = promoteResult.stale`. Chain it:

> **slot-bearing tick** → dispatcher writes a snapshot → gate reads the *wrong* (stale) key →
> `stale:true` → `stale_warning:true` → **legacy** → adaptive cadence skipped.
>
> **silent tick** → no snapshot at the gate's key → `{promoted:false, stale:false}` →
> `stale_warning:false` → **adaptive** → but there are no slots to schedule.

**Adaptive mode runs only when it has nothing to do.** Every tick that actually fans out agents falls
back to legacy. DWF-PHASE1's Steps 4.3–4.5 (calendar suppression, cadence due-check, freshness
downgrade, CHEF mutex) are inert in production on every slot-bearing tick.

`reference_isstale_stale_warning_forces_legacy` calls the practical effect "usually nil" because
legacy passes raw MATCHES through and the `0 */4` gatherers come out due either way. That reasoning
is sound for *those* slots — but it is an argument that the feature is harmless when dark, not
evidence that it is running. **It has not been running.**

## 4. This falsifies `reference_isstale_stale_warning_forces_legacy`'s mechanism claim

That memory (15 days old; its own reminder warns code claims may be outdated) states:

> Off-hours … `emit_pressure_state` returns `stale_warning:true` … **that flag persists across
> emits**, so every off-hours tick legacy-falls-back regardless of emit freshness.

**Both halves are wrong.** 7 consecutive off-hours emits:

| emit | tick | snapshot at the gate's key? | `stale_warning` |
|---|---|---|---|
| 21:06 | 21:05 — slot-bearing | yes (stale) | **true** |
| 21:31 | 21:30 — `slots:[]` | no | false |
| 21:37 | 21:30 re-fire — `slots:[]` | no | false |
| 00:08 | 00:00 — slot-bearing | yes (43d old) | **true** |
| 00:26 / 00:33 / 00:48 | `slots:[]` | no | false |

- **It does not persist** — it is recomputed from `promoteResult.stale` on every emit. 00:08 `true`
  → 00:26 `false` cleared it with no intervention.
- **"Off-hours" is a confound.** All 7 are off-hours; 3 are `false`. The real predicate is
  *does a file exist at `cycle-snapshot-<tickHHMM>.json`, and is it >4h old*.

The memory's **primary** claim is verified and still true: `isStale()` is an OR and Gate 1
short-circuits (`cadence-policy.js:120-132`). Only the mechanism paragraph is false.

## 4-NEW. SCOPE-BREAKER — fixing promotion will NOT restore the adaptive loop. Both handoffs are wrong about this.

Discovered 01:05Z, after the body above was written. **This is the one part of this document that is
not duplicate work, and it invalidates the fix scope of UC-SDF-P2 as currently written.**

Both handoffs assert the same causal chain. The 07-15 one (§42-44):

> Because promotion never fires, both [`last_regime`, `last_volatility_level`] are pinned to
> `"unknown"` every tick… **The adaptive-cadence feedback loop is structurally dark.**

Mine (§7) said the same, softer: "`last_regime: unknown` … consistent with `telemetry.md:19-20`
sourcing from it." **We both attributed `unknown` to the promotion outage. That is wrong.**

`telemetry.md:19-20` tells the dispatcher to read `regime_status` / `volatility_level` from
`cycle-snapshot-latest.json`. **Nothing writes those fields.** Raw evidence:

```
grep -rn "regime_status" --include='*.ts' --include='*.js' --include='*.go' --include='*.md'  (excl. docs/data/)
  → docs/agents/cowork-team/flow/telemetry.md:19          ← READER (this contract)
  → docs/handoffs/DWF-DEV-CROSS-3.md:63                   ← READER
  → docs/handoffs/2026-07-15-…-promotion-dark.md:39       ← READER
  → apps/mcp-server/src/__tests__/emit-pressure-state.test.ts:744   ← TEST FIXTURE
  (zero writers)
```

On disk, **12 of 102** snapshots carry `regime_status` — and every one is from a single window:

| | created_at | regime_status |
|---|---|---|
| 12 files (`05:00`…`00:00`) | **2026-06-02 → 06-03** | `FII_OUTFLOW_RISK` |
| every file since, incl. live `00:05` (written 6 min ago) and `-latest` | 2026-06-05 → **2026-07-16** | **absent** |

The live snapshot has **no `macro_snapshot.signals.carry` block at all** — the nested
`carry.regime` the old top-level field was derived from is gone too, so the data cannot even be
re-sourced from a nested path.

**Date of regression: 2026-06-05.** `tick-snapshot.md:4` records it —
`EMIT-DARK-RECURRING 2026-06-05: cycle-snapshot-latest.json promotion moved to telemetry.md Step 6`.
The last snapshot carrying `regime_status` is 06-03; the refactor is 06-05. **That refactor moved
promotion and dropped the two fields from the writer, and the reader contract was never updated.**

**Consequence for triage:** `last_regime` and `last_volatility_level` have been structurally pinned to
`"unknown"` for **~6 weeks** — three days *before* the 07-07 promotion freeze, and for reasons
entirely independent of it. Land UC-SDF-P2's key-unification fix and `computeTiers` still derives
`volatility_tier = low` unconditionally; the adaptive loop stays dark. **UC-SDF-P2 as scoped is
insufficient — it needs a second work-unit: restore a writer for `regime_status`/`volatility_level`
(or repoint the reader at whatever now carries regime), and add a test that fails when the reader's
source field has no writer.** The existing test at `emit-pressure-state.test.ts:744` *constructs*
`regime_status` in its fixture, so it passes against a schema production never produces — which is
exactly why 6 weeks passed unnoticed.

This is a **third** independent bug stacked under the same symptom, and the reason two separate
investigators (07-15 and me) both stopped one layer too early: `unknown` is over-determined. Promotion
being dark *would* produce it, so both of us stopped when we found a sufficient cause and never
checked whether it was the *operative* one. Cf. `feedback_composite_score_masks_dead_detector_pruned_table`.

## 4-NEW-2. FALSIFIED 2026-07-16T04:30Z — §3's headline claim is wrong. Adaptive DOES run on slot-bearing ticks, and the predicate has a ONE-TICK LAG.

Added by the cowork dispatcher at tick 04:15Z — the **third** independent re-derivation of this
document (07-15 → 07-16T00:50 → me). I found nothing in §§1-3 that was not already here, including
the same zsh `--include=*.ts` false-negative in §8. Two things below are additive; everything else
I "discovered" is folded already. Filed as an append, not a new handoff.

**§3 asserts:**

> **Adaptive mode runs only when it has nothing to do.** Every tick that actually fans out agents
> falls back to legacy. DWF-PHASE1's Steps 4.3–4.5 … are inert in production on every slot-bearing tick.

**Counterexample — tick 04:00Z, from committed evidence written before this claim was tested**
(`git show edcc4c66a^:docs/signals/cowork-team-2026-07-16T04-07-10Z.json`):

```
pressure_mode = adaptive
silent        = false
spawned       = 3 agents   (news-scout-offhours, market-watcher-offhours, alert-commander-critical)
suppressed_cadence = ["alert-commander-market"]
```

A slot-bearing tick that ran **adaptive** and fanned out three agents. And it was not idling: adaptive
is what applied the 240-min gate that **suppressed `alert-commander-market`** — the consequential
scheduling decision in `2026-07-16-alert-commander-market-dangling-policy-240min.md`. Steps 4.3–4.5
are not inert; they are **intermittently live and made a degrading decision on this tick**.

**Why §3 went wrong — the predicate has a one-tick lag.** Step 4.2 reads the `pressure-state.json`
written by the **previous** tick's Step 6.0 emit (emit is the last step of a tick). So:

> **mode(T) ← does a residue `cycle-snapshot-<nominal HH:MM of T-1>.json` exist and is it >4h old**

Slot-bearing-ness of T is irrelevant. Verified both directions, same hour:

| tick T | reads emit of | residue at that key | `stale_warning` | mode(T) | slots fired |
|---|---|---|---|---|---|
| 04:00Z | 03:45 | `cycle-snapshot-03:45.json` **absent** | false | **adaptive** | **3** ← falsifies §3 |
| 04:15Z | 04:00 | `cycle-snapshot-04:00.json` **present, 6 Jun (40d)** | true | **legacy** | 2 |

§4's predicate ("*does a file exist at `cycle-snapshot-<tickHHMM>.json`, and is it >4h old*") is the
correct one and already contradicts §3 — this document disagrees with itself between §3 and §4. §4 is
right. The slot-bearing↔legacy correlation in §4's 7-emit sample is **coincidental**: residue files
cluster at minutes where past ticks happened to fire, and those cluster near nominal boundaries.

**Consequences for triage (sharpen UC-SDF-P2, do not rescope it):**

1. **Severity framing changes.** "Adaptive is uniformly dark" (§3) invites "then it's harmless, ship
   the key fix whenever." The truth is worse to reason about: adaptive is **non-deterministically
   live**, gated by which ~110 gitignored junk files (back to 27 May) happen to sit at a nominal
   boundary. Behaviour depends on filesystem residue, not on system state.
2. **§4-NEW's conclusion survives intact and is unaffected** — `regime_status` has zero writers since
   06-05, so `computeTiers` still degrades to `volatility_tier=low` on the adaptive ticks that *do*
   run. Both work-units are still needed.
3. **Pruning the residue files is not just disk hygiene (§6.3) — it is a behaviour change.** Deleting
   them flips every tick to `stale_warning=false` → adaptive **everywhere**, which silently activates
   the 240-min dangling-policy gate on `alert-commander-market` fleet-wide. **Prune and author the
   missing policies in the same change, or the prune alone degrades the alert path 16×.** Sequencing
   matters; these two backlog rows are coupled and neither says so.

<!-- Corrects this doc's §3 and, in the sibling handoff, its "emitter health" framing. -->

## 5. Why this went unseen — the flag is read as a mode hint, not as a detector

`stale_warning:true` is consumed only to pick `legacy`, which is believed harmless. Nothing treats it
as "the promotion pipeline refused data." So a **9-day** promotion outage produced no alert, no
signal row, and no telemetry beyond a `pressure_mode` string that looks unremarkable.

Same shape as `feedback_passive_health_masks_dead_data` and
`feedback_composite_score_masks_dead_detector_pruned_table`: a health-ish field stayed plausible
while the thing underneath was dead. Note the irony — the mechanism is a **fail-safe freshness gate
built to refuse stale data**, and it has spent 9 days refusing *fresh* data while
`cycle-snapshot-latest.json` served a 9-day-old file to anything that read it.

## 6. Fix direction (PLAN-ONLY — po/dev-team own this)

1. **Unify the key.** Either the gate takes the snapshot path/key the dispatcher actually wrote, or
   `tick-snapshot.md` names the file by `tick_id`'s HH:MM. One SSOT for the key — do not fix one side.
2. **Put a date in the key** (`cycle-snapshot-<YYYYMMDD>-<HH:MM>.json`) — a cross-day collision is
   what turned a key mismatch into a *silent* one. **4th instance of this class today** (chef
   synthesis `date_vn`+`dish_type`; tnb notebook; bctc signals `ticker+date+mode`; this one — and
   this is the worst, with **no** date component at all). Worth one row for the class.
3. **Prune** the 101 accumulated files (gitignored, so this is disk + landmine debt only).
4. **Surface the refusal.** `stale:true` should be distinguishable from "nothing to promote" in
   telemetry — today both collapse into one boolean, which is why 9 days passed unnoticed.
5. **Re-check the "practical effect is nil" claim** once adaptive actually runs. It was reasoned
   about a system where adaptive was assumed live on slot-bearing ticks. It never was.

## 7. Honest limits of this finding

- **Not verified:** that the deployed image matches this source. If the running container predates
  it, the code above may not be what executed (`project_verify_deploy_sha_benign_doc_drift`,
  `feedback_force_recreate_no_build_stale_image`). The *observations* (9-day-stale `latest`, the
  7-emit pattern, the 43-day-old `00:00` file) stand regardless; the *code-level explanation*
  assumes source==deployed. Cheap check for the implementer: compare the running image SHA.
- **Not measured:** what else reads `cycle-snapshot-latest.json`. `telemetry.md:19-20` sources
  `last_regime`/`last_volatility_level` from it, which is consistent with every tick this session
  reporting `last_regime: "unknown"` — but I did not enumerate all consumers, so the blast radius
  beyond adaptive cadence is **unquantified**.
- **No harm observed today.** The 4 agents this tick used the tick-snapshot directly, not `latest`.

## 8. Dispatcher actions taken

- Chased this only because 7 emits contradicted a memory. The tick itself (00:45Z) completed
  normally: emit ✓, `released:1` ✓, zero cowork locks leaked, Step 6.1 correctly skipped.
- Filed one signal row to po. **Marginal cost zero** — the SILENT gate was already reopened by
  `cow-20260716T002226`, so this row adds no wasted ticks (unlike that row, which cost ~3).
- Did **NOT** prune the 101 files, touch the gate, or spawn anyone
  (`cowork-team/flow/main.md:12,16`).
- **Caught a zsh false-negative mid-investigation:** `grep --include=*.ts` (unquoted) let zsh glob
  `*.ts`, find no match in CWD, and abort the whole command — printing nothing, which reads exactly
  like "no code sets `stale_warning`." Quoted the includes and the answer appeared immediately.
  Third shell-quirk false-zero this session (`$k[...]` array-subscript, missing `timeout`, this).
