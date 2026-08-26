#!/usr/bin/env bash
# shellcheck disable=SC2034  # OUT1/2/4/5/6/7/9 captured (stdout+stderr) for
#   debug visibility on failure even where only the exit code is asserted —
#   OUT3/OUT8 ARE read via grep below.
# install-launchd-plist.test.sh — hermetic fixture-only gate for install-launchd-plist.sh
#
# Mirrors scripts/agents-flow/branch-hygiene-stop.test.sh's fixture convention:
# the shipped script resolves its own repo root via
# `cd "$(dirname "${BASH_SOURCE[0]}")/.." ` (its OWN on-disk location), so
# isolating this test copies the script into a throwaway fixture tree at the
# SAME relative path (scripts/install-launchd-plist.sh + a sibling launchd/)
# rather than pointing REPO_ROOT at a fixture via env override. The
# INSTALL_LAUNCHD_PLIST_DST_DIR env var (the ONE override the shipped script
# does support) redirects the install destination away from any real path —
# this test NEVER touches ~/Library/LaunchAgents or any real installed plist.
#
# Coverage (per architecture brief §6):
#   T1  fresh install, no pre-existing $DST                -> exit 0, file installed, mode 600
#   T2  pre-existing $DST with NO Disabled key              -> exit 0, overwrite allowed
#   T3  pre-existing $DST with Disabled=>true                -> REFUSED, exit 1, $DST byte-unchanged
#   T4  pre-existing $DST with Disabled=>false                -> exit 0, overwrite allowed (not disabled)
#   T5  missing label arg                                     -> exit 2 (usage error)
#   T6  label with a path separator                            -> exit 2 (rejected before any file I/O)
#   T7  label with no tracked source plist                      -> exit 2
#   T8  --help                                                    -> exit 0, prints usage
#   T9  $DST is a SYMLINK (drift-immune install)                   -> exit 2, refuses to touch it
#
# Run:
#   bash scripts/install-launchd-plist.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
#
# OWNING TASK: FIX-FLEETPUSH-DISARM-EXISTS-ONLY-IN-UNTRACKED-PLIST-REPO-COPY-SILENTLY-REARMS
set -uo pipefail

REAL_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REAL_SCRIPT="$REAL_SCRIPT_DIR/install-launchd-plist.sh"

if [ ! -f "$REAL_SCRIPT" ]; then
  echo "ERROR: shipped script not found at $REAL_SCRIPT" >&2
  exit 1
fi

# ── Isolated fixture repo: same relative layout (scripts/, launchd/) ─────────
TMPDIR_TEST=$(mktemp -d /private/tmp/install-launchd-plist-test-XXXXXX)
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMPDIR_TEST" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

mkdir -p "$TMPDIR_TEST/scripts" "$TMPDIR_TEST/launchd" "$TMPDIR_TEST/dst"
cp "$REAL_SCRIPT" "$TMPDIR_TEST/scripts/install-launchd-plist.sh"
FIXTURE_SCRIPT="$TMPDIR_TEST/scripts/install-launchd-plist.sh"
DST_DIR="$TMPDIR_TEST/dst"

LABEL="com.example.testjob"
SRC_PLIST="$TMPDIR_TEST/launchd/${LABEL}.plist"
DST_PLIST="$DST_DIR/${LABEL}.plist"

write_src() {
  # $1 = fixture body variant tag: none | disabled-true | disabled-false
  local variant="$1" disabled_block=""
  case "$variant" in
    disabled-true)  disabled_block="  <key>Disabled</key>
  <true/>
" ;;
    disabled-false) disabled_block="  <key>Disabled</key>
  <false/>
" ;;
    none) disabled_block="" ;;
  esac
  cat > "$SRC_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>RunAtLoad</key>
  <true/>
${disabled_block}</dict>
</plist>
PLIST
}

PASS=0
FAIL=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "[test] PASS: $name (got=$got)"
    PASS=$((PASS + 1))
  else
    echo "[test] FAIL: $name — got=$got want=$want" >&2
    FAIL=$((FAIL + 1))
  fi
}

run_ilp() {
  # runs the fixture script against the fixture DST_DIR; never the real HOME
  INSTALL_LAUNCHD_PLIST_DST_DIR="$DST_DIR" bash "$FIXTURE_SCRIPT" "$@"
}

