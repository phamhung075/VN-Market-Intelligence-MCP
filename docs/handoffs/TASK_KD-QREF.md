# TASK KD-QREF — 64-Quẻ Trading Reference on the kinh-dich Dashboard

**Owner chain:** architect (KD-QREF-1) → dev-kinh-dich (KD-QREF-2) → qa (KD-QREF-3) → PO (KD-QREF-EXIT)
**Zone:** `apps/kinh-dich-service/` (single zone — anti-scope-creep)
**Classification:** POST-PILOT ENHANCEMENT. Pilot stays DONE 12/12, frozen. Decision doc: `docs/po-decisions/2026-05-24-kinh-dich-que-reference-dashboard.md`.
**Source (read-only, outside repo):** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/` (64 que .md + SCHEMA.md)

---

## Product shape (PO-decided — do not re-litigate)

A new additive **"64 Quẻ — Trading Reference"** section on `apps/kinh-dich-service/dashboard/index.html`, BELOW the existing 3 trust panels.

**Per-que data shape (identical for all 64) — the SSOT field set:**

| Field | Source in `que_convert/NN_*.md` | Reframe rule |
|---|---|---|
| `id` (1-64) | filename / `# NN.` | as-is |
| `name` (VN) + `chinese` (glyph) | `# NN. <Name> <glyph>` | verbatim, never translated |
| `upper` / `lower` trigram + element | `## Quẻ Đơn` table | already in `queMetaList`; reuse |
| `coreMeaningEn` | header `> **...**` line | translate to one English clause |
| `marketTrend` enum | `Xu hướng` keyword | THUẬN LỢI→`favorable`, TRUNG TÍNH→`neutral`, BẤT LỢI→`unfavorable` |
| `marketTrendLabel` | `Xu hướng` | `Favorable (THUẬN LỢI)` bilingual label |
| `stateInterpretationEn` | `Nghề nghiệp` row (career→trade/position framing) + `Xu hướng` tail | translate, reframe to trading-state prose (1-3 sentences) |
| `favorableEn` | `Xu hướng` favorable condition + `Đại Tượng` action | translate, one line |
| `warningEn` | `Cảnh báo` row | translate, one line |
| `phases[6]` | `## Sáu Hào` | per hào: `{phase: 1-6, action: TIEN/GIU/CHO/THAN/LUI, outcome: CÁT/HUNG/VÔ CỬU/HỐI/LỆ, glossEn: <one-line English>}` |

- `action` + `outcome` tokens for phases ALREADY exist in `queDataMap.lines[]` — reuse them as the source of truth; `glossEn` is the new translated one-liner per phase.
- Outcome tokens displayed in VN form with English gloss tooltip/parenthetical (CÁT = auspicious, HUNG = inauspicious, VÔ CỬU = no error, HỐI = regret, LỆ = danger).

**Two display levels (both required):**
1. **Summary row** per que: `NN · Name 字 · <core meaning EN> · [trend chip] · <warning clause>`. Trend chip color-coded: favorable=green-ish, neutral=grey, unfavorable=amber/red-ish (REUSE existing CSS vars; do NOT introduce `scenario-status-dot` or `dot-red` classes — see Trust gate).
2. **Detail** (expand inline or modal — architect picks the pattern that least disturbs the existing modal): trigrams + element, `stateInterpretationEn`, `favorableEn`, `warningEn`, and the 6-phase table.

---

## KD-QREF-1 — architect: design the data asset + dashboard integration (READY)

**Deliverable:** a short design note (append to this handoff or a sibling) + go/no-go on the data-home question.

Decide and document:
1. **Data home:** extend `hexagram_data.go` vs. new `hexagram_reference.go` in the same `reading_composer` package. PO preference: a NEW struct `queReference` keyed by id (keeps the lean scoring `queData` untouched), in a new file. Confirm or override.
2. **Emit path:** how the 64-que reference reaches `index.html`. PO preference: a Go command (mirror `cmd/sandbox -emit-traces` → `sandbox-traces.js`) that emits a generated `window.__QUE_REFERENCE__ = {...}` file (e.g. `dashboard/que-reference.js`) loaded by a `<script src>` tag, with a `DO NOT EDIT — generated` header. Confirm or propose inline-embed alternative.
3. **Render contract:** the exact DOM the dashboard JS builds for the new section, ensuring NO `.category-chip`, NO `scenario-status-dot`/`dot-*`, NO "not wired" text leaks in (so dash-check.mjs stays green). Specify the CSS classes to use (reuse existing vars).
4. **Future-proofing:** confirm the `queReference` shape can later back `/hexagram/{number}/explain` without restructure (do NOT wire it now).
5. **No fence violation:** the new file stays in `reading_composer` (module tier) and does not introduce cross-module/primitive import-direction violations.

