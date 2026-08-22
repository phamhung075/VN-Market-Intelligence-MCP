#!/usr/bin/env bash
# scripts/git-hooks/pre-push.test.sh
#
# Permanent regression suite for scripts/git-hooks/pre-push
# (FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER). Prior to this task the hook had ZERO
# test coverage of its own (only its sub-scripts — size-lint-justification.test.sh,
# task-claim-owner-session-lint.test.sh, rebuild-raw-verify-check.test.sh — were tested).
#
# ISOLATION: mirrors scripts/git-hooks/pre-commit.test.sh's new_repo() scratch-repo idiom —
# every scenario runs inside its own mktemp scratch repo, NEVER touches the live project
# repo's .git/. The REAL scripts/git-hooks/pre-push script is invoked directly (bash on its
# live absolute path) rather than via a real `git push` over a network/local-remote hop —
# git's pre-push contract is exactly "read `<local ref> <local sha> <remote ref> <remote sha>`
# lines from stdin, cwd = the repo", which is reproduced verbatim by run_hook() below.
#
# Coverage (mirrors the owning brief's §4 test-plan points 1-4; point 5 "live parity proof
# against the real repo HEAD" is a one-time manual verification step, not a permanent
# assertion here — a hardcoded expected-FAIL would break the moment the 3 symptom rows landed,
# which is exactly what happened between this brief's 2026-08-05 measurement and this task's
# 2026-08-22 implementation. See the Developer Implementation Record / notebook for that run):
#   T1 doc-only push, all 3 doc-shaped checks clean -> they RUN and PASS, tsc SKIPPED
#      (CODE_TOUCHING_REGEX sees no code path in the pushed range).
#   T2 doc-shaped check FAILS on an otherwise docs-only push (task-claim-owner-session-lint
#      fixture — a docs/agents/*/flow/*.md file with a task_claim(...) call missing
#      owner_client_session, the same shape as the real 3ce726a6e incident) -> hook BLOCKS
#      (exit 1) even though the range never touches CODE_TOUCHING_REGEX and tsc would have
#      been skipped.
#   T3 code-touching push -> doc-shaped checks still run (and pass) AND tsc is still invoked
#      exactly as before (asserted via a stub `pnpm` on PATH that echoes a sentinel and exits
#      0 — proves the hook actually called it rather than skipping).
#   T4 bun absent from PATH, size-lint + task-claim-lint both clean -> WARN + non-blocking
#      (fail-open) skip of ONLY the tool-registry-parity check; hook still exits 0. Isolated
#      from T2's failing fixture deliberately: run_doc_shaped_checks() gates each check with
#      `|| return 1` in sequence (size-lint, then task-claim-lint, then bun), so a run that
#      ALSO fails an earlier check short-circuits before ever reaching the bun branch — T2
#      already proves the earlier 2 checks retain their own power to block independently.
#
# Run: bash scripts/git-hooks/pre-push.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
# Owning task: FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER
# Owning brief: docs/architecture-briefs/2026-08-05-fix-ci-gates-invisible-to-prepush-docs-path-filter.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="$SCRIPT_DIR/pre-push"

if [ ! -f "$HOOK_SRC" ]; then
  echo "ERROR: pre-push hook not found at $HOOK_SRC" >&2
  exit 1
fi

PASS=0
FAIL=0

AUDITS_SRC_DIR="$(cd "$SCRIPT_DIR/../audits" && pwd)"

