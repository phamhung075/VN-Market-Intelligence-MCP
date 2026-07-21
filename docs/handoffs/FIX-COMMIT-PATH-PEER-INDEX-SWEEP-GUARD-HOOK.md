---
sprint: FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK
branch: task/FIX-COMMIT-SWEEP-GUARD-HOOK
size: M
zone: scripts/
depends_on: []
blocks: []
---

## TLDR

Implement a pre-commit git hook that detects when a commit would absorb a peer's staged content into the index. The hook must distinguish bare commits (which sweep foreign content) from pathspec-scoped commits (which are safe). Default disposition: loud WARN. Optional opt-in REJECT via `GIT_SWEEP_GUARD_MODE=reject`. Must be installed via `scripts/git-hooks/install.sh` the same way as the existing pre-push hook.

## [PM] Planning Context

**Zone:** scripts/ (git-hooks infrastructure)

**Acceptance Criteria:**
- [ ] AC-1: An executable guard exists on the COMMIT path, installed via `scripts/git-hooks/install.sh` (extends existing `for hook in pre-push` loop to include `pre-commit` and `post-commit`)
- [ ] AC-2: A commit that would absorb index/working-tree content not staged by the committing actor is made OBSERVABLE at commit time via: (a) stderr banner naming swept files, (b) `.git/sweep-guard.log` local trail, (c) `docs/signals/*.json` bug-escalation write (bash+jq only, no MCP/network dependency)
- [ ] AC-3: The guard's own failure MUST NOT be silently indistinguishable from a pass; it must NOT adopt `2>/dev/null || true` idiom; internal guard errors (unrecognized `$GIT_INDEX_FILE` shape) fail-open AND loud
- [ ] AC-4: The legitimate `git commit -m ... -- <explicit pathspecs>` case is NOT blocked (pathspec-scoped commits route through `.git/next-index-*.lock` and never trigger the warning)
- [ ] AC-5: `scripts/git-hooks/install.sh` is extended so a fresh clone or `.git` rebuild re-installs the guard (`.git/hooks` is untracked; the symlink-from-tracked-source pattern is already proven in pre-push)

**Files to read first:**
- `docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md` (complete design specification; read §4.1 §4.3 §6 for hook logic, caveats, observability)
- `scripts/audits/verify-commit-sweep-discriminator.sh` (verification harness; re-run before accepting)
- `scripts/git-hooks/pre-push` (precedent pattern for installation and symlink wiring)

**Files to create:**
- `scripts/git-hooks/pre-commit` (§4.1 logic, bare vs pathspec detection via `$GIT_INDEX_FILE` basename)
- `scripts/git-hooks/post-commit` (optional SHA-correlation companion; non-blocking if it fails)
- `scripts/git-hooks/pre-commit.test.sh` (scratch-repo regression suite per §2.1/2.2/2.3/2.4/2.6; validates bare-sweeps-foreign, pathspec-excludes-foreign, directory/dot-loophole documented as non-goal, rebase-replay no-false-warn, reject-mode blocks+preserves index)

**Files to modify:**
- `scripts/git-hooks/install.sh` line 10: extend `for hook in pre-push` to `for hook in pre-push pre-commit` (and `post-commit` if the optional hook ships)

**Dependencies:** None (tier-1 parallel with skills fixes)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (script persistence convention)
- `docs/protocols/fail-loud-protocol.md` (bug-escalation signal shape for `docs/signals/*.json` write)
- `docs/standards/orch-state-access.md` (atomic file update patterns, if signaling via orch-state)
- Git internals: `$GIT_INDEX_FILE` environment variable set by git during commit, holds path to the index file in use (either `.git/index` / `.git/index.lock` for bare commits, or `.git/next-index-<pid>.lock` for pathspec-scoped commits)

**Design specification from architect brief (§4.1):**
- Bare commit or `git commit -a` → `$GIT_INDEX_FILE` basename is `index` or `index.lock` (reading real shared index)
- Pathspec-scoped `git commit -m msg -- exact-files` → basename is `next-index-*.lock` (git pre-resolved the pathspec into a scratch index before the hook runs, race-free)
- Hook fires INSIDE git's index.lock transaction, so the BARE check is atomic (no peer's concurrent `git add` can land mid-check)
- On BARE detection: emit stderr banner, write `.git/sweep-guard.log` (untracked, local, JSONL-ish), and attempt `docs/signals/*.json` bug-escalation write (best-effort, zero MCP dependency)
- On UNKNOWN shape (future git internal change): fail-open (exit 0) but loud (stderr message)
- Mode selection: check `$GIT_SWEEP_GUARD_MODE` environment variable; default `warn` (let commit proceed + emit signal); `reject` (exit 1, block commit, preserve index intact)

**Caveats from verification harness (§2 caveat 1-2):**
1. A pathspec commit cannot introduce an untracked file — will error `did not match any known file`. The scripts/git-hooks/ layer cannot address this; it is addressed by Layer 1 (skills fixes) which pair `git add <new>` with the scoped commit
2. `$GIT_DIR` is NOT reliably exported into the hook environment (observed empty on git 2.49.0/macOS). The guard must not depend on it; hooks reliably run with CWD at worktree top, so use relative paths only (`.git/sweep-guard.log`, `.git/next-index-*.lock`)

**Test strategy:**
- Run `scripts/git-hooks/pre-commit.test.sh` manually against the final implementation in a scratch clone (not the live repo)
- Verify against the row's `verification_gate` text: reproduce the race live with real command output (actor A stages file X, actor B runs pathspec-less commit, B's commit is rejected or flagged, A's content does NOT land under B's message)
- Re-run verification harness `scripts/audits/verify-commit-sweep-discriminator.sh` to confirm the brief's design premises still hold on the installed git (verified 2026-07-21 on git 2.49.0/macOS; recommend re-verify on Linux CI before marking AC as durable)

**Risk flags:**
- Detection depends on git-internal naming (`next-index-*.lock`) — not a documented public API. Mitigated by making the test script permanent and by the UNKNOWN-shape fail-open path; a future git version change degrades to "no warning" rather than wrongly blocks
- WARN-fire volume on day 1 could be high (60+ flow docs still use bare-commit-after-add idiom). Mitigated by shipping Layer 1 skills fixes in the same effort, which stops highest-traffic call sites from triggering warns
- `ps`-based argv enrichment (§2.3) is platform-fragile; flagged as best-effort only, core detection never depends on it
- Directory/dot-pathspec loophole (§2.3) is policy-enforced (mandate exact file paths only), not mechanically closed; acceptable because no observed occurrence used this form

**Post-implementation follow-up (Layer 2, NOT this row):**
- Sweep remaining ad-hoc inline `git commit -m` blocks in individual flow docs (60+ grep results) to pathspec-scoped form (already documented in `commit-boundary/SKILL.md` RULE 1 as `git add <named files only>`). This is PM-tracked cleanup, dispatched separately as a future sprint item.
