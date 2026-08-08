# Fix Spec — FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE

**Task:** FIX-AUDITOR-DOCAUDIT-MEMORY-PATH-PREDICATE · P2 · S · zone `docs/agents/system-auditor/flow/`
**Mode:** `supervised:true` + `plan_only:true` — this document is a PLAN only. No file outside `docs/handoffs/` and the board/notebook/journal was edited by this cycle. `docs/agents/system-auditor/flow/main.md` itself is untouched.
**Produced by:** architect, 2026-08-08
**Handoff to:** po (adjudicates, then routes to a fix-authorized agent — developer or a future architect direct-edit cycle, PO's call)
**Origin:** `origin_signal_id: sys-20260722T003235-52bb`, PO triage `po/triage-20260722T0049`
**BUILD-STANDARD:** not-applicable (in-zone prose/doc maintenance fix, no new primitive)

---

## 0. Live re-verification of the row's own citations (do not trust the row text — re-derive)

- Row's own `root_cause`/`deliverable` cite `main.md:445`. **STALE.** Live-grepped 2026-08-08: the actual section is at **`docs/agents/system-auditor/flow/main.md:720-722`**, under `## Existing Doc/Memory Audit (Tier-3 only — skip in Tier-1 and Tier-2)` (heading at line 708). File is 1240 lines total.
- Exact live bytes at 720-722 (verified via `sed -n '718,723p' ... | cat -e`, em-dash preserved, confirmed no trailing-whitespace surprises):
  ```
  ### 1. Memory integrity — `memory/MEMORY.md`
  - Each entry: file exists, content current, not stale
  - Broken pointers | index > 200 lines | contradictions → fix or delete
  ```
- `docs/agent-memory/MEMORY.md` (the path the phantom-WARN names): confirmed absent (`find docs -iname MEMORY.md` finds only `docs/MEMORY.md`, a different, unrelated stale doc — see §2). `git log --diff-filter=D --summary -- '**/MEMORY.md'` shows the only historical `MEMORY.md` deletion in this repo is `docs/agent-memory/cowork-refactory-expert/MEMORY.md` (commit `ace28b78d`, 2026-04-27, "agent-memory cleanup" — a different per-agent-subfolder scheme retired that cycle). `docs/agent-memory/MEMORY.md` (no subfolder) never existed as a tracked path — matches PO's `git log --diff-filter=D` empty-result finding.
- Repo-wide grep for the literal strings `docs/agent-memory/MEMORY.md` and `MEMORY.md is MISSING`: **zero hits** in `docs/`, `scripts/`, `.claude/` source — only in `docs/data/orch/orch-state.json` (the emitted signal row + this fix's own board row) and its ephemeral hook-proposal snapshots (`.claude/tmp/orch-hook-proposal-*.json`, not source). Confirms: no hardcoded phantom-path constant anywhere in code — the FP originates purely from an LLM auditor cycle resolving the ambiguous prose `memory/MEMORY.md` against this repo's actual directory name `docs/agent-memory/`.
- Confirmed present + healthy, and confirmed **not a repo-tracked path**: the external Claude Code auto-memory file. Its absolute path is per-user/per-project-hash, e.g. `/Users/<user>/.claude/projects/<url-encoded-project-path>/memory/MEMORY.md` (this project's own instance was auto-injected into this very session's context under exactly that path shape — direct live proof it exists and is populated). It is Claude-platform-managed, has no single canonical repo-relative location, and is outside git entirely (not `git log`-able, not `find docs`-able — orthogonal storage plane).

---

## 1. Proposed exact wording fix (§1 Memory integrity)

### Decision: repoint at `docs/agent-memory/INDEX.md`, do NOT attempt to validate the external Claude auto-memory file's existence

Reasoning (this DOC-AUDIT section is otherwise 100% repo-scoped — see items 2-6 below, every one of them checks a `docs/`/`.claude/`/repo-root path):

1. **Semantic fit.** PO's own `deliverable` names `docs/agent-memory/INDEX.md` as "the REAL memory index" — this repo's actual project documentation-memory entry point (confirmed live: 15 lines, links `sessions/LATEST.md` + 4 dated session files + the write protocol). It is git-tracked, agent-readable, and is exactly the kind of artifact items 2-6 of this same DOC-AUDIT section already audit (knowledge-hygiene docs, agent specs, size caps, stats files) — a repo-relative canonical doc.
2. **Operational fit.** The external Claude auto-memory path has no single canonical repo-relative location — it is keyed by a URL-encoded absolute project path unique per host/user (`~/.claude/projects/<hash>/memory/MEMORY.md`). A DOC-AUDIT prose instruction cannot name it unambiguously as a *repo* artifact without hardcoding a host-specific absolute path into a checked-in flow doc — which would itself violate this project's own "System Data — Never Hardcode" convention (`CLAUDE.md`) and break the moment the auditor runs under a different user/machine (e.g. a CI runner, a teammate's laptop, a VPS). Existence of that file is guaranteed by the Claude Code platform itself, not by anything this repo's documentation-hygiene gate can or should assert control over.
3. **Scope fit.** Every other DOC-AUDIT sub-check (items 2-6, verified live in §2 below) audits repo-tracked content only. Folding a platform-external, non-repo artifact into this same TIER-3 doc/memory audit would be the one outlier check with a fundamentally different verification mechanism (no `ls`/`git log` proof is even possible against a path this repo's source never names) — better left alone entirely, not half-specified.

**Verdict: single sub-bullet fix, not two.** Point item 1 at `docs/agent-memory/INDEX.md` only; do not add a second bullet attempting to also validate the external Claude auto-memory file. The prose should still name-drop the external file once, briefly, so a future auditor reading this section never re-derives the same phantom-path confusion by assuming "memory/MEMORY.md" must resolve to something under `docs/`.

### Verbatim diff

**Before** (`docs/agents/system-auditor/flow/main.md:720-722`):
```markdown
### 1. Memory integrity — `memory/MEMORY.md`
- Each entry: file exists, content current, not stale
- Broken pointers | index > 200 lines | contradictions → fix or delete
```

**After:**
```markdown
### 1. Memory integrity — `docs/agent-memory/INDEX.md`
- Scope note: this checks the REPO-TRACKED project memory index only. Claude Code's own external
  per-session auto-memory file (`~/.claude/projects/<project-hash>/memory/MEMORY.md`, outside this
  repo, platform-managed) is NOT this check's concern — it has no canonical repo-relative path and
  its existence is guaranteed by the Claude Code platform, not by this project's doc conventions.
- `docs/agent-memory/INDEX.md` exists; each entry it lists (session/notebook pointer): file exists,
  content current, not stale
- Broken pointers | index > 200 lines | contradictions → fix or delete
```

(3 lines → 5 lines net; the "index > 200 lines" bullet is UNCHANGED — it already correctly refers to `INDEX.md` sized as an index document, not the phantom path, and continues to apply verbatim.)

---

## 2. Sibling phantom-path sweep — DOC-AUDIT items 2-6 (read-only, live-verified 2026-08-08)

Per the deliverable's own "verify no other DOC-AUDIT sub-check hardcodes a non-existent canonical path" clause. All checked live; **zero additional phantom paths found** in items 2-6:

| # | Section (main.md line) | Referenced path(s) | Live status |
|---|---|---|---|
| 2 | Knowledge hygiene (:724) | `docs/{policies,protocols,standards,references}/*.md` | All 4 dirs exist (16/27/17/15 files respectively) |
| 2 | " (:726) | `docs/data/tool-registry.json`, `docs/data/cron-registry.json`, `docs/data/stock-classification.json` | All 3 exist |
| 3 | Agent validation (:728) | `.claude/agents/*.md` | Exists, populated (agent-father.md, architect.md, ba.md, … confirmed) |
| 4 | Size caps (:731-734) | `CLAUDE.md`, `docs/data/orch/orch-state.json .task_board`/`.sprint_goal.entries[]` | `CLAUDE.md` exists (63L, under its own 120L cap); `orch-state.json` exists and both jq paths resolve |
| 5 | DB health (:736-755) | `/app/data/market.db-wal`, `/app/data/pdf_extractor.db-wal`, `/app/data/market.db` | These are IN-CONTAINER runtime paths, resolved dynamically each cycle via `docker exec "$MCP_CTR" ...` against the live named volume — not static repo paths, so not in-scope for a "phantom repo path" class of defect. No hardcode risk: container name itself is resolved via `docker ps` at runtime, not literal. |
| 6 | Stats drift (:757-761) | `docs/data/project-stats.json`, `scripts/gen-project-stats.ts` | Both exist |

**No fixes proposed for items 2-6** — read-only per task scope; this table is the deliverable's required evidence, not a change request.

### Adjacent finding (NOT this task's scope — flagged for PO only, not fixed here)

`docs/agent-memory/INDEX.md` — the exact file this fix now points item 1 at — is **itself currently in a genuinely broken state**, unrelated to the phantom-path defect:
- All 5 of its own listed session pointers are dead: `sessions/LATEST.md`, `sessions/2026-04-26-{alert-commander,developer,qa,ops}.md` — none exist on disk today (verified live `ls`, all 5 report MISSING).
- `docs/agent-memory/sessions/` has since evolved to a different structure (single dated file `2026-08-07-developer.md`, `archive/` subdir, various `*.log` files, no `LATEST.md`) — INDEX.md's content has not been git-touched since commit `ace28b78d` (2026-04-27) and was never updated to track that evolution.
- This is exactly the "Broken pointers ... → fix or delete" condition the (unmodified) 3rd bullet already names — it is not a NEW defect this fix introduces; it is a REAL, pre-existing doc-hygiene gap that the phantom-path bug has been silently masking (the check has never once looked at the real file). See §3 below — this is the natural negative control.
- **Out of scope for this task** (item 1's fix is the prose/path-predicate only, not a content cleanup of INDEX.md itself) — noting for PO to decide whether to open a follow-up FIX/backlog row for INDEX.md content hygiene.

---

## 3. Negative-control design (acceptance criterion, 2nd clause)

Acceptance text: *"a deliberately-broken memory index still trips a real WARN (negative control)"* — i.e. confirm the fix repoints the check onto a LIVE, actionable target, and does not silently defang it into a no-op.

**Primary negative control — already naturally present, no synthetic fixture required.** As found in §2's adjacent finding, `docs/agent-memory/INDEX.md` is *already* broken today (5/5 listed session pointers dead, content stale since 2026-04-27). This means the very first live Tier-3 DOC-AUDIT cycle run against the current tree, after this fix lands, will in the SAME cycle:
1. Emit **zero** `"docs/agent-memory/MEMORY.md is MISSING"` signals (positive half of the acceptance criterion — the phantom path is gone from the check).
2. Emit a **new, real** WARN citing `docs/agent-memory/INDEX.md`'s 5 broken session pointers (negative-control half — proves the corrected predicate is live and actionable, not defanged).

This is a stronger proof than a synthetic before/after toggle: it demonstrates the fixed check catching a real, currently-existing defect in production data, not a fixture manufactured to pass a test.

**Formal/reproducible fallback procedure** (for QA or a future re-verification, in case a follow-up task cleans up INDEX.md's pointers and the natural broken condition above disappears — at which point the natural negative control would stop firing and a synthetic one becomes necessary):
1. Copy `docs/agent-memory/INDEX.md` to a scratch path (e.g. this session's scratchpad dir — never touch the live tracked file).
2. In the copy, edit one currently-valid listed entry to point at a nonexistent file (e.g. `sessions/DOES-NOT-EXIST.md`).
3. Re-run the corrected §1 check logic against the scratch copy's referenced paths only (not the live `docs/agent-memory/INDEX.md`).
4. Confirm the check flags the broken entry (`WARN`/"broken pointer" outcome) — proves the predicate still fires on a genuinely broken index once INDEX.md itself is otherwise clean.
5. Discard the scratch copy. No live file touched, no signal emitted to the real signal queue.

**What would defang the check (must NOT ship):** any version of the fix that only checks `docs/agent-memory/INDEX.md` FILE EXISTENCE (satisfied trivially — it always exists) without also carrying forward the unchanged 2nd/3rd bullets ("each entry: file exists... not stale" / "broken pointers... fix or delete"). The verbatim diff in §1 keeps both bullets intact specifically to avoid this failure mode.

---

## 4. Implementation notes for whoever ships this (developer or architect direct-edit, PO's routing call)

- Single-file edit: `docs/agents/system-auditor/flow/main.md`, lines 720-722 → the 5-line block in §1 "After". No other file needs to change (confirmed zero hardcoded phantom-path references anywhere else, §0).
- No code/script changes — this is TIER-3-ONLY LLM-interpreted prose (per dispatch brief); the "implementation" IS the flow-doc text. A future system-auditor Tier-3 cycle reads the corrected §1 verbatim and acts on it directly — no `.test.sh`/CI gate exists for this class of check today (matches the dispatch brief's framing: no canonical script implements this specific sub-check).
- Verification after landing: next live Tier-3 DOC-AUDIT cycle (or a manually-triggered one) should be diffed against §3's two predictions (zero phantom-MISSING signal; a new real INDEX.md broken-pointer WARN) — this doubles as the acceptance-criterion proof and should be cited in the closing QA/PO note rather than re-derived from scratch.
- Do not fold the INDEX.md content cleanup (adjacent finding, §2) into this same task — separate concern, separate row if PO wants it addressed.
