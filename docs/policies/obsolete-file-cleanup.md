<!-- size-justification: 88L — SSOT for a single narrow policy (allow-list + invariants + quarantine mechanics + one hard boundary). All sections load-bearing for the script/flow that implement it; no natural split point below the 120L policy-doc convention. -->
# Obsolete-File Cleanup — Policy SSOT

**Owner:** claude-manager-helper (Context Janitor) Pass 0b · **Task:** `FIX-CMH-OBSOLETE-FILE-CLEANUP`
**Design brief:** `docs/handoffs/2026-07-20-obsolete-file-cleanup-janitor-pass.md`
**Implements:** `scripts/audits/clean-obsolete-files.sh` (quarantine-first, dry-run default)
**Consumed by:** `docs/agents/claude-manager-helper/flow/main.md` § Pass 0 (disposition gate) + § Pass 0b (cleanup pass)

---

## 1. Principle

Deletion is **opt-in per pattern** — never "delete all untracked". A candidate qualifies ONLY if it
matches one allow-list pattern below AND passes every hard invariant in §3. No blind `rm` — quarantine
first (§4).

## 2. SAFE-DELETE allow-list

| # | Pattern | Where (non-recursive each) | Grace | Rationale |
|---|---|---|---|---|
| A | Unexpanded-shell-var filenames: `$*`, `${*}`, bare `$VARNAME` | repo root, `docs/data/`, `docs/archive/` | any age | always a script bug, never legitimate |
| B | Atomic-write temp leftovers: `*.tmp`, `*.json.tmp`, `*.tmp.*` | `docs/data/`, `docs/archive/` | > `OBSOLETE_GRACE_HOURS` (default 6h) | orphaned atomic-write scratch |
| C | Superseded per-cycle snapshots: `unified-agent-synthesis-*.json`, `cycle-snapshot-*.json` (never `cycle-snapshot-latest.json` — active pointer) | `docs/data/` | keep newest `OBSOLETE_SNAPSHOT_KEEP_DAYS` calendar days (default 2); older qualify | daily ephemera, regenerated each cycle |

`docs/archive/` is in-scope because Pass 0 has historically relocated pattern-A/B garbage there (§5). Its
legit tracked docs (`SSOT_AUDIT_*.md`, `notebooks/`, …) are protected by invariant 1 — only untracked
pattern-A/B matches are eligible.

## 3. HARD invariants (NEVER — every candidate must pass ALL)

1. **NEVER delete a git-tracked file.** `git ls-files --error-unmatch <path>` exits 0 → SKIP + log.
2. **NEVER descend into** `.git/`, `.claude/`, `node_modules/`, `apps/*/`, `.backups/`, `packages/`. Bounded,
   explicit directory allow-list only (repo root non-recursive, `docs/data/`, `docs/archive/`) — no `find /`,
   no unbounded recursion.
3. **NEVER delete files younger than the grace period** (default 6h; pattern A is the sole exception).
4. **No path traversal** — resolve realpath, assert it is prefixed by the repo root and inside an
   allow-listed subdir before any move.
5. **Idempotent** — re-running produces 0 new candidates once quarantined; quarantine dedup by manifest.

## 4. DRY-RUN-FIRST + QUARANTINE (no blind `rm`)

- `--dry-run` (**default**): prints candidate table (path · reason · age · size). Deletes nothing. If
  candidates found → best-effort one-line BUG-channel notice.
- `--live`: never `rm`s. **Moves** candidates to `docs/data/.trash/<YYYY-MM-DD>/` (gitignored, mirrors
  relative source path to avoid basename collisions) with a `manifest.json` (original path, reason, size,
  moved-at). Recovery window mirrors the signals-drain's `processed/` pattern.
- Quarantine self-purge: `.trash/<date>/` dirs older than `OBSOLETE_TRASH_RETAIN_DAYS` (default 7) are
  `rm -rf`'d on a later `--live` tick — age-gated, idempotent, reported as `would-purge` in dry-run.
- Mon/Thu cron runs dry-run by default; live is gated behind `--live` or `OBSOLETE_CLEANUP_LIVE=1` — the
  explicit `--dry-run` flag always wins over the env (safety valve, never overridable).

**Env config** (defaults shown): `OBSOLETE_GRACE_HOURS=6` · `OBSOLETE_SNAPSHOT_KEEP_DAYS=2` ·
`OBSOLETE_TRASH_RETAIN_DAYS=7` · `OBSOLETE_CLEANUP_LIVE=0`.

## 5. Pass 0 disposition (relocation must never launder garbage into a committable path)

Pass 0 (File Location Audit) relocates *misplaced-but-legitimate* files. It MUST NOT relocate pattern-A/B
garbage into `docs/archive/` (or any other committable path) — that turns "cleaning" into moving 10 MB of
garbage from one committable location to another (a latent `git add -A` sweep risk). Before its `mv`, Pass 0
checks each violation against §2's pattern-A/B; a match is excluded from relocation and left in place for
Pass 0b to quarantine. `docs/archive/` is NOT blanket-gitignored (it holds tracked legit archive docs) —
the fix is disposition logic, not suppression.

## 6. HARD BOUNDARY — signals are NOT in scope for deletion

`docs/signals/*.json` lifecycle is owned by `docs/agents/dev-team/flow/drain-signals.md` (fingerprint, move
to `processed/`, 7-day prune both planes). This policy's script is **DETECT-ONLY** on that directory: if
top-level `docs/signals/*.json` count > 50, it emits a **DRAIN-BEHIND** BUG notice — it never deletes or
moves those files. Do not add a second lifecycle owner for signals here.

## 7. Related

`CLEAN-SIGNALS-DIR-NONSIGNAL-ARTIFACTS` (open task) covers signals-dir relocation of non-signal artifacts —
do not double-work it from this policy.
