# SIGNALQUEUE-COLLAPSE-PERSISTENT-FINDING + AUDITOR-OUTPUT-CONTRACT-TALLY-FIX

**Date:** 2026-07-20
**Author:** agents-architect
**Status:** DESIGN COMPLETE — PLAN-ONLY, non-urgent batch improvement (not a fire)
**Slug:** signalqueue-persistent-finding-collapse-and-tally-accuracy
**Trigger:** Router batch request (2 non-urgent design questions), session `f4ca241d-7838-4cde-b671-b42e33e81653`

---

## 0. Executive Summary

Two independent, batched design questions about `docs/data/orch/orch-state.json` `.signal_queue`:

1. **Collapse-to-single-row** — should N append-always rows for the SAME persistent finding
   collapse into one upserted row (occurrence_count/first_seen/last_seen)? **Recommendation: YES,
   via a new downstream compaction pass — never touch the append-always emit path.**
2. **OUTPUT-CONTRACT tally flakiness** — `signal_queue_rows_written` self-reports 0/2/2 for
   identical work. **Root cause found: a documentation gap, not a script bug** — `emit-audit-signal.sh`
   behaves deterministically every time; `docs/agents/system-auditor/flow/main.md`'s OUTPUT-CONTRACT
   instructions never tell the LLM how to count a `SKIP-dedup` marker toward the row-write tally,
   only how to count `ABORT`. **Recommendation: doc-only counting-rule fix (agent-father, ship now)
   + optional script-level unambiguous marker (developer, batch with item 1).**

**Prior-art verdict: FRESH brief, not folded into `FIX-SIGNALQUEUE-DUP-ID-GUARD`** — see §1.
**No `.signal_queue.rows[]` mutation performed by this brief** (non-destructive constraint honored;
all evidence below is read-only `jq`).

---

## 1. Prior-Art Check (mandatory, run before minting)

Searched `docs/architecture-briefs/`, `docs/data/orch/orch-state.json` `.task_board`,
`docs/data/orch/archive/backlog-detail.json`, `docs/handoffs/`.

### 1.1 `FIX-SIGNALQUEUE-DUP-ID-GUARD` (BACKLOG, status TODO, owner `developer`, zone `cross-service/`)

Read in full (`docs/handoffs/TASK_FIX-SIGNALQUEUE-DUP-ID-GUARD.md` +
`archive/backlog-detail.json` line 7638). Its `status_note` is explicit and narrow:
> "THIS task owns ONLY the validate-side belt+suspenders guard + ts-format; do NOT double-fix
> D4 emitter."

Its AC is: **reject writes where two rows share the literal same `.id` value** (a defect —
accidental id collision), plus normalize auditor `ts` to full ISO8601.

**Verified this does NOT apply here.** Live-checked the 26 current pdf-extractor A-11/A-20 rows
(`jq -c '.signal_queue.rows[] | select(.summary|test("A-11|A-20|pdf-extractor"))'`) — **every row
has a genuinely distinct `id`** (`sys-<compact-ts>-<4hex>`, e.g. `sys-20260720T054158-2b57` vs
`sys-20260720T054204-28c5`), and every `ts` is already full ISO8601 (`2026-07-20T05:42:04Z`). There
is no id collision and no ts-format defect in this data. Item 1 is about N **distinct-id** rows for
the *same semantic finding* — an entirely different mechanism than a duplicate-id bug. Item 2 is
about a self-report counting instruction gap, unrelated to id uniqueness or ts format. **Folding
either item into `FIX-SIGNALQUEUE-DUP-ID-GUARD` would violate that task's own explicitly-scoped
narrow-scope discipline (the same discipline that already fenced off the D4 emitter as a separate
ticket below) — so I mint fresh instead.**

### 1.2 `FU-AUDITOR-D4-SIGNAL-ID` (BACKLOG, P3, zone `docs/agents/system-auditor`) — directly relevant precedent, not a duplicate

`archive/backlog-detail.json` line 7603. This is the ticket `FIX-SIGNALQUEUE-DUP-ID-GUARD` itself
points to for the D4-specific case: D4 emits one row per divergence but **reuses one run-scoped id**
(`sau-d4-<YYYYMMDDHHMM>`) across all of them — a real id-collision bug, 75 rows under one id on
2026-06-05. Its own proposed fix already names the two options relevant here:
> "(a) emit ONE rollup signal with a `findings[]` array (matches anomaly-task-bridge 'one deduped
> entry' philosophy), or (b) give each finding a unique id."

