---
task_id: TASK-SIGINBOX-ORPHAN-ESCALATION-CORE
parent: FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER
owner: developer
size: M
zone: cross-service/
branch: none — NO BRANCHES, all work on `main` (project CLAUDE.md rule; the `task/NNN-kebab` line in docs/agents/pm/flow/main.md Step 3b is a known doc defect, do not follow it)
depends_on: []
blocks: [TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER, TASK-SIGINBOX-LIVE-FIRST-RUN-GATE]
---

# TASK-SIGINBOX-ORPHAN-ESCALATION-CORE — age-bounded one-shot escalation for genuinely orphaned inbox files

## §1-tldr

`docs/signals/` is a write-only directory for most of what lands in it. `isDrainableShape()`
skips any file lacking all of `from`/`source`/`type`/`signal_type`, and a skipped file is never
enveloped, never routed, never fingerprinted, never pruned — it just accumulates. Measured
2026-08-23: 51 files, 2 drainable.

You are adding an **age-bounded, one-shot, dedup'd escalation** for the genuinely-orphaned subset,
inside `drain-signals.js`'s existing per-file classification loop. You are **not** widening the
reader, and you are **not** touching the by-path exemption.

---

## §2-hard-constraint-read-this-before-anything-else

**`isDrainableShape()` (`scripts/agents-flow/drain-signals.js:84-88`) and `isByPathConsumerFile()`
/ `BY_PATH_CONSUMER_FAMILIES` (`:101-107`) stay BYTE-FOR-BYTE UNCHANGED. Do not edit them. Do not
"improve" them. Do not add a prefix to `BY_PATH_CONSUMER_FAMILIES`. Do not remove one.**

Why this is stated this loudly: of the 49 currently-non-drainable files, **21 are `price_anomaly_*`
by-path dish inputs that are working exactly as designed** — glob-read by Chef EOD
(`docs/agents/unified-agent/flow/chef.md:130,153`). That family has been misdiagnosed as "stuck
inbox litter" **four times already**; the script's own comment at `:91-100` records this, and
`docs/standards/mcp-tools.md:186` § `price_anomaly — DUAL-PLANE CONTRACT` is the canonical
write-up. Folding them in would be the fifth.

The obvious-looking fix — "synthesize an envelope from filename + mtime so everything drains" —
is **explicitly rejected** by the design (architect brief §2). Any predicate that infers
drainability from filename shape will eventually match a protected by-path family, or miss the
next one. If you arrive at this task with only a file list and reach for reader-widening, stop
and re-read this section.

**Also unchanged, deliberately out of scope:**
- `docs/agents/market-watcher/flow/eod.md` — DO-NOT-RELOCATE / DO-NOT-ENVELOPE contract at `:29-45`.
- `scripts/agents-flow/notebook-auto-prune.sh` — it has a live `grep -c ... || echo 0` double-emit
  bug at `:574-575` that produces malformed signal JSON. It is real, it is still firing, and it is
  **NOT yours**. It has its own board row: `FIX-NOTEBOOKAUTOPRUNE-GREPC-DOUBLE-EMIT-WRITES-MALFORMED-SIGNAL-JSON`.
  Your escalation mechanism will *surface* every future instance of it as `category="malformed"` —
  that is the intended outcome, not a reason to fix the writer here.
- `price_anomaly_*` unbounded growth (oldest on disk is 52 days, nothing ever prunes them) — real,
  measured, and owned by `CLEAN-PRICEANOMALY-SIGNAL-FILES-UNBOUNDED-NO-AGE-CEILING-ANYWHERE`.
  Not yours.

---

## §3-design

Every file in the top-level inbox resolves to exactly ONE of four dispositions per tick:

| # | disposition | condition | behaviour |
|---|---|---|---|
| 1 | **DRAINED** | passes `isDrainableShape()` | unchanged |
| 2 | **BY-PATH-EXEMPT** | matches `BY_PATH_CONSUMER_FAMILIES` | unchanged — **never escalates, never gets a ledger row, ever** |
| 3 | **MALFORMED** | `JSON.parse()` throws | **NEW** — escalate once, after a **30-minute** mtime-age floor |
| 4 | **ORPHAN** | well-formed, non-by-path, fails `isDrainableShape()` | **NEW** — escalate once, after a **7-day** mtime-age floor |

Order matters and is already correct in the code: the by-path guard is at `:210-214`, *before*
`JSON.parse()` at `:219` and *before* the shape guard at `:238`. Disposition 2 must keep winning
over 3 and 4 by construction, not by an extra check.

**Both floors are derived from existing fleet constants — do NOT invent new numbers:**
- **30 min** = 2x the fastest live cowork cron cadence (`*/15 2-8 * * 1-5` in
  `docs/data/cowork-schedule.json`). Rationale: past that window no legitimate in-flight write is
  still open, and malformed JSON cannot self-heal.
- **7 days** = the *identical* constant this script already uses for its own DB/processed-file
  prune at `:337-338` (`7 * 864e5`). Do not introduce a second cutoff for the same directory —
  reference the same constant.

Make both env-overridable in the same style as the existing constants, but keep the defaults
derived as above and say where they come from in a comment.