**AC (architect):**
- AC-1: data-home + emit-path + render-contract decided and written.
- AC-2: render contract explicitly lists the trust-gate avoidances (no category-chip, no dot-*, no "not wired").
- AC-3: confirms zero new fetch/CDN/cred surface; file:// safe.
- AC-4: hands dev-kinh-dich a concrete file list + struct definition.

## KD-QREF-2 — dev-kinh-dich: implement (BLOCKED on KD-QREF-1)

**Deliverable:** Go data asset populated with all 64 reframed que + emit command + dashboard section rendering it.

Steps:
1. Create the `queReference` Go struct + populate all 64 entries by READING each `que_convert/NN_*.md` and translating/reframing per the field table above. This is human-quality translation content — accuracy matters (it is shown to the user as trading guidance). Pull `action`/`outcome` from existing `queDataMap`; pull trigrams from `queMetaList`.
2. Add the Go emit command (or extend `cmd/sandbox`) that writes `dashboard/que-reference.js` (`window.__QUE_REFERENCE__`), generated-header + DO NOT EDIT marker.
3. Add the dashboard section + JS renderer (summary rows + detail), reusing existing CSS vars, per architect's render contract.
4. Build clean `CGO_ENABLED=0`. Existing tests stay green.

**AC (dev-kinh-dich):**
- AC-1: all 64 que present in the Go asset (count == 64, ids 1..64 contiguous, no gaps). Each has every required field non-empty.
- AC-2: emit command regenerates `que-reference.js` deterministically; file carries the generated/DO-NOT-EDIT header.
- AC-3: dashboard renders all 64 summary rows + a working detail view; trend chips color-coded.
- AC-4: `CGO_ENABLED=0 go build ./...` clean; existing Go tests pass; no new fence violation.
- AC-5: `node dashboard/dash-check.mjs` exits 0 (PASS/WARN) — same as today. (See Trust gate.)
- AC-6: zero fetch / zero CDN / zero credentials in the new section; loads under file://.
- AC-7: the 3 trust panels, `sandbox-traces.js`, modal, edit-rerun handler are UNCHANGED (git diff touches only: the new Go file(s), the emit command, `index.html` additive section, new `que-reference.js`).

## KD-QREF-3 — qa: verify (BLOCKED on KD-QREF-2)

**AC (qa):**
- AC-1: open `index.html` under file://; confirm all 64 que listed, each opens a detail with trigrams + state + favorable + warning + 6 phases. No JS console errors.
- AC-2: run `node dashboard/dash-check.mjs` → exit 0, verdict PASS or WARN, `dotsRed=0`, `jsErrors=0`, `pageErrors=0`, no bad category labels. (This is the binding trust gate.)
- AC-3: spot-check 3 que (incl. 01 Kiền + 29 Tập Khảm + one mid-list) against the source files — trend enum correct, warning faithful, phases match `queDataMap`.
- AC-4: confirm git diff scope is exactly the allowed files (AC-7 above); 3 trust panels + sandbox-traces.js byte-unchanged.
- AC-5: bilingual rule honored — VN name + glyph verbatim, prose English, trend label bilingual.

## KD-QREF-EXIT — PO sign-off (BLOCKED on KD-QREF-3)

PO validates against this spec + the decision doc, records verdict, and (per the commit-mutex defect) MAIN TERMINAL performs the commit since dev-team agents cannot acquire the mutex. PO does not block on the agent committing.

---

---

## [Architect] Brownfield Findings — KD-QREF-1

**Zone:** `apps/kinh-dich-service/`
**Build standard:** lean (existing service, new feature)
**Scan clean:** true ✓

### Verified paths

