---
task_id: HC-DEV-6
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: READY
zone: apps/mcp-server/
depends_on: [HC-DEV-1, HC-DEV-3]
blocks: none
date_assigned: 2026-05-30
---

# HC-DEV-6 — Viewer Panel: "Sửa tay / Xác nhận cuối" Tab

**Scope:** ADDITIVE HTML/JS tab in the existing bctc-inspector.html viewer. New panel displays flagged cells with OCR/image values, allows hand-correction input, marks final-confirm lock, and shows confirmation status. All existing panes (PDF, OCR/MD, table, agent/debug toggle) untouched.

**Atomic goal:** New "Sửa tay / Xác nhận cuối" tab accessible in viewer. User can see flagged cells, correct them, and lock report as confirmed. All corrections persist via calls to HC-DEV-3 HTTP endpoints.

**DEPENDS ON:** HC-DEV-1 (schema), HC-DEV-3 (HTTP endpoints `/flags`, `/correct`, `/confirm`)

---

## File to Modify

**`apps/mcp-server/src/interface/mcp/routes/bctc-inspector.html`**

### Structure

The file has existing tabs for PDF view, OCR/MD view, table view. Add a new tab button + panel following the same pattern.

### Tab Button (HTML)

Add to the tab bar (same section as existing toggle for "Người dùng | Agent (debug)"):

```html
<button id="tab-corrections-btn" class="tab-btn">Sửa tay / Xác nhận cuối</button>
```

### Tab Panel (HTML)

Add new section after existing tabs:

```html
<div id="tab-corrections" class="tab-panel" style="display:none;">
  <h3>Sửa tay / Xác nhận cuối</h3>
  
  <!-- Confirmation status badge -->
  <div id="confirmation-badge" style="margin-bottom: 1rem;">
    <p><strong id="confirm-status-text">Trạng thái: Chờ xác nhận</strong></p>
    <button id="btn-confirm-report" class="btn-primary" onclick="confirmReport()">ĐÃ XÁC NHẬN toàn bộ báo cáo</button>
    <button id="btn-reset-confirm" class="btn-secondary" style="display:none;" onclick="resetConfirmation()">Đặt lại xác nhận</button>
  </div>

  <!-- Flagged cells list -->
  <div id="flagged-cells-container" style="max-height: 600px; overflow-y: auto; border: 1px solid #ccc; padding: 1rem;">
    <p id="loading-flags">Đang tải danh sách cảnh báo...</p>
  </div>
</div>
```

### JavaScript Functions

