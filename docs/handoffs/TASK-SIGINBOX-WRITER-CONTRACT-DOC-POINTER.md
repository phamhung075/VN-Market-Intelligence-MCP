---
task_id: TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER
parent: FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER
owner: agent-father
size: S
zone: docs/agents/cowork-team/
branch: none — NO BRANCHES, all work on `main`
depends_on: [TASK-SIGINBOX-ORPHAN-ESCALATION-CORE]
blocks: []
---

# TASK-SIGINBOX-WRITER-CONTRACT-DOC-POINTER — stale citation fix + one writer-contract sentence

## §1-tldr

Two lines in `docs/agents/cowork-team/flow/spawn-fanout.md` cite a signal file by a path that no
longer exists, and no signal-emitting flow doc anywhere states the envelope requirement that the
reader silently enforces. Three lines of doc, one file. That asymmetry — a reader-side predicate
enforcing a contract no writer-side doc states — is the root cause the parent row named.

Small task. It is separate from the core task only because `spawn-fanout.md` is a cowork-team agent
flow doc and therefore agent-father's commit zone.

---

## §2-change-1-stale-citation-MEASURED

`docs/agents/cowork-team/flow/spawn-fanout.md` cites, at **line 55** and again at **line 464**:

```
docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json
```

**Verified by pm 2026-08-23 at source:**
- `docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json` — **does not exist**
- `docs/signals/processed/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json` — **exists**, 8289 B

PO drained it this session (PO decision journal `triage-20260823T0947Z-po.md` D3; the fingerprint
basis used there was raw-bytes, which D3's own note flags as non-standard).

Update **both** citations to the `processed/` path. Keep the surrounding prose intact — line 55's
sentence and line 464's comment are both load-bearing arguments about a false positive, and only
the path is wrong. A short parenthetical (`already drained 2026-08-23, PO D3`) is welcome; a
rewrite of the argument is not.

---

## §3-change-2-writer-contract-sentence

Add **one** sentence near the top of the file's signal-emission guidance, stating the contract that
is currently enforced only by a reader-side predicate:

> A file written to `docs/signals/` must either carry a signal envelope (at minimum one of
> `from` / `source` / `type` / `signal_type`) **or** be a member of a declared by-path consumer
> family. Anything else is not drained, not routed, and not read by any agent — it now raises a
> one-shot `signal-inbox-orphan-escalation` to PO once it passes its age floor. See
> `docs/standards/mcp-tools.md` § `price_anomaly — DUAL-PLANE CONTRACT`.

Point at `docs/standards/mcp-tools.md` — **do not create a second doc and do not restate the
mechanism here.** That section is deliberately the single "read this first" page; the core task
extends it with the escalation write-up. Your job is the pointer, not a copy.

---

## §4-files

**Modify (exactly one file):**
- `docs/agents/cowork-team/flow/spawn-fanout.md` — lines 55 and 464 (path fix) + one contract
  sentence. File is 506 L and carries a `size-justification` comment; if your edit grows it, extend
  that comment with this task id and the delta or the push-time size-lint gate will fail.

**Do NOT touch:** `scripts/agents-flow/drain-signals.js`, `docs/agents/dev-team/flow/drain-signals.md`,
`docs/standards/mcp-tools.md` (all owned by `TASK-SIGINBOX-ORPHAN-ESCALATION-CORE`),
`docs/agents/dev-team/flow/main.md`.

---

## §5-acceptance-criteria

- [ ] **AC-1.** `grep -c 'docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json' docs/agents/cowork-team/flow/spawn-fanout.md`
      returns 0 for the bare `docs/signals/` form; both hits now read `docs/signals/processed/…`.
- [ ] **AC-2.** The surrounding argument at both sites is unchanged in substance (diff shows a path
      edit, not a rewrite).
- [ ] **AC-3.** Exactly one new contract sentence, and it points at
      `docs/standards/mcp-tools.md` § `price_anomaly — DUAL-PLANE CONTRACT` rather than restating
      the mechanism.
- [ ] **AC-4.** That mcp-tools.md section actually contains the escalation write-up at the time you
      land (i.e. `TASK-SIGINBOX-ORPHAN-ESCALATION-CORE` shipped first — that is why this task
      depends on it). If it does not, **stop and report**; do not write a pointer to content that
      does not exist.
- [ ] **AC-5.** Exactly one file in the commit; size-lint green on push.

## §6-closure

- [ ] Append `## §N-impl` Implementation Record to this file
- [ ] `NEXT: qa`