- `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_data.go` — SSOT. Holds `queMetaList` (64 × `{id, name, chinese, upper, lower}`) and `queDataMap` (64 × `{coreMeaning, trend, lines[6]{outcome, action}}`). Both types are unexported (`queMeta`, `queData`); access via unexported package-level helpers (`getQueMeta`, `getQueData`). All 64 entries verified 1..64, no gaps.
- `apps/kinh-dich-service/cmd/sandbox/main.go` — emit pattern SSOT. `-emit-traces` flag calls `emitTracesFile()` which writes `dashboard/sandbox-traces.js` as `window.__SANDBOX_TRACES__ = {...}` with a generated/DO-NOT-EDIT header. This is the exact pattern to mirror.
- `apps/kinh-dich-service/dashboard/sandbox-traces.js` — auto-generated output of sandbox emit, loaded by `<script src="sandbox-traces.js" onerror="...">` at the bottom of index.html before the main `<script>` block.
- `apps/kinh-dich-service/dashboard/index.html` — ~1750 lines. Existing 3 trust panels in `.levels-grid` (3-column grid). Trust content FROZEN. Footer, modal, edit-rerun handler, provenance block FROZEN.
- `apps/kinh-dich-service/dashboard/dash-check.mjs` — verifier. FAILs on: `[class*="dot-"]` elements with `dot-red`; `.category-chip` elements with text not in `{"Valid Input","Edge Case","Bad Input -> Error"}`; JS console errors; page errors; body text `not wired` / `not_wired`.
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/` (read-only source) — 64 files `01_kien.md`…`64_vi_te.md` + `SCHEMA.md`. Source of translated/reframed content. Verified structure in 01 (THUẬN LỢI) and 29 (BẤT LỢI).

### Design Decision 1 — Data home: CONFIRM new file

**Decision: NEW file `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go`** in the same `reading_composer` package.

Rationale:
- Keeps `hexagram_data.go` byte-unchanged (lean scoring logic, already 195 lines, stable). Avoids risk of accidentally disturbing the scoring structs (`queData`, `queDataMap`) that are exercised by module tests.
- `hexagram_reference.go` is additive-only; it introduces `queReference` struct + `queReferenceMap`. The emit command and any future `/hexagram/{number}/explain` handler read from `queReferenceMap` directly — no change to existing module API.
- DDD layer: remains at the **module tier** (`pkg/module/reading_composer/`). The reference data is domain knowledge; placing it here satisfies Fence-B (zero infra imports). No cross-module import needed.
- Fence-compliance: `hexagram_reference.go` imports only stdlib (`encoding/json`, `fmt`, `os`). Zero infra imports. Fence-A/B both satisfied.

### Design Decision 2 — `queReference` Go struct shape

```go
// queReference holds the full trading-reference record for one hexagram.
// This struct backs both the dashboard (via que-reference.js emit) and the
// future /hexagram/{number}/explain route. Do not restructure without both uses in mind.
type queReference struct {
    ID                   int             `json:"id"`
    Name                 string          `json:"name"`                 // Vietnamese name, verbatim
    Chinese              string          `json:"chinese"`              // Han zi glyph, verbatim
    Upper                string          `json:"upper"`                // trigram name (Qian/Kan/…)
    Lower                string          `json:"lower"`                // trigram name
    UpperElement         string          `json:"upperElement"`         // Kim/Moc/Hoa/Thuy/Tho
    LowerElement         string          `json:"lowerElement"`
    CoreMeaningEn        string          `json:"coreMeaningEn"`        // English one-clause core meaning
    MarketTrend          string          `json:"marketTrend"`          // "favorable"|"neutral"|"unfavorable"
    MarketTrendLabel     string          `json:"marketTrendLabel"`     // bilingual e.g. "Favorable (THUẬN LỢI)"
    StateInterpretationEn string         `json:"stateInterpretationEn"` // 1-3 sentence trading-state prose (EN)
    FavorableEn          string          `json:"favorableEn"`          // one-line condition for entry/hold
    WarningEn            string          `json:"warningEn"`            // one-line risk/warning
    Phases               []phaseReference `json:"phases"`              // len==6, index 0=phase1…index5=phase6
}