### §3.1-ledger

New table in the **existing** `docs/signals/signals.db` the script already opens (no new file, no
new dependency — `signals.db` is gitignored per UC-GCP-P2, so this adds zero commit surface):

```sql
CREATE TABLE IF NOT EXISTS signal_inbox_orphans (
  basename       TEXT PRIMARY KEY,
  category       TEXT NOT NULL CHECK (category IN ('malformed','orphan-no-envelope')),
  first_seen     TEXT NOT NULL,
  escalated_at   TEXT
);
```

Per tick, per non-drainable **non-by-path** file:
1. `INSERT OR IGNORE` a row with `first_seen = NOW` if absent.
2. If a row exists AND `escalated_at IS NULL` AND `NOW - first_seen >= floor(category)` → emit the
   escalation signal (§3.2), then `UPDATE ... SET escalated_at = NOW`.
3. Already-escalated rows are skipped **silently** — one escalation per stuck file **ever**, not
   one per tick forever. This is the whole point of the ledger; a per-tick re-fire would be worse
   than the current silence.
4. Once per run: `DELETE FROM signal_inbox_orphans WHERE basename NOT IN (<current dir listing>)` —
   the file left the inbox (drained, removed, fixed upstream), so its ledger row is stale. Prevents
   unbounded ledger growth. Same table-per-directory scoping discipline as `signals_processed`.

SQL goes through the existing `sqlite3`-via-stdin path with the existing `''` escaping helper
(`sqlEsc`/`escB`) — the file header at `:5` declares DRAIN-INJECTION-SAFE and that property must
survive your change. Basenames are attacker-influenceable filenames; escape them.

### §3.2-escalation-is-a-normal-signal

Do **not** call an MCP tool. Scripts in this repo have no `call_tool` access — every existing
diagnostic in this file goes to `console.error`/stdout, never `send_telegram`. The escalation is a
plain enveloped signal file, written with `fs.writeFileSync` in the **same pass-2 write loop**
already used for `.dest` (`:314`), so the next drain tick picks it up and routes it to PO like any
other signal. No second transport.

Path: `docs/signals/signal-inbox-orphan-<basename-safe>-<ISO>.json`

```json
{
  "from": "drain-signals",
  "to": "po",
  "type": "signal-inbox-orphan-escalation",
  "priority": "medium",
  "payload": {
    "basename": "<stuck file>",
    "category": "malformed" | "orphan-no-envelope",
    "age_minutes_or_days": 0,
    "first_seen": "<iso>",
    "detail": "<JSON.parse error message, or 'no from/source/type/signal_type after Nd'>"
  },
  "createdAt": "<now>"
}
```

**Ordering constraint — do not break it.** Pass 1 is non-destructive classification; pass 2 is the
destructive mv/fingerprint/DB-INSERT that runs ONLY after `appendDurableBatch()` succeeds
(`:40`, `:207`, and `docs/agents/dev-team/flow/drain-signals.md` § durable-append-before-destructive).
Your ledger write and escalation write are a **new, independent** classification outcome. They must
not reorder, gate, or be gated by the existing durable-append sequence. If the durable append fails
and pass 2 is skipped, it is acceptable (and preferable) that no escalation is written either —
re-evaluated next tick.

### §3.3-routing-table-spec-first-then-mirror

`docs/agents/dev-team/flow/drain-signals.md` §0a-3 is the **authoritative** routing table; the
`ROUTING_TABLE` array at `scripts/agents-flow/drain-signals.js:189-198` is a hand-kept mirror. The
script's own comment at `:183-188` states: *"the spec stays authoritative … a change to the spec
table MUST be reflected here in the same commit."*

**Therefore: the spec doc and the script are ONE task and ONE commit. This is why they are not
split.** Edit the spec table first, then the mirror, in the same commit.

New row, both places:

| type | from | route | note |
|---|---|---|---|
| `signal-inbox-orphan-escalation` | `drain-signals` | `PO Step 0-SIG` | payload = `{basename, category, age, first_seen, detail}` |

It would fall through to the existing `any other → PO Step 0-SIG` default correctly either way —
list it explicitly anyway, that is the table's own convention.

### §3.4-spec-doc-section

Add `§0a-1a` to `docs/agents/dev-team/flow/drain-signals.md` documenting: the four dispositions,
the two floors **and where each is derived from**, the ledger table DDL, and the escalation payload
shape. Spec-first, per the file's own "Edit the spec first, then the script" rule.

**The file carries a `size-justification` HTML comment on line 1 and the repo runs a size-lint gate
on push (threshold 120L; the file is at 232L today). You MUST extend that comment with your task id
and the line delta, or the push will fail.** Same for `drain-signals.js` if it has one.

### §3.5-doc-line-in-mcp-tools