This is the closest prior-art precedent for Item 1's "collapse" philosophy, but it is **narrower**
(D4-specific, and it is actually an id-uniqueness defect, since D4's rows illegally share one id —
which IS in `FIX-SIGNALQUEUE-DUP-ID-GUARD`'s guard scope). The pdf-extractor A-11/A-20 case has no
id defect at all; it is a **general emit-always** pattern producing legitimate, distinct, correct
rows for a **recurring condition**. §2 below generalizes option (a) from D4-only to any check.
Not touching `FU-AUDITOR-D4-SIGNAL-ID`'s board row myself (pm/po call) — flagging the relationship
only; see §4.

### 1.3 Precedent architecture already proven in this repo

- `scripts/orch-cold-evict.sh` — an existing, production, cron-driven **downstream/batch transform
  pass** over `.signal_queue.rows[]`/`.archive[]` (evicts terminal-status rows to a cold external
  store, same atomic read→transform→`orch-apply.sh`-write discipline). Proven pattern to extend for
  Item 1's compaction pass rather than inventing a new write architecture.
- `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md` — already establishes the
  "shrink the hot view, preserve full history in a cold/archive lane" philosophy for this exact
  file, for a different (volume/bloat) trigger. Item 1 reuses the philosophy, different trigger
  (semantic duplication, not terminal status).
- `.claude/skills/anomaly-task-bridge/SKILL.md` — "one deduped entry" philosophy already shipped
  elsewhere in the system for a sibling problem class.

### 1.4 `docs/handoffs/` sweep

No handoff matches `occurrence_count`, `collapse`, `OUTPUT-CONTRACT`, or
`signal_queue_rows_written`. `FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md` is a different
mechanism (news-scout cross-session signal-visibility window) — not prior art here.

**Verdict: mint one fresh brief covering both items** (this file), cross-referencing but not
folding into either existing row.

---

## 2. Item 1 — Collapse-to-single-row for persistent findings

### 2.1 Evidence (live, this session)

26 live `status=NEW`/`triaged` rows currently exist for the ONE underlying pdf-extractor
event-loop-stall condition (A-11 container-unhealthy + A-20 multi-probe 0/3), spanning
`2026-07-19T20:46Z`→`2026-07-20T05:42Z`, `type` alternating `signal_feedback` (20) /
`microservice_degraded` (6) — the category-type is itself inconsistently chosen across call sites
for the same check_id, a minor secondary finding. **PO has already hand-collapsed 20 of the 26 with
an almost byte-identical disposition string** repeated 4 times verbatim:
> "COLLAPSE (append-always dup of ONE recurring condition). ... Tracked by existing backlog
> PDF-AVAIL-02-FIX ... recurring_bug_count=5). PLAN-ONLY, no new mint (prior-art)."

This is the single strongest evidence for mechanizing the collapse: a human/agent is already
performing the exact judgment call, by hand, every triage pass.

### 2.2 A schema gap that blocks any collapse design today

`scripts/emit-audit-signal.sh` `_build_row_json()` (lines 321-332) persists onto the row **only**:
`{id, ts, from, to, type, summary, severity, status, payload_ref:null}`. The `check_id` and
`dedup_key` arguments the caller passes (`--check-id`, and `.dedup_key` inside `--detail-json`) are
used **only** for the ephemeral 7-day Telegram-mute ledger (`docs/data/auditor-dedup-ledger.json`)
and the E-1 `post_agent_signal` payload — **neither is ever written onto the persisted
`signal_queue` row.** Today's only join key across the 26 rows is fuzzy `summary` text matching
(which is not even consistent phrasing — compare `"A-11 FAIL: pdf-extractor — UNHEALTHY (event loop
stall)"` vs `"pdf-extractor A-11 UNHEALTHY — container health check failing"`). **Any collapse
mechanism — inline or downstream — first requires `check_id`/`dedup_key` to become persisted,
optional fields on the row.** This is a small, additive, backward-compatible schema change (Zod
`.optional()` field), not a rewrite.

### 2.3 Recommendation: downstream compaction pass, NOT an inline emit-path change

**Do not touch the E-3 append-always write** (`emit-audit-signal.sh` / flow/main.md line 632/639-640)
— per the router's explicit hard constraint and per this repo's own append-always CONTRACT
(`init.md:38`, `flow/main.md:632`). Preserving append-always here also protects:
- the just-shipped UC-ASL-P2 fail-loud CAS-retry contract (no new conditional-upsert branch to
  break),
