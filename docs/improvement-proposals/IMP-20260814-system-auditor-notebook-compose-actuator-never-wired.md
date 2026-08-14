# Improvement Proposal IMP-20260814-system-auditor-notebook-compose-actuator-never-wired

**Created:** 2026-08-14T02:02:00Z
**Created by:** po
**Status:** DRAFT

## target_agent
system-auditor

## target_files
- `docs/agents/system-auditor/flow/main.md`
- `docs/agents/tools/package/system-auditor.md`
- `scripts/notebook-compose.sh`
- `docs/agent-memory/notebooks/system-auditor.md`

## Weakness

`system-auditor`'s notebook cycle headers are structurally corrupt and have been for at least 6 days across two independently-reported occurrences. The `c<NNN>` cycle counter is produced by a PROSE instruction with no actuator — `docs/agents/system-auditor/flow/main.md` Step 1c states `<NNN>` MUST be "a literal incrementing counter continuing from the highest existing `c<NNN>` in the file", and Steps 1a–1g require the model to read the entire notebook into context and reproduce every retained section byte-for-byte inside a single freehand `Write()` payload. `scripts/notebook-compose.sh` was built precisely to remove that reproduction burden — it exists at 28628 bytes, is executable, was tested 9/9 and committed as `7552421bc` on 2026-08-06 — and it has **zero callers**. The rewire to call it was handed to `agent-father` twice by `developer`, via `docs/signals/processed/2026-08-06-notebook-compose-script-actuator-landed.json` and then `docs/signals/processed/fix-system-auditor-cycle-closeout-actuator-and-signal-path-20260809T0243Z.json` item 4a — which itself states the rewire "was already explicitly handed to agent-father by developer ... and never landed". Both signals sit in `processed/`. **No `task_board` row was ever minted for either**, so nothing in the system could detect that a signal marked "processed" had produced no change. That second-order defect — an actionable handoff filed to `processed/` being indistinguishable from completed work — is the reason this is an architecture proposal rather than a third identical handoff to the same agent.

## Evidence

- **Source:** router-observed defect, RAW-verified by `po` at source 2026-08-14T01:53Z against commit `e456eaf9f`. Prior occurrence recorded 2026-08-08 (`c383 → c384 → c385` then `c4`), which carried an explicit standing escalation rule: "If it recurs, route as a fresh improvement_proposal to agents-architect." This document is that escalation.
- **Data — five distinct mechanical defects in one file.** `grep -n '^## ' docs/agent-memory/notebooks/system-auditor.md` in file order:
  - `L1  ## c84 · 2026-08-13T22:35:08Z` (Tier-2)
  - `L22 ## c83 · 2026-08-13T20:44Z` (Tier-1)
  - `L70 ## c85 · 2026-08-14T00:14:15Z` (Tier-1)
  - `L194 ## c73 · 2026-08-14T01:19:21Z` (Tier-1)
  - `L309 ## RETURN`
  - `L330 ## c5 · 2026-08-14T01:30Z` (Tier-1)
  1. **Numbering non-monotonic** across the entire visible window: 84, 83, 85, 73, 5.
  2. **Ordering inverted.** Step 1e mandates NEWEST-FIRST insertion at TOP, yet the three newest entries by timestamp (00:14, 01:19, 01:30) sit progressively LOWER in the file — those cycles appended at EOF rather than composing a settled newest-first body, which is only possible if the Step 1 compose ladder was not executed as written.
  3. **Section cap breached:** 5 real sections against the hard cap of 3 (Step 1d: `WHILE (section count) >3: drop the LAST ## block`).
  4. **Line cap breached:** 426L against the AC-5 200L cap, so Step 1f's 200L backstop also did not run.
  5. **Stray `## RETURN` heading at L309** pasted inside the `c73` section body. A level-2 heading in the notebook body poisons every consumer that counts `^## ` headings: Step 1a `PRE_COUNT`, Step 2a's `EXPECTED_DROPS`/`ACTUAL_DROPS` guard, Step 1d's prune loop, `scripts/notebook-auto-prune.sh`, and pre-commit `_check_notebook_immutability`.