// phaseReference describes a single hào in trading terms.
type phaseReference struct {
    Phase   int    `json:"phase"`    // 1-6
    Action  string `json:"action"`   // reuse from queDataMap: TIEN/GIU/CHO/THAN/LUI
    Outcome string `json:"outcome"`  // reuse from queDataMap: CAT/HUNG/VO CUU/HOI/LE
    GlossEn string `json:"glossEn"`  // new: one-line English translation of this hào's trading meaning
}
```

**Population rules:**
- `Upper`/`Lower`: copy from `queMetaList` (already correct trigram names like `"Qian"`, `"Kan"`).
- `UpperElement`/`LowerElement`: look up in the existing `trigrams` map (already in `hexagram_data.go`).
- `Action`/`Outcome` per phase: copy verbatim from `queDataMap[id].lines[i].action` and `.outcome` — do NOT re-derive.
- `MarketTrend` enum mapping (from source `Xu hướng` keyword):
  - `"THUAN LOI"` (and variants with diacritics stripped) → `"favorable"`
  - `"TRUNG TINH"` → `"neutral"`
  - `"BAT LOI"` → `"unfavorable"`
- `MarketTrendLabel` format: `"Favorable (THUẬN LỢI)"` / `"Neutral (TRUNG TÍNH)"` / `"Unfavorable (BẤT LỢI)"` — the Vietnamese form uses full diacritics.

**Map variable:**
```go
// queReferenceMap is the master reference for all 64 hexagrams, keyed by id.
// Populated by init() scanning queReferenceList.
var queReferenceMap map[int]*queReference

// queReferenceList is the ordered slice of all 64 queReference entries.
// Content authored by dev-kinh-dich from the 64 que_convert/*.md source files.
var queReferenceList = []queReference{
    // … 64 entries …
}

func init() {
    queReferenceMap = make(map[int]*queReference, 64)
    for i := range queReferenceList {
        queReferenceMap[queReferenceList[i].ID] = &queReferenceList[i]
    }
}

// GetQueReference returns the reference record for a hexagram by ID.
// Exported for use by the emit command and (future) HTTP handler.
func GetQueReference(id int) *queReference {
    return queReferenceMap[id]
}