- the "signal_row status lags groundtruth" / append-always STANDING lessons — every raw occurrence
  stays recorded somewhere, nothing is silently dropped at write time.

Instead, add a **new downstream compaction pass**, modeled directly on `orch-cold-evict.sh`'s
proven architecture (atomic read → transform → `orch-apply.sh` write, same CAS-guard discipline):

```
scripts/signalqueue-collapse-persistent.sh   (new, cross-service/)

For rows where status == "NEW" (pre-triage only — see §2.4):
  group by (check_id, dedup_key) — both must now be present per §2.2
  for each group with count >= 2:
    canonical = the row with the LATEST ts (most current summary text is most useful to a triager)
    canonical.occurrence_count = group.length
    canonical.first_seen_ts    = MIN(group[].ts)
    canonical.last_seen_ts     = MAX(group[].ts)   # == canonical.ts
    the other (count-1) raw rows -> moved to .signal_queue.archive[]
      each stamped collapsed_into: <canonical.id>   (full traceability, nothing deleted)
    .signal_queue.rows[] now holds ONE row for this group
```

Run cadence: fold into the existing prune/drain cadence already touching this file (same cron
family as `orch-cold-evict.sh`) — no new cron primitive needed.

### 2.4 Interaction with the existing `status` lifecycle (explicit answer to the router's question)

Compaction only ever touches **`status=NEW`** rows. The moment PO/router sets `status=triaged` on
any row in a group (exactly as already happened for 20/26 of the pdf-extractor rows), that row and
its siblings are **frozen** — the pass leaves the group alone from then on, identical to today's
behavior. This means: (a) triage decisions are never silently re-litigated by the compactor, (b) a
triager who reads a `status=triaged` row today sees exactly what they saw when they triaged it,
(c) only the **noisy pre-triage NEW backlog** shrinks — which is precisely the triage-load problem
described in the router's brief.

### 2.5 Alternative considered and rejected: inline upsert-by-dedup_key inside `emit-audit-signal.sh`

Rejected: it would require `_e3_write_row` to search `.signal_queue.rows[]` for a matching
`dedup_key` before deciding append-vs-update, adding branching complexity + risk to a fail-loud
script that just shipped (UC-ASL-P2), for zero additional ledger-completeness over the downstream
pass, and it is exactly the "append-always" contract surface the router flagged as off-limits.

---

## 3. Item 2 — OUTPUT-CONTRACT tally accuracy

### 3.1 Root cause (read `scripts/emit-audit-signal.sh` in full + `flow/main.md:587-649`)

`_e3_write_row()` (script lines 336-370) **always** attempts the row write, independent of the
E-2/Telegram dedup decision (`DEDUP SCOPE`, script header lines 62-65: "dedup gates E-2 ... ONLY.
E-1 ... and E-3 ... ALWAYS fire regardless of dedup state"). On success, `run_emit_signal()`
(lines 451-481) prints exactly one of:
```
[emit-signal] OK dedup_key=<k> id=<id>
[emit-signal] SKIP-dedup dedup_key=<k> last_sent=<ts> id=<id>
[emit-signal] OK-escalation-bypass dedup_key=<k> ... id=<id>
[emit-signal] OK e3-only id=<id> check_id=<id>
[emit-signal] OK no-telegram id=<id> check_id=<id>
```
**Every one of these five forms only prints after `_e3_write_row` has already returned success** —
an `id=` is only ever present because the row write succeeded (if `_e3_write_row` fails, the
function returns 1 early and prints a distinct `ABORT e3-write-failed|e3-cas-exhausted|
e3-readback-failed` line instead, never reaching the success marker). **The script is
deterministic**: any non-`ABORT` marker == one real row written, every single time. No flakiness
exists at the script layer.

The flakiness is a **prompt-instruction gap** in `docs/agents/system-auditor/flow/main.md`. The
flow doc explicitly instructs the LLM auditor how to treat `ABORT` for the `signals_posted` counter
(lines 305, 599: *"`ABORT ...` → do NOT count this source/check toward `signals_posted`"*) but gives
**no equivalent instruction anywhere for `signal_queue_rows_written`**, and never states how to
treat a `SKIP-dedup` marker for either counter. Left to infer from the word "SKIP", the LLM
sometimes (incorrectly) reads `SKIP-dedup` as "this whole emit was skipped — count 0 toward
signal_queue_rows_written" and sometimes (correctly) counts the row anyway — reproducing exactly
the observed 0 → 2 → 2 sequence for identical actual work (both cycles genuinely wrote 2 rows).

### 3.2 Recommendation — two complementary fixes

**(a) PRIMARY, doc-only, ship immediately — agent-father, zone `docs/agents/system-auditor/`.**
Add an explicit counting rule to `flow/main.md`'s OUTPUT-CONTRACT section (~line 644-649):
> `signal_queue_rows_written` = count of `[emit-signal]` marker lines pasted into the notebook THIS
> cycle that do **NOT** start with `ABORT` — `OK`, `SKIP-dedup`, `OK-escalation-bypass`,
> `OK e3-only`, and `OK no-telegram` **all** count (E-3 always executes regardless of the E-2/dedup
> outcome — see `emit-audit-signal.sh` header, DEDUP SCOPE). `telegram_sent` = count of `OK` +
> `OK-escalation-bypass` markers **only** (excludes `SKIP-dedup`, `e3-only`, `no-telegram`).

This converts an ambiguous judgment call into a mechanical count — directly removes the root cause,
zero code risk, no script touched.

**(b) OPTIONAL hardening, batch with §2's script work — developer, zone `cross-service/`.** Add a
second, unambiguous, always-fires-on-success marker line to `emit-audit-signal.sh`, independent of
the E-2 dedup wording, e.g. `[emit-signal] E3-ROW-WRITTEN id=<id>` printed right before/after the
existing dedup-outcome line. This lets a future tally be a mechanical `grep -c "E3-ROW-WRITTEN"`
instead of LLM arithmetic over prose — the same "verify raw not badges" / "gate timestamp not
prose" preference already standing in this project. Small diff (~3 lines script + matching case in
`emit-audit-signal.test.sh`).

