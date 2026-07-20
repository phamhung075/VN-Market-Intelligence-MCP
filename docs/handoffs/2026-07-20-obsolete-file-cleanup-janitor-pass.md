# Design Brief — Obsolete-File Cleanup Pass for the Context Janitor

**Author:** po · **Date:** 2026-07-20T22:11:26Z · **Task:** `FIX-CMH-OBSOLETE-FILE-CLEANUP`
**Implementer:** agent-father (flow + policy + coupled janitor script — all file-hygiene artifacts)
**Origin:** user feature request (caveman) "add clean obsolete file to system audit cron"

---

## 1. Decision: owner + placement

Owner = **claude-manager-helper** (Context Janitor), cron `77876d96` = `30 19 * * 1,4` (Mon/Thu 19:30 UTC).
This is the file-hygiene janitor. Its current `Pass 0: File Location Audit`
(`docs/agents/claude-manager-helper/flow/main.md`) only **RELOCATES** misplaced files — it never
**DELETES** obsolete garbage. That is the gap. Add a sibling **`Pass 0b: Obsolete-File Cleanup`**
that ALWAYS runs (like Pass 0, not git-diff gated).

`system-auditor` was considered and rejected — it is a read-only health prober, not a mutator; deletion
belongs with the janitor that already owns Pass 0 relocation.

### 1b. TWO-FOLD FIX — Pass 0 disposition, not just a new delete pass

A live parallel janitor run exposed a second half of this bug: **Pass 0 RELOCATED the garbage into a
committable path.** `$DUMP_FILE` (10 MB) and `coverage-state.json.tmp` were `mv`'d from repo root →
`docs/archive/`, which is **NOT gitignored** and already holds legit *tracked* archive docs
(`SSOT_AUDIT_*.md`, `notebooks/`, …). So Pass 0 "cleaning" just moved 10 MB of garbage from one
committable location to another — a latent `git add -A` sweep risk. The fix is therefore two parts:

1. **New deletion/quarantine pass (Pass 0b)** — §3–§5 below. Its scan scope MUST include `docs/archive/`
   so it catches garbage Pass 0 already dumped there (the tracked-file guard in §4 protects the legit
   archived docs; only untracked pattern-A/B garbage is quarantined).
2. **Pass 0 disposition fix** — Pass 0 MUST NOT relocate pure garbage into a committable path. Before its
   `mv`, Pass 0 checks the pattern-A/B allow-list (§3); a match is **excluded from relocation** and left
   in place for Pass 0b to quarantine (or handed directly to the quarantine helper). Do NOT blanket-
   gitignore `docs/archive/` — it holds tracked legit docs; fix disposition instead.

**Live targets to clear on ship:** `docs/archive/$DUMP_FILE` (10 MB) + `docs/archive/coverage-state.json.tmp`.

## 2. HARD BOUNDARY — signal files are NOT in scope for deletion

The signal-file lifecycle is **already owned** by the dev-team drain flow
(`docs/agents/dev-team/flow/drain-signals.md`): it fingerprints, moves `docs/signals/*.json` →
`docs/signals/processed/`, prunes both file + DB planes after **7 days**, and has a one-time backlog
purge (`scripts/audits/purge-legacy-processed-signals.sh`).

Therefore the new pass **MUST NOT** `rm` top-level `docs/signals/*.json` or reimplement retention —
that races the drain and risks deleting undrained signals (data loss; drain is mandatory, it *moves*
not *deletes*). Instead:

- **Signals dir = DETECT-ONLY.** If `ls docs/signals/*.json | wc -l` > 50 → the pass emits a
  **DRAIN-BEHIND** flag to the BUG channel (drain owner must catch up). It does not delete.
- The stale `bctc_signal_*_20260719_*.json` / `*-2026-07-19*.json` in the tree today are a
  *drain-behind* symptom, not janitor-delete targets. Related open task
  `CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS` covers the signals-dir relocation angle — do NOT double-work it.

## 3. SAFE-DELETE allow-list (what the pass MAY delete)

Deletion is **opt-in per pattern** — never "delete all untracked". A candidate qualifies ONLY if it
matches one allow-list pattern AND passes every hard invariant in §4.

| # | Pattern | Where | Grace | Rationale |
|---|---|---|---|---|
| A | Unexpanded-shell-var filenames: name matches `$*`, `${*}`, or bare `$VARNAME` | repo root, `docs/data/`, `docs/archive/` (non-recursive each) | any age | always a script bug, never legitimate (e.g. `$DUMP_FILE` = 10 MB DB dump, now at `docs/archive/`) |
| B | Atomic-write temp leftovers: `*.tmp`, `*.json.tmp`, `*.tmp.*` | `docs/data/`, `docs/archive/` (non-recursive each) | > 6 h | orphaned atomic-write scratch (e.g. `coverage-state.json.tmp`, now at `docs/archive/`) |
| C | Superseded per-cycle snapshots: `unified-agent-synthesis-*.json`, `cycle-snapshot-*.json` | `docs/data/` | keep newest 2 calendar days; older qualify | daily ephemera, regenerated each cycle |

