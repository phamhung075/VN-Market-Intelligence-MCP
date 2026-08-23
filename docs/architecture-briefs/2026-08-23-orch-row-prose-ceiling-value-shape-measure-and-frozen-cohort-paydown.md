# orch-state Row Prose Ceiling — Value-Shape Measure + Frozen-Cohort Paydown

**Task:** `FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS` (P1, `ready[]`, `cross-service/`, PO-mint, router-direct dispatch)
**Author:** architect, 2026-08-23
**Owning predecessor brief:** `docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md` (the guard this row is about)
**Sibling rows folded into this design:** `FIX-PROSECEILING-PO-MANUAL-DISPATCH-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET` (`backlog[]`, P1, unshipped 8d) · `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` (`review[]`, BLOCKED) · `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION` (`review[]`, P0)
**Decision:** measure the ceiling over **value-shape-derived prose fields**, not over "every field not in a hand-maintained name allowlist" — plus a **targeted, over-ceiling-only compaction mode** so a frozen row has a return path. Do **not** raise the ceiling, do **not** add a bypass env var, do **not** remove `STRUCTURAL_FIELDS`.

---

## 0. Verified premise (all figures measured live this pass, 2026-08-23T09:3x-09:4xZ, not carried from the mint)

**Frozen cohort is 23, not 1.** Independently reproduced with the checker's own measurement convention against live `docs/data/orch/orch-state.json` (585 rows across the 3 guarded lanes):

| lane | rows | over 12000B | share |
|---|---|---|---|
| `backlog[]` | 452 | 11 | 2.4% |
| `ready[]` | 107 | 12 | 11.2% |
| `review[]` | 26 | **0** | 0% |

Distribution: p50=1970 · p75=4013 · p90=7906 · p95=11301 · p99=21918 · max=40494. Matches the router's independently-observed `23 pre-existing over-ceiling WARN(s)` from an unrelated lane-move at 09:39:08Z.

**The cohort is not shrinking on its own.** Over-ceiling count at successive committed states of the hot file: 2026-08-09 → **33**/615 rows · 08-12 → **35**/601 · 08-15 → **38**/549 · 08-18 → **38**/549 · 08-22 → **36**/571 · today → **23**/585. The absolute count rose 33→38 over the first six days while total rows *fell* 615→549 (fraction 5.4% → 6.9%). Today's apparent drop to 23 is **not** natural decay: diffing the id sets shows 13 rows left the over-ceiling set since 08-22 and **zero** entered, and 12 of the 13 left because `review[]` was cold-stubbed (they now carry `detail_ref` + stub fields only — e.g. `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`, 34264B → stub). That is a **paydown**, and it is the proof that the paydown mechanism works — see §4. `backlog[]`/`ready[]` have never had one.

**Exact reproduction of PO's block** (`scripts/orch-row-prose-ceiling-check.mjs` run read-only against the live file and a candidate built from `manual-dispatch-sweep.md` Step 2's verbatim jq):

```
[orch-row-prose-ceiling-check] ABORTED — 1 row(s) with net new inline growth past ORCH_ROW_PROSE_CEILING_BYTES=12000:
  id=FIX-AUDITOR-NOTEBOOK-APPEND-GATE-BYPASSED-ALL-GREEN-WRITE live=26552B -> candidate=26858B
```

+306B, four fields, all machine-generated from a fixed template: `po_manual_dispatch_flagged_at` (ISO), `po_manual_dispatch_flagged_by` (literal), `po_manual_dispatch_class` (class token), `po_manual_dispatch_note` (template string, one interpolation). Zero author-written prose.

