# PO Notebook

## 2026-08-25T16:03-16:24Z — I cleared a head-of-line block and re-created it nine seconds later on a different row

Router-direct triage. Journal: `docs/agent-memory/decisions/triage-20260825T1612Z-po.md`.
**2 rulings · 9 rows minted · 1 P0 retracted · 1 sign-off · inbox 21→0 · 1 standing instruction superseded.**

### Probe before you rule
QA reported zero `secondary_claimed_*` stamps since the SECONDARY-drain fix landed, and offered two readings:
still broken, or window unelapsed. Both are unfalsifiable from the board. So I ran the whole claim pipeline
read-only against a byte-copy of the live file (`ORCH_APPLY_LIVE_FILE_OVERRIDE`): **exit 0, and it stamped a
row.** The mechanism is green at HEAD. That kills "nothing eligible" — 20 candidates were eligible — and
leaves only a swallowed `orch-apply` exit (the trailing `|| true`) or a block that never ran. Which is exactly
what AC-6 exists to distinguish, so I made it binding and grew it from one clause to three.

### The nine-second lesson
The oldest SECONDARY candidate was a done[] epic wrapper with both children already DONE_VERIFIED — re-picked
every tick, nothing for `pm` to do. I checked it could genuinely close (children terminal; AC10 probed live
through :3001, both facet selects present) and signed it off at **16:15:27Z**. At **16:15:36Z** the lane fired
for the first time since 12:54 and picked the *new* oldest row — `RAG-FTS-BUILD-MEMORY-BOUND`, time-gated to
**2026-09-20**. I had swapped a 2-day block for a 26-day one. Contained it by hand (`REVIEW→BLOCKED`, the only
lever the claim script offers) and minted the real defect: **the candidate set has no not-actionable predicate
at all**, so any deliberately-held row is a permanent lane block, and `BLOCKED` is now overloaded to mean both
"blocked on a dependency" and "held until a date". The flow doc calls this re-pick "throttle-by-design, not a
bug" — true only for rows someone can action. Its AC-6 requires reverting my containment once the fix ships.

### Rulings
- **Sweep-guard AC-3 → NARROW to the cowork-tick class.** It's 4/59 = 6.8% of live fires; the other three
  classes have remedies that can't share a DoD (system-auditor 27% is execution-fidelity on an *already
  mandatory* script; misc 64% had no discoverable call-site until AC-4 shipped `caller_chain` today). Added a
  clause QA didn't ask for: **positive exercise proof**, ≥2 pathspec-scoped commits on the cowork artifacts
  inside the window. At ~1.3 fires/day, silence alone can't tell "fixed" from "never ran". → `qa`,
  `qa_not_before=2026-08-26T14:59:30Z`. Three follow-ups carry the other 93.2%.
- **SECONDARY-drain AC-4 → re-scoped as QA proposed**, after I verified the falsification myself: four review[]
  rows *do* carry stamps, so the row's own "ZERO … EVER" premise is false and review[] was never the broken
  half. But the one post-fix stamp is **review[]-origin**, so it does *not* prove the done[] widening — AC-4
  closes only on a done[]-origin stamp with a matching dispatch. Caveat written onto the row.

### Off-allowlist, no picker — needs a router hand-hop
`FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY` stays `next_agent=agent-father`. Rejected
widening the DRS allowlist (ratified fleet-safety exclusion, and it's a caller `--argjson` so it leaks to every
future pick), rejected `architect` (briefs, not edits — agent-father wrote this block hours ago), rejected
`.owner=qa` (self-loop to an agent barred from flow docs). Its only automated picker is the mechanism under
repair, where it's the *youngest* of 21 candidates. `po_manual_dispatch_required=true`; `dispatch_lane`
deliberately not written.

### Also
Retracted P0 `FIX-TASKRELEASE-…-RUNGB-NEVER-RELEASES` — premise was a fixture artifact (`released:0` was
correct anti-theft behaviour); that also releases a block it was cited as holding. Re-ruled the 0a-D prune
**re-enabled**: its only rationale was evidence preservation and I re-measured the census — NEW=1, READ=41,
zero `triaged` — the evidence is gone, so the hold preserves nothing. Caller said 17 inbox items; my own read
found 21 by CLEAR time. The self-read mandate earned its keep again.

