# orch-state.json Hot-File Inline-Prose Bloat — Architecture Brief

**Task:** FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT (P1, cross-service/, `supervised:true plan_only:true` — direct PO-mint FIX row, no BA/PM relay)
**Author:** architect, 2026-08-09
**Decision required by mint note:** (a) per-row write-gate byte ceiling, (b) one-time prose→`detail_ref` migration, or (c) both.
**Decision:** **(c), both — sequenced, with a mandatory prerequisite bug-fix neither alternative in the mint note names.**

---

## 0. Diagnosis (RAW-reverified this cycle against live `orch-state.json`, not trusted from the 2026-08-08T18:0xZ mint)

Live file today: 3,586,307 bytes. Re-measured lane counts (PO's mint cited 517 rows across
backlog+review; re-count today across the 3 flat non-terminal lanes is **623**, drift is normal
churn, not a discrepancy):

| lane | rows | `detail_ref` present | prose-byte p50 / p90 / max\* |
|---|---|---|---|
| `backlog[]` | 361 | 179 (50%) | 1.6KB / 5.9KB / 20.7KB |
| `ready[]` | 76 | 4 (5%) | 1.2KB / 12.8KB / 40.3KB |
| `review[]` | 186 | 105 (56%) | 2.9KB / 11.7KB / 48.4KB |

\*"prose bytes" = row's JSON byte length minus a ~30-field structural/routing/lifecycle exclude-set
(`id,title,status,owner,zone,priority,size,type,depends,depends_on,blocked_by,wave,detail_ref,
task_id,owner_agent,next_agent,sprint,sprint_id,created_at,closed_at,created_by,updated_at,
updated_by,claimed_at,claimed_by,promoted_at,promoted_by,dispatch_lane,supervised,plan_only,
review_lane,qa,verify_note`) — everything else (`note`, `desc`, `root_cause`, `acceptance`, `ac`,
`evidence`, `deliverable`, `files`, `source`, `review_note`, `status_note`, `promotion_note`,
`architect_review_note*`, `developer_review_note`, timestamped `po_*` fields, ...) counts as prose.

Confirms the mint note's core claim: **zero terminal-status rows** in these 3 lanes (backlog =
331 BACKLOG + 23 BLOCKED + 7 other-non-terminal; review = 186 REVIEW + a handful BLOCKED; ready =
67 READY + 8 TODO) — `TE-T15`/`FIX-BACKLOG-TERMINAL-ROW-DRIFT` as scoped finds nothing here, and
`scripts/orch-cold-evict.sh`'s D4 extension (terminal-status sweep across these exact 5 flat
lanes) is correctly scoped and already ships — it is simply not the applicable mechanism for
*live* rows carrying multi-KB prose.

**Three additional brownfield findings not in the mint note, all source-verified, that change the
shape of the fix:**

### F-1 — The "intended remedy" already exists (`scripts/orch-backlog-stub.sh`, HSC-4) but is
**mint-time-only**, not a write-time gate, and is **`backlog[]`-scoped only**