Extend the **existing** `docs/standards/mcp-tools.md:186` § `price_anomaly — DUAL-PLANE CONTRACT`
section (do **not** create a second doc — that section is already the canonical "read this before
you touch the undrained floor" page) with:
- the corrected population split, stated as a **method**, not as frozen integers (see §5 below);
- a pointer to the new escalation mechanism, so the next person who observes an undrained floor
  finds the discriminator instead of starting misdiagnosis #6.

---

## §4-files

**Modify (all four in ONE commit — see §3.3):**
- `docs/agents/dev-team/flow/drain-signals.md` — new §0a-1a; §0a-3 gains one routing row; line-1 size-justification extended.
- `scripts/agents-flow/drain-signals.js` — ledger DDL + read/write, malformed/orphan branches in the pass-1 loop (`:208-265`), escalation write in the pass-2 loop (`:314` region), one `ROUTING_TABLE` row (`:189-198`).
- `scripts/agents-flow/drain-signals.test.js` — new fixture cases (§5 AC-2/3/4). Run with `node scripts/agents-flow/drain-signals.test.js`; it is currently 28/28.
- `docs/standards/mcp-tools.md` — §3.5 above.

**Zone note (anticipating a challenge):** `docs/agents/**` is normally agent-father's commit zone.
`drain-signals.md` is the documented exception because of the same-commit mirror rule — precedent:
commit `5ad4a3f92` (`fix(dev-team/idle-chain-p2a)`) edited `drain-signals.md` + `drain-signals.js`
together, and `897d1811a` edited `drain-signals.js` + `mcp-tools.md` together. `spawn-fanout.md`
is *not* an exception and is split out to `TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER`.

**Do NOT touch:** `docs/agents/dev-team/flow/main.md`, `docs/agents/market-watcher/flow/eod.md`,
`scripts/agents-flow/notebook-auto-prune.sh`, any `docs/signals/price_anomaly_*.json`,
`apps/mcp-server/src/infrastructure/orchStateSchema.ts`.

---

## §5-acceptance-criteria

- [ ] **AC-1 — additive only.** `node scripts/agents-flow/drain-signals.js --count-drainable`
      returns the same value immediately before and immediately after your change, on the live
      inbox. Proves zero behaviour change to the existing drain/prune/dedup path.
- [ ] **AC-2 — orphan floor + one-shot.** Fixture: an 8-day-old well-formed file with
      `from`/`source`/`type`/`signal_type` all null → **one** drain run emits **exactly one**
      `signal-inbox-orphan-escalation` (`category="orphan-no-envelope"`) and writes one
      `signal_inbox_orphans` row with `escalated_at` set. A **second** drain run with no further
      passage of time emits **zero** additional escalations for that file.
- [ ] **AC-3 — malformed floor is a floor, not "escalate on first sight".** Fixture: a
      malformed-JSON file at mtime 45 min → escalates (`category="malformed"`). The **same** file
      at mtime 10 min → does **not** escalate yet.
- [ ] **AC-4 — by-path exemption beats age, always.** Fixture: a `price_anomaly_`-prefixed file
      aged 90 days, well-formed, no envelope → **zero** ledger rows, **zero** escalations, ever.
      This is the discriminator the parent row exists for; if this test is absent the task is not done.
- [ ] **AC-5 — ledger self-prunes.** After a fixture file is removed from the inbox, the next run
      deletes its `signal_inbox_orphans` row.
- [ ] **AC-6 — no schema touch.** `git diff` on `apps/mcp-server/src/infrastructure/orchStateSchema.ts`
      is empty for this task.
- [ ] **AC-7 — suite green.** `node scripts/agents-flow/drain-signals.test.js` runs to completion
      (it must reach the END of the file, not die mid-way — this suite has a documented history of
      a fixture crash silently truncating the run, see `scripts/router-s151-*.jq`) and reports
      **0 failed**, with no pre-existing case removed or weakened.
- [ ] **AC-8 — size-lint green.** `git push` passes the size-lint gate; the `size-justification`
      comments on every file you grew are updated with this task id and the delta.

**Do NOT hardcode 51 / 49 / 26 / 21 / 2 anywhere in the code or the tests.** The inbox is live and
moved between two measurements taken 8 minutes apart during design. Every count is time-varying.
Assert on *behaviour* (this class escalates, that class never does), never on a population size.

---

## §6-context

- Architect brief (full reasoning, rejected alternatives, live measurements):
  `docs/architecture-briefs/2026-08-23-signal-inbox-orphan-escalation-discriminator.md`
- Why the 26 orphan-shape files exist: a second, non-compliant cowork-team write path co-existed
  with the documented enveloped shape for ~11 days (2026-07-28 → 08-08) and has since stopped. The
  writer defect is closed/dormant; these files need **disposal/escalation**, not a writer patch.
  That is precisely why "just fix the writers" was rejected as the whole fix — the inbox needs a
  self-defending floor that catches the *next* writer bug too.
- The concrete cost that triggered this row: a cowork-team signal sat unread for 24 days while
  **both** of its recommendations shipped by other routes. A queue nobody reads is not a queue.

## §7-closure

- [ ] All ACs verified raw (real command output pasted into the Implementation Record, not asserted)
- [ ] One commit, explicit pathspec, spec + mirror together
- [ ] Append `## §N-impl` Implementation Record to this file
- [ ] `NEXT: qa` → `TASK-SIGINBOX-LIVE-FIRST-RUN-GATE`
