#!/usr/bin/env bash
# fleet-worktree-push.sh — worktree-isolated push backstop
#
# PURPOSE: Push accumulated local commits to origin/main when the main working
#   tree is perpetually dirty (cowork churn keeps notebooks/orch-state modified).
#   Never touches the main working tree. Uses a temp git worktree as an isolated
#   sandbox. Implements the proven recipe from po-s84 + po-s98.
#
# USAGE:
#   bash scripts/fleet-worktree-push.sh [--dry-run]
#   PUSH_THRESHOLD=30 bash scripts/fleet-worktree-push.sh
#
# FLAGS:
#   --dry-run   Print what would be done; never push, never send Telegram.
#
# TUNABLE CONSTANTS (edit header, no rebuild needed):
PUSH_THRESHOLD=${PUSH_THRESHOLD:-20}   # push when local commits > this count
#
# INVARIANTS (DO NOT CHANGE):
#   - NEVER git stash / git reset / git checkout on the main working tree
#   - NEVER git rebase on the main working tree
#   - NEVER --force or --force-with-lease push
#   - Worktree is ALWAYS cleaned up on exit (success or abort)
#
# OWNING FLOW: docs/agents/po/flow/main.md § Step PUSH-BACKSTOP
# FALLBACK:    docs/agents/dev-team/flow/post-cycle.md § Step PUSH-BACKSTOP
#
# Shell: bash 4+ required (associative arrays, [[ ]], local -r)
# ShellCheck: SC2317 suppressed (unreachable-in-trap false positive on cleanup fn)

set -euo pipefail

# ── 0. Resolve repo root (script may be called from any cwd) ──────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── 1. Parse flags ────────────────────────────────────────────────────────────
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) echo "[fleet-push] WARN: unknown arg '$arg' — ignored" >&2 ;;
  esac
done

# ── 2. Load .env (silent — vars may already be exported in caller environment) ─
if [ -f "$REPO_ROOT/.env" ]; then
  set +u
  # shellcheck disable=SC1091  # .env path is dynamic; source is best-effort (silent fail is correct)
  source "$REPO_ROOT/.env" 2>/dev/null || true
  set -u
fi

# ── 3. Telegram helper ────────────────────────────────────────────────────────
# Sends a message to the specified channel (work or bug).
# On dry-run or missing env vars: prints to stderr instead (non-fatal).
send_tg() {
  local channel="$1"
  local message="$2"

  if $DRY_RUN; then
    echo "[fleet-push][DRY-RUN] telegram($channel): $message" >&2
    return 0
  fi

  local chat_id=""
  case "$channel" in
    work) chat_id="${TELEGRAM_INFO_WORK_CHANNEL_ID:-}" ;;
    bug)  chat_id="${TELEGRAM_REPORT_BUG_CHANNEL_ID:-}" ;;
    *)    chat_id="" ;;
  esac

  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "$chat_id" ]; then
    echo "[fleet-push] WARN: Telegram env not set, skipping notification ($channel): $message" >&2
    return 0
  fi

  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$chat_id" \
    --data-urlencode "text=$message" \
    > /dev/null || echo "[fleet-push] WARN: curl Telegram failed (non-fatal)" >&2
}