It runs once, on new `backlog[]` item creation. It never re-fires when a row is later promoted
`backlog→ready→review` or edited during review lifecycle (`po-detail-resync-review-lifecycle-
routing.sh`'s own diagnosis independently confirms cold entries are "NEVER re-synced when the hot
row is later lifecycle-flipped"). Consequently: **95% of `ready[]` rows and 44% of `review[]`
rows never had a `detail_ref` written for them at all** — either minted directly into `ready[]`/
`review[]` by PM decomposition, PO triage, or the Supervised-Lane Sweep (bypassing the one place
`orch-backlog-stub.sh` is called), or promoted out of `backlog[]` before that run ever fired.
There is no `review[]`- or `ready[]`-scoped equivalent of this tool anywhere in the repo.

### F-2 — Even where `detail_ref` IS present, new prose re-accretes under NEW field names, because `TaskSchema` is `.passthrough()`

105 `review[]` rows have `detail_ref` **and** live inline prose under field names invented
*after* their stub ran (`review_note`, `status_note`, `architect_review_note_20260807`,
`architect_review_note_20260808`, `developer_reverification_20260805`,
`po_review_20260808T1220Z`, `po_transport_ruling_20260725T1735`, ...). `orchStateSchema.ts`'s own
comment names the intended end-state hot field set (`id,title,status,owner,zone,priority,size,
type,depends,wave,verify_note,detail_ref` + a documented "legacy, present during migration" set
including `note`/`status_note`) and says `.passthrough()` → `.strict()` is a **pending, already-
approved** promotion (`SSOT-W1-SERVER-ENFORCE`, task itself is `DONE_VERIFIED`, but the `.strict()`
flip is explicitly gated on "`checkRefIntegrity()` shows zero unknown-key warnings on live data" —
not yet true). This design does not compete with that plan; it is the missing precondition for it.

### F-3 — `orch-backlog-stub.sh`'s re-run is DATA-DESTRUCTIVE on any row edited since its last stub — verified by isolated reproduction, not asserted from source reading alone

`build_detail_temp`'s merge (`.items = ($new_items + .items)`) is a **shallow, id-keyed** jq `+`:
for an id present in both cold and the current hot snapshot, the **entire existing cold value wins
wholesale** — any field added to the hot row since the last stub (e.g. a fresh `review_note`) is
silently discarded, and it is nowhere else — cold never captured it, hot's own copy is about to be
stripped by `build_hot_temp`'s unconditional field filter. Reproduced in isolation (scratch fixture,
not the live file): a hot row with `detail_ref` + a new `review_note` added post-stub, re-run
through the script's own merge+strip logic, comes out the other end with `review_note` **gone from
both** hot and cold — no trace, no error. This means the tool **cannot safely be re-run today** to
sweep up re-accreted prose (F-2), and it must not be blindly extended to `ready[]`/`review[]`
before this is fixed — doing so would risk silently destroying live review/PO/architect notes the
first time anyone re-runs it, which is exactly the class of harm `feedback_no_fake_data_real_fetch`-
adjacent incidents in this repo's memory get escalated hard for.

---

## 1. Decision: (c) both, sequenced — with F-3's fix as a hard prerequisite

**Rejected: (b) alone.** It has already been tried once (HSC-4) and demonstrably did not hold —
F-1/F-2 show prose re-accretes within days of any stub run because there is no durable write-time
counterpart. A second one-time sweep with no gate behind it just resets the clock; the file will
be back at multi-MB within weeks (mean review-lane growth this session's memory alone shows several
15-40KB rows added in the past ~48h).

**Rejected: (a) alone, as a naive hard ceiling from day one.** 34 of 623 live rows already exceed a
data-driven 12KB candidate ceiling (see §2.3). A hard reject on ANY write touching those rows —
even an unrelated status flip or lane move — would brick routine writes on ~5.5% of the live board
starting the moment it ships. This is the exact brick-risk class PO's own D-4 ruling already
rejected for the *whole-file* WARN/ceiling task (`FIX-ORCHAPPLY-NO-HOTFILE-SIZE-TELEMETRY-WARN`) —
repeating it here, at row granularity, would be the same mistake in the sibling leg.

**Chosen: (c), three-part, in dependency order:**

1. **Prerequisite bug-fix** (F-3) — correct `orch-backlog-stub.sh`'s cold-merge to a per-field deep
   merge so hot-side content added since the last stub is preserved, not destroyed.
2. **(b)** — generalize the now-safe stub tool to `ready[]`/`review[]` (same cold store, `#<id>`
   keying — already the live convention per `po-detail-resync-review-lifecycle-routing.sh`'s use of
   the same file across lanes) and run it once, live, under commit-mutex, across all three lanes.
   This is the bulk debt paydown — gets the 34 outlier rows and the general prose float under
   control *today*.
3. **(a)** — a new, **growth-only** row-level check wired into `orch-apply.sh`: a row already over
   ceiling that is not growing is a non-blocking WARN (grandfathered); a row whose candidate prose
   bytes exceed the ceiling **and** exceed that same row's live prose bytes (net new inline growth)
   is a hard reject with a message pointing the caller at `detail_ref`. This is the durable
   counterpart (a) that F-1/F-2 prove (b) alone cannot survive without, and its growth-only
   semantics are exactly why it cannot brick — it is symmetric with `ORCH_APPLY_ALLOW_SHRINK`'s
   already-shipped "grandfather existing state, gate the delta" precedent for the conservation
   check, not a new pattern.