```javascript
// Global state
let currentDocId = null;
let allFlags = [];
let confirmStatus = 'PENDING';

// On doc load, fetch flags
async function loadFlags(docId) {
  currentDocId = docId;
  const container = document.getElementById('flagged-cells-container');
  container.innerHTML = '<p>Đang tải danh sách cảnh báo...</p>';

  try {
    const resp = await fetch(`/api/bctc-inspect/flags/${docId}`);
    if (!resp.ok) {
      container.innerHTML = '<p style="color:red;">Lỗi: không thể tải cảnh báo</p>';
      return;
    }

    const data = await resp.json();
    allFlags = data.flags || [];
    confirmStatus = data.confirm_status || 'PENDING';
    
    // Update confirmation status badge
    updateConfirmationBadge();
    
    if (!data.has_flags) {
      container.innerHTML = '<p style="color:green;">✓ Không có cảnh báo cần sửa</p>';
      return;
    }

    // Render flagged cells
    renderFlaggedCells(allFlags);
  } catch (err) {
    container.innerHTML = `<p style="color:red;">Lỗi: ${err.message}</p>`;
  }
}

function updateConfirmationBadge() {
  const statusEl = document.getElementById('confirm-status-text');
  const btnConfirm = document.getElementById('btn-confirm-report');
  const btnReset = document.getElementById('btn-reset-confirm');

  if (confirmStatus === 'CONFIRMED') {
    statusEl.textContent = 'Trạng thái: ĐÃ XÁC NHẬN';
    statusEl.style.color = 'green';
    btnConfirm.style.display = 'none';
    btnReset.style.display = 'inline-block';
  } else {
    statusEl.textContent = 'Trạng thái: Chờ xác nhận';
    statusEl.style.color = 'blue';
    btnConfirm.style.display = 'inline-block';
    btnReset.style.display = 'none';
  }
}

function renderFlaggedCells(flags) {
  const container = document.getElementById('flagged-cells-container');
  
  if (flags.length === 0) {
    container.innerHTML = '<p style="color:green;">✓ Không có cảnh báo cần sửa</p>';
    return;
  }

  let html = '';
  for (const flag of flags) {
    const flagBadge = flag.flag_type === 'red' ? '<span style="background:#ff6b6b; color:white; padding:2px 6px; border-radius:3px;">ĐỎ</span>' : '<span style="background:#ffd666; color:black; padding:2px 6px; border-radius:3px;">VÀNG</span>';
    const ocrValue = flag.ocr_value !== null ? flag.ocr_value : '(không có)';
    const imageValue = flag.image_value !== null ? flag.image_value : '(không có)';
    const correctedStatus = flag.has_correction ? `<span style="color:green;">✓ Đã sửa: ${flag.corrected_value}</span>` : '<span style="color:orange;">⚠ Chưa sửa</span>';

    // Vietnamese number parser for input
    const currentValueDisplay = flag.current_value !== null ? flag.current_value : '(null)';
    const inputValue = flag.corrected_value !== null ? flag.corrected_value : (flag.current_value !== null ? flag.current_value : '');

    html += `
      <div style="border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
        <p><strong>${flag.label}</strong> (trang ${flag.page_number}, ${flag.statement_section})</p>
        <p>${flagBadge}</p>
        <p>Giá trị OCR: <code>${ocrValue}</code></p>
        <p>Giá trị ảnh: <code>${imageValue}</code></p>
        <p>Giá trị hiện tại: <code>${currentValueDisplay}</code></p>
        <p>Trạng thái: ${correctedStatus}</p>
        
        ${confirmStatus !== 'CONFIRMED' ? `
        <p>
          <label for="input-${flag.row_id}">Giá trị sửa:</label><br/>
          <input type="number" id="input-${flag.row_id}" step="any" value="${inputValue}" placeholder="Nhập số" style="width: 150px; padding: 4px;"/>
          <button onclick="submitCorrection(${flag.row_id})" class="btn-primary">Xác nhận sửa</button>
        </p>
        ` : `
        <p><code style="color:gray;">Báo cáo đã xác nhận. Không thể sửa.</code></p>
        `}
      </div>
    `;
  }

  // Check if all red flags are corrected
  const allRedCorrected = flags
    .filter(f => f.flag_type === 'red')
    .every(f => f.has_correction);
  
  if (confirmStatus !== 'CONFIRMED') {
    document.getElementById('btn-confirm-report').disabled = !allRedCorrected;
    if (!allRedCorrected) {
      document.getElementById('btn-confirm-report').title = 'Tất cả cảnh báo ĐỎ phải được sửa trước khi xác nhận';
    }
  }

  container.innerHTML = html;
}

// Vietnamese number parser (same logic as TS parser)
function parseVnNumber(s) {
  if (!s) return null;
  // Remove spaces, strip trailing .00 if exact, replace , with .
  const cleaned = s.trim().replace(/\s/g, '').replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function submitCorrection(rowId) {
  const input = document.getElementById(`input-${rowId}`) as HTMLInputElement;
  const newValueStr = input.value;
  const newValue = parseVnNumber(newValueStr);

  if (newValue === null) {
    alert('Vui lòng nhập số hợp lệ');
    return;
  }

  try {
    const resp = await fetch(`/api/bctc-inspect/correct/${currentDocId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_id: rowId, new_value: newValue }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      alert(`Lỗi: ${result.error || 'không xác định'}`);
      return;
    }

    // Refresh flags
    await loadFlags(currentDocId);
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function confirmReport() {
  if (!currentDocId) return;
  
  if (!confirm('Xác nhận toàn bộ báo cáo này? Sau đó không thể sửa được.')) {
    return;
  }

  try {
    const resp = await fetch(`/api/bctc-inspect/confirm/${currentDocId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      alert('Lỗi: không thể xác nhận báo cáo');
      return;
    }

    // Refresh
    await loadFlags(currentDocId);
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function resetConfirmation() {
  if (!currentDocId) return;

  if (!confirm('Đặt lại xác nhận? Sẽ có thể sửa lại.')) {
    return;
  }

  try {
    const resp = await fetch(`/api/bctc-inspect/confirm/${currentDocId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      alert('Lỗi: không thể đặt lại');
      return;
    }

    // Refresh
    await loadFlags(currentDocId);
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}
```

### Tab Switching

Update the existing tab-switch logic to include the new tab:

```javascript
function switchTab(tabName) {
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(p => p.style.display = 'none');
  
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(b => b.classList.remove('active'));

  const panel = document.getElementById(`tab-${tabName}`);
  if (panel) panel.style.display = 'block';

  event.target.classList.add('active');

  // Load flags when switching to corrections tab
  if (tabName === 'corrections' && currentDocId) {
    loadFlags(currentDocId);
  }
}
```

### CSS (optional, minimal styling)

Add to existing CSS block:

```css
.tab-btn {
  padding: 0.5rem 1rem;
  margin: 0.25rem;
  border: 1px solid #ccc;
  background: #f9f9f9;
  cursor: pointer;
  border-radius: 4px;
}

.tab-btn.active {
  background: #0066cc;
  color: white;
}

.tab-panel {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 1rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: #f0f0f0;
  color: black;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}
```

### Integration Point

The existing `/api/bctc-inspect` handler (HC-DEV-3 provides JSON endpoints) supplies the `currentDocId` to the viewer JS on page load. Ensure the viewer passes this to `loadFlags(docId)` when the page loads and when the tab is first clicked.

---

## Acceptance Criteria

### AC-HC-DEV-6-1 Tab UI
- [ ] New "Sửa tay / Xác nhận cuối" tab button visible in tab bar
- [ ] Tab panel hidden by default, shows on click
- [ ] All existing tabs (PDF, OCR/MD, table, agent/debug) untouched and functional

### AC-HC-DEV-6-2 Flag Display
- [ ] GET `/api/bctc-inspect/flags/{doc_id}` called on tab switch
- [ ] Flagged cells rendered: label, page, statement_section, flag_type (red/yellow badge), OCR value, image value, current value
- [ ] No flags case shows success message "✓ Không có cảnh báo cần sửa"

### AC-HC-DEV-6-3 Correction Input
- [ ] Number input field pre-filled with current value or corrected value
- [ ] "Xác nhận sửa" button posts to `/api/bctc-inspect/correct/{doc_id}`
- [ ] Vietnamese number parsing: strip spaces, replace `,` with `.`, parseFloat
- [ ] After correction, flags list refreshes automatically

### AC-HC-DEV-6-4 Confirmation Lock
- [ ] "ĐÃ XÁC NHẬN toàn bộ báo cáo" button enabled only when all red flags have `has_correction: true`
- [ ] Button disabled (grayed out) if any red flag uncorrected
- [ ] Click posts to `/api/bctc-inspect/confirm/{doc_id}`
- [ ] After confirm, badge updates to "ĐÃ XÁC NHẬN" (green), inputs disabled, "Đặt lại xác nhận" button shows

### AC-HC-DEV-6-5 Confirmation Reset
- [ ] "Đặt lại xác nhận" button shows only when `confirm_status = 'CONFIRMED'`
- [ ] Click posts to `/api/bctc-inspect/confirm/{doc_id}/reset`
- [ ] After reset, inputs re-enabled, status back to "Chờ xác nhận"

### AC-HC-DEV-6-6 Vietnamese UX
- [ ] All user-facing text in plain Vietnamese (no jargon, no hexagram terms, no analyst speak)
- [ ] Button text: "Xác nhận sửa", "ĐÃ XÁC NHẬN toàn bộ báo cáo", "Đặt lại xác nhận"
- [ ] Labels: "Giá trị OCR", "Giá trị ảnh", "Giá trị hiện tại", "Giá trị sửa", "Trạng thái"
- [ ] Status: "Chờ xác nhận", "ĐÃ XÁC NHẬN", "Đã sửa", "Chưa sửa"

### AC-HC-DEV-6-7 `has_pek` Agnostic
- [ ] Flags panel reads `has_pek` from existing `/api/bctc-inspect/table/{doc_id}` response (if available)
- [ ] Panel itself is PEK-agnostic (reads `bctc_refined_units`, upstream of PEK)
- [ ] No breaking changes to existing table pane or `has_pek` logic

---

## DV Test Requirements (RED-before, GREEN-after, same commit)

No DV tests for HTML/JS layer. Frontend integration testing is QA/manual (Playwright in HC-DEV-5 is optional). This task verifies:
- HTML renders without JS errors
- HTTP calls to HC-DEV-3 endpoints work
- Flag list renders correctly
- Correction input + submission works
- Confirmation lock/reset works

---

## Exit Criteria

1. New "Sửa tay / Xác nhận cuối" tab added to bctc-inspector.html
2. Tab panel loads flags via GET `/api/bctc-inspect/flags/{doc_id}` (HC-DEV-3)
3. User can correct cells via POST `/api/bctc-inspect/correct/{doc_id}` (HC-DEV-3)
4. User can lock report via POST `/api/bctc-inspect/confirm/{doc_id}` (HC-DEV-3)
5. User can reset via POST `/api/bctc-inspect/confirm/{doc_id}/reset` (HC-DEV-3)
6. All existing panes untouched (PDF, OCR/MD, table, agent/debug toggle work as before)
7. All user text plain Vietnamese (no jargon)
8. Vietnamese number parsing works (`,` → `.`)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add`, never `-A`
- Existing panes untouched
- PDF-Extract-Kit pristine
- `text_table_extractor.py` frozen
- `has_pek` flag respected (panel reads it if available, doesn't break its logic)
- All user copy plain Vietnamese
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-6 handoff. Viewer panel for flag review and hand-correction.
ZONE: apps/mcp-server/
DEPENDS_ON: HC-DEV-1 (schema), HC-DEV-3 (HTTP endpoints)
BLOCKS: none
DV_TESTS: none (frontend manual/Playwright optional)
NEXT: dev-mcp-server — implement and manual-test in viewer
DURATION: ~1.5h (HTML/JS tab + integration)
SERIALIZATION: HC-DEV-1 and HC-DEV-3 must be done first
```
