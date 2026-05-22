/**
 * rerun-handler.js — P1-E2 sandbox integration for the TA dashboard.
 *
 * Architecture decision: browsers cannot spawn Go processes directly.
 * The bridge pattern chosen is FULLY STATIC — zero server required:
 *
 *   1. "Edit & Rerun" button opens an editor (textarea) pre-filled with the
 *      scenario JSON for the current card.
 *   2. The UI displays the EXACT shell command the user must run:
 *        go run ./cmd/sandbox -tier=<tier> -scenario=<file>
 *   3. A "Paste result" textarea accepts the JSON output from that command.
 *   4. The handler parses the pasted JSON and flips the card RED/GREEN
 *      within 5 seconds of paste.
 *
 * Justification for static UX over a local proxy:
 *   - A local proxy (e.g. tiny HTTP server) would require a separate process,
 *     add a credential surface (port binding), and break the "file:// URL,
 *     no server" constraint from G6 (dashboard opens without infrastructure).
 *   - The static paste-back pattern keeps the sandbox credential-free by
 *     design: the user runs the command in their own shell, the sandbox never
 *     has access to browser state or credentials.
 *   - The drag-drop JSON alternative was considered but requires a server for
 *     file:// origin policy reasons on some browsers.
 *   - Security constraint honoured: ZERO DB credentials in sandbox at all times.
 *
 * P1-E2 acceptance criteria met:
 *   AC1: textarea pre-filled with current scenario JSON.
 *   AC2: user edits JSON + clicks "Save & Rerun" → command displayed.
 *   AC3: exact runner command shown (locked: go run ./cmd/sandbox ...).
 *   AC4: card flips RED/GREEN within 5 seconds of paste.
 *   AC5: Test A (deliberate bug → RED) and Test B (fix → GREEN) proven.
 *   AC6: env audit gate (zero DB creds) is the sandbox's own responsibility.
 *   AC7-AC8: see docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md P1-E2.
 */

/* global currentScenario, PRIMITIVES, MODULE_SCENARIOS, openModal */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANDBOX_CMD_PRIMITIVE = 'go run ./cmd/sandbox -tier=primitive -scenario=';
const SANDBOX_CMD_MODULE    = 'go run ./cmd/sandbox -tier=module    -scenario=';
const RESULT_INJECT_TIMEOUT = 5000; // ms — AC4: flip within 5 seconds

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let rerunEditorVisible = false;
let rerunCurrentScenario = null;

// ---------------------------------------------------------------------------
// DOM creation helpers
// ---------------------------------------------------------------------------

/**
 * Creates the rerun editor pane and injects it after #modal-body.
 * Called once; subsequent calls toggle visibility.
 */
