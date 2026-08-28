#!/usr/bin/env bun
/**
 * scripts/agents-flow/orch-bash-direct-write-guard.mjs
 * PreToolUse gate — Bash matcher: heuristic detection of direct-bypass writes
 * to docs/data/orch/orch-state.json that skip the mandated orch-apply.sh wrapper.
 *
 * Sprint:    COWORK-GUARANTEED-SLOT-CATCHUP
 * Task:      HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD
 * Directive: docs/architecture-briefs/2026-08-26-hook-enforcement-plane-mcp-socket.md
 *            §6.2 (rule class 2 — direct-bypass Bash writes) + §8 (staged rollout)
 * Authority: docs/policies/dev-standards.md § Script Persistence (CANONICAL pointer added)
 *
 * ROLE (Point-1 enforcement, rule class 2 — the Write|Edit prewrite hook is blind
 * to shell writes that bypass the Write/Edit tools entirely):
 *   Parses tool_input.command from the PreToolUse Bash hook payload. If the
 *   command contains a write-verb (`>`, `>>`, `tee`, `mv`, `cp`, `sed -i`)
 *   targeting a path resolving to docs/data/orch/orch-state.json AND the command
 *   does NOT also contain `orch-apply.sh` (the mandated wrapper) → this is a
 *   direct-bypass write candidate.
 *
 *   HEURISTIC, HONESTLY SCOPED (brief §6.2 — stated here so nobody later cites
 *   this as airtight): it raises the bar against the realistic failure mode — an
 *   agent forgetting the wrapper mandate and writing an obvious
 *   `jq '...' > docs/data/orch/orch-state.json` one-liner, the exact class
 *   CLAUDE.md's mandate exists to prevent. It does NOT claim to defeat deliberate
 *   string obfuscation (`X="docs/data/orch/orch-state.json"; ... > "$X"`), nor
 *   quoted-echo of the literal bypass string. A quoted `>` inside e.g. a jq
 *   filter (`select(.a > 1)`) is not a redirect and is not flagged.
 *
 * STAGED ROLLOUT (§8 — promotion is PO-gated, never this script's own choice):
 *   Stage 0 — instrumentation only (this script's detection exists, zero new
 *             blocking behavior).
 *   Stage 1 — OBSERVE-ONLY, SHIPPED AS THE DEFAULT (`ORCH_BASH_GUARD_MODE`
 *             unset or "observe"): a would-flag command is appended as one
 *             JSONL line to the sibling would-block log and the hook exits 0.
 *             NEVER returns decision:block. Stage-1 promotion criteria (both
 *             MUST be met before Stage 2): (i) a deliberate direct-bypass write
 *             fires the would-block log — proves the gate is not false-green;
 *             (ii) zero false positives against real legitimate orch-apply.sh-
 *             piped traffic over a named window (minimum 20 real orch-state-
 *             touching Bash invocations observed clean).
 *   Stage 2 — BLOCK (`ORCH_BASH_GUARD_MODE=block`): `{"decision":"block",...}`
 *             + exit 2. Only after BOTH Stage-1 criteria are met, by PO ruling.
 *   Kill switch (§8): `ORCH_BASH_GUARD_DISABLE=1` → exit 0, no log, no block.
 *
 * INPUT (stdin): PreToolUse JSON hook payload
 *   { "tool_name": "Bash", "tool_input": { "command": "..." }, ... }
 *
 * OUTPUT on Stage-2 block: {"decision":"block","reason":"..."} to stdout; exit 2
 * OUTPUT on Stage-1 observe: one JSONL line appended to the would-block log;
 *                            exit 0, nothing on stdout
 * OUTPUT on pass:            nothing; exit 0
 * OUTPUT on error:           nothing (allow through — hook errors must never
 *                            break work); errors written to stderr only.
 *
 * EXIT CODES: 0 = allow (incl. every fail-open path), 2 = Stage-2 block only.
 *
 * ENV:
 *   ORCH_BASH_GUARD_DISABLE        =1 → kill switch (exit 0 immediately)
 *   ORCH_BASH_GUARD_MODE           "observe" (default) | "block" (Stage 2, PO-gated)
 *   ORCH_BASH_GUARD_WOULDBLOCK_LOG override would-block log path (test coverage)
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Path resolution ──────────────────────────────────────────────────────────
// Use import.meta.url so paths are correct regardless of CWD when hook fires.
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '../..');
const WOULDBLOCK_LOG =
  process.env.ORCH_BASH_GUARD_WOULDBLOCK_LOG ??
  resolve(PROJECT_ROOT, 'docs/data/orch-bash-guard-would-block.log');

// ── Stage + kill-switch configuration ────────────────────────────────────────
const MODE = process.env.ORCH_BASH_GUARD_MODE ?? 'observe'; // Stage 1 default
const DISABLED = process.env.ORCH_BASH_GUARD_DISABLE === '1';

// ── Detection — tokenizer-based heuristic ────────────────────────────────────
// The write-verb must be DIRECTLY ASSOCIATED with the orch-state path token
// (an unquoted `jq '...' > docs/data/orch/orch-state.json` one-liner, the
// realistic failure mode this guard exists to catch):
//
//   redirect — the path token immediately follows a redirect operator token
//              (`>` / `>>` / `2>` / `2>>` / `&>` / `&>>`), or the path token
//              itself starts glued with one (`>docs/...`)
//   tee      — `tee [-a|--append] <path>` (tee's operand IS its write target)
//   mv/cp    — segment's command word is `mv`/`cp` AND the path token is the
//              LAST operand of the segment (the destination — so
//              `cp orch-state.json /tmp/backup.json` is a READ-SOURCE copy and
//              is NOT flagged)
//   sed -i   — segment's command word is `sed`, a `-i` flag is present, AND the
//              path token is the LAST operand (the in-place edit target)
//
// Tokenization: split the command into pipe/`;`/`&&`/`||` segments, then into
// whitespace tokens. Quote-wrapped tokens are stripped of their quotes ONLY for
// path matching (so `> "docs/data/orch/orch-state.json"` is caught); the
// OPERATOR tokens are matched on their RAW form (so `grep -q '>' orch-state.json`
// is NOT a redirect — the raw `'>'` token differs from `>`).
//
// HEURISTIC LIMIT (brief §6.2, stated here): deliberately does NOT defeat
// deliberate string obfuscation (`X="docs/data/orch/orch-state.json"; ... > "$X"`),
// nor cwd-relative bare-basename writes after `cd docs/data/orch` (the path
// token must contain `docs/data/orch/`). Raises the bar, not airtight.
const REDIRECT_OP = /^[0-9]?&?>+$/;
const TARGET_SUBSTR = 'docs/data/orch/';

/** Split a command into shell segments on `;`, `&&`, `||`, `|` (crude — quote-agnostic is fine for this heuristic). */
function splitSegments(command) {
  return command.split(/;|&&|\|\||\|/).map((s) => s.trim()).filter(Boolean);
}

