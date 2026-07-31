#!/usr/bin/env node
// Static regression guard for the leaf-worker ENTRY_PROMPT session-id channel.
// Mirrors scripts/agents-flow/cowork-schedule-consistency.test.js conventions
// (plain-assert, no framework, reads the live doc source directly).
//
// Root cause this guards: FIX-COWORK-SPAWNFANOUT-NO-SESSION-ID-IN-LEAF-ENTRY-PROMPT
// (2026-07-31) — docs/agents/cowork-team/flow/spawn-fanout.md Step 5.2 composed
// ENTRY_PROMPT in two branches (trigger_prompt branch and legacy flow_path branch) and
// NEITHER ever injected a session identifier, nor did IDENTITY_PREAMBLE. A leaf worker
// with no Bash grant (e.g. docs/agents/refine_bctc_md/flow/main.md) cannot resolve
// $CLAUDE_CODE_SESSION_ID itself and its SELF-IDENTITY GUARD hard-requires
// owner_client_session as a spawn-prompt literal — EXITs before claiming when absent.
// Recurred twice live (2026-07-30 slot-4 raw schema error, 2026-07-31 slot-2 clean
// self-guard EXIT). spawn-fanout.md is prose/pseudocode (an LLM-executed flow doc, not a
// JS module) — there is no importable ENTRY_PROMPT-composition function to unit-test, so
// this is a source-text static assertion, same class as TC-7 in the sibling
// cowork-schedule-consistency.test.js (which reads the live schedule JSON directly; this
// one reads the live flow-doc markdown directly). A future edit that drops the
// SESSION_ID_LINE append from either branch — or a future ENTRY_PROMPT composition site
// that omits it — fails this test.
//
// Run: node scripts/agents-flow/cowork-spawn-entry-prompt-session-id.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const path = require('path');
const fs = require('fs');

const flowPath = path.join(process.cwd(), 'docs/agents/cowork-team/flow/spawn-fanout.md');
const src = fs.readFileSync(flowPath, 'utf8');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    failed++;
  }
}

// Isolate the Step 5.2 composition block so matches can't be satisfied by an unrelated
// mention of "SESSION_ID_LINE" or "ENTRY_PROMPT" elsewhere in the file.
const step52Start = src.indexOf('## Step 5.2 — Bounded batch fan-out (UC-CDC-P4)');
const spawnMarker = src.indexOf('**Spawn:**', step52Start);
assert('Step 5.2 section and the Spawn marker after it both exist (doc structure unchanged)', step52Start !== -1 && spawnMarker !== -1 && spawnMarker > step52Start);
const block = step52Start !== -1 && spawnMarker !== -1 ? src.slice(step52Start, spawnMarker) : '';

// ---------------------------------------------------------------------------
// TC-1: SESSION_ID_LINE is defined, carries cowork-team's own resolved session id,
// and is namespaced under a recognizable "owner_client_session=" coordination key —
// the literal key format docs/agents/refine_bctc_md/flow/main.md's SELF-IDENTITY GUARD
// tells the leaf worker to extract from the spawn prompt.
// ---------------------------------------------------------------------------
console.log('\nTC-1: SESSION_ID_LINE is defined and carries owner_client_session=<value>');
{
  const defRe = /SESSION_ID_LINE\s*=\s*".*owner_client_session=".*\$CLAUDE_CODE_SESSION_ID/;
  assert('SESSION_ID_LINE assignment carries "owner_client_session=" + $CLAUDE_CODE_SESSION_ID', defRe.test(block));
}

// ---------------------------------------------------------------------------
// TC-2/TC-3: BOTH ENTRY_PROMPT composition branches append SESSION_ID_LINE.
// This is the load-bearing assertion — the actual bug was "neither branch injects one".
// ---------------------------------------------------------------------------
console.log('\nTC-2: trigger_prompt branch appends SESSION_ID_LINE to ENTRY_PROMPT');
{
  const triggerBranchRe = /ENTRY_PROMPT\s*=\s*IDENTITY_PREAMBLE\s*\+\s*slot\.trigger_prompt\s*\+\s*SESSION_ID_LINE/;
  assert('ENTRY_PROMPT = IDENTITY_PREAMBLE + slot.trigger_prompt + SESSION_ID_LINE', triggerBranchRe.test(block));
}

console.log('\nTC-3: legacy flow_path branch appends SESSION_ID_LINE to ENTRY_PROMPT');
{
  const legacyBranchRe = /ENTRY_PROMPT\s*=\s*IDENTITY_PREAMBLE\s*\+\s*"run "\s*\+\s*slot\.flow_path\s*\+\s*"\s*slot="\s*\+\s*slot\.slot_id\s*\+\s*SESSION_ID_LINE/;
  assert('ENTRY_PROMPT = IDENTITY_PREAMBLE + "run " + slot.flow_path + "  slot=" + slot.slot_id + SESSION_ID_LINE', legacyBranchRe.test(block));
}

// ---------------------------------------------------------------------------
// TC-4: the forbidden literal-token anti-pattern is not (re-)introduced — ENTRY_PROMPT
// itself must never be assigned the bare unresolved "$CLAUDE_CODE_SESSION_ID" text with
// no surrounding composition (i.e. it must always go through SESSION_ID_LINE, never be
// pasted directly as a stray literal that an LLM-issued spawn cannot expand).
// ---------------------------------------------------------------------------
console.log('\nTC-4: no ENTRY_PROMPT branch assigns the bare unresolved token directly');
{
  const bareTokenInEntryPrompt = /ENTRY_PROMPT\s*=[^\n]*\$CLAUDE_CODE_SESSION_ID(?!\s*\))/.test(
    block.replace(/SESSION_ID_LINE\s*=\s*"[^\n]*\$CLAUDE_CODE_SESSION_ID/g, '')
  );
  assert('ENTRY_PROMPT assignment lines never inline $CLAUDE_CODE_SESSION_ID outside SESSION_ID_LINE', !bareTokenInEntryPrompt);
}

// ---------------------------------------------------------------------------
// TC-5: slot.trigger_prompt stored field stays untouched — SESSION_ID_LINE must be
// APPENDED to the composed ENTRY_PROMPT, never written back into the stored schedule
// field itself (AC-4: the pre-spawn consistency check and cowork-match-slots.js's
// extractPromptFlowPath() both match trigger_prompt's literal FIRST LINE and must keep
// passing byte-identically).
// ---------------------------------------------------------------------------
console.log('\nTC-5: SESSION_ID_LINE is never written into the stored slot.trigger_prompt field');
{
  const noWritebackRe = /slot\.trigger_prompt\s*=\s*/; // any assignment INTO trigger_prompt would be a write-back
  assert('no assignment expression writes into slot.trigger_prompt (composition is read-only on the stored field)', !noWritebackRe.test(block));
}

// ---------------------------------------------------------------------------
// TC-6: cowork-schedule.json itself is untouched by this fix (static cross-check —
// the live schedule-consistency test already covers the trigger_prompt/flow_path
// invariant; this just confirms the file this row is forbidden from mutating still
// parses and still has the slot shape TC-1..5 above assume exists downstream).
// ---------------------------------------------------------------------------
console.log('\nTC-6: docs/data/cowork-schedule.json still parses with slot entries present (sanity, not re-testing TC-7 of the sibling file)');
{
  const schedPath = path.join(process.cwd(), 'docs/data/cowork-schedule.json');
  const sched = JSON.parse(fs.readFileSync(schedPath, 'utf8'));
  assert('cowork-schedule.json parses and has a non-empty slots[] array', Array.isArray(sched.slots) && sched.slots.length > 0);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