**Correction to one framing in the dispatch brief.** The dispatch note says "a numeric occurrence bump — incrementing a recurrence counter". Measured: `occurrence_count: 1 → 2` on that same row **passes today** (exit 0) — same digit count, zero byte delta. The predicate is byte-exact, so what actually rejects is (a) *adding* the field where absent (+21B, PO's 2026-08-15 trace), (b) a digit-boundary crossing `9 → 10` (+1B), (c) any timestamp/status value of different length, and (d) the 4-field coordination stamp above. The defect is real and PO's two blocks are real; it is just not "all numeric bumps" — it is "any byte-level change other than a same-length in-place value substitution". Stating it precisely matters because it rules out a fix shaped as "special-case integer increments".

---

## 1. What is actually broken — four defects, not one

### D1 — `STRUCTURAL_FIELDS` is a closed name-allowlist over an open name-namespace

`TaskSchema` is `.passthrough()`. Measured live: **846 distinct field names** appear on `task_board` rows; **33** are in `STRUCTURAL_FIELDS`; **813 count as prose**. Any flow doc can mint a new field name, and every new machine-written coordination field defaults to the prose side of the measure.

This is the **third** instance of the identical defect in 8 days, each with the identical fix shape (add names to the set):

| # | date | family | state |
|---|---|---|---|
| 1 | 2026-08-15 | `secondary_claimed_at/_by`, `secondary_dispatch_target`, `dispatch_target` | **SHIPPED** (`FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET`) |
| 2 | 2026-08-15 | `occurrence_count` | row minted, **still unshipped** (this row) |
| 3 | 2026-08-15 | `po_manual_dispatch_*` ×4 | row minted, **still `backlog[]` 8 days later** |

Instance #1's own dev-standards write-up already anticipated this: its AC-5 said *"audit the remaining in-place sweep stamp families for the same gap in one pass rather than waiting for a third same-day recurrence — this is now the SECOND instance, which makes the enumeration itself the durable fix."* The enumeration was never done, and the third instance is what is blocking PO today. **A fourth name-list patch is not the fix; it is the fourth turn of a loop.** Same class as `project_signalrow_type_open_namespace_vs_closed_allowlist_20260813` (four patch-only passes, each decayed within days) — resolved yesterday by deriving the allowlist instead of hand-maintaining it.

**Measured evidence that a name-list can never converge:** the 18 field names currently on the board whose values are *only ever* number/boolean/ISO/null — `occurrence_count`(27 rows), `timebox`(15), `ba_spec_complete`(15), `task_count`(13), `recurring_bug_count`(8), `architect_design_complete`(8), `redispatch_count`(7), `rebuild_required`(4), `epic_hold`(2), `branch`(2), `po_approved`, `deploy_gated`, `optional`, `stretch`, `pm_decomposition_complete`, `architect_complete`, `qa_durability_window_ends_at`, `qa_durability_certified` — are **all** counted as prose today. Add short coordination strings (`source`×79, `origin_signal_id`×59, `verification_gate`×54, `dedup_key`×37, `verdict`×21, `mode`×15, `architect_completed_at`×14, `ba_completed_at`×12, `priority_bumped_at/_by/_from`×10 each, `supervised_by`×7, `check_id`×7, …) and the missing-names list is in the hundreds and grows weekly.

### D2 — the predicate measures BYTES, not INFORMATION

`violation ⟺ prose(cand) > CEILING ∧ prose(cand) > prose(live)`, where `prose(row)` is the serialized row minus the name allowlist. For an over-ceiling row this degenerates to **"zero byte growth of any kind, forever"**. A monotone counter, a timestamp refresh, a status-field transition and a paragraph of new analysis are refused identically. The guard's own name, abort message and remediation text all say *prose*; the arithmetic says *bytes*.

### D3 — cross-lane baseline collapse (NEW — not in the row, not in the sibling, not previously reported)

`collectRowsById()` scans only `backlog|ready|review` on **both** sides. A row arriving in a guarded lane from an **unguarded** lane (`in_progress[]`, `qa[]`, `active_sprints[]`, `done[]`, `done_verified[]`, `archive[]`) gets `liveBytes = 0` and is treated as a brand-new >12KB mint. Proven live, read-only, zero bytes changed:

```
$ jq '.task_board.review += [.task_board.in_progress[]|select(.id=="UC-CCA-P3")]
      | .task_board.in_progress |= map(select(.id!="UC-CCA-P3"))' orch-state.json > cand
$ bun scripts/orch-row-prose-ceiling-check.mjs orch-state.json cand
  id=UC-CCA-P3 live=0B -> candidate=12161B          exit 1
```

`in_progress[] → review[]` is the **standard developer-completion transition**. There are **15 over-ceiling rows sitting in unguarded lanes right now** — 3 in `in_progress[]` (`FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58` 17859B, `UC-CDC-P1` 13724B, `UC-CCA-P3` 12161B), 1 in `qa[]` (`FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED` 29906B), 3 in `active_sprints[]` (`VN-MACRO-TOOLING` 70728B, `BCTC-ANALYTICS-LAYER` 45144B, `OHLCV-UNIT-CONTAM-WHOLEROW-LT1000` 13880B), 7 in `done_verified[]`, 1 in `done[]`. **Each is a landmine that detonates on its next lifecycle transition**, with an abort message that falsely claims net-new growth.

`docs/policies/dev-standards.md` over-claims here: *"Row identity is id-keyed and **lane-agnostic** (a lane move with unchanged prose bytes is never mistaken for a brand-new row with a 0 baseline)"*. True only for moves **within** the 3 guarded lanes. The `LANE-AGNOSTIC-MOVE` regression test (`scripts/test/orch-row-prose-ceiling-check-tests.sh:204-221`) only exercises `backlog[] → review[]` — it cannot catch this. Same shape as `feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`.

### D4 — the guard shipped without the paydown its own brief made a hard prerequisite

The 2026-08-09 brief chose option **(c), three parts in dependency order**: §2.1 fix `orch-backlog-stub.sh`'s destructive cold-merge → §2.3 run the bulk `LANES=backlog,ready,review` migration → §2.4 wire the growth-only gate. **Only part 3 shipped.** Part 1's follow-on `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION` is still `review[]`/P0/unverified; part 2 has run on `review[]` only (§0) and never on `backlog[]`/`ready[]` — `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` is `BLOCKED` behind it.

That brief explicitly rejected *"(a) alone, as a naive hard ceiling"* because *"a hard reject on ANY write touching those rows — even an unrelated status flip or lane move — would brick routine writes on ~5.5% of the live board"* and named it *"the exact brick-risk class PO's own D-4 ruling already rejected"*. The growth-only semantics were the mitigation, and they were sized for a **transient residue after paydown** — not for a permanent 23-row population running unpaid for 14 days. **The system is currently in the state its own designer ruled out.** The guard is not misdesigned; it is running without its prerequisite.

**Net effect, stated plainly (the router's observation, confirmed):** the ceiling does no work at all on the worst offenders (40494B, 34589B, 32121B are all grandfathered on every write) while fully blocking the cheapest, most bounded writes in the fleet.

---

## 2. Decision

**Chosen: reclassify by VALUE SHAPE, union'd with the existing name allowlist; widen the live-side baseline lookup; add a targeted compaction mode.** Three independent, small, separately-landable changes.

### 2.1 Rejected alternatives (and why)

| Alternative | Verdict |
|---|---|
| **Add `occurrence_count` + `po_manual_dispatch_*` to `STRUCTURAL_FIELDS`** (both sibling rows' proposal) | **Rejected as the durable fix, retained as a free side-effect.** It is turn #4 of a documented 3-turn loop whose #1 already ordered the enumeration and did not get it. Measured: 846 names live, 813 on the prose side. Under §3.1 both families are excluded *by construction* with no name added — and so is every future one. |
| **Raise / retune `ORCH_ROW_PROSE_CEILING_BYTES`** | **Rejected.** `project_context_bloat_governance` + `feedback_ctxbloat_breach_on_live_sprint_file_defer` are real incidents; the guard exists for a reason. Also arithmetically useless: raising 12000 → 41000 to clear today's max would grandfather the entire distribution (p99=21918) and disarm the guard completely. |
| **Bypass env var** | **Rejected**, agreeing with the guard's own header. §3.1 removes the need for one. |
| **Split the write** | **Rejected** (PO already declined; the check's message forbids it; correct). |
| **Fold the recurrence onto the ceiling row itself** | **Rejected** (PO already declined; it grows the row into the same wall; correct). |
| **Special-case integer increments** | **Rejected.** §0 shows same-length increments already pass and the real blocked set is broader (field addition, digit-boundary crossing, timestamp refresh, 4-field stamp). A rule scoped to `typeof === 'number' && delta > 0` fixes none of PO's two actual blocks. |
| **Promote `TaskSchema` to `.strict()` to close the namespace** | **Rejected as in-scope.** Separately owned (`SSOT-W1-SERVER-ENFORCE`), gated on zero live unknown-key warnings — not true today with 846 names. `orch-apply.sh` Stage 1 validates the whole candidate document all-or-nothing (same finding as yesterday's signal-type brief §2), so a strict flip would reject entire compound transactions. This design is a precondition for that promotion, not a substitute — unchanged from the 2026-08-09 brief's own §3 non-goal. |

### 2.2 The rule

> **A field is PROSE iff its value is a string longer than `ORCH_PROSE_MIN_STRING_BYTES` (default 200), or a non-empty object/array. Everything else — numbers, booleans, `null`, ISO timestamps, short scalar strings — is BOUNDED and is not prose.**
> A field is **excluded from the ceiling measure** iff its name is in `STRUCTURAL_FIELDS` **OR** its value is bounded.
> `violation ⟺ prose(cand) > CEILING ∧ prose(cand) > prose(live)` — same predicate, new measure.

Why value-shape is the right discriminator and a name-list is not: **prose is unbounded by nature; coordination metadata is bounded by nature.** The property that makes a field a bloat risk is a property of its *value*, not of its *name*. Deriving from the value needs no registry, no enumeration, no per-producer maintenance, and covers producers that do not exist yet.

**Safety property — the change is monotone.** The exclusion set only ever grows (name-set ∪ shape-set ⊇ name-set), so `prose_new(row) ≤ prose_old(row)` for every row. **No write that passes today can start failing.** This is what makes it landable against a live fleet with three concurrent writers.

---

## 3. Design

### 3.1 New measure — `scripts/orch-row-prose-ceiling-check.mjs`

Extract the measurement into `scripts/lib/orch-row-prose-measure.mjs` (exports `STRUCTURAL_FIELDS`, `isProseField(value)`, `proseBytes(row)`, `scalarBytes(row)`) so the gate (§3.1), the compactor's selector (§4) and the tests all consume **one** definition — honouring both scripts' existing "never duplicate this logic" header constraint. The checker imports it; nothing else changes in the checker's CLI contract, exit codes, or `orch-apply.sh` Stage 2.5 wiring.

```js
// scripts/lib/orch-row-prose-measure.mjs
const PROSE_MIN_STRING_BYTES = Number(process.env.ORCH_PROSE_MIN_STRING_BYTES ?? '200');

export function isProseField(v) {
  if (typeof v === 'string')  return Buffer.byteLength(v, 'utf-8') > PROSE_MIN_STRING_BYTES;
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return false;
  if (Array.isArray(v))       return v.length > 0;
  if (typeof v === 'object')  return Object.keys(v).length > 0;
  return false;                       // undefined / function — unreachable via JSON
}
// proseBytes(row): JSON byte length of { k:v | !STRUCTURAL_FIELDS.has(k) && isProseField(v) }
// scalarBytes(row): JSON byte length of { k:v | !STRUCTURAL_FIELDS.has(k) && !isProseField(v) }
```

`STRUCTURAL_FIELDS` is **kept, not replaced** — it excludes long *structural* strings the shape rule would otherwise call prose (`title` runs to 290B+, `verify_note`, `supervised_reason`). Union, not substitution.

**Threshold justification (measured, not chosen):** over-ceiling row count is *flat* at 22 for `ORCH_PROSE_MIN_STRING_BYTES` ∈ {80, 120, 200} and only starts eroding at 400 (→20). 200 sits in the middle of the flat region with 2x margin on both sides — the same "data-driven, env-tunable, not asserted permanently correct" posture as `ORCH_ROW_PROSE_CEILING_BYTES` itself.

**The guard is not disarmed — measured:** of the 23 currently-frozen rows, **22 remain over ceiling** under the new measure. Only `DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING` drops out (12205 → 11759B, i.e. it was 205B over — genuinely marginal, not a loophole). The frozen cohort's non-prose footprint is negligible: per-row `scalarBytes` runs 2–662B against 12KB–40KB rows; board-wide `scalarBytes` p50=43 · p90=299 · p99=646 · max=1114.

**The short-string loophole is measured, not assumed, and it is closed by the data:** across all 585 guarded rows, non-structural strings ≤200B hold **43,875 bytes total**, versus **1,616,447 bytes** held by strings >200B. Short strings carry **2.6%** of the prose mass. They are demonstrably not the bloat channel — the bloat is in `status_note`/`desc`/`po_*_ruling_*` multi-KB blocks, all of which stay classified as prose.

**Defence-in-depth against slow scalar accretion** (F-2's "prose re-accretes under freshly-invented field names" is a documented pattern, so do not leave the door fully open): on an over-ceiling row only, reject if `scalarBytes(cand) - scalarBytes(live) > ORCH_ROW_OVERCEILING_SCALAR_DELTA_BYTES` (default **1024**). PO's 4-field stamp is 306B (3.3x headroom); board-wide max *cumulative* scalar on any single row is 1114B, so a single write adding >1KB of scalars to an already-over-ceiling row is anomalous by construction. Tripping this cap should be read as a signal to investigate the producer, **not** as a reason to raise the number — say so in the abort message. This is the only new knob; a separate field-*count* cap was considered and dropped as redundant (8 new fields × 200B already exceeds the byte cap).

### 3.2 Widen the LIVE-side baseline lookup (fixes D3)

Keep the **gated** set at `backlog|ready|review` (unchanged scope — the 2026-08-09 brief's §3 non-goal for `in_progress[]`/`qa[]`/`active_sprints[]` stands: stubbing mid-work risks losing an agent's in-flight note). Widen only the **live baseline** lookup to all `task_board` array lanes, so a row entering a guarded lane from anywhere gets its true prior byte count instead of 0.

Two guards on the widening:
- **Duplicate ids across lanes exist today** — measured: `FIX-ACTIVE-READPATH-LIVENESS-PROBE-NO-DETECTOR`, `FIX-BCTC-BANK-SUMMARY-MAPPING`, `FIX-NEWSVPS-OVERNIGHT-PUSH-OUTAGE-663M-SILENT`. The current code's "last-write-in-iteration-order wins" would, once widened, be able to pick the *smaller* copy as baseline and manufacture a false reject. **Use `max(proseBytes)` across all live occurrences of the id** — conservative in the safe direction, cannot false-reject, one line.
- A genuinely **new** id is still absent from every lane → baseline 0 → still hard-rejects. Verified on the prototype (§7 AC-5).

### 3.3 No change to `docs/agents/po/flow/manual-dispatch-sweep.md`

The sibling row lists it in `files[]`. Under this design PO's Step 2 stamp lands unmodified — **scope reduction, one fewer agent-doc edit, one fewer `agent-father` hop.** Worth stating explicitly so PM does not carry the sibling's file list verbatim.

---

## 4. The return path: targeted over-ceiling-only compaction

An over-ceiling row must be able to get back under the limit. Today's sanctioned hatch cannot do it at a usable granularity.

**Why the existing hatch is unusable in practice (source-verified, `scripts/orch-backlog-stub.sh`):** row selection is `lanes[] → every row with .id != null`. There is **no id filter, no threshold filter, no per-row mode anywhere in the script.** Compacting one 26KB row means rewriting all 452 `backlog[]` rows (or all 107 `ready[]` rows) under `commit-mutex:main`. That is why PO correctly refused it twice ("far outside a triage tick's blast radius", `triage-20260822T2258Z-po.md`), why architect-5 refused it on 08-22, and why it has not run on those lanes in 14 days. The tool is a bulk migrator, not a compactor.

**Design — add a targeted mode, reusing the §3.1 shared measure (never a second copy of the definition):**

- `scripts/orch-row-prose-ceiling-check.mjs --list-over-ceiling <file>` — new read-only mode, emits over-ceiling ids as JSON. One function call on the shared module.
- `scripts/orch-backlog-stub.sh --ids=<csv>` and `--over-ceiling-only` — restrict selection to those ids (the latter shells out to the mode above). Everything else — cold-first ordering, deep merge, atomic rename, mtime-CAS, `orch-apply.sh` routing — unchanged.
- **Align `STUB_FIELDS` with the new measure**: keep = `STRUCTURAL_FIELDS ∪ bounded-scalars` = exactly the complement of what the ceiling counts. One definition drives both the gate and the compactor, so a compacted row is guaranteed under ceiling by construction rather than by hope.

**This alignment also closes a live regression risk in any paydown run.** Today's `STUB_FIELDS` (12 names) would strip `po_manual_dispatch_flagged_at`, `occurrence_count`, `owner`, `next_agent`, `supervised`, `plan_only`. `manual-dispatch-sweep.md` Step 1's `flag_reentrant` reads `.po_manual_dispatch_flagged_at` **inline with no `detail_ref` fallback** — so a `ready[]` stub run under today's field set would silently clear every idempotency flag and re-surface the whole candidate set. Under the aligned rule those fields are bounded scalars and stay hot. **This must land before any `backlog[]`/`ready[]` paydown, not after.**

**Projected impact of a targeted run (modelled against the live file, read-only):**

| metric | value |
|---|---|
| rows touched | **22** (not 585) |
| bytes moved to cold | **426,251** (0.41 MB) |
| hot file (compact-serialized) | 2,934,547 → 2,508,296 B (**−14.5%**) |
| largest surviving hot row | **1,839 B** (6.5x under the 12000 ceiling) |
| frozen cohort after | **0** |

That is the whole `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` §2.3 debt paid down by touching 3.8% of the board, at a blast radius a single supervised tick can actually carry.

**Ordering constraint:** the targeted paydown depends on `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION` (`review[]`, P0) being verified — it is the F-3/F-4 prerequisite the 2026-08-09 brief made mandatory, and running the compactor before it is verified is the data-destructive path that brief reproduced in isolation. **§3 (the measure fix) does NOT depend on it** and must ship first and alone: it unblocks PO immediately with zero hot-file surgery.

---

## 5. Files, owners, DDD/zone

**Zone: `cross-service/`** — `scripts/` + `docs/policies/`. Per `.claude/skills/zone-detect/SKILL.md` Tier-1 (*"Files span >1 zone OR root/scripts/ → route to `developer` (generic)"*), owner is **`developer`**, matching the sibling row's own `next_agent: developer` and the 2026-08-15 precedent fix. No microservice `apps/` zone is touched. `BUILD-STANDARD: not-applicable` (bug-fix / in-zone refactor, no new primitives).

| # | file | change | owner |
|---|---|---|---|
| 1 | `scripts/lib/orch-row-prose-measure.mjs` | **new** — shared measure module (`STRUCTURAL_FIELDS`, `isProseField`, `proseBytes`, `scalarBytes`) | developer |
| 2 | `scripts/orch-row-prose-ceiling-check.mjs` | import #1; widen live baseline to all lanes with `max()` dedup; add over-ceiling scalar-delta cap; add `--list-over-ceiling`; update header + abort message | developer |
| 3 | `scripts/test/orch-row-prose-ceiling-check-tests.sh` | add AC-1..AC-7 (§7) | developer |
| 4 | `scripts/orch-backlog-stub.sh` | `--ids=` / `--over-ceiling-only`; align `STUB_FIELDS` to complement-of-prose | developer |
| 5 | `scripts/orch-apply.sh` | Stage 2.5 header comment only (behaviour + exit codes unchanged) | developer |
| 6 | `docs/policies/dev-standards.md` | correct the over-claimed "lane-agnostic" sentence (D3); document the value-shape measure, the new env vars, and the targeted compaction mode | developer |
| 7 | `docs/data/orch/orch-state.json` | close the two sibling exclude-set rows as **superseded-by-construction**, not as duplicates | po |

**Not touched:** `apps/mcp-server/src/.../orchStateSchema.ts` (`.passthrough()` stays — `SSOT-W1-SERVER-ENFORCE`'s job); `docs/agents/po/flow/manual-dispatch-sweep.md` (§3.3 — no change needed, so no `agent-father` hop).

---

## 6. Risk register

| Risk | Sev | Mitigation |
|---|---|---|
| New measure silently un-freezes rows that carry real prose | LOW | Measured: 22/23 stay over ceiling; the single dropout was 205B over. AC-2's negative control makes this a permanent regression test. |
| Short-string accretion becomes a new bloat channel | LOW | Measured 2.6% of prose mass today; §3.1's 1024B/write scalar-delta cap bounds it; every over-ceiling row is already named in a WARN on every single write. |
| Widened live-lane lookup picks the wrong duplicate copy | MED | Real — 3 duplicate ids live today. `max(proseBytes)` across occurrences is conservative and cannot false-reject. AC-6. |
| Widened lookup weakens the brand-new-row case | LOW | Absent id → baseline 0 unchanged. AC-5 (verified on the prototype). |
| Targeted paydown destroys hot-side prose | **HIGH** | Hard-gated behind `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH` verification (the 2026-08-09 F-3 reproduction). `--dry-run` first. §3 ships independently and first. |
| Paydown strips fields a live predicate reads inline | **HIGH** | Found this pass (`flag_reentrant` reads `po_manual_dispatch_flagged_at` inline, no fallback). Cured by the §4 `STUB_FIELDS` alignment, which must land *before* any run. AC-7. |
| Three concurrent writers (`pm`, `agent-father`, PO) during rollout | LOW | §3 is a pure predicate change in a read-only check — no orch-state write at all. `orch-apply.sh`'s CAS-mtime guard is untouched. |

---

## 7. Acceptance criteria — all replayed on a live-data prototype this pass

Each was executed read-only against the real `orch-state.json` plus a jq-built candidate. **All pass.** They are ACs for the implementer, not claims of shipped code.

| AC | case | required | prototype |
|---|---|---|---|
| **AC-1** | `manual-dispatch-sweep.md` Step 2's verbatim 4-field jq stamp on `FIX-AUDITOR-NOTEBOOK-APPEND-GATE-…` (26552B) | **LAND** | ✅ exit 0, 22 WARN |
| **AC-2** | +1 byte appended to a >200B prose field on the same frozen row | **ABORT** | ✅ exit 1, `PROSE-GROWTH live=26219 → cand=26220` |
| **AC-3** | `occurrence_count` added / incremented across a digit boundary on a frozen row | **LAND** | ✅ exit 0 |
| **AC-4** | `UC-CCA-P3` `in_progress[] → review[]`, byte-identical row (D3) | **LAND** | ✅ exit 0 (today: exit 1, `live=0B → 12161B`) |
| **AC-5** | brand-new id minted into `backlog[]` with 20KB `desc` | **ABORT** | ✅ exit 1, `l=0 c=20011` |
| **AC-6** | duplicate-id row present in a guarded **and** an unguarded lane, unchanged | **LAND** | to implement — `max()` rule |
| **AC-7** | after `--over-ceiling-only` stub run, `flag_reentrant` still reads a non-empty `po_manual_dispatch_flagged_at` off the hot row | **PASS** | to implement — `STUB_FIELDS` alignment |
| **AC-8** | full existing suite `bash scripts/test/orch-row-prose-ceiling-check-tests.sh` | **all green, no case removed** | to implement |

AC-2 is load-bearing: it is the proof the fix narrows the gap without disarming the ceiling. AC-4/AC-6/AC-7 are new classes with no existing coverage.

---

## 8. Sequencing

1. **§3 — measure fix** (files 1,2,3,5,6). Independent, monotone-safe, no hot-file surgery, no dependency on any open row. **Unblocks PO's next tick.** Ship first, alone.
2. **§7 AC-7 — `STUB_FIELDS` alignment** (file 4, first half). Prerequisite for any paydown.
3. **Verify `FIX-ORCHBACKLOGSTUB-COLD-ITEMS-ARRAY-SHAPE-CRASH-BLOCKS-LANES-MIGRATION`** (`review[]`, P0) — already on the board, needs QA, not new work.
4. **§4 — targeted mode + supervised `--over-ceiling-only` run** (file 4, second half). Clears the 23 → 0 and unblocks `FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT` (`BLOCKED`), which is itself the named prerequisite for `FIX-ORCHAPPLY-NO-HOTFILE-SIZE-TELEMETRY-WARN`'s hard-ceiling half.
5. **PO closes** `FIX-PROSECEILING-PO-MANUAL-DISPATCH-STAMP-FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET` and this row's `occurrence_count` clause as **superseded by construction** — record *why* (both were name-list patches; the rule now derives them), so the closure is not later mistaken for a silent drop.

**Flagged for PO, not folded in:** the 15 over-ceiling rows in unguarded lanes (§1 D3) are outside this row's scope and outside the 2026-08-09 brief's measured scope, but `VN-MACRO-TOOLING` (70728B) and `BCTC-ANALYTICS-LAYER` (45144B) in `active_sprints[]` are each larger than the worst guarded row. That brief's §3 said to *"flag as a natural follow-on if a future measurement shows it warrants the same treatment."* This is that measurement. Candidate row for PO — after §3 lands, they can at least move lanes without a false abort.
