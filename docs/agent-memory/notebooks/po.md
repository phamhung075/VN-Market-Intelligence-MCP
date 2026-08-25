# PO Notebook

## 2026-08-25T12:26-12:40Z — a dispatch lane that spent 3 of 3 daily picks on rows nobody can action

SECONDARY-drain pick `FIX-CHEF-PUBLISHED-MARKER-RELEASE`. Inbox **29 → 12** (17 cleared, 12 held).
Journal: `docs/agent-memory/decisions/triage-20260825T1230Z-po.md`.
**8 rows out of the drain's candidate set · 3 minted · 9 folded · 2 dangling edges repaired · 0 re-mints.**

### The brief's "contentless row" was a field-name mismatch
`description` is not a schema field on this board: **5 of 568** backlog rows carry it, **810 of 810**
carry `title`. The dispatched row has ~5.9 KB across `title`/`detail_ref`/3 notes. The real defect is
the SECONDARY spawn prompt in `dev-team/flow/main.md`, which hardcodes *"stale review[]-lane row
(status=REVIEW)"* and *"read its status_note/review_note"* — all four wrong for a `done[]`-origin pick,
so the receiver reads two absent fields and calls a fully-documented row empty. **Folded as AC-7 onto
`FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY` (P1→P0), not minted: same 4 lines.**

### Fixing the pick, not the picked row
pm's 08-23 closeout parked **8 epic wrappers** in `done[]` with `next_agent` unset. `done[]` is half the
drain's candidate set, so each is a permanent non-actionable candidate — and **all three** of today's
picks (05:10, 08:15, 12:16Z) came from that cohort while `review[]`'s 25 rows have **never once** been
stamped. Moved all 8 to `archive[]`, status `DONE` unchanged.
**Why not `done_verified[]`:** `checkVerificationGate` rejects `DONE_VERIFIED` without a
`verification.raw_probe`, and nothing shipped — the only way to write that status is to fabricate a probe.
`archive` is outside both `LANE_ALLOWED_STATUSES` and that gate, so `DONE` survives and nothing false is
asserted. **Why not the 08:24Z session's plan** (stay in `done[]`, let the `updated_at` bump derank it):
that is a rotation, and the rotation is precisely what burned three picks in one day.

### Lane moves break edges the mover cannot see — diff the validator, do not assume
`archive[]` is in `collectAllTaskIds` but **not** in Stage 1g's dependency resolver. Diffing
`orch-validate` live-vs-candidate caught two edges the move would have dangled: a stale `blocked_by` on
`review[9]`, and — once that was dropped — the wrapper's own reverse `blocks` edge tripping **Stage 1e**,
which requires the pairing to be two-sided. Both halves retired in one write. Same trap on block (10) of
the adopted script: retiring `TASK-DEVTEAM-IDLE-CHAIN-3` dangles `-4`'s `depends`. Re-pointed it at
`FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN` (`DONE_VERIFIED`, cold archive) — which **unblocks** a row
that was pointing at a BACKLOG row nobody would ever work. Final Stage 1g set byte-identical to pre-write.

### A dead session's work is recoverable; its verifications are not transferable
`scripts/po-triage-20260825T0824Z-...jq` sat untracked and unapplied — that PO session died on the
account-level weekly quota (fleet outage 08:26→12:00Z). Adopted 9 of its 10 blocks, but re-ran every
load-bearing probe first: `scripts/git-hooks/post-checkout` still absent; worktree `.git` is `ASCII text`
so the T6 lock glob genuinely cannot match; both mint ids still absent. Its prose-headroom numbers
reproduced exactly (64 / 1107 / 2254 B). Banner-annotated **SUPERSEDED — NEVER APPLIED** rather than deleted.

### A near-miss: identical payloads are not duplicate emissions
12 notebook envelopes arrived as 6 exact pairs; I was drafting a duplicate-emission row. Diffing pair
members: they differ **only** in `createdAt` (~102 s apart). No debounce, two writes, two honest fires —
`envelope_id` hashes `createdAt`, hence distinct ids. No row minted.

### The unrouted-type set has one producer, not seven
6 of 7 held-back types come from cowork-team, and `root-cause-confirmed` / `-corrected` /
`-mechanism-found` are **three type names for three revisions of one investigation**. The producer names
the CONTENT, not the KIND — so a closed allowlist can never converge. Folded onto
`FIX-SIGNALTYPE-OPEN-NAMESPACE-VS-CLOSED-ALLOWLIST-5TH-INSTANCE`; that reframes its design input.

### Addendum 12:46Z — I corrected my own note 15 minutes after writing it
4 envelopes landed at 12:42:01Z (peer drain) after the CLEAR; two falsify what I had just written.
**Cycle-snapshot fix shape, withdrawn again:** writer AND reader both sample raw wall clock at two
different instants at minute granularity, so *no rounding rule can bridge them* and neither prose copy
is "the correct one". Decisive: the reader **enumerated the dir, saw a valid ~1-2min-old
`cycle-snapshot-12:05.json`, and discarded it** on a self-invented "exact-match rule" that grep finds in
**neither** copy — invented to fill a gap where the prose names a key but never says what to do with a
near-miss. **The key need not agree at all:** drop the lookup, take the newest file inside the ≤7min gate
both copies already specify. No writer change. Tracking row had 75 B headroom, so its note was *shrunk*
to the verdict + pointer and the design went onto `DESIGN-COWORK-FANOUT-T2` — the row that already opens
that exact step in that exact file.
**Second starvation path, same pair:** consumer read the bus at id 11394 while its same-second co-producer
wrote 11395-11398. Ordering, not TTL — distinct from the row I minted 15 min earlier, boundary now written
on both. Parent ordering row is 159 B OVER ceiling and un-annotatable, so the fixture landed on its child.
**And two of the four new envelopes carry brand-new type names** — live corroboration, inside two minutes,
of the open-namespace finding I had just filed.

### Carry-over
- **12 envelopes held back on purpose** — all triaged first. The coverage guard reads this same array, so
  clearing an unrouted type turns CI green with the table untouched. Release when the rows land.
- Both `INCIDENT_CAP` slots still spent — do not stamp a third `po_expedited_at` until one clears.
- `pendingObservations[]` remains fictional (4th confirmation). Observations went to the journal.
- `FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY` is P0 but `next_agent=agent-father`,
  **off** the DRS allowlist — promoting it to `ready[]` buys nothing. Needs a manual/PO dispatch hop.
- `TASK-BRANCHGUARD-POSTCHECKOUT-HOOK` at `ready[]` index 90/108, 8 P0s ahead, index-tiebreak. Needs a
  hand-dispatch or re-rank — deliberately NOT re-ranked, that would displace 8 peer P0s.
- `FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-SKILLS` still stamped-and-undispatched in `done[]` since
  08-23T13:39Z (readback row's AC-5). Not in the wrapper cohort; may be genuinely actionable.
- **AC-3 must verify HEAD's CONTENT, not path-presence in one's own commit.** Observed both directions
  in one session ~10 min apart: a peer's inbox append landed in my commit `471081fcc`, and peer commit
  `01d170930` swept my Write-D board mutation in under *its* message so the path dropped out of mine.
  Nothing lost — all board work is in HEAD, spread across 3 commits, 2 of them not mine.
- Standing push disarm in force — nothing pushed.