new_repo() {
  # Creates a fresh scratch repo, seeds a base commit carrying:
  #  - a PASSING apps/mcp-server/__tests__/tool-registry-parity.test.ts fixture (so `bun test
  #    tool-registry-parity` has something real to match/pass by default — bun exits 1 on
  #    zero-file-match, verified live, so every scenario needs this present unless it is
  #    deliberately testing the bun-absent path);
  #  - REAL (copied, not re-implemented) byte-for-byte copies of the 3 audit scripts
  #    scripts/git-hooks/pre-push itself shells out to (size-lint-justification.sh,
  #    task-claim-owner-session-lint.sh, rebuild-raw-verify-check.sh) at scripts/audits/ —
  #    each of those resolves its OWN `git rev-parse --show-toplevel` independently, so they
  #    must live inside the scratch repo tree to behave exactly as they would in the real repo
  #    (no docs/data/*-baseline.json present in the scratch repo -> both lint scripts fall
  #    back to an empty baseline, which is fine: the fixtures below are crafted as clean
  #    new-offender cases either way, not baseline-adjacent).
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/pre-push-test.XXXXXX")"
  (
    cd "$dir" || exit 1
    git init -q .
    git config user.email test@local
    git config user.name test
    mkdir -p apps/mcp-server/__tests__ scripts/audits
    cat > apps/mcp-server/__tests__/tool-registry-parity.test.ts <<'EOF'
import { test, expect } from "bun:test";
test("fixture parity ok", () => { expect(1).toBe(1); });
EOF
    cp "$AUDITS_SRC_DIR/size-lint-justification.sh" scripts/audits/size-lint-justification.sh
    cp "$AUDITS_SRC_DIR/task-claim-owner-session-lint.sh" scripts/audits/task-claim-owner-session-lint.sh
    cp "$AUDITS_SRC_DIR/rebuild-raw-verify-check.sh" scripts/audits/rebuild-raw-verify-check.sh
    chmod +x scripts/audits/*.sh
    echo base > seed.txt
    git add -A
    git commit -qm seed
  )
  printf '%s' "$dir"
}

# run_hook <dir> <base_sha> <head_sha> <outfile> [extra PATH prefix to strip, space-free token]
# Feeds a synthetic single-ref push line to the REAL hook (git's own pre-push stdin protocol),
# cwd = <dir>. Captures combined stdout+stderr to <outfile>, returns the hook's exit code.
run_hook() {
  local dir="$1" base="$2" head="$3" outfile="$4"
  (
    cd "$dir" || exit 1
    printf 'refs/heads/main %s refs/heads/main %s\n' "$head" "$base" | bash "$HOOK_SRC"
  ) >"$outfile" 2>&1
}

# ── T1: doc-only push, all 3 doc-shaped checks clean -> RUN+PASS, tsc SKIPPED ──────────────
D1="$(new_repo)"
BASE1="$(cd "$D1" && git rev-parse HEAD)"
(
  cd "$D1" || exit 1
  mkdir -p docs
  echo "hello" > docs/note.md
  git add docs/note.md
  git commit -qm "doc-only change"
)
HEAD1="$(cd "$D1" && git rev-parse HEAD)"
OUT1="$D1/out.log"
run_hook "$D1" "$BASE1" "$HEAD1" "$OUT1"
RC1=$?
if [ "$RC1" -eq 0 ] \
  && grep -q "\[size-lint\] PASS" "$OUT1" \
  && grep -q "\[task-claim-lint\] PASS" "$OUT1" \
  && grep -q "1 pass" "$OUT1" \
  && grep -q "no code paths in range" "$OUT1"; then
  echo "PASS T1: doc-only push ran all 3 doc-shaped checks (all green) AND skipped tsc (rc=$RC1)"
  PASS=$((PASS + 1))
else
  echo "FAIL T1 (rc=$RC1):"
  cat "$OUT1"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D1"

# ── T2: one doc-shaped check FAILS on an otherwise docs-only push -> BLOCKED ───────────────
D2="$(new_repo)"
BASE2="$(cd "$D2" && git rev-parse HEAD)"
(
  cd "$D2" || exit 1
  mkdir -p docs/agents/foo/flow
  cat > docs/agents/foo/flow/main.md <<'EOF'
# Foo flow
```
call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "task:1",
  task_kind: "sprint-task",
  owner_agent: "foo",
  ttl_seconds: 600
})
```
EOF
  git add docs/agents/foo/flow/main.md
  git commit -qm "flow doc missing owner_client_session"
)
HEAD2="$(cd "$D2" && git rev-parse HEAD)"
OUT2="$D2/out.log"
run_hook "$D2" "$BASE2" "$HEAD2" "$OUT2"
RC2=$?
if [ "$RC2" -ne 0 ] \
  && grep -q "\[task-claim-lint\] FAIL" "$OUT2" \
  && grep -q "BLOCKED: doc-shaped check(s) failed" "$OUT2"; then
  echo "PASS T2: docs-only push with a failing task-claim-lint fixture BLOCKED (rc=$RC2), even though CODE_TOUCHING_REGEX never matched"
  PASS=$((PASS + 1))
else
  echo "FAIL T2 (rc=$RC2):"
  cat "$OUT2"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D2"

# ── T3: code-touching push -> doc-shaped checks still run AND tsc still gated as before ────
D3="$(new_repo)"
BASE3="$(cd "$D3" && git rev-parse HEAD)"
(
  cd "$D3" || exit 1
  mkdir -p apps/mcp-server/src/domain
  echo "export const x = 1;" > apps/mcp-server/src/domain/foo.ts
  git add apps/mcp-server/src/domain/foo.ts
  git commit -qm "code change"
)
HEAD3="$(cd "$D3" && git rev-parse HEAD)"
STUBDIR3="$(mktemp -d "${TMPDIR:-/tmp}/pre-push-test-stub.XXXXXX")"
cat > "$STUBDIR3/pnpm" <<'EOF'
#!/usr/bin/env bash
echo "STUB-PNPM-CALLED $*"
exit 0
EOF
chmod +x "$STUBDIR3/pnpm"
OUT3="$D3/out.log"
(
  cd "$D3" || exit 1
  export PATH="$STUBDIR3:$PATH"
  printf 'refs/heads/main %s refs/heads/main %s\n' "$HEAD3" "$BASE3" | bash "$HOOK_SRC"
) >"$OUT3" 2>&1
RC3=$?
if [ "$RC3" -eq 0 ] \
  && grep -q "\[size-lint\] PASS" "$OUT3" \
  && grep -q "\[task-claim-lint\] PASS" "$OUT3" \
  && grep -q "STUB-PNPM-CALLED --filter vn-market check" "$OUT3" \
  && grep -q "\[pre-push\] tsc OK" "$OUT3"; then
  echo "PASS T3: code-touching push ran doc-shaped checks (green) AND still invoked tsc via CODE_TOUCHING_REGEX gate (rc=$RC3)"
  PASS=$((PASS + 1))
else
  echo "FAIL T3 (rc=$RC3):"
  cat "$OUT3"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D3" "$STUBDIR3"

# ── T4: bun absent from PATH -> WARN + non-blocking (fail-open) skip of parity ONLY ────────
# NOTE on scope: run_doc_shaped_checks() runs size-lint, THEN task-claim-lint, THEN the
# bun-presence branch, each gated by `|| return 1` (brief §2 pseudocode, reproduced verbatim
# in the hook) — so a run that ALSO fails an earlier check short-circuits before ever reaching
# the bun branch, and cannot simultaneously demonstrate "bun WARN fired" and "a later real
# failure still blocked" in one invocation. This case isolates the bun-absent branch on its own
# (size-lint + task-claim-lint both clean) to prove the WARN+skip is genuinely fail-open, not
# blocking; T2 above already proves size-lint/task-claim-lint retain their own power to block
# independently of this branch.
D4="$(new_repo)"
BASE4="$(cd "$D4" && git rev-parse HEAD)"
(
  cd "$D4" || exit 1
  mkdir -p docs
  echo "hello" > docs/note.md
  git add docs/note.md
  git commit -qm "doc-only change, bun absent"
)
HEAD4="$(cd "$D4" && git rev-parse HEAD)"
OUT4="$D4/out.log"
(
  cd "$D4" || exit 1
  # Strip ONLY the PATH entry that resolves `bun` (bun lives in its own dir, e.g.
  # ~/.bun/bin, disjoint from where git/jq/pnpm live) — every other binary stays reachable.
  NEW_PATH=""
  IFS=':' read -r -a _dirs <<< "$PATH"
  for _d in "${_dirs[@]}"; do
    [ -x "$_d/bun" ] && continue
    NEW_PATH="${NEW_PATH:+$NEW_PATH:}$_d"
  done
  export PATH="$NEW_PATH"
  command -v bun >/dev/null 2>&1 && { echo "SKIP T4: could not strip bun from PATH on this machine"; exit 3; }
  printf 'refs/heads/main %s refs/heads/main %s\n' "$HEAD4" "$BASE4" | bash "$HOOK_SRC"
) >"$OUT4" 2>&1
RC4=$?
if [ "$RC4" -eq 3 ]; then
  echo "SKIP T4: environment could not strip bun from PATH — inconclusive, not counted as pass/fail"
elif [ "$RC4" -eq 0 ] \
  && grep -q "WARN: bun not on PATH" "$OUT4" \
  && grep -q "\[size-lint\] PASS" "$OUT4" \
  && grep -q "\[task-claim-lint\] PASS" "$OUT4" \
  && ! grep -q "1 pass" "$OUT4" \
  && grep -q "no code paths in range" "$OUT4"; then
  echo "PASS T4: bun-absent WARN fired, tool-registry-parity skipped (no test ran), size-lint+task-claim-lint still ran (both PASS), hook still exits 0 — fail-open confirmed (rc=$RC4)"
  PASS=$((PASS + 1))
else
  echo "FAIL T4 (rc=$RC4):"
  cat "$OUT4"
  FAIL=$((FAIL + 1))
fi
rm -rf "$D4"

# ── Summary ─────────────────────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
