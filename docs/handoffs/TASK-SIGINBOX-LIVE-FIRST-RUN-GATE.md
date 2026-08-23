---
task_id: TASK-SIGINBOX-LIVE-FIRST-RUN-GATE
parent: FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER
owner: qa
size: S
zone: cross-service/
branch: none — NO BRANCHES, all work on `main`
depends_on: [TASK-SIGINBOX-ORPHAN-ESCALATION-CORE]
blocks: []
---

# TASK-SIGINBOX-LIVE-FIRST-RUN-GATE — the parent row's verification_gate, owned

## §1-why-this-is-a-separate-task

The parent row's `verification_gate` reads:

> `no_file_can_sit_in_docs_signals_beyond_a_declared_age_without_either_being_drained_or_raising_a_loud_escalation_that_names_it`

Fixture tests (owned by `TASK-SIGINBOX-ORPHAN-ESCALATION-CORE`) prove the *mechanism*. They do not
prove the gate, because the gate is a statement about the **live inbox**. A gate with no owner is
the artifact that gets narrated instead of produced. This task is the owner.

There is a second reason it is separate: the first real run is expected to emit **one escalation
signal per genuinely-stuck file, all in one tick**, straight into PO's Step 0-SIG queue. That is a
real, one-time blast into a live queue and it deserves a supervised observation rather than being
a side effect of a developer's last test run.

---

## §2-what-to-do

**Step 1 — measure the population BEFORE the first post-fix drain tick.** Do not carry any number
from the brief or from this file. The inbox is live: it moved between two measurements taken eight
minutes apart during design (drainable_count 1 → 2). Re-derive, at the moment of the run:

```bash
ls docs/signals/*.json | wc -l
node scripts/agents-flow/drain-signals.js --count-drainable
```

Then classify each non-drainable file into the three buckets using the script's **own** predicates
(by-path prefix match / `JSON.parse()` success / all-four-fields-null), not a reimplementation:
`by_path`, `orphan_no_envelope`, `malformed`. Record the three integers **and the file lists**.

**Step 2 — run one real drain tick and observe.**

**Step 3 — assert.**

---

## §3-acceptance-criteria

- [ ] **AC-1 — every orphan escalates, exactly once.** The count of new
      `signal-inbox-orphan-escalation` files written in that single tick equals
      `orphan_no_envelope + malformed` **as measured in Step 1 of this run** (not 28, not any number
      carried from the brief). Each names a distinct `basename` in its payload.
- [ ] **AC-2 — zero by-path escalations.** **Zero** of the `by_path` files produced an escalation,
      and **zero** of them have a row in `signal_inbox_orphans`. This is the discriminator the
      parent row exists for.
- [ ] **AC-3 — one-shot holds on live data.** A second drain tick immediately afterwards emits
      **zero** further escalations for the same files. (This is the property that distinguishes a
      fix from a new noise source. If it fails, the mechanism is worse than the silence it replaced
      — fail the gate.)
- [ ] **AC-4 — the escalations actually route.** The escalation files themselves are drainable and
      land in PO's Step 0-SIG queue on the following tick — verify by reading the durable inbox /
      `signals_processed`, not by eyeballing the filenames.
- [ ] **AC-5 — no collateral.** `--count-drainable` before and after the tick moves only by the
      expected drained/emitted delta; no `price_anomaly_*` file was moved, renamed, or deleted;
      `git status --porcelain docs/signals/` shows no unexpected deletion.
- [ ] **AC-6 — gate statement.** Write the gate verdict in the form the parent row asks for: name
      any file still sitting in `docs/signals/` past its declared floor that neither drained nor
      escalated. The correct answer is an empty list; if it is not empty, that list IS the finding.

---

## §4-hazard-to-watch-for

If AC-1's count is large, PO's queue takes all of it at once. That is intended and is not a reason
to suppress or batch the escalations. It **is** a reason to run this deliberately rather than
accidentally, and to tell PO in your RETURN how many landed and of which category, so PO can triage
them as one cohort rather than as N unrelated arrivals.

If AC-3 fails (escalations re-fire every tick), **escalate immediately and recommend reverting the
core change** — a per-tick re-fire on a large stuck population is a worse failure than the silent
accumulation it replaced.

## §5-closure

- [ ] All ACs verified with raw command output pasted into the Implementation Record
- [ ] Append `## §N-qa` section to this file
- [ ] Parent row `FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER`
      can move to `DONE_VERIFIED` only after this gate passes
- [ ] `NEXT: po` with the escalation cohort summary