# ── 3b. Abort-signal emitter ──────────────────────────────────────────────────
# Drops a signal_queue row into docs/signals/ so the orch loop can SEE a push
# abort (previously the abort only sent a BUG telegram -> the board was BLIND to
# divergence, which is why the two-dot false-abort sat unnoticed for days).
# (FIX-AUTO-PUSH-ABORT-SIGNAL-TRACKING)
# Args: $1 = abort reason code (short slug), $2 = human-readable detail.
emit_abort_signal() {
  local reason="$1"
  local detail="$2"
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  local sig_path="$REPO_ROOT/docs/signals/fleet-push-abort-${reason}-${ts}.json"

  if $DRY_RUN; then
    echo "[fleet-push][DRY-RUN] would emit abort signal: $sig_path ($reason)" >&2
    return 0
  fi

  # Best-effort: signal emission must NEVER mask the real abort exit code.
  cat > "$sig_path" 2>/dev/null <<EOF || echo "[fleet-push] WARN: could not write abort signal $sig_path" >&2
{
  "from": "fleet-worktree-push",
  "to": "po",
  "type": "auto-push-abort",
  "priority": "high",
  "payload": {
    "reason": "${reason}",
    "detail": "${detail}",
    "ahead": "${ahead:-unknown}",
    "behind": "${behind:-unknown}",
    "threshold": "${PUSH_THRESHOLD}",
    "note": "Auto-push backstop aborted. origin/main is diverging without push. Investigate behind-set or push manually via scripts/fleet-worktree-push.sh."
  },
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# ── 4. Worktree path (timestamped to avoid collision) ─────────────────────────
WT_PATH="/tmp/fleet-push-wt-$(date +%s)"

# ── 5. Cleanup trap — always fires on exit (success, abort, or signal) ────────
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below — not a dead function
cleanup() {
  local exit_code=$?
  if [ -d "$WT_PATH" ]; then
    git -C "$REPO_ROOT" worktree remove --force "$WT_PATH" 2>/dev/null || true
  fi
  git -C "$REPO_ROOT" worktree prune 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ── 6. Ahead count check ──────────────────────────────────────────────────────
# Abort immediately (safe no-op) if we are not far enough ahead.
cd "$REPO_ROOT"

ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
echo "[fleet-push] ahead=$ahead threshold=$PUSH_THRESHOLD"

if [ "$ahead" -le "$PUSH_THRESHOLD" ]; then
  echo "[fleet-push] ahead ($ahead) <= threshold ($PUSH_THRESHOLD) — nothing to do"
  exit 0
fi

if $DRY_RUN; then
  echo "[fleet-push][DRY-RUN] would push $ahead commits (> threshold $PUSH_THRESHOLD)"
fi

# ── 7. Behind-set classification ─────────────────────────────────────────────
# Fetch to get up-to-date knowledge of origin (non-destructive read-only fetch).
git fetch origin main --quiet 2>/dev/null || {
  echo "[fleet-push] WARN: git fetch failed — proceeding with cached origin/main" >&2
}

behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
echo "[fleet-push] behind=$behind"

if [ "$behind" -gt 0 ]; then
  # Classify the behind-set by WHAT it changed, NOT by the commit-message prefix.
  #
  # WHY NOT message-prefix: the old classifier treated a commit as benign only if
  #   its subject started with "chore(" or "ci(". That ABORTS on the two commit
  #   kinds origin ACCUMULATES on every cycle:
  #     - "Merge ..." commits (every worktree-push we do creates one on origin), and
  #     - "docs(reports): ..." commits (TNB/cowork report churn).
  #   Both are benign content-wise, but neither starts with chore(/ci( -> the
  #   message-prefix classifier aborted ~every subsequent run. Message-prefix
  #   allow-listing is brittle; the real question is whether the behind-set touches
  #   CODE that needs human review.
  #
  # The benign-path allowlist mirrors the actual cowork/report churn surface that
  # origin accumulates without any human-review need:
  #   docs/**            cowork/report/health doc churn
  #   *.md               any markdown (notebooks, reports, flow docs)
  #   orch-state.json    board SSOT (cloud chore mutations, additive)
  #   docs/signals/**    signal-bus files
  #   *cowork-schedule.json  cadence ledger
  #   docs/agent-memory/**   agent notebooks + health rechecks
  #   scripts/*.jq       disposable PO/router triage helpers (261 on origin,
  #                      churned + deleted every cycle — NOT reviewable code)
  # Anything OUTSIDE this set (scripts/*.sh, *.ts, apps/**, *.json config, etc.)
  # is real code/config -> abort + BUG telegram so a human reconciles.
  # Single source of truth for the allowlist (keep both uses in sync via this var):
  BENIGN_RE='^(docs/|.*\.md$|docs/data/orch/orch-state\.json|docs/signals/|.*cowork-schedule\.json|docs/agent-memory/|scripts/.*\.jq$)'
  # NOTE: `grep -c` exits 1 on zero matches; chaining `|| echo 0` would emit a
  # SECOND "0" (the multiline "0\n0" then breaks `[ -gt ]` under set -e). So we
  # swallow grep's nonzero exit with `|| true` and default an empty result to 0.
  # WHY THREE-DOT (HEAD...origin/main): we must classify ONLY the behind-set's
  #   own changes (merge-base -> origin/main), NOT the symmetric tip diff.
  #   TWO-dot (HEAD..origin/main) is the *combined* tip-to-tip diff and therefore
  #   also surfaces LOCAL's AHEAD edits (e.g. unpushed *.ts code fixes). The fleet
  #   perpetually carries ahead code commits, so two-dot mis-reads them as
  #   "behind-set touches code" and FALSE-ABORTS every cycle even when origin's
  #   actual behind-set is pure chore. Three-dot = diff(merge-base, origin/main)
  #   = exactly what the behind-set introduces. (FIX-AUTO-PUSH-TWODOT-FALSE-ABORT)
  #   The `behind=` rev-list on line ~121 uses two-dot CORRECTLY — that is a
  #   reachability COUNT (commits in origin not in HEAD), not a content diff.
  # shellcheck disable=SC2155
  code_touched=$(git diff --name-only HEAD...origin/main 2>/dev/null \
    | grep -Ev "$BENIGN_RE" \
    | grep -c '.' || true)
  code_touched=${code_touched:-0}

  echo "[fleet-push] behind-set: ${behind} commit(s), ${code_touched} code/config file(s) touched"

  if [ "$code_touched" -gt 0 ]; then
    code_files=$(git diff --name-only HEAD...origin/main 2>/dev/null \
      | grep -Ev "$BENIGN_RE" \
      | tr '\n' ' ')
    msg="[fleet-push] ABORT: origin/main behind-set touches ${code_touched} code/config file(s) not in HEAD: ${code_files}. Manual reconcile required before auto-push."
    echo "$msg" >&2
    send_tg bug "$msg"
    emit_abort_signal "behind-set-code" "$code_files"
    exit 1
  fi

  echo "[fleet-push] behind-set is docs/notebook/orch/signal-only (no code) — safe to merge"
fi

# ── 8. Create isolated worktree ───────────────────────────────────────────────
echo "[fleet-push] creating worktree at $WT_PATH"
git worktree add "$WT_PATH" HEAD --quiet

# ── 9. Merge origin/main into worktree (if behind) ───────────────────────────
if [ "$behind" -gt 0 ]; then
  if $DRY_RUN; then
    echo "[fleet-push][DRY-RUN] would merge origin/main (${behind} chore commits)"
  else
    echo "[fleet-push] merging origin/main (${behind} chore commits)"
    if ! git -C "$WT_PATH" merge origin/main --no-edit 2>&1; then
      # Merge failed — check if only orch-state.json is conflicted
      conflicted=$(git -C "$WT_PATH" diff --name-only --diff-filter=U 2>/dev/null || echo "")
      # `grep -c` exits 1 on zero matches -> swallow with `|| true` + default 0
      # (chaining `|| echo 0` would emit "0\n0" and break `[ -gt ]` under set -e).
      orch_conflicts=$(echo "$conflicted" | grep -c 'orch-state\.json' || true)
      orch_conflicts=${orch_conflicts:-0}
      other_conflicts=$(echo "$conflicted" | grep -v 'orch-state\.json' | grep -c '.' || true)
      other_conflicts=${other_conflicts:-0}

      if [ "$other_conflicts" -gt 0 ]; then
        # Non-orch-state conflict — abort merge, abort push
        git -C "$WT_PATH" merge --abort 2>/dev/null || true
        msg="[fleet-push] ABORT: merge conflict in non-orch-state file(s): $(echo "$conflicted" | grep -v 'orch-state\.json' | tr '\n' ' '). Manual resolve required."
        echo "$msg" >&2
        send_tg bug "$msg"
        emit_abort_signal "merge-conflict" "$(echo "$conflicted" | grep -v 'orch-state\.json' | tr '\n' ' ')"
        exit 1
      fi

      if [ "$orch_conflicts" -gt 0 ]; then
        # orch-state.json conflict: keep HEAD (our board mutations are authoritative;
        # cloud chore commits are additive _updated_at/_updated_by only — safe to discard).
        echo "[fleet-push] orch-state.json conflict — keeping HEAD (--ours)"
        git -C "$WT_PATH" checkout --ours docs/data/orch/orch-state.json
        git -C "$WT_PATH" add docs/data/orch/orch-state.json
        GIT_EDITOR=true git -C "$WT_PATH" merge --continue 2>&1 || {
          msg="[fleet-push] ABORT: merge --continue failed after orch-state.json --ours resolution."
          echo "$msg" >&2
          send_tg bug "$msg"
          emit_abort_signal "merge-continue-fail" "orch-state.json --ours merge --continue failed"
          exit 1
        }
        echo "[fleet-push] merge continued cleanly after orch-state.json --ours"
      fi
    fi
  fi
fi

# ── 10. Symlink node_modules so pre-push tsc hook can resolve deps ────────────
# The worktree shares the repo's node_modules (COPY-baked or local).
if [ ! -e "$WT_PATH/node_modules" ] && [ -d "$REPO_ROOT/node_modules" ]; then
  ln -s "$REPO_ROOT/node_modules" "$WT_PATH/node_modules"
  echo "[fleet-push] symlinked node_modules"
fi
# Also symlink apps/mcp-server/node_modules if it exists separately
if [ ! -e "$WT_PATH/apps/mcp-server/node_modules" ] && [ -d "$REPO_ROOT/apps/mcp-server/node_modules" ]; then
  ln -s "$REPO_ROOT/apps/mcp-server/node_modules" "$WT_PATH/apps/mcp-server/node_modules" 2>/dev/null || true
fi

# ── 11. Pre-push tsc gate ─────────────────────────────────────────────────────
# MUST be 0. Never push around a red tree (feedback_red_prepush_strands_fleet).
echo "[fleet-push] running pre-push tsc check..."
if $DRY_RUN; then
  echo "[fleet-push][DRY-RUN] would run: pnpm --filter vn-market check (in worktree)"
else
  pushd "$WT_PATH" > /dev/null
  if ! pnpm --filter vn-market check 2>&1; then
    popd > /dev/null
    msg="[fleet-push] ABORT: pnpm --filter vn-market check failed (red tree). Fix tsc errors before pushing."
    echo "$msg" >&2
    send_tg bug "$msg"
    emit_abort_signal "tsc-red" "pnpm --filter vn-market check failed in worktree"
    exit 1
  fi
  popd > /dev/null
  echo "[fleet-push] tsc check passed"
fi

# ── 12. Push ──────────────────────────────────────────────────────────────────
# Use git -C <worktree> push (the worktree knows its remote from the main repo).
# HEAD:main = fast-forward push only (no force, no force-with-lease).
echo "[fleet-push] pushing ${ahead} commits to origin/main..."
if $DRY_RUN; then
  echo "[fleet-push][DRY-RUN] would run: git -C $WT_PATH push origin HEAD:main"
  send_tg work "[fleet-push][DRY-RUN] would push ${ahead} commits to origin/main (threshold=${PUSH_THRESHOLD})"
else
  if ! git -C "$WT_PATH" push origin HEAD:main 2>&1; then
    msg="[fleet-push] ABORT: git push origin HEAD:main failed (non-zero exit). Check git output above."
    echo "$msg" >&2
    send_tg bug "$msg"
    emit_abort_signal "push-fail" "git push origin HEAD:main returned non-zero"
    exit 1
  fi
  echo "[fleet-push] push succeeded"
  send_tg work "[fleet-push] pushed ${ahead} commits to origin/main (threshold=${PUSH_THRESHOLD})"
fi

# cleanup trap fires here (removes worktree + prunes)
exit 0