**Sequencing gate this row unblocks:** per the mint note, this row must land before
`FIX-ORCHAPPLY-NO-HOTFILE-SIZE-TELEMETRY-WARN`'s hard-ceiling half — step 2 above is what actually
gets the whole file under any sane whole-file ceiling, and step 3 is what stops it re-inflating
past that ceiling immediately afterward (without step 3, a future whole-file hard ceiling hits the
identical re-accretion problem at file scope that this brief diagnoses at row scope).

---

## 2. Component-level design

### 2.1 Fix `scripts/orch-backlog-stub.sh`'s cold-merge (prerequisite)

`build_detail_temp`, current (buggy) line:
```jq
.items = ($new_items + .items)
```
Fixed:
```jq
.items = (.items * $new_items)
```
jq's `*` on two objects is a **recursive** merge (right side wins per matching leaf key; keys
unique to either side pass through untouched). Verified via isolated fixture (cold has `id`+`title`
+`note`; hot has `id`+`title`+`detail_ref`+new `review_note`, no `note` — because it was already
stripped by a prior run): `.items * $new_items` yields `id`+`title`+`note` (preserved from cold)
+`review_note` (picked up from hot) — exactly the union both sides need, with hot winning on any
genuinely re-editable field (`title`, `status`, ...) and cold's exclusive prose surviving untouched.
No change needed to `build_hot_temp` (the strip-to-stub-fields step) — it was never the buggy side.

### 2.2 Generalize lane coverage — additive only, zero call-site churn

Add a `LANES` config var (mirrors the existing `STUB_FIELDS` idiom exactly), default `backlog`
(100% backward-compatible — none of the ~10 existing callers set it, so behavior is byte-identical
for all of them). `build_detail_temp`/`build_hot_temp` iterate `.task_board[$lane]` for each lane
in `LANES` instead of hardcoding `.task_board.backlog`, writing every lane's full-item snapshot
into the SAME `backlog-detail.json` (`items` is already a flat `id → object` map, not lane-scoped
— reusing it for `ready[]`/`review[]` rows matches the live convention `po-detail-resync-review-
lifecycle-routing.sh` already depends on). Do **not** rename the script — 10+ existing call sites
(`pm/flow/main.md`, `dev-team/flow/post-cycle.md`, `po/flow/*`, 2 test suites) reference it by
name; a header-comment note that it now covers 3 lanes is sufficient, matching this repo's
demonstrated preference for minimal blast radius over naming purity.

### 2.3 One-time migration run (executes (b))

`bash scripts/orch-backlog-stub.sh --dry-run` first (already supported, reports projected byte
reduction with zero writes), then live under `commit-mutex:main` (same discipline as HSC-2 and
`orch-cold-evict.sh`), `LANES=backlog,ready,review`. This is the "hot-file surgery on 517[623]
live rows" the mint note flags as not autonomous-pickup-class — inherit `supervised:true` onto
this specific sub-step's board task, distinct from the (mechanically low-risk) code changes in
§2.1/§2.4.

### 2.4 New growth-only row ceiling — `scripts/orch-row-prose-ceiling-check.mjs` (executes (a))

