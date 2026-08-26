#!/usr/bin/env bash
# install-launchd-plist.sh — sole sanctioned install/re-arm path for copy-based
#   launchd/*.plist labels (currently: com.vn-market.fleet-push,
#   com.vn-market.docker-events).
#
# PURPOSE (FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS):
#   Some launchd labels install as a symlink to the tracked repo file
#   (drift-immune by construction — editing the repo file IS editing the live
#   file). Others (fleet-push, docker-events) install as an independent COPY —
#   a `cp launchd/<label>.plist ~/Library/LaunchAgents/` from a fresh clone or
#   disaster-recovery restore silently overwrites any live host-level override
#   the user made directly on the installed copy (e.g. flipping `Disabled` to
#   true to pause a job without changing the tracked design default).
#
#   This script closes that gap by REFUSING to overwrite an installed plist
#   that is currently locally-disabled (`Disabled` => true), instead of
#   silently re-arming it. It is a discipline/documentation control, not an
#   OS-level lock — a manual `cp` still bypasses it entirely. Same category,
#   same acceptance this fleet already gives scripts/orch-apply.sh.
#
# HARD CONSTRAINT: never verifies/mutates using `grep` on a plist. These files
#   are BINARY — grep reads the `Disabled` key as false-absent (hit live once
#   during this row's triage). Always `plutil -extract ... raw`.
#
# USAGE:
#   bash scripts/install-launchd-plist.sh <label>
#   bash scripts/install-launchd-plist.sh com.vn-market.fleet-push
#   bash scripts/install-launchd-plist.sh --help
#
# EXIT CODES:
#   0 = installed (fresh install, or overwrite of a not-locally-disabled copy)
#   1 = REFUSED — installed copy is locally disabled (Disabled=>true); not overwritten
#   2 = usage/arg error (missing label, missing source file, etc.)
#
# Does NOT run `launchctl load`/`enable`/`bootstrap` — install/refresh of the
#   on-disk copy only. Loading (or not) after install is a separate, explicit
#   step the caller performs — this script never arms a job on its own.
#
# OWNING TASK: FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS
# OWNING DESIGN: docs/architecture-briefs/2026-08-26-fix-fleetpush-disarm-durable-install-guard.md
# OWNING DOC: docs/standards/cron-jobs.md § Push Backstop "Install / re-arm"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: install-launchd-plist.sh <label>

  <label>   launchd label, e.g. com.vn-market.fleet-push
            (matches launchd/<label>.plist in this repo)

Installs launchd/<label>.plist to ~/Library/LaunchAgents/<label>.plist.

REFUSES (exit 1) to overwrite an already-installed copy whose `Disabled`
key currently reads true — that would silently re-arm a job the user
disabled on the live host. Verified via `plutil -extract Disabled raw`,
never grep (this plist format is binary; grep false-negatives the key).

Does not run `launchctl load`/`enable`/`bootstrap` — install only.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ $# -ne 1 ]; then
  echo "ERROR: expected exactly one argument, <label>." >&2
  usage >&2
  exit 2
fi

LABEL="$1"

if [ -z "$LABEL" ]; then
  echo "ERROR: label must not be empty." >&2
  exit 2
fi

case "$LABEL" in
  */*)
    echo "ERROR: label must be a bare launchd label (e.g. com.vn-market.fleet-push), not a path: $LABEL" >&2
    exit 2
    ;;
esac

SRC="$REPO_ROOT/launchd/${LABEL}.plist"
DST_DIR="${INSTALL_LAUNCHD_PLIST_DST_DIR:-$HOME/Library/LaunchAgents}"
DST="$DST_DIR/${LABEL}.plist"

if [ ! -f "$SRC" ]; then
  echo "ERROR: no tracked plist for label '$LABEL' at $SRC" >&2
  exit 2
fi

if [ -L "$DST" ]; then
  echo "ERROR: $DST is a SYMLINK install (drift-immune by construction) — this script only" >&2
  echo "       handles copy-based labels. Refusing to touch a symlink install." >&2
  exit 2
fi

if [ -f "$DST" ]; then
  # plutil -extract, never grep (binary plist; grep reads the key as false-absent).
  # rc=0 + stdout "true"  -> key present and true  -> locally disabled, REFUSE.
  # rc=1 (stderr "No value at that key path") -> key absent -> not disabled, proceed.
  # rc=0 + stdout "false" -> key present but false -> not disabled, proceed.
  DISABLED_VAL="$(plutil -extract Disabled raw "$DST" 2>/dev/null || true)"
  if [ "$DISABLED_VAL" = "true" ]; then
    echo "REFUSE: ${LABEL} is locally disabled on the INSTALLED plist ($DST, Disabled=>true)." >&2
    echo "        Not overwriting — this would silently re-arm it." >&2
    echo "        See docs/standards/cron-jobs.md for the documented, explicit re-arm" >&2
    echo "        procedure if re-arming is truly intended." >&2
    exit 1
  fi
fi

mkdir -p "$DST_DIR"
cp "$SRC" "$DST"
chmod 600 "$DST"
echo "Installed ${LABEL} from ${SRC#"$REPO_ROOT/"} to $DST."
echo "Not loaded. To arm it: launchctl load \"$DST\""