- **The documented interim guard did not fire.** Step 2a is labelled "MANDATORY, BLOCKING" and is supposed to `git checkout --` revert on a heading-count mismatch. With `PRE_COUNT`=4/5 and `ACTUAL_DROPS`=0 against `EXPECTED_DROPS`=2/3 it should have printed `[notebook-compose-guard] ABORT` on at least the last two cycles. It did not.
- **A third step is also dead.** Step 0b.1's stale-marker orphan sweep (`find -name '.auditor-cycle-markers-*.tmp' -mmin +20` → emit signal → `rm -f`, documented as running on "EVERY tier's EVERY cycle") has reaped nothing in 2.5 days: 13 markers on disk at 2026-08-14T01:55Z, oldest mtime 2026-08-11T18:38 (~7000 minutes past a 20-minute trigger), 6 of them zero-byte. Additionally the marker filename key is inconsistent — 10 use the bare tick, 2 use the `auditor-t1:<tick>` `FIRE_TASK_ID` form whose colon breaks the sweep's filename-parse, and one is literally `.auditor-cycle-markers-.tmp`, an empty `$FIRE_TICK` expansion.
- **Hypothesis explicitly refuted — do not re-chase it.** Both the router and the prior occurrence memory fingered `docs/agent-memory/.auditor-cycle-markers-*.tmp` as the counter source. Per `docs/agents/system-auditor/flow/main.md:282-287` those files are per-cycle OUTPUT-CONTRACT marker scratch keyed by `$FIRE_TICK`, consumed only by `scripts/audit-output-contract.sh`. Nothing in the numbering path reads them.
- **Content correctness is NOT affected.** Every claimed report in the notebook was RAW-verified against its source and matches. This is purely a write-mechanism defect; no false findings were published.
- **Reproducibility:** `grep -n '^## ' docs/agent-memory/notebooks/system-auditor.md && wc -l docs/agent-memory/notebooks/system-auditor.md` after any 2–3 consecutive auditor cycles. `grep -rn 'notebook-compose.sh' docs/ .claude/ scripts/` returns no call site outside the script itself. `find docs/agent-memory -name '.auditor-cycle-markers-*.tmp' | wc -l`.

## Proposed Change

Wire the actuator that already exists; do not rewrite or fork it.

1. Replace `docs/agents/system-auditor/flow/main.md` Notebook Write Steps 1a/1/2/2a with ONE `bash scripts/notebook-compose.sh …` call plus a stdout-marker branch, mirroring the precedent this same flow already uses for `scripts/auditor-notebook-commit.sh`.
2. Authorize that call in `docs/agents/tools/package/system-auditor.md`'s Bash allowlist. Per signal `…20260809T0243Z.json` item 4a this omission already existed, so a prior wiring attempt could have failed at runtime even had the flow edit landed — verify before assuming the flow edit alone is sufficient.
3. Move `c<NNN>` derivation into the script as a deterministic max-over-existing-headings read. **Open question for review:** the script's header describes only byte-preservation of retained sections and never mentions counter derivation, so this may be a genuine gap in the script rather than a wiring job.
4. State concurrent-tier safety explicitly. Tier-1 (30 min), Tier-2 (4 h), Tier-3 (daily), Tier-4, Tier-5 and `AUDIT_TIER=DATA` all write this ONE file and share ONE counter namespace with no lock; a full-file settled `Write()` from a tier holding a stale snapshot silently discards a concurrent peer's section. Either the compose actuator takes the notebook-write mutex (`FIX-NOTEBOOK-WRITE-AC7-SKILL`, currently BLOCKED on `FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION` — if that chain is the chosen mechanism, say so and unblock it), or the actuator must re-read-and-reconcile immediately before its own write. Asserting "tiers do not overlap" is not acceptable: c85 (00:14:15Z), c73 (01:19:21Z) and c5 (01:30Z) are three Tier-1 cycles ~35 and ~11 minutes apart against a 30-minute cadence.
5. Repair the current file as a separate, first commit: renumber retained headings monotonically, restore newest-first ordering, remove the stray `## RETURN` heading (demote or strip — never delete surrounding cycle content), prune to 3 sections and ≤200L, with every retained section's body byte-identical (AC-2a immutability invariant).
6. Convert Step 0b.1's marker reaper to executed bash emitting its own marker, and normalise the `FIRE_TICK` filename key to one form with a fail-loud guard against an empty expansion.
7. **Second-order, the reason this is an architecture proposal:** rule on whether a signal carrying an actionable edit may be moved into `docs/signals/processed/` without first minting a `task_board` row. Two independent handoffs for this exact rewire were both marked processed and neither landed, and nothing in the system could detect it, because `processed` means "read", not "done".

