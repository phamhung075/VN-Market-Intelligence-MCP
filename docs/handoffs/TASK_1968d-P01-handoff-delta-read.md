# TASK_1968d-P01 — L-10 Handoff Delta-Read SKILL + Flow Updates

**Sprint:** 1968d | **Wave:** 1 (parallel with P02) | **Owner:** agent-father
**Zone:** `.claude/skills/handoff-delta-read/` + `.claude/flows/` (qa, developer, fixer)
**Est. savings:** 50–150 KB/trading-day across QA + developer + fixer handoff re-reads
**DDD layer:** Infrastructure (skill = read-path optimization, no domain logic)
**Size:** M | **Priority:** HIGH | **NFR-3:** BCTC-freeze not triggered
**Depends on:** none (Wave 1 parallel-safe with P02)

---

## § 1 — Problem Statement

QA, developer, and fixer agents re-read the full `docs/handoffs/TASK_NNN.md` on every round-trip.
A handoff file grows 30–80L per round (developer appends implementation record, QA appends review record, fixer appends fix record).
On a 3-round task (dev → QA → fixer → QA), the final QA reads ~3× the original content for context it already loaded in prior rounds.
Delta-read: on subsequent reads, the agent jumps to the anchor marking its previous read position and reads only the delta appended since.

---

## § 2 — Scope

**Files to CREATE:**
- `.claude/skills/handoff-delta-read/SKILL.md` (≤80L)

**Files to UPDATE (≤2 files of dev work):**
- `.claude/flows/qa/main.md` — Step 0 handoff-read replaced with delta-read skill call
- `.claude/flows/developer/main.md` — Step 0 handoff-read replaced with delta-read skill call

Note: If `.claude/flows/fixer/main.md` exists and reads the handoff, update it too (counts as 1 of the 2 file slots — within ≤2 files rule applied per flow pair; QA+developer is the primary pair, fixer is additive).

**OUT of scope:**
- Any `apps/*` code
- Any `.claude/agents/*.md` that does not read handoffs
- Retro-conversion of historical handoff files (forward-only from deploy)

---

## § 3 — Acceptance Criteria

**AC-1 (skill exists):** `.claude/skills/handoff-delta-read/SKILL.md` ≤80L exists and defines:
- `## §<N>-<slug>` section anchor convention for handoff files (e.g., `## §1-spec`, `## §2-impl`, `## §3-qa-round-1`)
- How the caller stores `last_read_anchor` and `last_read_at` in the calling signal payload or in-context variable
- The delta-read algorithm: on re-read, locate the anchor line in the file; read from that line to EOF only
- Full-read fallback rule: if `last_read_anchor` absent OR `last_read_at` older than 24h → full Read of entire file

**AC-2 (qa flow updated):** `.claude/flows/qa/main.md` Step 0 (handoff read) references the delta-read skill instead of a bare `Read(path=docs/handoffs/TASK_NNN.md)`. The flow stores the anchor from the CURRENT handoff read into context so the next round's caller can pass it.

**AC-3 (developer flow updated):** `.claude/flows/developer/main.md` equivalent handoff-read step references the delta-read skill.

**AC-4 (backward compat):** Full-read fallback is explicitly documented in the skill. A handoff file with NO `##§` anchors triggers full-read silently (no error). Existing handoff files without anchors continue to work correctly.