/** True when a path token "resolves to" docs/data/orch/orch-state.json (contains the dir + ends with the file). */
function isOrchStatePathToken(token) {
  return token.includes(TARGET_SUBSTR) && token.endsWith('orch-state.json');
}

/** True when the command is a direct-bypass write candidate. */
function isDirectBypass(command) {
  if (!command.includes('orch-state.json')) return false;
  if (command.includes('orch-apply.sh')) return false; // sanctioned wrapper present

  for (const segment of splitSegments(command)) {
    const rawTokens = segment.split(/\s+/).filter(Boolean);
    if (rawTokens.length === 0) continue;
    const stripped = rawTokens.map((t) => t.replace(/^["']+|["']+$/g, ''));
    const cmdWord = rawTokens[0].toLowerCase();

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = stripped[i];
      if (!isOrchStatePathToken(tok)) continue;

      // redirect: glued op on the path token (`>docs/...`, `2>docs/...`),
      // or an op token immediately before (`jq . > docs/...`)
      const glued = tok.match(/^([0-9]?&?>+)(.+)$/);
      if ((glued && isOrchStatePathToken(glued[2])) || (i > 0 && REDIRECT_OP.test(rawTokens[i - 1]))) {
        return true;
      }
      // tee: `tee` (with optional -a/--append flags) immediately before the path
      if (i > 0) {
        const prev = rawTokens[i - 1];
        const prevPrev = i > 1 ? rawTokens[i - 2] : '';
        if (prev.toLowerCase() === 'tee' || (['-a', '--append'].includes(prev.toLowerCase()) && prevPrev.toLowerCase() === 'tee')) {
          return true;
        }
      }
      // mv/cp: command word is mv|cp AND path is the last operand (destination)
      if ((cmdWord === 'mv' || cmdWord === 'cp') && i === rawTokens.length - 1) {
        return true;
      }
      // sed -i: command word is sed, a -i flag exists, AND path is the last operand
      if (cmdWord === 'sed' && i === rawTokens.length - 1 && rawTokens.some((t) => t.startsWith('-i'))) {
        return true;
      }
    }
  }
  return false;
}

// ── Stage-2 block helper ─────────────────────────────────────────────────────
function block(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `[orch-bash-direct-write-guard] BLOCKED: ${reason}`,
    }) + '\n'
  );
  process.exit(2);
}