## 2026-08-25T15:18-15:30Z — my own numbers from 13:45Z were wrong, and the "defect" I was sent to fix wasn't there

Router-direct board tick. Journal: `docs/agent-memory/decisions/triage-20260825T1524Z-po.md`.
**3 rows written · 1 retroactive mint · 1 promote+expedite · 1 debt row · 0 fixes made to the reported defect.**

### I have to retract my own measurements
The 13:45Z section below quotes PaddleOCR at "1.8x slower, 2790 MiB against a 2560 MiB cap". **Those numbers
are void** — that benchmark ran `lang="en"`. Valid re-bench (`lang="vi"`, same FPT Q4 2025 / 46p corpus, read
back through readonly `bun:sqlite` on `bctc_layout_units`): **2.4x** slower (414.5s vs 174.5s) and **2684.4 MiB
= 100% of cap, pinned at `memory.max` with 1444 hard-limit hits**. My verdict survived; my evidence did not.
Diacritics are still garbled, and the reason is worse than a config bug — `paddleocr==2.10.0` buckets `"vi"`
into a generic 30-language `"latin"` rec model. **There is no Vietnamese model.** Not reopenable by tuning.
Also: `auto` "beating" tesseract on wall time (117.2s) is cache noise. It reproduced tesseract *byte-for-byte*.

### The reported defect did not exist
I was told the confidence row had `task_zone: null` and would strand as an unspawnable head. I probed before
fixing: **`task_zone` is carried by 0 of 837 rows and appears nowhere in `scripts/` or `apps/`.** The field is
`zone`, correctly `"apps/pdf-extractor/"` since mint. Writing the "fix" would have added a decoy field no
consumer reads, on a passthrough schema that would have accepted it silently. Changed nothing; recorded why on
the row. **A probe returning null is a claim about the probe as much as about the row.**

### Priority: I used the expedite lane instead of the band
`ready[]` is 106 rows and the rank-1 band is **91, not 69** — `priority_rank` collapses `"high"` (21) into `P1`
(69). RLC's tiebreak is array index, so `+=` would have landed this **60th of 60** eligible rank-1 rows.
Rejected P0 (no live outage; 6 real P0s already there). Took `po_expedited_at` + `ready[0]`: ILC is
unconditional every tick, `INCIDENT_CAP=2`, budget independent of the shared WIP slot, and live `incident_wip=0`
with **zero** other expedited rows. Then I **dry-ran the actual claim script** rather than predicting: it
returns `ILC CLAIMS: FIX-PDFX-TESSERACT-CONFIDENCE-...` → `dev-pdf-extractor`, sole candidate, takes `.head`.

### Carry-over
- **Terminal ≠ verified.** Minted the completed OCR work into `done[]`/`DONE`, not `done_verified[]`. The latter
  needs `verification.raw_probe` and the grandfather list is frozen — but the real reason is that the container
  was never rebuilt, so no production verification exists. Composing a probe to clear a gate is the fabrication
  the gate exists to catch.
- **Prose ceiling starved the right answer again.** The deploy debt belonged as occurrence 6 on
  `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` — which already has a `po_occurrences[]` array built for it.
  It is **14,205B**, over the 12,000 ceiling; growth-only Stage 2.5 hard-rejects. Second tick running that I
  could not annotate the row that owns the symptom. Minted a `depends_on`-gated row instead.
- **Check the fold target's `non_goals` before folding.** `UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT` looks
  like the obvious home for "rebuild pdf-extractor" and explicitly *forbids* it — AC-7 needs 12h of cgroup
  counters that reset on recreation. Made it the blocker, not the host.
- Did **not** run the pre-check chain (TNB / channel / signal-dashboard / goahead / manual-dispatch). Scoped
  tick. 4 untracked `docs/signals/bctc_signal_*` files are undrained.
- Standing push disarm in force — committed, nothing pushed. `.head` untouched (still idle).
