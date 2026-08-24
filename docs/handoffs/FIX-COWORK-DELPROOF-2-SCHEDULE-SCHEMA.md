---
task_id: FIX-COWORK-DELPROOF-2-SCHEDULE-SCHEMA
parent: FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION
owner: agent-father
size: M
zone: docs/data/
branch: none — NO BRANCHES, all work on `main` (project CLAUDE.md rule)
depends_on: []
blocks: []
---

# FIX-COWORK-DELPROOF-2-SCHEDULE-SCHEMA — delivery_proof declaration for all 23 cowork-schedule.json slots

## §1-tldr

`cowork-schedule.json`'s own `_maintained_by` stamp names you the owner of this file (via architect
brief only). You are adding an explicit `delivery_proof` array to every one of the 23 live slots
(`jq '.slots | length' docs/data/cowork-schedule.json`) — a real, per-slot analysis of what that
slot's own agent flow actually writes, not one shape copied onto all 23. Sibling task
`FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE` (developer) consumes this field in `spawn-fanout.md`
Step 5.3 Arm 2; you do not touch that file. **Full design of record:**
`docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-gate-artifact-conjunction-design.md`
§3 — read it in full before writing any declarations.

---

## §2-hard-constraints-read-first

- **Allowlist-only, never a silent opt-out default.** A slot with genuinely no viable proof
  artifact needs an EXPLICIT `{ "opt_out": true, "reason": "<concrete reason>" }` entry — a
  placeholder reason ("TBD", "n/a") is not acceptable; the reason must name the actual mechanism
  that makes proof unavailable.
- **Conjunction, never disjunction — this is the whole point of the row.** The occurrence that
  forced this design: a slot's synthesis JSON landed while its notebook did not, and a
  single-plane check (declaring only `notebook`) would have falsely PASSed. If a slot's real
  contract writes to two planes, declare both. Read the slot's OWN agent flow doc
  (`docs/agents/<agent>/flow/*.md`) before declaring — do not guess from the slot name.
- **Do not invent probe kinds.** Available kinds: `notebook`, `commit`, `signal_queue`, `ledger`,
  `extra_file` (map 1:1 to `detect-analysis-only-exit.sh`'s 5 native planes — use these for any
  slot whose agent writes a notebook/commits/appends signal_queue rows/appends a ledger/writes a
  named extra artifact file), `published_marker` (guaranteed Telegram-publishing slots — probes
  `task_list_held` for a `published:<slot_id>:` row), `db_probe` (MCP-tool-only artifacts, e.g.
  `refine_bctc_md` slots which have NO notebook file at all — declare `tool` + `compare`).
- **You do not implement the probe logic** — that is the sibling developer task. You only declare
  the schema per slot and extend the static consistency test. If a probe kind you need does not
  exist yet in the sibling's implementation, declare it anyway (the schema is the contract; landing
  order between the two tasks is independent per the parent brief's §0).

---

## §3-design — schema shape (brief §3, verbatim examples)

```jsonc
// guaranteed Telegram-publishing slot (e.g. chef-morning)
"delivery_proof": [
  { "kind": "notebook" },
  { "kind": "published_marker" }
]

// refine_bctc_md — no notebook, DB-plane artifact only
"delivery_proof": [
  { "kind": "db_probe", "tool": "get_bctc_pending_refine", "compare": "pending_row_absent_or_row_updated" }
]

// a slot with no currently viable proof artifact — explicit, visible, reasoned
"delivery_proof": [
  { "opt_out": true, "reason": "<concrete reason, not a placeholder>" }
]
```

Work slot-by-slot. For each of the 23: (1) identify the owning agent + its flow doc, (2) read what
that flow doc's own completion path actually writes (notebook append? commit? signal_queue row?
MCP tool write with no local artifact?), (3) declare every plane that is genuinely mandatory for a
real completion — not everything the agent CAN write, only what a real cycle DOES write every time.

Extend `scripts/agents-flow/cowork-schedule-consistency.test.js` (the existing static config-time
test for this file) with a check that every `enabled:true` slot has either a non-empty typed
`delivery_proof` array or an explicit `opt_out` entry — fail loud otherwise, same pattern as the
file's existing `trigger_prompt`/`flow_path` consistency check.

---

## §4-files

- `docs/data/cowork-schedule.json` — `delivery_proof` field, all 23 slots.
- `scripts/agents-flow/cowork-schedule-consistency.test.js` — extend with the presence/shape check.

**Do NOT touch:** `docs/agents/cowork-team/flow/spawn-fanout.md`,
`docs/agents/cowork-team/flow/last-fired.md`, `scripts/agents-flow/cowork-delivery-proof-probe.sh`
(all sibling task, developer).

---

## §5-acceptance-criteria

- [ ] **AC-1** All 23 `enabled:true` slots have either a non-empty `delivery_proof` array or an
      explicit `opt_out` entry with a concrete (non-placeholder) reason. `jq` count check pasted
      into the Implementation Record: `slots|length` vs count with a valid `delivery_proof`.
- [ ] **AC-2** No slot declares a single-plane proof where its own flow doc's completion path
      writes to more than one plane (spot-check at least 3 multi-plane slots in the Implementation
      Record, citing the flow-doc line(s) that justify each declared kind).
- [ ] **AC-3** Every `refine_bctc_md`-family slot (no notebook file) uses `db_probe`, never
      `notebook`.
- [ ] **AC-4** `cowork-schedule-consistency.test.js` extended and green; demonstrate it fails RED
      against a fixture slot with an empty/missing `delivery_proof` before your fix, green after.
- [ ] **AC-5** No edit to any file outside §4.

---

## §6-context

- Architecture brief (full reasoning, occurrence 7's single-plane-false-PASS lesson):
  `docs/architecture-briefs/2026-08-12-fix-cowork-delivery-proof-gate-artifact-conjunction-design.md`
  §1, §3.
- Sibling task (same parent, consumes this schema, independently landable):
  `FIX-COWORK-DELPROOF-1-STEP53-TWOARM-GATE` (developer).

## §7-closure

- [ ] All ACs verified raw (real command output pasted into the Implementation Record)
- [ ] One commit, explicit pathspec
- [ ] Append `## §N-impl` Implementation Record to this file
- [ ] `NEXT: qa`