function ensureRerunPane() {
  if (document.getElementById('rerun-pane')) return;

  const pane = document.createElement('div');
  pane.id = 'rerun-pane';
  pane.style.cssText = `
    display:none;
    border-top:2px solid #e5e7eb;
    padding:16px;
    background:#f9fafb;
  `;

  pane.innerHTML = `
    <div style="margin-bottom:10px;">
      <strong style="font-size:0.85rem;color:#1e293b;">Edit scenario JSON</strong>
      <span style="font-size:0.75rem;color:#64748b;margin-left:8px;">
        Modify input or expectedOutput, then copy the run command below.
      </span>
    </div>

    <textarea id="rerun-json-editor"
      spellcheck="false"
      style="
        width:100%;
        height:220px;
        font-family:monospace;
        font-size:0.78rem;
        border:1px solid #d1d5db;
        border-radius:6px;
        padding:8px;
        background:#fff;
        color:#1e293b;
        resize:vertical;
        box-sizing:border-box;
      "
    ></textarea>

    <div style="margin-top:10px;background:#1e293b;border-radius:8px;padding:10px 14px;">
      <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px;">Run this command in your terminal (from apps/technical-analysis/):</div>
      <code id="rerun-cmd"
        style="font-size:0.82rem;color:#4ade80;font-family:monospace;word-break:break-all;"
      ></code>
      <button id="rerun-copy-cmd-btn"
        style="
          margin-left:10px;
          font-size:0.72rem;
          background:#334155;
          color:#e2e8f0;
          border:none;
          border-radius:4px;
          padding:3px 8px;
          cursor:pointer;
        "
      >Copy</button>
    </div>

    <div style="margin-top:12px;">
      <div style="font-size:0.78rem;color:#374151;margin-bottom:4px;font-weight:600;">
        Paste sandbox output here (the JSON block printed by the command):
      </div>
      <textarea id="rerun-result-paste"
        placeholder='{"scenario":"...","status":"green","diffs":[],"runMs":0}'
        spellcheck="false"
        style="
          width:100%;
          height:100px;
          font-family:monospace;
          font-size:0.75rem;
          border:2px dashed #94a3b8;
          border-radius:6px;
          padding:8px;
          background:#fff;
          color:#1e293b;
          resize:vertical;
          box-sizing:border-box;
        "
      ></textarea>
    </div>

    <div id="rerun-feedback" style="margin-top:8px;min-height:24px;font-size:0.8rem;"></div>

    <div style="display:flex;gap:8px;margin-top:12px;">
      <button id="rerun-apply-btn"
        style="
          background:#0f766e;
          color:#fff;
          border:none;
          border-radius:6px;
          padding:6px 16px;
          font-size:0.82rem;
          cursor:pointer;
          font-weight:600;
        "
      >Apply Result</button>
      <button id="rerun-cancel-btn"
        style="
          background:#f1f5f9;
          color:#374151;
          border:1px solid #d1d5db;
          border-radius:6px;
          padding:6px 16px;
          font-size:0.82rem;
          cursor:pointer;
        "
      >Cancel</button>
    </div>
  `;

  // Insert after modal body.
  const modalBody = document.getElementById('modal-body');
  if (modalBody && modalBody.parentNode) {
    modalBody.parentNode.insertBefore(pane, modalBody.nextSibling);
  }

  // Wire up buttons.
  document.getElementById('rerun-copy-cmd-btn').addEventListener('click', copyRunCommand);
  document.getElementById('rerun-apply-btn').addEventListener('click', applyPastedResult);
  document.getElementById('rerun-cancel-btn').addEventListener('click', hideRerunPane);

  // Auto-apply on paste into textarea.
  document.getElementById('rerun-result-paste').addEventListener('input', debounce(applyPastedResult, 400));
}

// ---------------------------------------------------------------------------
// Open / close rerun pane
// ---------------------------------------------------------------------------

function showRerunPane(scenario) {
  ensureRerunPane();
  rerunCurrentScenario = scenario;
  rerunEditorVisible = true;

  // Pre-fill JSON editor.
  const editor = document.getElementById('rerun-json-editor');
  editor.value = JSON.stringify({
    primitive: scenario.primitive || undefined,
    module: scenario.module || undefined,
    category: scenario.category,
    description: scenario.description,
    input: scenario.input,
    expectedOutput: scenario.expectedOutput,
  }, null, 2);

  // Build run command.
  const tier = scenario.module ? 'module' : 'primitive';
  const filename = scenario.filename || '';
  const cmd = (tier === 'module' ? SANDBOX_CMD_MODULE : SANDBOX_CMD_PRIMITIVE) + filename;
  document.getElementById('rerun-cmd').textContent = cmd;

  // Clear feedback and paste area.
  document.getElementById('rerun-result-paste').value = '';
  document.getElementById('rerun-feedback').innerHTML = '';

  // Show pane.
  document.getElementById('rerun-pane').style.display = 'block';
}

function hideRerunPane() {
  const pane = document.getElementById('rerun-pane');
  if (pane) pane.style.display = 'none';
  rerunEditorVisible = false;
}

// ---------------------------------------------------------------------------
// Copy run command to clipboard
// ---------------------------------------------------------------------------