# ── T1: fresh install, no pre-existing $DST → exit 0, installed, mode 600 ───
write_src none
rm -f "$DST_PLIST"
OUT1=$(run_ilp "$LABEL" 2>&1); RC1=$?
check "T1 fresh install exit code" "$RC1" "0"
check "T1 fresh install file now exists" "$([ -f "$DST_PLIST" ] && echo yes || echo no)" "yes"
MODE1=$(stat -f '%Lp' "$DST_PLIST" 2>/dev/null || stat -c '%a' "$DST_PLIST" 2>/dev/null)
check "T1 fresh install mode 600" "$MODE1" "600"
check "T1 fresh install byte-identical to source" \
  "$(cmp -s "$SRC_PLIST" "$DST_PLIST" && echo same || echo diff)" "same"

# ── T2: pre-existing $DST with NO Disabled key → exit 0, overwrite allowed ──
write_src none
printf 'STALE-PLACEHOLDER' > "$DST_PLIST"
OUT2=$(run_ilp "$LABEL" 2>&1); RC2=$?
check "T2 overwrite (no Disabled key) exit code" "$RC2" "0"
check "T2 overwrite (no Disabled key) content replaced" \
  "$(cmp -s "$SRC_PLIST" "$DST_PLIST" && echo same || echo diff)" "same"

# ── T3: pre-existing $DST with Disabled=>true → REFUSED, exit 1, unchanged ─
write_src none
BEFORE_HASH=""
{
  cat > "$DST_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>Disabled</key>
  <true/>
</dict>
</plist>
PLIST
}
BEFORE_HASH=$(cksum "$DST_PLIST")
OUT3=$(run_ilp "$LABEL" 2>&1); RC3=$?
AFTER_HASH=$(cksum "$DST_PLIST")
check "T3 Disabled=>true REFUSED exit code" "$RC3" "1"
check "T3 Disabled=>true DST byte-unchanged" "$([ "$BEFORE_HASH" = "$AFTER_HASH" ] && echo unchanged || echo CHANGED)" "unchanged"
check "T3 refusal message names REFUSE" "$(printf '%s' "$OUT3" | grep -qi 'REFUSE' && echo yes || echo no)" "yes"

# ── T4: pre-existing $DST with Disabled=>false → exit 0, overwrite allowed ──
write_src none
cat > "$DST_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>Disabled</key>
  <false/>
</dict>
</plist>
PLIST
OUT4=$(run_ilp "$LABEL" 2>&1); RC4=$?
check "T4 Disabled=>false overwrite exit code" "$RC4" "0"
check "T4 Disabled=>false overwrite content replaced" \
  "$(cmp -s "$SRC_PLIST" "$DST_PLIST" && echo same || echo diff)" "same"

# ── T5: missing label arg → exit 2 ───────────────────────────────────────────
OUT5=$(run_ilp 2>&1); RC5=$?
check "T5 missing arg exit code" "$RC5" "2"

# ── T6: label with a path separator → exit 2, rejected before any file I/O ──
rm -f "$DST_PLIST"
OUT6=$(run_ilp "a/b" 2>&1); RC6=$?
check "T6 path-separator label exit code" "$RC6" "2"
check "T6 path-separator label creates no file" "$([ -f "$DST_PLIST" ] && echo yes || echo no)" "no"

# ── T7: label with no tracked source plist → exit 2 ─────────────────────────
OUT7=$(run_ilp "com.example.no-such-label" 2>&1); RC7=$?
check "T7 unknown label exit code" "$RC7" "2"

# ── T8: --help → exit 0, prints usage ───────────────────────────────────────
OUT8=$(run_ilp --help 2>&1); RC8=$?
check "T8 --help exit code" "$RC8" "0"
check "T8 --help prints usage" "$(printf '%s' "$OUT8" | grep -qi 'Usage:' && echo yes || echo no)" "yes"

# ── T9: $DST is a SYMLINK → exit 2, refuses to touch a drift-immune install ─
write_src none
rm -f "$DST_PLIST"
ln -s "$SRC_PLIST" "$DST_PLIST"
OUT9=$(run_ilp "$LABEL" 2>&1); RC9=$?
check "T9 symlink DST exit code" "$RC9" "2"
check "T9 symlink DST left as a symlink (untouched)" "$([ -L "$DST_PLIST" ] && echo yes || echo no)" "yes"
rm -f "$DST_PLIST"

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — install-launchd-plist.sh refuses to silently re-arm a locally-disabled installed plist; fresh/not-disabled installs still succeed. No real host state touched."
exit 0