**Placement decision:** a NEW sibling script to `orch-conservation-check.mjs`, not an extension of
`orch-validate.mjs` (candidate-only, no live-file comparison capability today — would be a new
capability bolted onto a script whose entire existing contract is single-file) and not an
extension of `orch-stamp-updated-at.mjs` (already has the right live-vs-candidate row-diff
primitives, but is currently mid-extension for the unrelated, in-flight
`FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP` fix — coupling a new independent check into that same
script's diff loop right now adds unnecessary review/merge risk to both changes). `orch-
conservation-check.mjs`'s existing `(liveFilePath, candidateFilePath)` CLI contract and read-only
assert-and-exit shape is the closer semantic match: both are "diff live vs candidate, apply a
circuit-breaker rule, never mutate" checks — the new script mirrors that contract rather than
duplicating its magnitude-ratio logic.

```bash
bun scripts/orch-row-prose-ceiling-check.mjs <liveFilePath> <candidateFilePath>
# Exit 0 = no violation (may still print non-fatal WARN lines for pre-existing over-ceiling
#          rows that did NOT grow this write — informational only, mirrors Stage 1g's
#          non-fatal-report precedent in orch-validate.mjs)
# Exit 1 = at least one row's prose-byte total in CANDIDATE exceeds
#          ORCH_ROW_PROSE_CEILING_BYTES AND exceeds that row's own LIVE prose-byte total
#          (net new inline growth past ceiling) — ABORT, live file untouched, message
#          names every violating id + live/candidate byte counts + points at detail_ref
```

Wired into `orch-apply.sh` as a new **Stage 2.5**, positioned after Stage 2 (conservation) and
before the CAS-mtime re-check — same shape as the existing Stage 2 block verbatim:
```bash
ceiling_output=$(bun "${REPO_ROOT}/scripts/orch-row-prose-ceiling-check.mjs" "${LIVE_FILE}" "${TMP}" 2>&1) || {
  ceiling_exit=$?
  printf '%s\n' "${ceiling_output}" >&2
  printf '[orch-apply] ABORTED: row prose ceiling check exit %s — live file untouched\n' "${ceiling_exit}" >&2
  exit 1
}
[[ -n "${ceiling_output}" ]] && printf '%s\n' "${ceiling_output}" >&2
```

**Ceiling default:** `ORCH_ROW_PROSE_CEILING_BYTES`, default **12000** (12KB) — data-driven, ≈p90
across all 3 lanes today (`review[]` p90=11.7KB, `backlog[]` p90=5.9KB, `ready[]` p90=12.8KB on
today's live distribution, §0). Grandfathers ~90-95% of current rows untouched (no WARN, no
block), targets exactly the long tail (34 rows today, up to 48KB) for redirection to `detail_ref`
on their next edit. Env-tunable, same pattern as `ORCH_HOT_CEILING_BYTES` /
`FLOOR_RATIO` / `MIN_BASELINE` elsewhere in this write-gate family — **not asserted as the
permanently-correct number**; PO/PM may retune after step 2.2/2.3 change the live distribution.

**Structural/routing field exclude-set:** ship as a small exported const in the new script,
literally the list in §0's footnote (superset of `orch-backlog-stub.sh`'s `STUB_FIELDS` plus the
lifecycle/provenance fields `STUB_FIELDS` deliberately never strips). No schema change required —
this is a measurement convention local to the new script, not a validation rule, so it does not
touch `TaskSchema`/`.passthrough()` at all (that remains `SSOT-W1-SERVER-ENFORCE`'s pending,
separately-owned `.strict()` promotion — see F-2).

**No bypass env var.** Unlike `ORCH_APPLY_ALLOW_SHRINK` (which protects a legitimate, structurally-
necessary operation — bulk eviction), there is no legitimate reason to inline-grow a row past
ceiling: `detail_ref` is already the sanctioned escape hatch. Adding a bypass here would be a
foot-gun with no matching legitimate use case.

### 2.5 Doc updates

- `docs/policies/dev-standards.md` § Script Persistence: extend the existing "CANONICAL: Orch-state
  cold eviction" entry's sibling list with the `--lane`/`LANES` addition to `orch-backlog-stub.sh`;
  new CANONICAL block for `scripts/orch-row-prose-ceiling-check.mjs` (mirrors the conservation-
  breaker block's structure) + `orch-apply.sh`'s new EXIT CODES / Stage 2.5 doc-comment.
- One-line convention note (dev-standards.md, near the `.passthrough()`/legacy-field discussion,
  or a short addendum to this brief referenced from there): new review/verification prose should
  append to the existing `note`/`status_note`/`verify_note` fields or route through `detail_ref`
  rather than minting a new uniquely-timestamped field name per cycle (`architect_review_note_
  <date>`, `po_review_<timestamp>`, ...) — informational guidance only, not schema-enforced (that
  enforcement is `SSOT-W1-SERVER-ENFORCE`'s future `.strict()` job, out of this row's scope).

---

## 3. Non-goals / explicit exclusions

- **Not touching `TaskSchema`'s `.passthrough()` → `.strict()` promotion.** Already an approved,
  separately-tracked trigger (`SSOT-W1-SERVER-ENFORCE`) gated on zero unknown-key live warnings —
  this design is a precondition for it, not a substitute.
- **Not renaming `orch-backlog-stub.sh`.** Blast-radius vs. naming-purity tradeoff, see §2.2.
- **Not retrofitting `active_sprints[].tasks[]` / `in_progress[]` / `done[]` / `qa[]` lanes into
  the stub/ceiling mechanism this cycle.** `in_progress[]`/`qa[]` are typically small and
  actively-churning (stubbing mid-work risks losing an agent's own in-flight note); `done[]`/
  `done_verified[]` are handled by the terminal-status eviction path (`orch-cold-evict.sh`), a
  different, already-correct mechanism. `active_sprints[].tasks[]` prose bloat is out of this
  row's measured scope (PO's mint only measured the 3 flat lanes) — flag as a natural follow-on
  if a future measurement shows it warrants the same treatment.
- **Not implementing the whole-file hard ceiling** (`FIX-ORCHAPPLY-NO-HOTFILE-SIZE-TELEMETRY-
  WARN`'s deferred half) — this row is its named prerequisite, not its replacement.

## 4. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| §2.3 migration run collides with a concurrent writer mid-sweep | MED | Existing mtime-CAS retry loop in `orch-backlog-stub.sh` (unchanged) + commit-mutex hold, same discipline as HSC-2 |
| §2.4 ceiling default (12KB) mis-tuned — too low, blocks legitimate growth | LOW | Growth-only semantics mean a mis-tuned ceiling only ever blocks *new* inline growth past it, never blocks unrelated field edits on already-large rows; env-tunable, no code redeploy needed to retune |
| §2.1 fix verified only on a synthetic fixture, not the live file | LOW | Deliberate — do not experiment on the live SSOT; implementer must add the fixture as a permanent regression test (mirrors this repo's `scripts/test/orch-apply-wrapper-tests.sh` fixture-harness idiom) before the live migration run in §2.3 |
| §2.4's new script becomes a 3rd near-duplicate of the live/candidate-diff pattern (alongside conservation-check and stamp-updated-at) | LOW | Accepted tradeoff, explicitly reasoned in §2.4 placement decision — decoupling from the in-flight sibling change outweighs the minor duplication; both existing scripts already diverge from each other in the same way (magnitude-ratio vs. content-diff) |
| Post-migration, some already-`detail_ref`'d rows still exceed 12KB even after this pass (their STUB_FIELDS-excluded routing fields alone are large) | LOW | Non-blocking WARN only for rows that don't grow further — never bricks; a genuinely oversized stub is a separate, visible signal for a future manual look, not a write-blocker |

## 5. Task decomposition (single developer engagement, zone `cross-service/` per Tier-2 `root/scripts/` — matches `FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP`/`FIX-DONELANE-...` precedent of direct-to-developer dispatch for this exact class of row)

| step | files | AC |
|---|---|---|
| 1 (prereq) | `scripts/orch-backlog-stub.sh` (merge fix), new fixture test | Reproduces F-3's data-loss on the pre-fix code (RED), passes post-fix (GREEN); existing `scripts/orch-backlog-stub.test.sh` suite still green |
| 2 | `scripts/orch-backlog-stub.sh` (`LANES`/`--lane` param) | `--dry-run --lane=review` reports correct projected reduction with zero writes; default invocation (no `--lane`) byte-identical behavior to today for `backlog[]`-only callers |
| 3 (supervised, commit-mutex) | live `orch-state.json` + `docs/data/orch/archive/backlog-detail.json` | Post-run: reconciliation check (already built into the script) passes for backlog+ready+review; hot-file size reduction measured and reported |
| 4 | new `scripts/orch-row-prose-ceiling-check.mjs`, `scripts/orch-apply.sh` (Stage 2.5 wiring + EXIT CODES doc), new test fixtures | Growing a row past 12KB → exit 1, live untouched; editing a row already >12KB without growing its prose bytes → exit 0 + WARN; a brand-new row minted with >12KB prose on first write → exit 1 (growth from a live baseline of 0) |
| 5 | `docs/policies/dev-standards.md` | New/extended CANONICAL blocks per §2.5 |

Files list is implementer scope — architect does not write code (`plan_only:true`).

---

## RETURN
DONE: Technical design complete — decision (c), both (a)+(b), sequenced behind a prerequisite bug-fix (F-3) not named in the original mint note.
ZONE: cross-service/ (scripts/)
NEXT: developer — single coherent engagement, no BA/PM relay (direct FIX dispatch, matches established local precedent for this row class)
BUILD-STANDARD: not-applicable (bug-fix/refactor + new script in an existing zone, no new service/primitive)
HANDOFF: docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md
PIPELINE: continue