Sequencing: (a) is independent and should not wait on anything. (b) is optional and naturally
batches with §2.2's schema-field addition since both touch `emit-audit-signal.sh` in the same
region (`_build_row_json`/`run_emit_signal`) — one developer task, one diff, one test-file update.

---

## 4. Implementation Route

| Work item | File(s) | Zone | Owner | Urgency |
|---|---|---|---|---|
| 2(a) OUTPUT-CONTRACT counting-rule doc fix | `docs/agents/system-auditor/flow/main.md` (~L644-649) | `docs/agents/system-auditor/` | **agent-father** (direct edit) | ship now, zero risk |
| §2.2 + §2.3: persist `check_id`/`dedup_key` on row + new `signalqueue-collapse-persistent.sh` compaction pass | `scripts/emit-audit-signal.sh` (`_build_row_json`), new `scripts/signalqueue-collapse-persistent.sh`, `scripts/orch-apply.sh` (no change expected — reuses existing write path), `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (add optional `check_id`/`dedup_key`/`occurrence_count`/`first_seen_ts`/`last_seen_ts`/`collapsed_into` fields to the row schema) | `cross-service/` | **developer** (mint BACKLOG row, pm to schedule) | non-urgent, batch |
| 2(b) optional `E3-ROW-WRITTEN` marker | `scripts/emit-audit-signal.sh`, `scripts/emit-audit-signal.test.sh` | `cross-service/` | **developer** (same task as row above) | optional, batch |

Recommend PM mint ONE new BACKLOG row (suggested id `FIX-SIGNALQUEUE-COLLAPSE-PERSISTENT-FINDING`,
type FIX, priority P3/low, zone `cross-service/`, owner `developer`) covering the second and third
table rows together, `related: ["FU-AUDITOR-D4-SIGNAL-ID", "FIX-SIGNALQUEUE-DUP-ID-GUARD"]` (cross-
reference, not fold — see §1.1/§1.2). Once implemented, `FU-AUDITOR-D4-SIGNAL-ID`'s option (a)
("findings[] rollup") is subsumed by this general mechanism — pm/po may then consider marking that
row superseded, at their own discretion; this brief does not mutate that row.

This brief performs **zero writes to `.signal_queue.rows[]` or `.archive[]`** — all evidence above
was gathered via read-only `jq`, per the router's hard non-destructive constraint.

---

## 5. Verification Gate (for whoever implements — test design, not run by this brief)

1. **Schema addition regression:** existing rows (no `check_id`/`dedup_key`) must still validate —
   fields are `.optional()`, not required.
2. **Collapse pass, happy path:** fixture with 5 `status=NEW` rows sharing one `(check_id,
   dedup_key)` → after compaction: 1 row in `.rows[]` with `occurrence_count=5`, correct
   `first_seen_ts`/`last_seen_ts`; 4 rows moved to `.archive[]`, each `collapsed_into` == the
   canonical row's id. Total row count conserved (5 before == 1+4 after).
3. **Status-freeze guard:** fixture with 3 `status=triaged` rows sharing a key → compaction pass
   must leave all 3 untouched (regression test for §2.4).
4. **OUTPUT-CONTRACT counting rule:** re-run the exact 2-row A-11+A-20 cycle that produced 0/2/2 —
   after doc fix (a), the auditor's self-reported `signal_queue_rows_written` must equal 2 on every
   cycle, verified by an independent `jq` count of rows with `ts` inside that cycle's window (the
   router's own existing verification practice — "jq the serving delta").

---

## 6. Files Read / Commands Run (citation)

- `docs/agents/agents-architect/init.md`, `handlers.md`, `flow/main.md` (full)
- `docs/protocols/fail-loud-protocol.md`, `docs/policies/commit-convention.md`,
  `.claude/skills/commit-boundary/SKILL.md` (full)
- `docs/agent-memory/notebooks/agents-architect.md` (full)
- `docs/handoffs/TASK_FIX-SIGNALQUEUE-DUP-ID-GUARD.md` (full)
- `docs/data/orch/archive/backlog-detail.json` lines 7595-7700 (`FU-AUDITOR-D4-SIGNAL-ID`,
  `FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE`), 7630-7648 (`FIX-SIGNALQUEUE-DUP-ID-GUARD` full
  record)
- `docs/data/orch/orch-state.json` lines 6951-6970 (task_board backlog row) + `.signal_queue.rows`
  (full jq scan for `A-11|A-20|pdf-extractor`) + `.head` (idle check)
- `scripts/emit-audit-signal.sh` (full, 488 lines)
- `docs/agents/system-auditor/flow/main.md` lines 280-420, 580-680 (Emit Sequence + D-BCTC-EVAL +
  D-IMPROVE + OUTPUT-CONTRACT + Anomaly Reporting sections)
- `docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md` (grep, targeted read)
- `scripts/orch-cold-evict.sh` (existence + grep confirmation, precedent architecture)
- `docs/references/agent-roster.md` (full — zone/ownership confirmation)
- `docs/handoffs/FIX-DMS1-DMS2-SIBLING-DEDUP-CORROBORATION-spec.md` (targeted, ruled out as
  unrelated)
- `docs/improvement-proposals/` listing (no match)

```bash
jq -c '.signal_queue.rows[] | select(.summary // "" | test("A-11|A-20|pdf-extractor"))' docs/data/orch/orch-state.json
jq '[.signal_queue.rows[] | select(.summary // "" | test("A-11|A-20|pdf-extractor"))] | length' docs/data/orch/orch-state.json   # -> 26
jq -r '.signal_queue.rows[] | select(...) | .type' docs/data/orch/orch-state.json | sort | uniq -c   # -> 6 microservice_degraded, 20 signal_feedback
jq -r '.head' docs/data/orch/orch-state.json   # -> idle, no zone collision
grep -n "FIX-SIGNALQUEUE-DUP-ID-GUARD" docs/data/orch/orch-state.json docs/data/orch/archive/backlog-detail.json
grep -n "OUTPUT-CONTRACT\|Known dedup_key" docs/agents/system-auditor/flow/main.md
```

---

## RETURN

DONE: Brief authored — Item 1 (collapse-to-single-row) designed as a downstream compaction pass +
minimal schema addition, never touching the append-always emit path; Item 2 (tally flakiness)
root-caused to a `flow/main.md` instruction gap (script itself is deterministic), fixed via a
doc-only counting rule + optional script marker hardening.
ZONE: multi — `docs/agents/system-auditor/` (agent-father) + `cross-service/` (developer)
FOLD-VS-FRESH: FRESH — `FIX-SIGNALQUEUE-DUP-ID-GUARD` is a distinct id-collision/ts-format defect
class, not a natural fit; cross-referenced `FU-AUDITOR-D4-SIGNAL-ID` as related-but-narrower prior
art instead.
NEXT: agent-father — apply §3.2(a) doc fix directly; loop pm to mint the §4 BACKLOG row
(`FIX-SIGNALQUEUE-COLLAPSE-PERSISTENT-FINDING`, owner `developer`, zone `cross-service/`) for §2/§3.2(b).
HANDOFF: docs/architecture-briefs/2026-07-20-signalqueue-persistent-finding-collapse-and-tally-accuracy.md
PIPELINE: complete