// GetAllQueReferences returns all 64 records in canonical order (id 1..64).
func GetAllQueReferences() []queReference {
    return queReferenceList
}
```

Note: `phaseReference` and `queReference` are unexported structs — they are JSON-serializable via the emit command in the same package. `GetQueReference` and `GetAllQueReferences` are exported entry points.

### Design Decision 3 — Emit path: EXTEND `cmd/sandbox` with `-emit-reference` flag

**Decision: Add `-emit-reference` bool flag to the existing `cmd/sandbox/main.go`** (does NOT create a new `cmd/`).

Rationale:
- Keeps the single command entry point — `go run ./cmd/sandbox` already knows how to find the dashboard dir via `findDashboardDir()`. Reuse prevents DRY violations.
- Adding a flag is 30-40 lines inside `cmd/sandbox/main.go` — well within the zero-new-cmd preference.
- Consistent with `-emit-traces` pattern: emits a `.js` file with a `window.__*__` global and a generated/DO-NOT-EDIT header.

**Emit command (dev-kinh-dich uses this):**
```
CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference
```

**Output file:** `apps/kinh-dich-service/dashboard/que-reference.js`

**File content template:**
```js
// AUTO-GENERATED by: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference
// Generated at: <RFC3339 UTC>
// Commit: <short hash>
// DO NOT EDIT MANUALLY — re-run: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference
window.__QUE_REFERENCE__ = <JSON.MarshalIndent of []queReference>;
```

The JSON payload is `[]queReference` ordered id 1..64, marshalled from `queReferenceList` via `encoding/json.MarshalIndent`.

**Dashboard load:**
```html
<!-- QUE REFERENCE DATA — auto-generated; see que-reference.js header -->
<script src="que-reference.js" onerror="console.log('[dash] que-reference.js not found - que reference unavailable');"></script>
```
Placed BEFORE the existing main `<script>` block (same pattern as `sandbox-traces.js`). If the file is absent, `window.__QUE_REFERENCE__` is `undefined` and the reference section shows a "Reference not generated — run emit-reference" note (not an error, not "not wired").

### Design Decision 4 — Render contract (trust-gate-safe DOM spec)

**Panel insertion point:** A new `<div id="que-reference-section">` is appended AFTER the closing `</div><!-- .levels-grid -->` comment and BEFORE the `<!-- LEGEND -->` block. This is purely additive — zero modification to `.levels-grid`, its children, or any element above it.

**Allowed classes and IDs (explicit safe list):**

```
#que-reference-section           — wrapper div, max-width:1400px, margin:32px auto 0
.qref-header                     — section title bar
.qref-grid                       — CSS grid for summary rows (1 column, max-width 1400px)
.qref-row                        — one row per que (summary level)
.qref-row-toggle                 — expand/collapse button inside .qref-row (not a scenario card)
.qref-detail                     — collapsible detail block inside .qref-row
.qref-trend-chip                 — trend badge inside summary row (NOT .category-chip)
.qref-trend-favorable            — CSS modifier: green-tinted (uses var(--green) / var(--green-bg))
.qref-trend-neutral              — CSS modifier: grey-tinted (uses #6b7280 / #f1f5f9)
.qref-trend-unfavorable          — CSS modifier: amber/red-tinted (uses var(--red) / var(--red-bg))
.qref-phases-table               — <table> for 6-phase sequence in detail view
.qref-outcome-token              — inline span for CÁT/HUNG/VÔ CỬU/HỐI/LỆ tokens
```

**Explicitly FORBIDDEN in the new section (trust-gate avoidances):**

| Token / class | Why forbidden |
|---|---|
| `dot-red`, `dot-green`, `dot-pending`, any `dot-*` | dash-check.mjs counts `[class*="dot-"]` — any red dot fails |
| `.category-chip` | dash-check.mjs reads `.category-chip` text against the allowed set; any unknown label = FAIL |
| `.scenario-status-dot` | Semantic to trust-scenario dots only; reference rows are not scenarios |
| Text `"not wired"` or `"not_wired"` | dash-check.mjs body-text scan, case-insensitive |
| `window.__SANDBOX_TRACES__` read or write | Frozen; reference section reads only `window.__QUE_REFERENCE__` |
| Any `fetch()` / `XMLHttpRequest` | Zero-fetch contract |
| Any CDN URL | Zero-CDN contract |
| Any credential string | Zero-creds contract |

**Color coding for `.qref-trend-chip`:** uses existing CSS vars only:
- `favorable`: `background: var(--green-bg); border: 1px solid var(--green-border); color: var(--green)`
- `neutral`: `background: #f1f5f9; border: 1px solid #cbd5e1; color: #64748b`
- `unfavorable`: `background: var(--red-bg); border: 1px solid var(--red-border); color: var(--red)`

No new CSS variables introduced.

**Detail expand pattern:** inline expand/collapse (NOT the existing modal). Each `.qref-row` has a `<button class="qref-row-toggle">` that toggles a `<div class="qref-detail">` display. This avoids any interaction with the frozen modal (`#modal-overlay`, `openModal()`, `closeModal()` functions). The reference detail is purely static rendering from `window.__QUE_REFERENCE__`.

**JS renderer (in the main `<script>` block, appended as a new function):**
```js
function renderQueReference() {
  const data = window.__QUE_REFERENCE__;
  const section = document.getElementById('que-reference-section');
  if (!section) return;
  if (!data || !Array.isArray(data) || data.length === 0) {
    section.innerHTML = '<div style="...">Reference not generated — run: ' +
      'CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference</div>';
    return;
  }
  // … build .qref-grid rows from data …
}
```

Called from the bottom of the existing `document.addEventListener('DOMContentLoaded', ...)` handler (after existing `renderPrimitives()`, `renderModule()`, `renderService()`, `loadSandboxTraces()` calls).

**Section header text:** "64 Quẻ — Trading Reference" (English-primary, no "not wired" or "not_wired" strings anywhere).

### Design Decision 5 — Future-proofing for `/hexagram/{number}/explain`

The `queReferenceMap` in `hexagram_reference.go` is already keyed by integer ID and accessed via `GetQueReference(id int)`. The future HTTP handler wires trivially:

```go
// (future, NOT wired now)
func handleExplainHexagram(w http.ResponseWriter, r *http.Request) {
    id, _ := strconv.Atoi(chi.URLParam(r, "number"))
    ref := reading_composer.GetQueReference(id)
    if ref == nil { http.NotFound(w, r); return }
    json.NewEncoder(w).Encode(ref)
}
```

The struct shape (JSON tags matching what the dashboard reads) means zero restructure is needed. `queReference` is already JSON-ready.

### Risk flags

- **R-1 (MEDIUM) Content quality:** The 64 `GlossEn`/`CoreMeaningEn`/`StateInterpretationEn`/`FavorableEn`/`WarningEn` fields require human-quality translation from Vietnamese. This is the largest time cost. dev-kinh-dich must read each `que_convert/NN_*.md` and write English prose. Accuracy is user-facing. Spot-check 3 que (QA AC-3).
- **R-2 (LOW) dash-check.mjs body-text scan:** The verifier does `body.textContent.toLowerCase().includes("not wired")`. Ensure no fallback message in the reference section uses that string. Safe alternative: "Reference not generated — run emit-reference".
- **R-3 (LOW) `que-reference.js` absent on cold open:** If dev-kinh-dich forgets to emit, `window.__QUE_REFERENCE__` is undefined. The renderer must handle this gracefully (show the "run emit-reference" note) without throwing a JS error — a JS error would fail dash-check.mjs.
- **R-4 (LOW) Trend string matching in Go data:** `queDataMap` stores trend strings like `"THUAN LOI"`, `"THUAN LOI — manh"`, `"THUAN LOI — rat manh"` (ASCII, no diacritics). The `MarketTrend` mapping in `hexagram_reference.go` must use prefix-contains logic (not exact match) against the normalized trend string.
- **R-5 (LOW) Fence-B:** `hexagram_reference.go` must not import anything from `pkg/infrastructure`, `pkg/application`, or `pkg/interface`. Only stdlib + same package. The emit function that reads `queReferenceList` lives in `cmd/sandbox/main.go` (already outside the module fence).

### Files to create / modify

| Action | File | Description |
|---|---|---|
| CREATE | `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go` | `queReference` struct + `phaseReference` struct + `queReferenceList` (64 entries) + `queReferenceMap` + `init()` + `GetQueReference()` + `GetAllQueReferences()` |
| MODIFY | `apps/kinh-dich-service/cmd/sandbox/main.go` | Add `-emit-reference` bool flag + `emitReferenceFile()` function that marshals `reading_composer.GetAllQueReferences()` to `dashboard/que-reference.js` |
| MODIFY | `apps/kinh-dich-service/dashboard/index.html` | (a) Add `<script src="que-reference.js" onerror="...">` before main `<script>` block; (b) Add `<div id="que-reference-section">` between `.levels-grid` close and `<!-- LEGEND -->`; (c) Add CSS for `.qref-*` classes inside `<style>`; (d) Add `renderQueReference()` JS function + call from DOMContentLoaded |
| CREATE | `apps/kinh-dich-service/dashboard/que-reference.js` | Auto-generated by `go run ./cmd/sandbox -emit-reference` — DO NOT hand-author |

**Total new files: 1. Modified files: 2 (plus the generated que-reference.js). Frozen files: 0 touched.**

### AC verification mapping

- AC-1 (data-home + emit-path + render-contract): all three decided above (DD1/DD3/DD4). ✓
- AC-2 (render contract lists trust-gate avoidances): forbidden token table in DD4. ✓
- AC-3 (zero new fetch/CDN/cred): dashboard reads `window.__QUE_REFERENCE__` from local `.js` file only. No fetch, no CDN, no credentials. ✓
- AC-4 (concrete file list + struct definition): file table + struct definition above. ✓

---

## Trust gate (binding, repeated for emphasis)

`node dashboard/dash-check.mjs` MUST exit 0 after the change. It FAILS on: any `dot-red`, any JS console error, any page error, any `.category-chip` whose text is not in {Valid Input, Edge Case, Bad Input → Error}, and body text "not wired"/"not_wired". The new reference section therefore: uses NO `dot-*` classes, emits NO `.category-chip` elements, contains NO "not wired" text. Reference content is NOT a trust scenario.

## Commit reality

`commit-mutex` enum is missing the kind → dev-team agents (no MCP gateway) cannot acquire it. Workaround: dev-kinh-dich leaves work in-tree; main terminal commits at KD-QREF-EXIT. Do not treat "agent didn't commit" as a failure.

---

## [QA] Review Record — KD-QREF-3

**Date:** 2026-05-24
**Reviewer:** qa
**Verdict:** APPROVED

### Check 1 — Build / Vet / Test

```
CGO_ENABLED=0 go build ./...  → EXIT:0
go vet ./...                  → EXIT:0
go test ./...                 → EXIT:0 (reading_composer PASS + 4 primitive packages cached PASS)
```

### Check 2 — Fence: golangci-lint + DDD scan + hexagram_data.go untouched

```
golangci-lint run ./...       → 0 issues EXIT:0
hexagram_reference.go imports → "strings" only (no infra/application/interface)
git diff HEAD hexagram_data.go → EMPTY (file untouched, as required)
```

Fence-A and Fence-B: PASS. Module-purity intact.

### Check 3 — Coverage: 64 quẻ, ids 1..64, no gaps, no placeholders

```
Entry count (comment markers): 64
ID sequence: 1 2 3 ... 63 64 — no gaps
Placeholder scan (TODO/PLACEHOLDER/lorem/FIXME/TBD): 0 matches
```

Spot-check fidelity (3 entries against que_convert/ source):
- ID 01 Kiền: trend=favorable ✓ (source: THUẬN LỢI), warning faithful ✓ ("At the peak, decline begins. Excessive pride leads to downfall." ← "Dương cực sinh âm..."), phases action/outcome from queDataMap ✓
- ID 29 Tập Khảm: trend=unfavorable ✓ (source: BẤT LỢI), warning ✓ ("Panic or recklessness in danger worsens the situation dramatically." ← "Đừng rơi vào cạm bẫy khi đang hoảng sợ"), phases from queDataMap ✓
- ID 64 Vị Tế: trend=neutral ✓ (source: TRUNG TÍNH), trigrams upper=Hoa/lower=Thuy ✓, warning ✓

Content fidelity: PASS. Phases action/outcome correctly reused from queDataMap (not re-derived). GlossEn are new translated one-liners consistent with source hào luận giải.

### Check 4 — Trend-map trap (ids 11, 14, 34, 50)

```
ID 11 Thai  → queDataMap trend="THUAN LOI — manh"  → HasPrefix("THUAN LOI") → favorable ✓
ID 14 Dai Huu → trend="THUAN LOI — rat manh"       → HasPrefix("THUAN LOI") → favorable ✓
ID 34 Dai Trang → trend="THUAN LOI — rat manh"     → HasPrefix("THUAN LOI") → favorable ✓
ID 50 Dinh  → trend="THUAN LOI — manh"             → HasPrefix("THUAN LOI") → favorable ✓
```

mapTrendToEnum: PASS. No mis-mapped or dropped entries.

### Check 5 — Emit reproducibility

```
CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference → EXIT:0
que-reference.js: 64 entries, DO-NOT-EDIT header present ✓
Re-run diff (excluding timestamp line): IDENTICAL (deterministic) ✓
```

Tree restored to dev's intent state (que-reference.js untracked new file, same content).

### Check 6 — Trust gate (binding)

```
node dashboard/dash-check.mjs → EXIT:0
DASH-CHECK-RESULT: dotsGreen=17, dotsRed=0, jsErrors=0, pageErrors=0
categoryChips: {Valid Input:6, Edge Case:6, Bad Input->Error:5}, badLabels:[]
verdict: PASS
```

Original 17/17 sandbox dots confirmed unchanged. sandbox-traces.js: total=17, passed=17. PASS.

### Check 7 — Honesty / Forbidden tokens

Scanned new section (lines 789–1160 HTML, 2240–2374 JS) for:
- `.category-chip` in new section: 0 (existing uses at lines 1747/1806/1967 are ORIGINAL panels, untouched)
- `dot-red`, `dot-*`, `scenario-status-dot`: 0 in new section
- "not wired" / "not_wired": 0 (fallback message uses "Reference not generated — run emit-reference")
- `fetch(`: 0
- CDN URLs: 0
- `window.__SANDBOX_TRACES__` read/write in new section: 0
- Credentials/secrets: 0

PASS. .qref-* namespace clean.

### Check 8 — Scope

```
git status apps/kinh-dich-service/ modified/new files:
  M  apps/kinh-dich-service/cmd/sandbox/main.go       (additive: -emit-reference flag + emitReferenceFile())
  M  apps/kinh-dich-service/dashboard/index.html      (additive only: 378 lines added, 0 removed)
  ?? apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go (new)
  ?? apps/kinh-dich-service/dashboard/que-reference.js (new, generated)
```

index.html diff: 5 insertion-only hunks. No deletions. 3 trust panels + modal + edit-rerun handler: untouched.
Other zone files modified in working tree (api-gateway, news-fetch, pdf-extractor): pre-existing from other parallel work — NOT from KD-QREF. Scope: CLEAN.

### AC Summary

| AC | Description | Verdict |
|----|-------------|---------|
| AC-1 | 64 quẻ listed, ids 1..64 contiguous, each has all required fields non-empty | PASS |
| AC-2 | emit command regenerates que-reference.js deterministically; DO-NOT-EDIT header present | PASS |
| AC-3 | dash-check.mjs exit 0; dotsRed=0; jsErrors=0; pageErrors=0; badLabels=[] | PASS |
| AC-4 | git diff scope confined to apps/kinh-dich-service/; 3 trust panels byte-unchanged | PASS |
| AC-5 | VN name + glyph verbatim from queMetaList SSOT; prose English; trend label bilingual | PASS |

**Overall verdict: APPROVED**

Blocking issues: NONE

---

## [PO] Final Sign-Off — KD-QREF-EXIT

**Date:** 2026-05-24T17:39:47Z
**Author:** PO
**Verdict:** SIGNED OFF — DoD MET. KD-QREF tasks marked DONE in docs/TASKS.md.

### DoD validation (vs decision doc `2026-05-24-kinh-dich-que-reference-dashboard.md` + spec)

| Decision-doc clause | Spec AC coverage | Verdict |
|---|---|---|
| A1 — bilingual English-primary; VN name + glyph verbatim; trend label bilingual; outcome tokens VN + EN gloss | dev AC-1, qa AC-5 + Check 3 | PASS |
| A2 — one fixed shape for all 64 (summary row + detail w/ 6-phase) | dev AC-3, qa AC-1 | PASS |
| A3 — Go data asset SSOT (`hexagram_reference.go`), emitted to dashboard via generated `que-reference.js` (never hand-typed HTML); shape does not preclude future `/hexagram/{number}/explain` | architect DD1/DD2/DD3/DD5, dev AC-1/AC-2, qa Check 3/5 | PASS |
| A4 — additive panel, honest-green preserved; dash-check.mjs exit-0; 3 trust panels + sandbox-traces.js + modal + edit-rerun FROZEN | dev AC-5/AC-7, qa Check 6/8 + AC-3/AC-4 | PASS |
| Pure Go `CGO_ENABLED=0`, zero fetch/CDN/creds, file:// safe | dev AC-4/AC-6, qa Check 1/2/7 | PASS |

### Independent PO spot-confirmation (in-tree, pre-commit)

- `hexagram_reference.go` present (55,617 B, untracked `??`); `que-reference.js` present (108,085 B, untracked `??`) with the generated/DO-NOT-EDIT header (`Generated at: 2026-05-24T17:34:52Z`, commit anchor `e9608167`).
- `que-reference.js` contains 64 `"id":` entries (matches `count == 64`).
- `cmd/sandbox/main.go` + `dashboard/index.html` show as modified (`M`); `hexagram_data.go` does NOT appear in git status (untouched — confirms the scoring SSOT stayed frozen, per architect DD1 + qa Check 2).

### Classification (held)

POST-PILOT ENHANCEMENT. The kinh-dich Go-reboot pilot stays **DONE 12/12 and FROZEN**. `pilot-status-kinh-dich.json` is NOT edited and NO goal is reopened. This enhancement is traced via TASKS.md (KD-QREF block) + this handoff + the decision doc — never in the pilot's goal ledger.

### Commit reality

Per the `commit-mutex` enum defect, dev-team agents (no MCP gateway path to the kind) cannot acquire the mutex. Work is left IN-TREE. **MAIN TERMINAL performs the commit** using the documented workaround. PO does not block on the agent committing. Commit manifest + message handed back in the RETURN block.

**KD-QREF: CLOSED.**
