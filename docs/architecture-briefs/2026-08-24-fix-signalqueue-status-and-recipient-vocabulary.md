<!-- size-justification: ~430L — single ruling covering two coupled closed-vocabulary
decisions (status + to) on one shared schema file, plus a forensic trail (walEscalation.ts
sanctioned-producer discovery, OPEN's true origin, an appendSignalQueueRow throw-contract bug)
that has to stay attached to the ruling it justifies or a future reader re-derives it from
scratch. Splitting status/to into two files would duplicate the SignalRowSchema/enforcement-
mechanism section (§4) between them for no reuse benefit — they share one write path. -->

# FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING — Status + Recipient Vocabulary Ruling

**Date:** 2026-08-24
**Author:** architect
**Status:** DESIGN COMPLETE — zone=multi, split into 2 implementation rows (§8)
**Row:** `FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING` (P1) — becomes the umbrella
**Sibling (implements the mechanism this row rules on):** `FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES` (developer, P1) — its own AC-2 states verbatim: *"OPEN's membership is NOT this row's call ... take OPEN's disposition from that row rather than guessing."* This brief is that ruling.
**Dispatch:** router hand-dispatch (`next_agent=architect` is non-dev, holds it out of BOUNDED-1; not `plan_only`, so SLS cannot see it either — see §7.4 for why that gap is named, not fixed, here).

---

## 0. Scope: what this row rules on vs. what it implements

The sibling developer row already owns the *mechanism* (Zod enum, TS type, grandfather safety,
AC-4 standing check) and its own AC-2 explicitly defers the *content* of the ratified set and
OPEN's disposition to this row. This brief supplies that content, plus a second axis the sibling
row's `files[]` never touched (`to`), plus one forensic finding (§1.3) that changes the shape of
the `to` ruling from what the router's own thin framing assumed.

**Non-negotiable, inherited from the sibling row's own ACs, not re-litigated here:**
- AC-1 (sibling): do not case-fold the consumers — `orch-cold-evict.sh:164-172` already
  considered and rejected that fix on the record.
- AC-3 (sibling): never silently drop a row — reject loudly or coerce-with-marker, never lose it.

---

## 1. Live evidence gathered during this design (all re-measured, not inherited from the router's framing)

### 1.1 The live file is already 100% clean against the vocabulary this brief ratifies

`jq '[.signal_queue.rows[].status] | group_by(.) | map({status:.[0],count:length})'` against
`docs/data/orch/orch-state.json` **right now** (post PO's `446957f0e` dedup this morning):
`READ=86, RETRACTED=12, triaged=8, NEW=1` — 107 rows, all four values inside the 8-member set §2
ratifies. `OPEN` and lowercase `"new"` are both **zero** live. This matters for §4's enforcement
design: the grandfather-vs-hard-reject tradeoff the sibling row's AC-3 raises is not being solved
against a dirty file — it is a forward-looking safety margin, not a today-blocking constraint.

### 1.2 No sanctioned writer of `status:"OPEN"` exists anywhere in the fleet

`scripts/emit-audit-signal.sh:564` (the one sanctioned system-auditor E-3 actuator) hardcodes
`status:"NEW"`. Every TS in-process writer (`walEscalation.ts`, `tasksMdJanitorJob.ts`,
`bctcImageFetchDegradedSignalWriter.ts`, `improvementSignalWriter.ts`,
`narrativeContradictionSignalWriter.ts`) hardcodes `status: "NEW"` or `'NEW' as const`, no
exceptions. `"OPEN"` **does** appear ~15x elsewhere in this repo — `sprint_goal.entries[].status`,
`docs/data/DASHBOARD.md` row status (`scripts/emit-dashboard-row.sh:131`'s own `--status` default),
`pilot-status-*.json .phase2.status` — all **disjoint namespaces from `signal_queue.rows[]`**. The
most plausible producer of the 6 dead rows is a hand-authored mint that mirrored a DASHBOARD.md-
style row (`OPEN` is that artifact's own default open/closed vocabulary) into a signal_queue row
without translating the status field to the queue's own NEW/READ/RESOLVED lifecycle. This is
forensic color, not something this row needs to trace to a specific commit — §2/§3 do not depend
on identifying the exact producer, only on the fact that **no sanctioned code path currently emits
it**, so ratifying it would legalize a mistake nobody currently needs.

### 1.3 `to:"ops"` is a SANCTIONED, shipped, in-code producer — this is not just a casing bug

`apps/mcp-server/src/scheduler/walEscalation.ts:30-34` — the WAL-checkpoint-escalation job — emits
`to: 'ops', status: 'NEW' as const` on every WAL-file-exceeds-10MB event. **Correctly cased,
sanctioned, shipped code, and still structurally undeliverable** — proving AC-1's warning
empirically rather than theoretically: *"a correctly-cased NEW row addressed to an agent with no
selector is still undelivered, just less obviously."* The only live `to:"ops"` row today
(`po-decision-bug5468-2026-08-23T15:27:38Z`) is not even from this job — it is PO's own decision
row, left deliberately `NEW` per its own note, carrying a standing unactuated mitigation
instruction "for whoever monitors this." Nobody monitors it. This changes §5's ruling from "some
unknown producer typed the wrong recipient" to "the fleet has a live, sanctioned code path that
depends on a delivery mechanism that has never existed."

### 1.4 `ops` has no polling loop and no push-spawn target — ratifying it as a recipient would recreate this exact bug under a new name

`docs/data/cowork-schedule.json` has zero `ops` entries — ops is dispatched only by direct
router/PO/dev-team spawn for point diagnostics (`docs/agents/ops/flow/{docker,vps,db,bctc,
cloudflare-mcp,data-validation}.md`), never on a recurring tick. The push-model alternative
(`FIX-SIGNALQUEUE-PUSH-SPAWN-FANOUT-MECHANISM`, ready, agent-father, depends=[]) only wires the
6 existing `cowork-schedule.json` slots — ops isn't one of them, and giving it one would mean
inventing an autonomous ops polling cadence, a materially bigger and independently-scoped change
this row does not need. PO's own `docs/agents/po/flow/triage-signals.md` already has a **working,
documented, exercised-today** bridge for exactly this class of finding: `system-issue` /
`data_stale` / `db_freshness` rows all carry an explicit "if the fix is live infra action, route
`owner: ops`" disposition — i.e. PO already turns an auditor/scheduler finding into an actionable
`.task_board` row `owner:ops` mint. §5 rules accordingly.

---

## 2. Ratified vocabulary — `status` (8 members, single SSOT)

Derived from live data (§1.1) + the two SSOT docs (`.claude/skills/signal-dashboard/SKILL.md`
§ ACK/CLOSE, `scripts/orch-cold-evict.sh:150/181` `TERMINAL_SIGNAL_STATUSES`) per the sibling row's
own AC-2 instruction — no member invented, none dropped without a named reason.

| Status | Terminal? | Ratified by | Live producer |
|---|---|---|---|
| `NEW` | no (entry point) | Every picker's byte-exact match (`cowork-tick-preflight.sh:360`, `dashboard-protocol.md:86/92`, `drain-signals.md:24`) | `emit-audit-signal.sh`, all 5 TS in-process writers, dashboard WRITE protocol |
| `READ` | yes | SKILL.md § ACK | dashboard READ Phase 2 flip |
| `RESOLVED` | yes | SKILL.md § CLOSE | dashboard CLOSE |
| `SUPERSEDED` | yes | `orch-cold-evict.sh:181` default, SKILL.md § PRUNE criteria | pre-existing SSOT member, no live rows today — kept, not invented (removing a documented member outside this row's mandate) |
| `ACUTE-RESOLVED-ROOT-TRACKED` | yes | `orch-cold-evict.sh:181` default, cited live at `cron-db-data-integrity.md:130` | PO root-tracked disposition |
| `triaged` (lowercase) | yes | SKILL.md § ACK/CLOSE "Extended statuses" (ratified 2026-08-01) | PO triage flow — 8 live rows today |
| `TRIAGED` (uppercase) | yes | `orch-cold-evict.sh:164-172`'s own header: added 2026-08-01 "for a different, ad-hoc-cased writer," deliberately NOT case-folded into `triaged` | **Zero live rows today** — historical one-time triage scripts only (`po-s110-*.jq`, `po-triage-20260805-*.jq`), both already executed and gone. Kept ratified (not this row's call to retire a 2026-08-08-ratified member), flagged as a retirement candidate for a future pass, not retired here. |
| `RETRACTED` | yes | SKILL.md § ACK/CLOSE (ratified 2026-08-01) | PO verified-false-positive — 12 live rows today |

**`TERMINAL_SIGNAL_SET`** = the 7 terminal rows above, byte-identical to `orch-cold-evict.sh:181`'s
current default — this ruling changes **zero** picker/evictor literals (§0 of the router's own
framing was correct: consumers are already right, only the write side was open).

**Explicitly NOT ratified (§3 covers `OPEN` specifically):**
- `"OPEN"` — see §3.
- `"PARTIAL"` — present in `orchStateStore.ts:47`'s broken union but **zero signal-row producer
  found anywhere**; every `"PARTIAL"` hit in the repo (`refine_bctc_md`'s `report_status`,
  `fb-market-poster`'s `data_quality_flag`) is a different field on a different row shape. This is
  a second half-alive value, same class as OPEN, just never triggered because nothing writes it —
  dropped from the type, never admitted to the schema.
- Lowercase `"new"`, or any other casing/spelling not in the table above — hard-reject by
  construction (§4), no allowlist growth without a new row in this file.

---

## 3. `OPEN`'s disposition — NOT ratified, removed from the TS type, hard-rejected at write

Three converging reasons, none of them merely "no consumer exists yet":

1. **No sanctioned producer needs it** (§1.2) — every current writer already emits `NEW`
   correctly. Ratifying `OPEN` as a real state (AC-1 option (a) in the sibling row's framing —
   "OPEN becomes a real state with a real picker") would mean building a picker/consumer for a
   value nothing legitimately produces, purely to rescue 6 rows already cleared this morning
   (§1.1 — the population this row's title describes is already zero).
2. **It collides with an established, different vocabulary from a sibling artifact**
   (`emit-dashboard-row.sh`'s DASHBOARD.md row status, whose own default IS `OPEN`) — admitting
   it into signal_queue's vocabulary would keep that collision live and invite the same
   copy-paste-across-artifacts mistake to recur with a DIFFERENT dashboard-row field next time.
3. **A quarantine-status alternative would be worse, not better, for this specific value.** The
   router's own framing (§1 of the task) offered "real state with a picker" vs "removed from the
   type and mapped" — a third option, a generic quarantine status (e.g. `"INVALID"`) that IS
   evictable and IS visible, does not apply well here because the write-time reject (§4) already
   gives strictly stronger guarantees for a value nothing needs: the writer gets IMMEDIATE,
   loud, in-band feedback (their own write fails) instead of a value that lands, waits for a
   periodic audit to notice it, and only THEN gets attention — reproducing the exact "silent
   accumulation until someone measures it" shape this whole row exists to close, just with a
   shorter fuse. Quarantine-and-evict is the right answer for a value that might be a **legitimate
   but not-yet-ratified** future state (see §4's grandfather discussion) — it is the wrong answer
   for a value that is **provably a producer mistake** (§1.2).

**Ruling: `OPEN` is removed from `orchStateStore.ts:47`'s union entirely (not carried forward as a
dead member) and is not a member of `SignalStatusEnum` (§4). Any future write of `status:"OPEN"`
to `signal_queue.rows[]` hard-rejects at the schema gate, citing the offending id/value per AC-4.**

---

## 4. Enforcement mechanism — single Zod SSOT, reject-closed with a bounded grandfather story

### 4.1 Where the enum lives, and why it closes BOTH write paths in one place

Traced the actual write topology (not assumed): `scripts/orch-validate.mjs` (the shell/jq gate
`orch-apply.sh` invokes) imports `OrchStateSchema` directly from `orchStateSchema.ts` and calls
`.safeParse()`. Separately, `orchStateStore.ts`'s `appendSignalQueueRow()` (used by every TS
in-process writer — walEscalation.ts, tasksMdJanitorJob.ts, the 3 signal writers) does **not**
validate inline — it delegates to `writeAtomicFn` (default `writeOrchStateAtomic`), which **also**
calls `OrchStateSchema.safeParse(parsed)` and throws before any fs write on failure. **Both write
paths already converge on the exact same Zod schema object** — this was not obvious from the task
framing (which reads as if two separate enforcement stories need building) and materially
simplifies the design: one enum, in one file, closes both.

```ts
// apps/mcp-server/src/infrastructure/orchStateSchema.ts, § 4 SIGNAL QUEUE SCHEMA,
// colocated next to SignalRowSchema, same file-section pattern as StatusEnum (§1)/TERMINAL_SET.
export const SignalStatusEnum = z.enum([
  "NEW", "READ", "RESOLVED", "SUPERSEDED", "ACUTE-RESOLVED-ROOT-TRACKED",
  "triaged", "TRIAGED", "RETRACTED",
]);
export type SignalStatus = z.infer<typeof SignalStatusEnum>;

export const TERMINAL_SIGNAL_SET: ReadonlySet<SignalStatus> = new Set([
  "READ", "RESOLVED", "SUPERSEDED", "ACUTE-RESOLVED-ROOT-TRACKED", "triaged", "TRIAGED", "RETRACTED",
]);
// SSOT for scripts/orch-cold-evict.sh:181 TERMINAL_SIGNAL_STATUSES — same cross-language
// hand-sync-with-comment-anchor pattern already used for TERMINAL_SET/TERMINAL_SPRINT_STATUSES
// (orch-cold-evict.sh:154-155). Drift between the two is now MECHANIZED-detectable, not just
// commented — see §6.
```

`SignalRowSchema.status: z.string()` (:284) becomes `SignalRowSchema.status: SignalStatusEnum` —
hard, no `| string` escape hatch, mirroring `StatusEnum`'s own already-established precedent for
`task_board` rows (`SSOT-W1-SERVER-ENFORCE`) exactly. This is not a new design — it is closing the
one field that never got the treatment its sibling field already has.

`orchStateStore.ts:47`'s `OrchStateSignalRow.status: "NEW"|"READ"|"RESOLVED"|"PARTIAL"|"OPEN"|string`
becomes `status: SignalStatus` (imported: `import { SignalStatusEnum, type SignalStatus, ...}
from "./orchStateSchema"` — mirrors the existing `import { OrchStateSchema, type Status }` one
line above it, §31).

### 4.2 Reject-closed, engaged not assumed — the "hot path shared by many agents" failure mode named explicitly

The task asked this to be engaged, not assumed. Concretely:

- **Is this a NEW failure mode?** No. `writeOrchStateAtomic` already throws on ANY Zod violation
  for ANY section on EVERY write today (task_board malformed rows already hard-fail the whole
  document). Adding `status`/`to` enums does not introduce all-or-nothing write semantics — it
  extends an existing, already-fleet-wide contract to a field that was inconsistently left open.
- **What actually changes:** a candidate write that used to silently succeed with a garbage
  `status` now fails synchronously, in-band, for the writer that caused it. For shell/jq writers
  (`orch-apply.sh`), that is a non-zero exit code the caller must already handle (every other Zod
  violation already produces this). For TS in-process writers (`appendSignalQueueRow`), see §4.4 —
  this is where a real, previously-latent problem was found.
- **The genuine cost, stated plainly:** if a legitimate NEW lifecycle value is ever needed (the
  same situation that produced `triaged`/`RETRACTED` in the first place, live-in-use for weeks
  before ever being ratified in a schema), every write using it hard-rejects until the enum is
  updated. Mitigation, not hand-waved: (a) the enum is a single one-line-array edit in one file —
  the sibling row's own AC-2 already names this as the design goal ("ship the mechanism so that
  adding or removing a member is a one-line change"); (b) AC-4's rejection message (sibling row)
  must name the offending id + value, turning what used to be a 10-day silent strand (§ router
  framing) into an immediate, actionable decision point — a strictly better failure mode even
  though it blocks the one write.

### 4.3 Why this is NOT the same shape as `orch-row-prose-ceiling-check.mjs`'s growth-only/grandfather pattern, and why that's the right call here

The sibling row's AC-3 cites the prose-ceiling checker's live-vs-candidate diff (pre-existing
over-ceiling row → non-blocking WARN; only NET NEW growth → reject) as the model to mirror. That
pattern requires comparing the CANDIDATE document against the LIVE file's PRIOR state per row —
Zod alone cannot express this (it validates one document, no live-file visibility), which is why
prose-ceiling-check.mjs is a **separate, dedicated `(liveFilePath, candidateFilePath)` script**,
not a Zod refinement. Two reasons this ruling does NOT build an equivalent dual-file diff script
for status/to:

1. **The live file is provably clean today (§1.1).** Prose-ceiling's grandfather exists because
   34/623 rows were *already, continuously* over-ceiling on the day that gate shipped — an ongoing
   population, not a one-time artifact. Signal-row status has zero non-conforming rows live right
   now; there is nothing to grandfather against as of this design.
2. **A dual-file diff script only protects the shell/jq write path** (it would have to be wired
   into `orch-apply.sh` as an extra stage, exactly like prose-ceiling-check.mjs is). It does
   nothing for `appendSignalQueueRow()`'s TS in-process path, which bypasses `orch-apply.sh`
   entirely and only ever sees `writeOrchStateAtomic`'s plain Zod check. Building asymmetric
   protection (shell path gets a grandfather, TS path gets a hard wall) to solve a risk that
   doesn't exist in the current data is worse than the single-Zod-gate design, not better.

**Ruling: ship the hard `SignalStatusEnum`/eventual `SignalRecipientEnum` directly in Zod, no
dual-file diff script.** The residual risk this declines to build for — a non-conforming row
landing in the window between this design and the developer's deploy — is closed procedurally
instead: **the implementing developer re-runs the exact live-conformance check from §1.1
immediately before shipping** (`jq '[.signal_queue.rows[].status] | unique - ["NEW","READ",
"RESOLVED","SUPERSEDED","ACUTE-RESOLVED-ROOT-TRACKED","triaged","TRIAGED","RETRACTED"]'` must be
`[]`). If it is not empty at that moment, that is new information this ruling did not have and the
developer escalates rather than silently widening the enum to route around it — captured as a
sibling-row AC, not re-litigated here.

### 4.4 Found in the course of this design: `appendSignalQueueRow()` already contradicts its own documented never-throw contract

`orchStateStore.ts:247-260`'s own docstring: *"If all retries are exhausted the row is dropped
with a WARN log (do NOT throw — one lost signal row is better than crashing the auditor/cowork
cycle)."* But the retry loop's `writeAtomicFn(orchStatePath, state); return;` call (§4.1's Step 4)
has **no try/catch** — only the CAS mtime-mismatch branch retries via `continue`; any OTHER
exception from `writeAtomicFn` (which, per §4.1, is exactly where `OrchStateSchema.safeParse`
throws on a schema violation) propagates uncaught straight out of `appendSignalQueueRow`, directly
contradicting the function's own stated philosophy. This is pre-existing — not introduced by this
ruling — but it was never exercised in practice because nothing on the signal-row shape could
realistically fail Zod validation before `status`/`to` were open strings. This ruling's own enum
is what will first make that latent throw reachable. **Recommended, scoped fix for the
implementing developer (not mandating the exact diff, describing the contract):** wrap the
`writeAtomicFn` call inside the retry loop in try/catch; on a schema-validation error specifically,
follow the SAME warn-and-drop path already used for CAS exhaustion (do not swallow other exception
types the same way — only the documented "one lost row beats a crashed cycle" case). This keeps
`appendSignalQueueRow`'s actual behavior honest against its own docstring rather than leaving a
mismatch this ruling would otherwise be the first thing to expose in production.

---

## 5. `to:"ops"` — ruling: INVALID for `signal_queue.rows[]`, producers repoint to `to:"po"`

Per §1.3/§1.4: ops has no consumer today, no path to gaining one without a materially bigger
change (an autonomous polling cadence this row does not need), and PO's `triage-signals.md`
already has a working, exercised bridge from an auditor/scheduler finding to an `owner:ops`
task-board mint. Ratifying `ops` as a recipient (AC-1 option (a) in the sibling row's framing)
would require inventing a consumer from nothing to rescue a producer that is trivially repointed.

**Concrete actions:**
1. `apps/mcp-server/src/scheduler/walEscalation.ts:30` — `to: 'ops'` → `to: 'po'`. One-line code
   fix; `type: 'WAL_ESCALATION'` and `severity: 'HIGH'` unchanged. This is the one sanctioned
   in-code producer identified (§1.3) — grep found no others.
2. The one live `to:"ops"` row (`po-decision-bug5468-2026-08-23T15:27:38Z`) is, under this
   ruling, itself now a dead letter (undeliverable `to`, correctly-cased `status`) — hand-corrected
   to `to:"po"` in the same pass that ships §5's code fix (a data cleanup, not a mechanism —
   grandfather does not apply to a single hand-fixable row the ruling itself identifies).
3. `.claude/skills/signal-dashboard/SKILL.md` § Receivers table gains an explicit negative
   entry: `ops` is NOT a valid `to` — route ops-actionable findings via `to:"po"`, which already
   dispatches `owner:ops` task-board work per `triage-signals.md`'s existing rules. Prevents the
   next hand-authored mint from repeating §1.2's mistake.

### 5.1 `SignalRecipientEnum` — same closed-vocabulary treatment as `status`, same reasoning as §4.2/§4.3

Task's own question: *"Address whether `to` needs the same closed-vocabulary treatment as status,
and whether a row addressed to an agent with no consumer should be rejectable at write time."*
**Yes to both**, justified by §1.3 alone — this is not a hypothetical, it already happened in
shipped code and would have stayed invisible until someone measured the WAL file (nobody had, as
of this design).

```ts
export const SignalRecipientEnum = z.enum(["po", "tran-ngoc-bau", "alert-commander", "unified-agent"]);
export type SignalRecipient = z.infer<typeof SignalRecipientEnum>;
```

**Deliberately an inline TS enum, not a live read of `docs/data/system-map.json`
`.project.cowork_signal_recipient`** — even though that file is this exact list's true authoring
location and CLAUDE.md's "never hardcode structural data" rule generally argues for reading it
live. Named tradeoff, not hidden: `cowork_signal_recipient` growth is deliberate and
agent-father/PM-coordinated (standing up a new cowork consumer), materially different in kind from
signal-row status (near-frozen). Reading system-map.json inside a Zod `.refine()` on every
`signal_queue` write would introduce a new I/O dependency into what has always been a pure,
synchronous, in-memory schema check, and — more importantly — would COUPLE two previously
independent hot files' failure modes (a malformed/missing `system-map.json` would now be able to
block every orch-state.json write, a new fragility this ruling does not want to buy). The inline
enum is a hand-synced mirror of `cowork_signal_recipient`, same relationship as `TERMINAL_SIGNAL_SET`
↔ `orch-cold-evict.sh`'s bash default (§4.1) — kept honest by the SAME standing drift-check script,
§6, rather than by real-time coupling.

`orchStateSchema.ts`'s `SignalRowSchema.to: z.string().optional()` → `to: SignalRecipientEnum
.optional()` (stays optional — some archived/legacy rows predate a mandatory `to`).
`orchStateStore.ts:38`'s `OrchStateSignalRow.to: string` → `to: SignalRecipient`.

---

## 6. Standing dead-letter / vocabulary-drift visibility (AC-4, permanent — not a one-time sweep)

Two things must be checked on a standing cadence, not just at ship time, because the 2026-08-08
precedent (§ router framing) shows a fix that closes the CURRENT population but not the CLASS
recurs:

1. **Dead-letter count** (sibling row's own AC-4): rows whose `status` is in neither `{NEW}` nor
   `TERMINAL_SIGNAL_SET` — with a hard `SignalStatusEnum` (§4) this should be structurally zero
   going forward, but the check must exist independently of the write gate (defense-in-depth
   against any future write path that bypasses both `orch-apply.sh` and `writeOrchStateAtomic` —
   e.g. a raw fs write, or a future refactor that forgets to route through either).
2. **Vocabulary-mirror drift** (new, not in the sibling row's AC list, added by this ruling):
   `TERMINAL_SIGNAL_SET` (TS) vs `orch-cold-evict.sh`'s `TERMINAL_SIGNAL_STATUSES` bash default,
   and `SignalRecipientEnum` (TS) vs `cowork_signal_recipient` (system-map.json) — both are
   hand-synced mirrors by design (§4.1/§5.1), and a hand-sync with no automated cross-check is
   exactly the mechanism that let the 2026-08-08 fix's own allowlist go stale.

**One script, both checks**, run the same way `guard-signal-type-coverage.sh` already does (this
repo's own precedent for "parse the SSOT docs, don't hand-maintain a duplicate array" —
`docs/WORK.md` 2026-08-22 entry) and wired into `.github/workflows/ci.yml` as a new job, same
pattern as that guard's own `signal-type-coverage-guard` job:
- `scripts/audits/signal-queue-vocabulary-drift-check.sh` — (a) counts live `.signal_queue.rows[]`
  whose `status` is outside `{NEW} ∪ TERMINAL_SIGNAL_SET`, fails loud (non-zero exit, named ids)
  if count > 0; (b) extracts `orch-cold-evict.sh`'s literal `TERMINAL_SIGNAL_STATUSES=` default
  and asserts it is byte-set-equal to `TERMINAL_SIGNAL_SET` (imported from the TS module via
  `bun -e`, same idiom `orch-row-prose-ceiling-check.mjs` already uses to run TS-adjacent checks
  under `bun`); (c) asserts `SignalRecipientEnum`'s members are byte-set-equal to
  `docs/data/system-map.json .project.cowork_signal_recipient` (read via `jq`).

---

## 7. Non-goals — stated explicitly, not left implied

**7.1 `severity`** (`SignalRowSchema.severity: z.string()`, same file, adjacent comment deferring
an enum "post-signal-cleanup") — the sibling row's own AC-5 already asks the implementer to either
enum it in the same pass or record an explicit refusal. Not ruled on here: this task named three
things (status vocabulary, OPEN's disposition, the `to:ops` hole) and severity is none of them.
Ruling on it would be scope creep past what was asked, and it already has its own tracked, deferred
history distinct from this defect class (legacy `P1`/`WARN`/`MEDIUM` values live today, a genuinely
different cleanup shape). Left to the developer child per the sibling row's own AC-5, not decided
here.

**7.2 `task_board.head`'s `OPEN` / `sprint_goal.entries[].status: "OPEN"` / DASHBOARD.md row
`OPEN`** — confirmed disjoint namespaces (§1.2), each with its own established, working consumer
(`orchestrationHandler.ts:219`'s `.toUpperCase()==="OPEN"` sprint-goal picker, `emit-dashboard-row.sh`'s
own DASHBOARD.md lifecycle). None of these are touched — the collision that produced §3's ruling is
a naming coincidence across artifacts, not a shared defect.

**7.3 The 2026-07-12 rescoped-enum precedent that would have shipped without `triaged`/`RETRACTED`**
(`docs/handoffs/UC-ASL-P5-BA-spec.md:71`) is not reopened — it was correctly declined at the time
(would have Zod-rejected 18/22 live rows) and this ruling's §2 table already folds its corrected
8-value vocabulary in, so there is nothing left to re-litigate from that thread.

**7.4 The BOUNDED-1/SLS dispatch-layer gap that stranded this row for a day before router
hand-dispatch.** This is a general defect (any non-dev-`next_agent`, non-`plan_only` backlog row
is unreachable by any automated picker — `docs/agents/dev-team/flow/main.md:640`'s own comment
already names it "a tracked residual gap"), not specific to signal_queue semantics — it happened
to be the mechanism that delayed THIS row, but fixing it belongs to the dispatch layer
(`docs/agents/dev-team/flow/main.md`), not to a signal-queue vocabulary brief. **Declared out of
scope, named rather than left implied, per the task's own instruction.** Already passively
surfaced (not silently unassumed) by `scripts/audits/bounded1-supervised-lane-report.sh`'s
SECONDARY section. If PO/PM want it actively tracked as a fix rather than a passive report, the
row it would need is: **`FIX-BOUNDED1-NONPLANONLY-NONDEV-NEXTAGENT-NO-SWEEP-LANE`** — asserting
that a backlog row gated by the NON-DEV-NEXT_AGENT gate AND not `plan_only` needs either its own
automated sweep lane (mirroring SLS's shape but keyed off NON-DEV-NEXT_AGENT without requiring
`plan_only`) or a documented, load-bearing recurring PO obligation to sweep
`bounded1-supervised-lane-report.sh`'s SECONDARY output on a fixed cadence — not minted here
because it is a dispatch-layer/router-zone concern this brief has no standing to scope, and
dedup-checked against the live board (`FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE`,
`FIX-DRS-SWEEP-006-BOUNDED1-REGRESSION` — neither covers this specific "no lane at all" gap).

**7.5 No dual-file live-vs-candidate diff script for status/to** — reasoned explicitly in §4.3,
not an oversight.

---

## 8. Split — developer (mechanism, enriched sibling row) + agent-father (docs), per the sibling row's own owner precedent

Files span `apps/mcp-server/src/infrastructure/` + one scheduler file (developer, code) and
`.claude/skills/signal-dashboard/` (agent-father, the established owner of agent-flow/signal-queue
prose in this repo — same zone precedent as `FIX-SIGNALQUEUE-SIGNAL-DASHBOARD-DOCS`, the sibling
docs child already living under the `FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT` epic).

**No new mechanism row minted for the enum/enforcement work** — `FIX-ORCHAPPLY-SIGNALROW-STATUS-
UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES` already exists (developer, P1, `depends:[]`) and
its own AC-2 was explicitly waiting on this ruling. Enriched in place (same write this brief's
RETURN performs) with: the concrete §2 vocabulary + §3 OPEN ruling + §4's `SignalStatusEnum`/
`TERMINAL_SIGNAL_SET` design + §4.4's `appendSignalQueueRow` throw-contract finding + §5's
`SignalRecipientEnum`/`walEscalation.ts` repoint + §6's combined drift-check script — `files[]`
extended to add `apps/mcp-server/src/scheduler/walEscalation.ts` and
`scripts/audits/signal-queue-vocabulary-drift-check.sh`; `size` corrected `S`→`M` (now materially
more than the single-field fix it was scoped as before this ruling landed). `depends:[]` unchanged
— nothing blocks it now that the ruling exists.

**One new row**, docs-only, independently dispatchable (the ratified vocabulary is fixed by this
brief, not pending developer discretion — no runtime coupling to wait on, unlike the auditor-tier1
precedent's genuinely coupled halves):

- `FIX-SIGNALQUEUE-STATUS-TO-VOCABULARY-DOCS` (agent-father, P1, `depends:[]`) — updates
  `.claude/skills/signal-dashboard/SKILL.md` § Receivers (ops negative-entry, §5.3) and § ACK/CLOSE
  (cite the 8-member `SignalStatusEnum` as the now-enforced SSOT, §2) plus a
  `.claude/skills/signal-dashboard/reference.md` note on the `to:ops`→`to:po` redirect rule.

This row (`FIX-SIGNALQUEUE-OPEN-STATUS-DRAINED-BY-NOTHING-EVICTED-BY-NOTHING`) becomes the
umbrella: `children=[FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-UNEVICTABLE-VALUES,
FIX-SIGNALQUEUE-STATUS-TO-VOCABULARY-DOCS]`, `next_agent=qa` once both reach review — QA's joint
check: (i) §4.3's pre-deploy live-conformance re-check was actually run and is clean, (ii) §6's
drift-check script passes against the shipped enum, (iii) AC-6 (sibling row) regression on a THIRD
unseen value (`"Open"` or `"pending"`, not `OPEN` and not lowercase `new`) actually rejects,
(iv) `walEscalation.ts`'s `to:'po'` repoint has a test asserting it, (v) the SKILL.md docs child
literally cites the same 8/4-member lists this brief ratifies (no drift between the shipped code
and the shipped prose describing it).

---

## RETURN

```
DONE: Ruled on the 3 items the sibling developer row's AC-2/AC-1 were waiting on: (1) ratified
8-member SignalStatusEnum (NEW/READ/RESOLVED/SUPERSEDED/ACUTE-RESOLVED-ROOT-TRACKED/triaged/
TRIAGED/RETRACTED), derived from live data (100% clean today) + the two SSOT docs, no member
invented; (2) OPEN removed from the TS type entirely, hard-rejected at write (not quarantined —
no sanctioned producer needs it, §3); (3) to:ops ruled INVALID — walEscalation.ts is a SANCTIONED,
correctly-cased, already-shipped producer with zero consumer (proves AC-1's warning empirically,
not hypothetically), repointed to to:po which already has a working PO-mediated ops-dispatch path;
added SignalRecipientEnum (4 members) with the same closed-vocabulary + reject-at-write treatment
as status, justified against the walEscalation.ts evidence. Both enums are inline TS (not a live
system-map.json read) to avoid coupling two independent hot files' failure modes — kept honest by
a new combined drift-check script (§6) instead. Found and flagged (not fixed) a pre-existing
appendSignalQueueRow() throw-contract bug this ruling's own enum will be the first thing to
exercise (§4.4). BOUNDED-1/SLS routing gap that stranded this row: named explicitly as OUT OF
SCOPE (§7.4), candidate row FIX-BOUNDED1-NONPLANONLY-NONDEV-NEXTAGENT-NO-SWEEP-LANE named, not
minted — dispatch-layer concern, not signal-queue vocabulary.
ZONE: multi (apps/mcp-server/src/infrastructure/ + apps/mcp-server/src/scheduler/walEscalation.ts
-> developer; .claude/skills/signal-dashboard/ -> agent-father)
NEXT: developer (enriched FIX-ORCHAPPLY-SIGNALROW-STATUS-UNVALIDATED-ADMITS-UNPICKABLE-
UNEVICTABLE-VALUES, depends=[]), agent-father (new FIX-SIGNALQUEUE-STATUS-TO-VOCABULARY-DOCS,
depends=[], parallel-safe), then qa on this umbrella row for the joint cross-check once both reach
review.
HANDOFF: docs/architecture-briefs/2026-08-24-fix-signalqueue-status-and-recipient-vocabulary.md
PIPELINE: continue
```