The `docs/archive/` scan is the sink for anything Pass 0 already relocated (§1b). Its legit tracked docs
are protected by invariant 1 (tracked → skip); only untracked A/B garbage is eligible.

Grace periods + the keep-window are **env-configurable** (`OBSOLETE_GRACE_HOURS`,
`OBSOLETE_SNAPSHOT_KEEP_DAYS`) with the defaults above.

## 4. HARD invariants (NEVER — every candidate must pass ALL)

1. **NEVER delete a git-tracked file.** Per candidate: `git ls-files --error-unmatch <path>` exits 0
   → tracked → SKIP + log. Only untracked files are eligible.
2. **NEVER descend into** `.git/`, `.claude/`, `node_modules/`, `apps/*/`, `.backups/`, `packages/`.
   Bounded, explicit directory allow-list only (repo root non-recursive, `docs/data/`). No `find /`,
   no unbounded recursion.
3. **NEVER delete files younger than the grace period** (default 6 h; pattern A is the sole exception —
   unexpanded-var names are unambiguous garbage at any age).
4. **No path traversal** — resolve realpath, assert it is prefixed by `$PROJECT_ROOT` and inside an
   allow-listed subdir before any move/delete.
5. **Idempotent** — re-running produces 0 new candidates once quarantined; quarantine dedup by manifest.

## 5. DRY-RUN-FIRST + QUARANTINE (no blind `rm`)

- Reusable script `scripts/audits/clean-obsolete-files.sh`:
  - `--dry-run` (**default**): print candidate table (path · reason · age · size), write count to the
    Pass 10 report; if candidates found → one-line BUG-channel notice. **Deletes nothing.**
  - `--live`: does NOT `rm`. **Moves** candidates to `docs/data/.trash/<YYYY-MM-DD>/` (gitignored) with a
    `manifest.json` (original path, reason, size, moved-at). Recovery window mirrors drain's `processed/`.
  - Quarantine self-purge: `.trash/<date>/` dirs older than `OBSOLETE_TRASH_RETAIN_DAYS` (default 7) are
    `rm -rf`'d on a later tick — age-gated, idempotent.
- The Mon/Thu cron runs **dry-run by default**; live deletion is enabled by an explicit flag/env
  (`OBSOLETE_CLEANUP_LIVE=1`) so the first production ticks are observe-only.

## 6. Deliverables (agent-father)

1. **Flow:** add `Pass 0b: Obsolete-File Cleanup` to `docs/agents/claude-manager-helper/flow/main.md`
   (ALWAYS-runs stub calling the script) + a Pass 10 report line + Dispatch-table note. **Also fix Pass 0**
   (§1b): before its relocation `mv`, exclude pattern-A/B garbage from relocation (leave in place for
   Pass 0b / hand to quarantine) so garbage is never moved into a committable path. Mind the file's
   size-justification header and the janitor's own ≤200 L notebook self-cap.
2. **Policy SSOT:** `docs/policies/obsolete-file-cleanup.md` — allow-list (§3), invariants (§4),
   quarantine/retention (§5), the signals-drain boundary (§2).
3. **Script:** `scripts/audits/clean-obsolete-files.sh` — allow-list driven, bounded globs, tracked-file
   guard, quarantine + manifest + self-purge; `--dry-run` default. Add a canonical pointer in
   `docs/policies/dev-standards.md` § Script Persistence and in the Pass 0b body.
4. **.gitignore:** add `docs/data/.trash/`.

## 7. Acceptance criteria (QA-verifiable)

- **AC1** `clean-obsolete-files.sh --dry-run` lists the live targets `docs/archive/$DUMP_FILE` (pattern A)
  and `docs/archive/coverage-state.json.tmp` (pattern B, >6 h) plus any `docs/data/*.json.tmp` >6 h as
  candidates; lists NOTHING git-tracked (incl. the legit `docs/archive/SSOT_AUDIT_*.md`, `notebooks/`);
  lists NOTHING under `.git/.claude/node_modules/apps/packages/.backups`.
- **AC1b** Pass 0 no longer relocates pattern-A/B garbage into `docs/archive/` (or any committable path):
  seed a `$DUMP_FILE`-style file at repo root → after a Pass 0 run it is NOT sitting in `docs/archive/`
  (it is quarantined or left in place for Pass 0b), and `git status docs/archive/` shows no new garbage.
- **AC2** `--live` moves candidates into `docs/data/.trash/<date>/` with `manifest.json`, deletes 0
  tracked files, and a second run yields 0 new candidates (idempotent).
- **AC3** top-level `docs/signals/*.json` are never deleted by the script; with >50 present it emits a
  DRAIN-BEHIND BUG notice instead.
- **AC4** `Pass 0b` present in the janitor flow + Pass 10 report, runs on cron `77876d96`, dry-run by
  default, live-gated behind an explicit flag/env.
- **AC5** a freshly-created `docs/data/foo.tmp` (<6 h) is NOT a candidate (grace guard); a git-tracked
  file matching a pattern is NOT a candidate (invariant 1).

## 8. Scope

Lean CLEAN-type, single implementer (agent-father). No BA/architect chain — design is fully specified
here. Destructive risk is contained by allow-list + tracked-file guard + dry-run default + quarantine
(not `rm`). QA verifies against §7.