**AC-5 (no apps/* touch):** `git diff --name-only HEAD` lists ONLY `.claude/` files. Zero `apps/` or `docs/` changes other than the handoffs directory if the skill is exercised in a smoke test.

---

## § 4 — Smoke Test (1-cycle verification)

1. Open any existing handoff file ≥60L (e.g., `docs/handoffs/TASK_1968c-P01-tick-snapshot.md`).
2. Simulate first read: invoke delta-read skill with `last_read_anchor=null`. Verify the skill returns full file length (bytes). Record `last_read_anchor = "## §3-qa-round-1"` (last heading in file) as `anchor_out`.
3. Append a 10L `## §4-fixer-round-1` block to the file (in a scratch copy — do NOT modify the real handoff).
4. Simulate second read: invoke delta-read skill with `last_read_anchor=anchor_out`. Verify the agent reads ONLY the `## §4-fixer-round-1` block (~10L) — not the full file.
5. Assert: second-read byte count ≤ 30% of first-read byte count (target from SPRINT_GOAL.md AC-1 metric).
6. Verify full-read fallback: pass `last_read_at = now - 25h` → skill returns full-read despite anchor present.

Pass condition: steps 2–6 all assert correctly. No fallback error emitted on step 4.

---

## § 5 — Rollback (1-step revert)

```bash
git revert HEAD --no-edit
```

Both `.claude/skills/handoff-delta-read/SKILL.md` (new file) and flow edits (2 files) are reverted.
Agents auto-fall back to bare `Read(path=...)` calls as before — no state corruption, no data loss.
Handoff files themselves are unchanged (purely additive section anchors if agent-father added them to future files).

---

## Implementation Notes (for agent-father, not BA work)

- Anchor convention must be compatible with the Markdown heading `##` that QA/developer flows already use for their `[QA] Review Record` and `[Developer] Implementation Record` sections. Recommend: standardize those section titles to `## §N-<slug>` as part of this task.
- The `last_read_anchor` field should be stored in the calling signal JSON payload (e.g., `docs/signals/<task-done>.json`) rather than in a separate file — no new file type needed.
- The skill must be ≤80L to respect the lazy-load waterfall budget.

---

## [BA] Spec Record

**BA:** ba | **Cycle:** c250 | **Timestamp:** 2026-05-22T05:10Z
**Blockers for PO:** none
**DDD layer:** Infrastructure (read-path tooling, no domain entity change)
**Wave:** 1 — parallel-safe with P02 (different skill subtree, different flow files)

## §impl-agent-father

## [Developer] Implementation Record

- **Agent:** agent-father | **Cycle:** c252 | **Timestamp:** 2026-05-22T08:35Z
- **Files created:**
  - `.claude/skills/handoff-delta-read/SKILL.md` — 77L; §N-slug anchor convention; delta-read algo; full-read fallback (null anchor, anchor-not-found, >24h stale)
- **Files modified:**
  - `.claude/flows/qa/main.md` — Step 0c delta-read call added; HANDOFF_DELTA in 2 RETURN blocks
  - `.claude/flows/developer/main.md` — Step 0c delta-read call added; HANDOFF_DELTA in RETURN block
  - `.claude/flows/fixer/main.md` — Step 0c delta-read call added; HANDOFF_DELTA in RETURN block
- **Smoke test:** PASS — delta read 7.6% of full file (628 of 8234 bytes). Backward compat: no §N anchors → full-read silently. Stale >24h → full-read. AC-5: zero apps/ touch.
- **AC status:** AC-1 PASS, AC-2 PASS, AC-3 PASS, AC-4 PASS, AC-5 PASS
- **Signal:** docs/signals/agent-father-1968d-P01-ready.json emitted (NEXT=qa)

## [QA] Review Record

**QA:** qa | **Round:** 1 | **Timestamp:** 2026-05-22T09:15Z
**Verdict:** CHANGES_REQUESTED
**Issues found:**
1. `.claude/skills/handoff-delta-read/SKILL.md:11` — prose says `##§N-slug` (no-space), code block examples show `## §1-spec` (space)
2. `.claude/skills/handoff-delta-read/SKILL.md:22` — grep pattern `^##§[0-9]` does not match space-format anchors
3. `.claude/skills/handoff-delta-read/SKILL.md:48` — fallback rule uses `##§` detection; space-format anchors not detected

**Required fix:** Standardize ALL occurrences to `## §N-slug` (WITH space) to match BA spec AC-1.

## [Fixer] Fix Record

**Fixer:** fixer | **Round:** 1 | **Timestamp:** 2026-05-22T10:45Z
**Issues fixed:**
1. `.claude/skills/handoff-delta-read/SKILL.md:11` — prose updated: `##§N-<slug>` → `## §N-<slug>`
2. `.claude/skills/handoff-delta-read/SKILL.md:22` — grep pattern updated: `^##§[0-9]` → `^## §[0-9]`
3. `.claude/skills/handoff-delta-read/SKILL.md:29` — input description updated: `##§N-slug` → `## §N-slug`
4. `.claude/skills/handoff-delta-read/SKILL.md:48` — fallback rule #1 updated: `##§` → `## §`
5. `.claude/skills/handoff-delta-read/SKILL.md:58, 64` — JSON examples: `##§3-qa-round-1` → `## §3-qa-round-1`
6. `.claude/skills/handoff-delta-read/SKILL.md:74, 77` — Smoke test section: `##§` → `## §`

**Verification:** `grep -n "##§" SKILL.md` returns ZERO matches; all canonical anchor format now `## §N-slug` (WITH space) ✓
**Commit:** b637bd8b
**Signal:** docs/signals/fixer-1968d-wave1-refixed.json emitted (NEXT=qa)