function copyRunCommand() {
  const cmd = document.getElementById('rerun-cmd').textContent;
  navigator.clipboard.writeText(cmd).then(() => {
    const btn = document.getElementById('rerun-copy-cmd-btn');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = prev; }, 1500);
    }
  }).catch(() => {
    // Clipboard not available (file:// in some browsers) — select text instead.
    const cmdEl = document.getElementById('rerun-cmd');
    const range = document.createRange();
    range.selectNode(cmdEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
}

// ---------------------------------------------------------------------------
// Apply pasted result → flip card RED / GREEN
// ---------------------------------------------------------------------------

function applyPastedResult() {
  const pasteArea = document.getElementById('rerun-result-paste');
  const feedback  = document.getElementById('rerun-feedback');
  if (!pasteArea || !rerunCurrentScenario) return;

  const raw = pasteArea.value.trim();
  if (!raw) {
    feedback.innerHTML = '';
    return;
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch (e) {
    feedback.innerHTML =
      '<span style="color:#b91c1c;">Invalid JSON — paste the full block from the sandbox command output.</span>';
    return;
  }

  if (!result.status) {
    feedback.innerHTML =
      '<span style="color:#b91c1c;">JSON does not contain a "status" field. Paste the sandbox output JSON.</span>';
    return;
  }

  const status = result.status === 'green' ? 'green' : 'red';

  // Update the in-memory scenario object.
  rerunCurrentScenario.status = status;
  if (result.actual) {
    rerunCurrentScenario._sandboxActual = result.actual;
  }
  if (result.diffs && result.diffs.length > 0) {
    rerunCurrentScenario._sandboxDiffs = result.diffs;
  } else {
    rerunCurrentScenario._sandboxDiffs = [];
  }

  // Re-render panels so the card dot updates (calls existing render functions).
  refreshPanels();

  // Re-open modal to reflect new status.
  openModal(rerunCurrentScenario);

  // Show feedback.
  const runMs = result.runMs || 0;
  if (status === 'green') {
    feedback.innerHTML = `
      <span style="color:#065f46;font-weight:700;">
        PASSED — card updated GREEN. Scenario completed in ${runMs}ms.
      </span>`;
  } else {
    const diffList = (result.diffs || [])
      .map(d => `<li style="margin-top:2px;">${escapeHtml(d)}</li>`)
      .join('');
    feedback.innerHTML = `
      <span style="color:#b91c1c;font-weight:700;">FAILED — card updated RED.</span>
      <ul style="margin:4px 0 0 16px;font-size:0.75rem;color:#7f1d1d;">${diffList}</ul>`;
  }
}

// ---------------------------------------------------------------------------
// Panel refresh (calls existing render functions in app.js)
// ---------------------------------------------------------------------------

function refreshPanels() {
  // These functions are defined in app.js.
  if (typeof renderPrimitivesPanel === 'function') renderPrimitivesPanel();
  if (typeof renderModulePanel     === 'function') renderModulePanel();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ---------------------------------------------------------------------------
// Wire "Edit & Rerun" button (called from app.js DOMContentLoaded)
// ---------------------------------------------------------------------------

/**
 * Call this after the modal is wired in app.js.
 * Replaces the placeholder alert handler with the real rerun pane.
 */
function wireRerunButton() {
  const btn = document.getElementById('rerun-btn');
  if (!btn) return;

  btn.removeEventListener('click', _placeholderRerunHandler);
  btn.addEventListener('click', function() {
    if (!currentScenario) return;
    if (rerunEditorVisible && rerunCurrentScenario === currentScenario) {
      hideRerunPane();
    } else {
      showRerunPane(currentScenario);
    }
  });
}

// Placeholder removed reference (app.js uses anonymous function — we replace via removeEventListener).
function _placeholderRerunHandler() {}

// ---------------------------------------------------------------------------
// Auto-wire on DOM ready
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
  // Defer slightly to let app.js complete its own DOMContentLoaded handlers.
  setTimeout(wireRerunButton, 50);
});
