# cycle-snapshot promotion has been DARK for 9 days — the freshness gate false-positives on fresh data, and adaptive cadence never runs on the ticks that matter

**Detected:** 2026-07-16T00:50Z by the cowork-team dispatcher, chasing an unexplained `stale_warning`
pattern across 7 consecutive emits.
**Status:** PLAN-ONLY. **Severity: MED-HIGH** — a shipped feature (DWF-PHASE1 adaptive cadence) is
inert in production and the flag that would reveal it reads as a routine mode hint.

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