Existing tracking row: `FIX-AUDITOR-NOTEBOOK-COMPOSE-ACTUATOR-BUILT-TESTED-NEVER-WIRED` (`task_board.backlog[]`, P1, `next_agent: agents-architect`, minted `3d6131602`). Related: `FIX-NOTEBOOK-COMPOSE-REWRITES-RETAINED-PRIOR-SECTIONS`, `FIX-SYSAUDITOR-NOTEBOOK-COMPOSE-ACTUATOR`, `FIX-AUDITOR-SELF-COMMIT-STEP-NEVER-FIRES`, `FIX-NOTEBOOK-WRITE-AC7-SKILL`, `FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION`, `CLEAN-STRANDED-REPO-STATE-20260806`.

## Lane

LANE-A

### Lane Rationale

Classified LANE-A by `po`, with the classification deliberately deferred to Step IP-2 for correction — there is a genuine tension worth adjudicating rather than resolving unilaterally.

- **LANE-C is tested first and is arguable.** Item 6 of the proposed change replaces Step 2a, which is itself a guard, and item 7 asks for a ruling on the handoff/audit gate. If review judges either to be "the gate/audit logic itself", the whole proposal becomes LANE-C.
- **LANE-B is defensible for items 1–5.** A hard, machine-checkable, ungameable success signal exists (below) and can be demonstrated red by writing a deliberately out-of-order or over-cap heading. It is ungameable because it reads the persistence plane — the committed file — rather than any agent's own report of what it wrote, which is the precise failure mode this proposal is about.
- **LANE-A chosen as the conservative default** because over-claiming LANE-B authorises auto-implementation, and this proposal has already failed twice under an auto-handoff route. Note that LANE-A's implementer is `agent-father`, which is the agent that dropped both prior handoffs — so a plain LANE-A routing without the tracked board row would reproduce the exact failure being escalated. The board row is what makes LANE-A viable this time.

## Success Signal

Machine-checkable, evaluated on the persistence plane only. No agent's RETURN text may substitute for any of these — this defect class has already produced two agent RETURNs claiming a correct notebook write while the on-disk file was corrupt.

After 3 consecutive real auditor cycles spanning at least one Tier-1/Tier-2 overlap window:

1. `grep -n '^## ' docs/agent-memory/notebooks/system-auditor.md` → headings strictly DESCENDING in `c<NNN>` top-to-bottom, strictly DESCENDING in timestamp top-to-bottom, exactly 3 in count, no non-cycle `## ` heading present.
2. `wc -l < docs/agent-memory/notebooks/system-auditor.md` ≤ 200.
3. `grep -c 'notebook-compose.sh' docs/agents/system-auditor/flow/main.md` > 0.
4. `find docs/agent-memory -name '.auditor-cycle-markers-*.tmp' -mmin +20 | wc -l` == 0, sampled one hour after the fix ships.

## Rollback

Every item is a documentation/flow edit plus one data repair, all in single-purpose commits on `main`. `git revert` the flow-rewire commit restores the current LLM-narrated compose path; the notebook data-repair commit is independently revertible and touches no other artifact. `scripts/notebook-compose.sh` is not modified by the rollback and stays on disk. If success signals 1–2 are not met within 7 days of the rewire landing, revert the flow commit and re-open the tracking row with the observed marker output attached — do not iterate on the wiring in place, since the failure would then indicate the script itself is the gap (item 3's open question) rather than the wiring.

---

## Architect Review
*(filled by agents-architect before routing to PO)*

**Lane confirmed:**
**Evidence validated:**
**target_agent confirmed:**
**target_files confirmed:**
**Proposed change scope:**
**Architect notes:**