// ── Stage-1 observe helper ───────────────────────────────────────────────────
// One JSONL line per would-flag command (never on the clean-pass hot path).
// Mirrors the degradation-log line shape from brief §7 ({ts, hook, reason,
// session_id}) extended with mode + command. Bounded: command truncated.
function observe(command, reason) {
  const sessionId = process.env.DSH_SESSION_ID ?? process.env.CLAUDE_CODE_SESSION_ID ?? '';
  const truncated = command.length > 600 ? `${command.slice(0, 600)}…(truncated)` : command;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    hook: 'orch-bash-direct-write-guard',
    mode: 'observe',
    session_id: sessionId,
    reason,
    command: truncated,
  });
  try {
    appendFileSync(WOULDBLOCK_LOG, `${line}\n`, 'utf-8');
  } catch (err) {
    // Fail-open: a log write failure must never break the agent's work.
    process.stderr.write(
      `[orch-bash-direct-write-guard] WARN: would-block log write failed (${err.message}) — ` +
        `allowing through; log path: ${WOULDBLOCK_LOG}\n`
    );
  }
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────
let hookInput;
try {
  const raw = readFileSync('/dev/stdin', 'utf-8');
  if (!raw.trim()) process.exit(0);
  hookInput = JSON.parse(raw);
} catch (err) {
  // Unparseable stdin → allow through silently
  process.stderr.write(`[orch-bash-direct-write-guard] stdin parse error: ${err.message}\n`);
  process.exit(0);
}

const toolName = String(hookInput?.tool_name ?? '');

// Fast-path: only intercept Bash calls
if (toolName !== 'Bash') process.exit(0);

const command = String(hookInput?.tool_input?.command ?? '');
if (command === '') process.exit(0);

// Kill switch (§8) — checked before any detection or logging
if (DISABLED) process.exit(0);

const reason =
  'direct write to docs/data/orch/orch-state.json without orch-apply.sh — use: ' +
  `jq '<transform>' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh ` +
  '(kill switch: ORCH_BASH_GUARD_DISABLE=1)';

if (isDirectBypass(command)) {
  if (MODE === 'block') {
    block(reason); // Stage 2 — only after PO-gated Stage-1 criteria met
  }
  observe(command, reason); // Stage 1 (default) — observe-only
}

// Clean pass — silence is the passing signal
process.exit(0);
