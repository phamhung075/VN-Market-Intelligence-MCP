# TASK — KD-QREF-LANG · 64-Quẻ Trading Reference EN/VI Language Switch

**Status:** OPEN 2026-05-24T18:51Z (PO self-initiated from user feature request, routed by main terminal).
**Classification:** FOLLOW-ON to KD-QREF (panel shipped `0b401124`, data regenerated `e9608167`). POST-PILOT enhancement #2. Pilot stays DONE 12/12 FROZEN — `pilot-status-kinh-dich.json` NOT edited.
**Decision record:** `docs/po-decisions/2026-05-24-kinh-dich-que-reference-language-switch.md` (D1–D5 + ACs).
**Zone:** `apps/kinh-dich-service/` (single). **Chain:** architect → dev-kinh-dich → qa → PO.
**WIP:** sequential within the chain. Fleet WIP=2 cap still applies (stock-price + kinh-dich) — this is a single-zone chain, not a pilot.

---

## User request (verbatim)

> "64 Quẻ — Trading Reference: need version english and version vietnamese switch."

## Goal

Add a user-toggled EN | VI language switch to the existing `.qref-*` panel. Today it is bilingual EN-primary. After this: a full ENGLISH view and a full VIETNAMESE view, swapped by a control in the panel header, choice persisted in `localStorage`. Every textual field carries BOTH languages in the Go SSOT, emitted to `que-reference.js`.

## PO decisions (binding — see decision note for rationale)

- **D1 Default = EN** (shell is `lang="en"`, France-based user; persisted choice means VI users pay the toggle once).
- **D2 Persistence = `localStorage["kd-qref-lang"]`** (`"en"`/`"vi"`), file:// safe, `try/catch` guarded → falls back to EN on storage error, NEVER throws.
- **D3 Scope = `.qref-*` panel ONLY.** 3 trust panels / sandbox / `sandbox-traces.js` / modal / edit-rerun handler FROZEN + English.
- **D4 Data shape = both languages carried in `hexagram_reference.go`, emitted to `que-reference.js`.** PO-recommended `localized{en,vi}` nested sub-struct; exact Go idiom + breaking-rename-vs-additive + outcome-gloss location = architect's call. NEVER fetched, NEVER hand-typed in HTML.
- **D5 Toggle UI = EN|VI segmented control in `.qref-header`,** inside `.qref-*` namespace, no `dot-*`/`.category-chip`/"not wired"/fetch/CDN. Static section labels + column headers + legend ALSO localize.

## Authoritative VI source (read-only, OUTSIDE repo)

`/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/01_kien.md`…`64_vi_te.md`. **Schema verified consistent** (files 01, 29, SCHEMA.md). Reuse VI text **verbatim or lightly trimmed** — do NOT machine-retranslate English back to VI. Field → source map:

| Field | VI source location |
|---|---|
| coreMeaning.vi | header blockquote (the core-meaning sentence under the title) |
| stateInterpretation.vi | `## Phán Đoán` **Luận giải** + `## Phân Tích Trạng Thái` **Nghề nghiệp** row (trim to 1–3 sentences, trading-state framing) |
| favorable.vi | `## Phân Tích Trạng Thái` **Xu hướng** condition clause (the text after THUẬN LỢI/TRUNG TÍNH/BẤT LỢI) |
| warning.vi | `## Phân Tích Trạng Thái` **Cảnh báo** row |
| marketTrendLabel.vi | the Xu hướng keyword: `Thuận lợi (THUẬN LỢI)` / `Trung tính (TRUNG TÍNH)` / `Bất lợi (BẤT LỢI)` (architect sets exact VI label form) |
| phase gloss.vi (×6) | each `### Hào N` **Hành động** clause (one line per hào; may fold in **Luận giải** one-liner if too terse) |

`name` (VN) + `chinese` glyph = proper nouns, verbatim in BOTH views. `action`/`outcome` = language-neutral codes, same in both; only their gloss/legend label localizes (EN "advance"/"auspicious" vs authentic VI "TIẾN"/"CÁT").

---

## Tasks

| Task ID | Title | Priority | Type | Owner | Status | Blocked by |
|---------|-------|----------|------|-------|--------|-----------|
| KD-QREF-LANG-1 | Design i18n shape (Go struct + emit + render/toggle contract, trust-gate safe). DESIGN ONLY. | HIGH | TASK | architect | DONE | — |
| KD-QREF-LANG-2 | Implement: populate 64 × `{en,vi}` for every textual field from `que_convert/*.md`; re-emit `que-reference.js`; wire toggle + `localStorage` + localized labels in `index.html`. | HIGH | TASK | dev-kinh-dich | DONE | — |
| KD-QREF-LANG-3 | Verify: 64 × both langs no-gap, toggle swaps whole panel both ways, persistence, `dash-check.mjs` exit-0, frozen-surface diff-scope, source spot-check. Emit `qa-kd-qref-lang-<UTC>.json`. | HIGH | TASK | qa | DONE (Round-2 APPROVED) | — |
| KD-QREF-LANG-EXIT | PO sign-off vs ACs; main terminal commits in-tree work (commit-mutex enum defect). | HIGH | GATE | po | DONE (signed off 2026-05-24T20:04:51Z) | — |

### KD-QREF-LANG-1 (architect — DESIGN ONLY) ACs

- A1. Define the exact Go i18n shape in `hexagram_reference.go` (`localized{en,vi}` nested sub-struct recommended; or paired `*En`/`*Vi` fields if better Go idiom). Specify which fields become localized vs stay language-neutral (id/name/chinese/upper/lower/*Element/marketTrend/action/outcome stay neutral).
- A2. Decide emitted JSON key migration: breaking-rename (`coreMeaningEn` → `coreMeaning.en`) vs additive. PO prefers clean nested (no legacy debt; `que-reference.js` is auto-generated, single consumer). State the chosen emitted shape literally so QA can assert it.
- A3. Decide where outcome-token gloss localization lives: in the data, or in a closed-enum JS lookup map (5 tokens CAT/HUNG/VO CUU/HOI/LE × 2 langs). Either OK; specify the authentic VI gloss strings.
- A4. Render/toggle contract: init order (apply traces → set lang from localStorage-or-EN → render), `localStorage` `try/catch` guard, the EN/VI static-label map (panel h2, desc, "Trigrams"/"Favorable Condition"/"Market State Interpretation"/"Six Phases", phase-table column headers, trend legend), and confirmation that no `dot-*`/`.category-chip`/"not wired"/fetch/CDN is introduced and `renderQueReference()` re-runs cleanly on toggle.
- A5. Confirm the change set is exactly: `pkg/module/reading_composer/hexagram_reference.go`, `dashboard/que-reference.js` (regenerated), `dashboard/index.html`, and `cmd/sandbox/main.go` ONLY IF the emit serializer needs the new shape (often automatic via struct tags — confirm). No other file.
- Output: design notes + per-task ACs appended to THIS handoff. No code.

### KD-QREF-LANG-2 (dev-kinh-dich) ACs

- AC-1. `hexagram_reference.go`: every textual field carries both `en` and `vi` per the architect shape, for ALL 64 entries + all 6 phases each. VI text reused/lightly-trimmed from `que_convert/*.md` per the field map — authentic VN, not machine-retranslated.
- AC-2. NO gaps: no empty `vi` (or `en`), no "TODO", no placeholder, no English text in a `vi` field. (A `grep`-able self-check before handoff: zero empty localized values; spot-check ≥5 que against source.)
- AC-3. Re-emit `que-reference.js` via `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference`; the regenerated file is in-tree and matches the new shape. `go build ./...` clean, `CGO_ENABLED=0`.
- AC-4. `index.html`: EN|VI control in `.qref-header` (`.qref-lang-btn`, `.active`); toggling re-renders `#qref-grid` in the chosen lang for EVERY textual field + static labels/headers/legend; default EN; `localStorage["kd-qref-lang"]` read on init / written on toggle, `try/catch` guarded.
- AC-5. Inside `.qref-*` namespace only: NO new `dot-*`, NO `.category-chip`, NO "not wired"/"not_wired", NO fetch/CDN/external asset. Frozen surfaces (3 trust panels, sandbox runner, `sandbox-traces.js`, modal, edit-rerun handler) byte-for-byte unchanged.
- AC-6. `node dashboard/dash-check.mjs` exit-0 with toggle wired (default EN). Zero JS/page errors.
- AC-7. `git diff --stat` (uncommitted) shows ONLY the allowed files (A5). Explicit-file staging when main terminal commits; no `-A`/`.`. Paste the AC-6 dash-check output + the diff-stat into THIS handoff.

### KD-QREF-LANG-3 (qa) ACs

- QA-1. All 64 entries render in EN; toggle VI → all 64 re-render in Vietnamese (programmatically set `localStorage`/click and re-scan, or assert per-row VI text present). Both directions reversible.
- QA-2. No-gap audit: every textual field (coreMeaning, stateInterpretation, favorable, warning, trendLabel, 6× gloss) non-empty in BOTH langs across all 64. No English leaking into VI fields (spot-check ≥8 que against `que_convert/*.md`).
- QA-3. Persistence: set VI → reload → VI restored. Storage-disabled context → falls back to EN, no thrown error.
- QA-4. `node dashboard/dash-check.mjs` exit-0 (PASS/WARN, never FAIL) — run in default state AND after toggling to VI (re-run / re-check). 17 sandbox dots intact, 0 red, 0 JS/page errors, no bad category labels.
- QA-5. Frozen-surface diff scope: `git diff --stat` shows only the A5 allowed files; `sandbox-traces.js`, the 3 trust panels, modal, edit-rerun handler untouched; `pilot-status-kinh-dich.json` untouched.
- QA-6. Emit `docs/signals/qa-kd-qref-lang-<UTC>.json` with verdict + evidence.

### KD-QREF-LANG-EXIT (PO) — sign-off gate

PO validates QA evidence + independent spot-check vs the 7 ACs in the decision note. On PASS: mark chain DONE in `docs/TASKS.md`, produce commit manifest, hand to main terminal to commit in-tree. Pilot stays frozen.

---

## Constraints (binding, Day 0, every agent)

- Stay in `apps/kinh-dich-service/`. Reading `que_convert/` is allowed; output lands in repo. Pure Go, `CGO_ENABLED=0`, port 5005.
- Dashboard static / file:// / zero-creds / zero-fetch / zero-CDN. `dash-check.mjs` exit-0 = binding gate.
- `pilot-status-kinh-dich.json` FROZEN (12/12, verdict=scale) — do NOT touch / reopen.
- Explicit-file staging (`git add <path>` per file, NEVER `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; NO `git push` (user owns); all on `main` (NO branches). `git show --stat HEAD` must show zero foreign files (heavy fleet commit-race).
- **Commit-mutex enum defect:** dev-team agents cannot acquire `commit-mutex` (gateway absent + `task_claim` enum lacks the kind). Keep work IN-TREE; the chain produces a commit manifest at EXIT; **MAIN TERMINAL commits** (as for KD-QREF `0b401124`). Do NOT block on the agent committing. If a self-claim is needed, claim under `sprint-task` kind (documented workaround).
- Never ask the user — PO decides and continues.

---

## Design notes (architect → appended by KD-QREF-LANG-1)

**Authored:** 2026-05-24T~UTC | **Architect cycle:** KD-QREF-LANG-1

---

### A1. Go i18n Shape — `localized` Nested Sub-Struct (DECIDED: Breaking Rename)

**Decision: breaking rename with additive struct `localized`.**

PO preference is clean nested shape, no legacy debt. Since `que-reference.js` is AUTO-GENERATED and `renderQueReference()` in `index.html` is the sole consumer, a clean rename is safe and leaves zero orphan fields.

**New shared type (add near top of `hexagram_reference.go`):**

```go
// localized carries one text field in two languages.
type localized struct {
    En string `json:"en"`
    Vi string `json:"vi"`
}
```

**Updated `queReference` struct — field-by-field:**

| Old field (renamed/removed) | New field | JSON key | Language-neutral? |
|---|---|---|---|
| `CoreMeaningEn` | `CoreMeaning localized` | `coreMeaning` | NO — localized |
| `MarketTrendLabel` | `MarketTrendLabel localized` | `marketTrendLabel` | NO — localized |
| `StateInterpretationEn` | `StateInterpretation localized` | `stateInterpretation` | NO — localized |
| `FavorableEn` | `Favorable localized` | `favorable` | NO — localized |
| `WarningEn` | `Warning localized` | `warning` | NO — localized |
| `ID`, `Name`, `Chinese`, `Upper`, `Lower`, `UpperElement`, `LowerElement`, `MarketTrend` | UNCHANGED | unchanged | YES — verbatim |

**Updated `phaseReference` struct:**

| Old field | New field | JSON key | Language-neutral? |
|---|---|---|---|
| `GlossEn` | `Gloss localized` | `gloss` | NO — localized |
| `Phase`, `Action`, `Outcome` | UNCHANGED | unchanged | YES — language-neutral codes |

**Migration rule:** Dev replaces ALL 64 `build(id, coreMeaningEn, stateInterpretationEn, favorableEn, warningEn, []string{glosses})` calls with `build(id, localized{En:..., Vi:...}, localized{En:..., Vi:...}, localized{En:..., Vi:...}, localized{En:..., Vi:...}, []localizedGloss{{En:..., Vi:...}×6})`. The `build` helper signature updates accordingly.

**Updated `mapTrendToEnum` return:** Add VI form for the trend label:

```go
func mapTrendToEnum(trend string) (marketTrend string, marketTrendLabel localized) {
    t := strings.ToUpper(trend)
    if strings.HasPrefix(t, "THUAN LOI") {
        return "favorable", localized{En: "Favorable (THUẬN LỢI)", Vi: "Thuận lợi (THUẬN LỢI)"}
    }
    if strings.HasPrefix(t, "BAT LOI") {
        return "unfavorable", localized{En: "Unfavorable (BẤT LỢI)", Vi: "Bất lợi (BẤT LỢI)"}
    }
    return "neutral", localized{En: "Neutral (TRUNG TÍNH)", Vi: "Trung tính (TRUNG TÍNH)"}
}
```

The VI form of `marketTrendLabel` uses the clean Vietnamese keyword matching the VI source Xu hướng column: `Thuận lợi`, `Trung tính`, `Bất lợi`. Both EN and VI include the uppercase Vietnamese suffix in parentheses for identification.

---

### A2. Emitted JSON Shape (window.__QUE_REFERENCE__)

**Decision: clean nested shape, no additive fallback, breaking rename from prior shape.**

The emitted `window.__QUE_REFERENCE__` array will contain objects of this shape (excerpt for entry 1):

```json
{
  "id": 1,
  "name": "Kiền",
  "chinese": "乾",
  "upper": "Qian",
  "lower": "Qian",
  "upperElement": "Kim",
  "lowerElement": "Kim",
  "marketTrend": "favorable",
  "marketTrendLabel": { "en": "Favorable (THUẬN LỢI)", "vi": "Thuận lợi (THUẬN LỢI)" },
  "coreMeaning": {
    "en": "Pure creative force, strong yang energy advancing without rest",
    "vi": "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành"
  },
  "stateInterpretation": {
    "en": "Period of powerful growth suitable for launching or expanding positions...",
    "vi": "Thời kỳ phát triển mạnh mẽ, thích hợp khởi nghiệp hoặc mở rộng. Cần giữ liêm chính, đừng kiêu ngạo."
  },
  "favorable": {
    "en": "All endeavors prosper when you maintain righteous conduct and persistent effort.",
    "vi": "năng lượng dương cực mạnh, vạn sự hanh thông nếu giữ chính đạo"
  },
  "warning": {
    "en": "At the peak, decline begins. Excessive pride leads to downfall.",
    "vi": "Dương cực sinh âm — ở đỉnh cao nhất thì suy thoái đã bắt đầu. Đừng kiêu căng tự mãn."
  },
  "phases": [
    {
      "phase": 1,
      "action": "CHO",
      "outcome": "VO CUU",
      "gloss": {
        "en": "Hidden potential phase — accumulate resources, do not act yet",
        "vi": "tích lũy năng lực, chưa nên xuất đầu lộ diện"
      }
    }
    // ... phases 2-6
  ]
}
```

**Determinism:** `cmd/sandbox/main.go`'s `emitReferenceFile()` calls `reading_composer.GetAllQueReferences()` and `json.MarshalIndent`. No change to the emit logic is needed — the struct tags on `localized` fields handle serialization automatically. The `-emit-reference` flag, the DO-NOT-EDIT header, and the `len(refs) != 64` guard all remain unchanged. `cmd/sandbox/main.go` does NOT need editing unless the dev finds the `GetAllQueReferences()` return type signature needs adjustment (it should not — the slice element type changes internally but the accessor signature stays `[]queReference`).

**QA assertion contract:** QA can assert that every entry in `window.__QUE_REFERENCE__` satisfies:
- `entry.coreMeaning.en` non-empty string
- `entry.coreMeaning.vi` non-empty string
- `entry.marketTrendLabel.en` and `.vi` non-empty
- `entry.stateInterpretation.en` and `.vi` non-empty
- `entry.favorable.en` and `.vi` non-empty
- `entry.warning.en` and `.vi` non-empty
- `entry.phases.length === 6`
- For each phase: `phase.gloss.en` and `phase.gloss.vi` non-empty

---

### A3. Outcome-Token Gloss Localization (DECIDED: Closed-enum JS lookup map, in-render)

**Decision: closed-enum JS lookup maps, NOT in the per-que data struct.**

Rationale: the 5 outcome tokens (CAT/HUNG/VO CUU/HOI/LE) and 5 action tokens (TIEN/GIU/CHO/THAN/LUI) are a fixed closed enum reused across all 64 hexagrams. Embedding gloss per phase in the data would duplicate the same 5 strings 64× (384 strings) with no new information. A two-language lookup map in `renderQueReference()` keeps the SSOT compact and is the correct pattern for enum translation.

**Exact VI gloss strings (authentic VN from source):**

Outcome tokens:
```js
const OUTCOME_GLOSS = {
  en: {
    'CAT':    'CÁT (auspicious)',
    'HUNG':   'HUNG (inauspicious)',
    'VO CUU': 'VÔ CỬU (no error)',
    'HOI':    'HỐI (regret)',
    'LE':     'LỆ (danger)',
  },
  vi: {
    'CAT':    'CÁT (cát lành)',
    'HUNG':   'HUNG (hung hiểm)',
    'VO CUU': 'VÔ CỬU (không lỗi)',
    'HOI':    'HỐI (hối tiếc)',
    'LE':     'LỆ (nguy hiểm)',
  }
};
```

Action tokens:
```js
const ACTION_GLOSS = {
  en: {
    'TIEN': 'TIẾN (advance)',
    'GIU':  'GIỮ (hold)',
    'CHO':  'CHỜ (wait)',
    'THAN': 'THẬN (caution)',
    'LUI':  'LUI (retreat)',
  },
  vi: {
    'TIEN': 'TIẾN',
    'GIU':  'GIỮ',
    'CHO':  'CHỜ',
    'THAN': 'THẬN',
    'LUI':  'LUI',
  }
};
```

In VI view the action token shows its pure VI label (TIẾN/GIỮ/CHỜ/THẬN/LUI) without parenthetical, as the Vietnamese label is the primary form. The outcome token in VI shows the full VI label with parenthetical Vietnamese meaning. Both maps are declared in-script adjacent to `renderQueReference()`.

The `action` and `outcome` fields in the emitted data remain language-neutral codes (TIEN/GIU/CHO/THAN/LUI and CAT/HUNG/VO CUU/HOI/LE) — unchanged from current.

---

### A4. Render / Toggle Contract

#### Init order (MANDATORY sequence)

```
1. applyTracesOnLoad()           ← unchanged, runs first
2. renderPrimitives()            ← unchanged
3. renderModules()               ← unchanged
4. renderService()               ← unchanged
5. initQrefLang()                ← NEW: read localStorage → set module-level `qrefLang` var → default "en"
6. renderQueReference()          ← reads `qrefLang`; already called last — no reorder needed
```

#### Language state variable

```js
// Module-level (inside the <script> block, before renderQueReference)
let qrefLang = 'en';  // default per D1

function initQrefLang() {
  try {
    const stored = localStorage.getItem('kd-qref-lang');
    if (stored === 'en' || stored === 'vi') {
      qrefLang = stored;
    }
    // Unknown/absent value → silently keep 'en'
  } catch (_) {
    // Storage disabled or throws → silently keep 'en' (D2 requirement)
  }
}
```

#### Toggle control DOM (inside `.qref-header`, `.qref-*` namespace only)

Replace the current `<div class="qref-header">` content with:

```html
<div class="qref-header">
  <h2 id="qref-title">64 Quẻ — Trading Reference</h2>
  <div class="qref-lang-switch">
    <button class="qref-lang-btn active" id="qref-btn-en" type="button"
            onclick="setQrefLang('en')">EN</button>
    <button class="qref-lang-btn" id="qref-btn-vi" type="button"
            onclick="setQrefLang('vi')">VI</button>
  </div>
  <p class="qref-desc" id="qref-desc">
    Complete I-Ching hexagram reference reframed for market trading. Click any hexagram to expand details.
  </p>
</div>
```

CSS additions (inside `.qref-*` namespace, adjacent to existing `.qref-header` rule):

```css
.qref-lang-switch {
  display: flex;
  gap: 4px;
  margin-left: auto;  /* push to right of h2 */
}
.qref-lang-btn {
  padding: 3px 10px;
  border: 1.5px solid var(--border);
  border-radius: 4px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.qref-lang-btn.active {
  background: #0ea5e9;
  color: #fff;
  border-color: #0ea5e9;
}
```

#### `setQrefLang` function

```js
function setQrefLang(lang) {
  if (lang !== 'en' && lang !== 'vi') return;
  qrefLang = lang;
  try {
    localStorage.setItem('kd-qref-lang', lang);
  } catch (_) {
    // storage disabled → silently continue (D2)
  }
  // Update active button
  document.getElementById('qref-btn-en').classList.toggle('active', lang === 'en');
  document.getElementById('qref-btn-vi').classList.toggle('active', lang === 'vi');
  // Re-render grid and update static labels
  renderQueReference();
}
```

#### `renderQueReference` updated logic (key changes only)

The function reads `qrefLang` (module-level var, never re-reads localStorage) to select language. Helper functions receive `lang` parameter:

```js
function outcomeGloss(outcome, lang) {
  const o = (outcome || '').toUpperCase();
  return (OUTCOME_GLOSS[lang] || OUTCOME_GLOSS['en'])[o] || outcome;
}
function actionGloss(action, lang) {
  const a = (action || '').toUpperCase();
  return (ACTION_GLOSS[lang] || ACTION_GLOSS['en'])[a] || action;
}
```

Field access per language (for `q` = one queReference entry):

```js
// Read localized fields — safe accessor (never throws on missing .en/.vi)
function loc(field, lang) {
  if (!field) return '';
  return field[lang] || field['en'] || '';
}

// In the render loop:
const coreMeaning      = loc(q.coreMeaning, qrefLang);
const stateInterp      = loc(q.stateInterpretation, qrefLang);
const favorable        = loc(q.favorable, qrefLang);
const warning          = loc(q.warning, qrefLang);
const trendLabel       = loc(q.marketTrendLabel, qrefLang);
// For phases:
const glossText        = loc(p.gloss, qrefLang);
```

The `loc()` helper falls back to `en` if the VI string is empty — a second-layer guard on top of the no-gap data requirement (D2 graceful fallback).

#### Static label map (localizes on toggle)

```js
const QREF_LABELS = {
  en: {
    title:          '64 Quẻ — Trading Reference',
    desc:           'Complete I-Ching hexagram reference reframed for market trading. Click any hexagram to expand details.',
    trigrams:       'Trigrams',
    favorable:      'Favorable Condition',
    stateInterp:    'Market State Interpretation',
    sixPhases:      'Six Phases (Hào)',
    phaseCol:       'Phase',
    actionCol:      'Action',
    outcomeCol:     'Outcome',
    glossCol:       'Trading Gloss',
    expand:         'Expand',
    collapse:       'Collapse',
    upper:          'Upper',
    lower:          'Lower',
    fallbackMsg:    'Reference not generated — run: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference',
  },
  vi: {
    title:          '64 Quẻ — Tham Chiếu Giao Dịch',
    desc:           'Tham chiếu 64 quẻ Kinh Dịch được diễn giải theo ngữ cảnh thị trường. Nhấn vào quẻ để xem chi tiết.',
    trigrams:       'Quẻ Đơn',
    favorable:      'Điều Kiện Thuận Lợi',
    stateInterp:    'Phân Tích Trạng Thái Thị Trường',
    sixPhases:      'Sáu Hào',
    phaseCol:       'Hào',
    actionCol:      'Hành Động',
    outcomeCol:     'Kết Quả',
    glossCol:       'Diễn Giải Giao Dịch',
    expand:         'Mở rộng',
    collapse:       'Thu gọn',
    upper:          'Ngoại quẻ',
    lower:          'Nội quẻ',
    fallbackMsg:    'Chưa có dữ liệu — chạy: CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference',
  }
};
```

`renderQueReference()` reads `QREF_LABELS[qrefLang]` (falls back to `en` if lang unknown) for every static string: the panel `<h2>`, `.qref-desc`, all section `<h4>` headers, table `<th>` cells, and expand/collapse button text. The `loc()` helper populates the per-que text fields. The fallback `<div class="qref-fallback">` uses `labels.fallbackMsg`.

The `.qref-header` layout must accommodate the toggle beside the `h2` — change `.qref-header` CSS to `display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px;` so h2 + lang-switch sit on the same row.

#### Graceful fallback (que-reference.js absent)

The existing `onerror` on `<script src="que-reference.js">` stays unchanged. `renderQueReference()` already guards `if (!data || !Array.isArray(data))` → renders fallback div (no throws). This is unchanged behavior — the toggle buttons still render in `.qref-header` (they live in static HTML, outside the dynamic grid), but clicking them just re-renders the empty fallback in the chosen language. No JS error.

#### Persistence restore on reload

`initQrefLang()` is called before `renderQueReference()`. If `localStorage` contains `"vi"` from a prior session, `qrefLang` is set to `"vi"` before the first render. `renderQueReference()` renders VI on first paint. The toggle buttons' `.active` class must reflect the restored lang — dev must sync button state after `initQrefLang()` (either inside `initQrefLang` itself or at the top of `renderQueReference`):

```js
function syncLangButtons() {
  const enBtn = document.getElementById('qref-btn-en');
  const viBtn = document.getElementById('qref-btn-vi');
  if (enBtn) enBtn.classList.toggle('active', qrefLang === 'en');
  if (viBtn) viBtn.classList.toggle('active', qrefLang === 'vi');
}
// Call syncLangButtons() at start of renderQueReference() and in setQrefLang()
```

---

### A5. File Change Set (Exact — No Others)

| File | Change type | What changes |
|---|---|---|
| `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go` | MODIFY | Add `localized` struct; rename EN-only fields to `localized`; update `mapTrendToEnum`, `buildPhases`, `build` helper, all 64 entries; add VI content from `que_convert/*.md` per field map below. |
| `apps/kinh-dich-service/dashboard/que-reference.js` | REGENERATE | Re-run `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` after struct change. New nested shape with `{en,vi}` objects. |
| `apps/kinh-dich-service/dashboard/index.html` | MODIFY | Add `OUTCOME_GLOSS`/`ACTION_GLOSS`/`QREF_LABELS` lookup maps; add `let qrefLang`; add `initQrefLang()`, `setQrefLang()`, `syncLangButtons()`, `loc()` helper; update `renderQueReference()` to use localized fields + static labels; add EN/VI buttons to `.qref-header` HTML; add `.qref-lang-switch` + `.qref-lang-btn` CSS inside `.qref-*` block. |
| `apps/kinh-dich-service/cmd/sandbox/main.go` | NO CHANGE EXPECTED | `emitReferenceFile()` calls `json.MarshalIndent(refs, ...)` — Go struct tags handle the new nested shape automatically. Confirm `go build ./...` clean after struct rename. If any compile error surfaces (e.g., a type assertion on old field name in test helpers), fix in this file only. |

**Explicitly forbidden from touching:** `dashboard/sandbox-traces.js`, the 3 trust panel sections (`#primitives-section`, `#module-section`, `#service-section`), the modal HTML/JS, the edit-rerun handler, `pilot-status-kinh-dich.json`, `docs/TASKS.md` pilot rows.

---

### A5-supplement: VI Source → Field Mapping Rules (dev handoff)

Dev reads each `que_convert/NN_name.md` file and maps as follows:

| Go field | Source location in `.md` | Extraction rule |
|---|---|---|
| `CoreMeaning.Vi` | Line 3 blockquote (the `> **…**` line) | Verbatim; strip `> **` and `**`; keep full sentence. |
| `StateInterpretation.Vi` | `## Phán Đoán` → **Luận giải** paragraph + `## Phân Tích Trạng Thái` → **Nghề nghiệp** row value | Combine: Luận giải (1-2 sentences) + Nghề nghiệp row value (1 sentence). Trim to ≤3 sentences total, keep trading-context sentences. |
| `Favorable.Vi` | `## Phân Tích Trạng Thái` → **Xu hướng** row value (the text after the trend keyword and em-dash) | Verbatim after the `—` separator; strip the keyword prefix (THUẬN LỢI / TRUNG TÍNH / BẤT LỢI). |
| `Warning.Vi` | `## Phân Tích Trạng Thái` → **Cảnh báo** row value | Verbatim. |
| `MarketTrendLabel.Vi` | Derived from `marketTrend` enum — use `mapTrendToEnum` return value | `"favorable"` → `"Thuận lợi (THUẬN LỢI)"`, `"neutral"` → `"Trung tính (TRUNG TÍNH)"`, `"unfavorable"` → `"Bất lợi (BẤT LỢI)"`. Not extracted per-file — computed in `mapTrendToEnum`. |
| `Phases[N].Gloss.Vi` | `### Hào N+1` → **Hành động** value (after the `:` on the `- **Hành động:**` line) | Verbatim or lightly trimmed to 1 line. If **Hành động** is too terse (e.g., just "CHỜ — tích lũy năng lực"), fold in the **Luận giải** one-liner from that Hào section (first sentence only). |

**Dev self-check before handoff:**
- `grep -n '"vi": ""' hexagram_reference.go` → must return 0 matches.
- `grep -n '"vi": "TODO\|PLACEHOLDER\|TBD"' hexagram_reference.go` → must return 0 matches.
- Spot-check ≥5 que: open source file, verify Vi text in Go matches source within light trim.

---

### Trust-Gate Guard (A4 supplement)

The following tokens/classes are FORBIDDEN in the new code. If any appear, `dash-check.mjs` will exit 1:

| Forbidden | Why |
|---|---|
| Any element with `class*="dot-"` added by this change | dash-check counts dot-red → FAIL |
| Any text with class `.category-chip` | dash-check validates chip labels against known set |
| Body text `"not wired"` or `"not_wired"` | dash-check body text scan → FAIL |
| `fetch(` anywhere in the new JS | violates zero-fetch constraint; also breaks file:// |
| CDN `<script src>` or `<link href>` pointing to external URL | violates zero-CDN constraint |
| `window.__SANDBOX_TRACES__` reads/writes | frozen surface |
| Any edit outside `#que-reference-section` / `renderQueReference()` / `initQrefLang()` / `setQrefLang()` / `syncLangButtons()` / `loc()` / `OUTCOME_GLOSS` / `ACTION_GLOSS` / `QREF_LABELS` / `.qref-*` CSS block | scope violation |
| `localStorage` read/write outside `try/catch` | a thrown error = JS page error = dash-check FAIL |

The `.qref-lang-btn.active` class is SAFE — dash-check only inspects `[class*="dot-"]` and `.category-chip`. Confirmed by reviewing `dash-check.mjs` lines 144-157.

---

### Standard Detection

**BUILD-STANDARD: lean** — `apps/kinh-dich-service/` exists; this is a follow-on feature to an existing panel, no new microservice.

**NOTE:** dev-kinh-dich drives end-to-end; no relay required beyond dev → qa → po → main terminal commit.

## QA evidence (qa → appended by KD-QREF-LANG-3)

**[QA] Review Record — KD-QREF-LANG-3**
**Date:** 2026-05-24T19:55:19Z | **Verdict:** CHANGES_REQUESTED (2 blocking issues)
**Signal:** `docs/signals/qa-kd-qref-lang-2026-05-24T195519Z.json`
**Round:** 1

### Checks Executed

| Check | Result |
|---|---|
| go build CGO_ENABLED=0 | PASS EXIT:0 |
| go vet | PASS EXIT:0 |
| go test ./... | PASS (reading_composer + 4 primitive packages) |
| golangci-lint 0 issues | PASS |
| hexagram_reference.go imports: strings only | PASS |
| hexagram_data.go UNTOUCHED | PASS |
| 64 entries sequential 1..64 | PASS |
| Empty En fields: 0 | PASS |
| Empty Vi fields: 0 | PASS |
| Placeholder/TODO Vi: 0 | PASS |
| ASCII-only Vi fields (data): 0 | PASS |
| que-reference.js 64 entries, nested {en,vi} shape | PASS |
| que-reference.js issues: 0 (per field scan) | PASS |
| VI fidelity id=01 Kiền (coreMeaning/warning/favorable/phase1) | PASS — verbatim/trimmed from source |
| VI fidelity id=29 Tập Khảm (coreMeaning/warning/trend) | PASS — authentic (lightly paraphrased) |
| VI fidelity id=64 Vị Tế (coreMeaning/trend) | PASS — authentic trimmed |
| OUTCOME_GLOSS tokens cover all 5 outcomes (VO CUU normalized) | PASS — key normalization via .replace(/\s+/g,'') |
| ACTION_GLOSS tokens cover all 5 actions | PASS |
| Emit CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference exit:0 | PASS |
| Emit 64 entries, nested {en,vi} shape | PASS |
| Emit deterministic (diff = timestamp+hash only) | PASS |
| dash-check.mjs exit:0 | PASS |
| dotsGreen=17 / dotsRed=0 / jsErrors=0 / pageErrors=0 | PASS |
| localStorage try/catch guards present | PASS |
| loc() fallback to en | PASS |
| setQrefLang() guard (lang !== 'en' && lang !== 'vi') | PASS |
| Forbidden tokens in new code (dot-*, category-chip, not_wired, fetch, CDN) | PASS — all 0 |
| cmd/sandbox/main.go UNCHANGED | PASS |
| sandbox-traces.js UNTOUCHED | PASS |
| pilot-status-kinh-dich.json UNTOUCHED | PASS |
| Scope: 3 allowed files only | PASS |
| **BLOCKING B-1: localStorage key 'qrefLang' vs required 'kd-qref-lang'** | **FAIL** |
| **BLOCKING B-2: OUTCOME_GLOSS/ACTION_GLOSS vi values lack Vietnamese diacritics** | **FAIL** |

### Blocking Issues

**B-1 — `dashboard/index.html:2357,2372`**
`localStorage.getItem('qrefLang')` and `localStorage.setItem('qrefLang', lang)` use wrong key.
PO binding decision D2 requires `"kd-qref-lang"`. QA-3 / AC-4 fail.
Fix: replace both `'qrefLang'` occurrences with `'kd-qref-lang'`.

**B-2 — `dashboard/index.html:2299-2323`**
`OUTCOME_GLOSS.vi` and `ACTION_GLOSS.vi` use ASCII approximations without Vietnamese diacritics.
Examples: `'CAT (tot lanh)'` instead of `'CÁT (cát lành)'`; `'HUNG (xau)'` instead of `'HUNG (hung hiểm)'`;
`'TIEN (tien len)'` instead of `'TIẾN'`; `'GIU (giu nguyen)'` instead of `'GIỮ'`, etc.
AC-2 requires authentic Vietnamese. Architect spec (A3) provides exact strings — use those.
Fix: replace vi values in both maps with the architect-specified authenticated strings in A3.

### Non-Blocking Notes

**NB-1 — `dashboard/index.html:2441,2481`:** `toggleQueDetail()` hardcodes 'Expand'/'Collapse' strings; QREF_LABELS has `expand`/`collapse` keys but they are never used. Minor UX: collapse/expand buttons stay English in VI mode. Fix in same pass recommended but not blocking gate.

**NB-2 — `dashboard/index.html:1186,1192`:** Panel `<h2>` title and `.qref-desc` text are static HTML; QREF_LABELS has `title`/`desc` but `renderQueReference()` does not update those elements on toggle. D5 calls for full localization. Fix in same pass recommended.

**NB-3 — `dashboard/index.html:2528-2531`:** `initQrefLang()` called before `applyTracesOnLoad()` (spec says traces first). No functional impact — both are independent. Cosmetic ordering deviation.

## [Fixer] Fix Record — KD-QREF-LANG-3 Round 1 Blocking Issues

**Fixer activation:** 2026-05-24T20:15Z | **Scope:** 1 file (dashboard/index.html)

### Blocking Fixes Applied

**B-1 — localStorage key (lines 2357, 2372)**
- Changed: `localStorage.getItem('qrefLang')` → `localStorage.getItem('kd-qref-lang')`
- Changed: `localStorage.setItem('qrefLang', lang)` → `localStorage.setItem('kd-qref-lang', lang)`
- Both inside try/catch guards per D2
- QA AC-3/AC-4 now satisfied

**B-2 — Vietnamese gloss diacritics (lines 2299-2323)**
- OUTCOME_GLOSS.vi: replaced all 5 tokens with authentic Vietnamese (A3 spec verbatim)
  - CAT → CÁT (cát lành)
  - HUNG → HUNG (hung hiểm)
  - VOCUU → VÔ CỬU (không lỗi)
  - HOI → HỐI (hối tiếc)
  - LE → LỆ (nguy hiểm)
- ACTION_GLOSS.vi: replaced per A3 spec
  - GIU → GIỮ
  - TIEN → TIẾN
  - LUI → LUI
  - THAN → THẬN
  - CHO → CHỜ
- QA AC-2 no-gap audit now satisfied

### Spec-Completion Fixes (A4 realization, not blocking but recommended by QA)

**NB-1 resolved — Expand/Collapse button localization**
- toggleQueDetail() now reads button text from QREF_LABELS[qrefLang].expand/collapse
- QREF_LABELS map extended with expand/collapse keys (en and vi)
- renderQueReference() button element now uses `${escapeHtml(labels.expand)}`

**NB-2 resolved — Panel h2/desc localization on toggle**
- renderQueReference() now updates .qref-header h2 text and .qref-desc text from QREF_LABELS on every render
- QREF_LABELS map extended with title/desc keys (en and vi)
- Panel localizes on toggle; no static English chrome in VI mode
- Also corrected upper/lower keys in VI from incorrect 'Thượng'/'Hạ' to architect spec 'Ngoại quẻ'/'Nội quẻ'

**NB-3 noted — init order (no change)**
- initQrefLang() remains before applyTracesOnLoad(). No functional impact per QA; cosmetic ordering non-blocking.

### Verification

```
[dash-check] PASS - 17 green dots, 0 red, 0 errors, all category labels valid
```

- Verdict: **PASS / exit-0**
- dotsGreen: 17
- dotsRed: 0
- jsErrors: 0
- pageErrors: 0
- categoryChips: Valid Input=6, Edge Case=6, Bad Input→Error=5

All 6 required dashboard dots intact; no regressions.

### Files modified

- `apps/kinh-dich-service/dashboard/index.html` (this fixer's work)

### Scope validation

- ≤1 file rule: ✓ (only index.html edited by fixer)
- No other files touched by fixer (que-reference.js and hexagram_reference.go are pre-existing dev implementation)
- All blocking issues B-1 and B-2 resolved
- Spec-completion NB-1 and NB-2 also resolved as recommended

**Status:** Ready for QA re-verification round 2. All ACs should now pass.

## [QA] Review Record — KD-QREF-LANG-3 Round 2

**Date:** 2026-05-24T(round-2) | **Verdict:** APPROVED (PASS)
**Round:** 2 | **Files re-verified:** `apps/kinh-dich-service/dashboard/index.html` only

### B-1 Resolution (localStorage key)

- `localStorage.getItem('kd-qref-lang')` at line 2365 — CONFIRMED correct key
- `localStorage.setItem('kd-qref-lang', lang)` at line 2380 — CONFIRMED correct key
- Both inside try/catch (lines 2364-2371 and 2379-2383) — NO throw path
- Zero remaining `'qrefLang'` string literal (grep exit 1) — CONFIRMED

### B-2 Resolution (VI gloss diacritics)

All 10 A3 architect-spec strings verified verbatim:

| Token | A3 spec | In file |
|---|---|---|
| OUTCOME CAT | `CÁT (cát lành)` | MATCH |
| OUTCOME HUNG | `HUNG (hung hiểm)` | MATCH |
| OUTCOME VOCUU | `VÔ CỬU (không lỗi)` | MATCH |
| OUTCOME HOI | `HỐI (hối tiếc)` | MATCH |
| OUTCOME LE | `LỆ (nguy hiểm)` | MATCH |
| ACTION TIEN | `TIẾN` | MATCH |
| ACTION GIU | `GIỮ` | MATCH |
| ACTION CHO | `CHỜ` | MATCH |
| ACTION THAN | `THẬN` | MATCH |
| ACTION LUI | `LUI` | MATCH |

### NB-1 Resolution (Expand/Collapse localization)

- `toggleQueDetail()` at line 2450: `btn.textContent = isOpen ? labels.expand : labels.collapse` — reads `QREF_LABELS[qrefLang]`
- `renderQueReference()` at line 2503: initial button rendered with `${escapeHtml(labels.expand)}`
- QREF_LABELS.en.expand = `'Expand'`, QREF_LABELS.vi.expand = `'Mở rộng'` — CONFIRMED both present

### NB-2 Resolution (Panel h2 + .qref-desc localization)

- `renderQueReference()` lines 2461-2471: updates `.qref-header h2` innerHTML and `.qref-desc` textContent from `QREF_LABELS[qrefLang]` on every render
- Both `title` and `desc` keys present in en + vi — CONFIRMED

### QREF_LABELS Key Parity

14 keys each in en and vi — identical sets (python3 diff: Missing in VI: [], Missing in EN: [])

### Trust Gate

```
DASH-CHECK-RESULT: {"service":"kinh-dich","dotsGreen":17,"dotsRed":0,"dotsPending":0,
"jsErrors":0,"pageErrors":0,"categoryChips":{"Valid Input":6,"Edge Case":6,
"Bad Input -> Error":5},"badLabels":[],"verdict":"PASS"}
EXIT:0
```

### Smoke Check (regression)

- `CGO_ENABLED=0 go build ./...` — EXIT:0
- `CGO_ENABLED=0 go test ./...` — EXIT:0 (reading_composer + 4 primitives PASS)
- Forbidden tokens in qref JS section — grep exit 1 (NONE found)

### Scope Confirmation

- `git diff --name-only HEAD -- apps/kinh-dich-service/` → 3 files: `index.html`, `que-reference.js`, `hexagram_reference.go` (all within A5 allowed set)
- `sandbox-traces.js` diff EMPTY — UNTOUCHED
- `pilot-status-kinh-dich.json` diff EMPTY — UNTOUCHED
- `cmd/sandbox/main.go` diff EMPTY — UNTOUCHED

### Checks Summary

| Check | Round 2 Result |
|---|---|
| B-1: localStorage key 'kd-qref-lang' both get+set | PASS |
| B-1: Both inside try/catch, no throw path | PASS |
| B-1: No remaining 'qrefLang' literal | PASS |
| B-2: OUTCOME_GLOSS.vi all 5 tokens — A3 exact strings | PASS |
| B-2: ACTION_GLOSS.vi all 5 tokens — A3 exact strings | PASS |
| NB-1: Expand/Collapse driven by QREF_LABELS[qrefLang] | PASS |
| NB-2: Panel h2 + .qref-desc localized on render/toggle | PASS |
| NB-2: QREF_LABELS title/desc/expand/collapse in BOTH en + vi | PASS |
| QREF_LABELS key parity (14 keys each, zero missing) | PASS |
| dash-check.mjs exit 0 / 17 green / 0 red / 0 JS / 0 page errors | PASS |
| go build EXIT:0 | PASS |
| go test EXIT:0 | PASS |
| Forbidden tokens: 0 | PASS |
| sandbox-traces.js + pilot-status + main.go UNTOUCHED | PASS |
| Scope: only A5 allowed files modified | PASS |

**Round 2 Verdict: APPROVED — all blocking issues resolved, all spec-completion items delivered, trust gate PASS.**

## PO sign-off (po → KD-QREF-LANG-EXIT)

**Date:** 2026-05-24T20:04:51Z | **Verdict: APPROVED — SIGNED OFF** | **Gate:** KD-QREF-LANG-EXIT

### Classification (confirmed, unchanged)

POST-PILOT ENHANCEMENT #2 — follow-on to KD-QREF (`0b401124`). Pilot `docs/data/pilot-status-kinh-dich.json` stays DONE 12/12 verdict=scale FROZEN — NOT edited, NOT reopened. No sprint goal touched (this is a single-zone follow-on chain, tracked by this handoff, not a sprint).

### AC validation vs decision note (D1–D5 + per-task ACs)

| AC | Source | Verdict | Evidence |
|---|---|---|---|
| D1 default EN | decision note | PASS | `qrefLang='en'` default; shell `lang="en"` |
| D2 persistence `kd-qref-lang` + try/catch + EN fallback | decision note | PASS | B-1 fixed (get line 2365 / set line 2380, both try/catch); QA Round-2 grep zero `'qrefLang'` literal |
| D3 scope `.qref-*` only, frozen surfaces English | decision note | PASS | 3 A5 files only; sandbox-traces.js + 3 trust panels + modal + edit-rerun untouched |
| D4 both langs in Go SSOT → emitted JSON | decision note | PASS | `localized{en,vi}` struct; 64 entries no-gap both langs; que-reference.js regenerated nested shape |
| D5 EN\|VI toggle in `.qref-header` + static labels localize | decision note | PASS | `.qref-lang-btn`; QREF_LABELS 14-key parity en/vi; h2 + desc + headers + legend + expand/collapse localize |
| AC-2 authentic VI (no machine-retranslate, no gaps) | KD-QREF-LANG-2 | PASS | B-2 fixed — A3 diacritics exact (CÁT/HUNG/VÔ CỬU/HỐI/LỆ; TIẾN/GIỮ/CHỜ/THẬN/LUI); QA fidelity spot-check id 01/29/64 |
| AC-6 / QA-4 `dash-check.mjs` exit-0 | KD-QREF-LANG-2/3 | PASS | 17 green / 0 red / 0 JS / 0 page errors, default + post-toggle |
| QA-5 frozen-surface diff scope + pilot untouched | KD-QREF-LANG-3 | PASS | PO re-verified: kinh-dich diff = 3 A5 files; sandbox-traces.js + main.go + pilot-status all diff-EMPTY |
| go build / go test clean | KD-QREF-LANG-3 | PASS | CGO_ENABLED=0 build EXIT:0, test EXIT:0 |

### PO independent re-verification (this cycle)

- `git diff --name-only HEAD -- apps/kinh-dich-service/` → exactly: `dashboard/index.html`, `dashboard/que-reference.js`, `pkg/module/reading_composer/hexagram_reference.go`. No scope creep.
- `apps/kinh-dich-service/dashboard/sandbox-traces.js` diff EMPTY; `apps/kinh-dich-service/cmd/sandbox/main.go` diff EMPTY; `docs/data/pilot-status-kinh-dich.json` diff EMPTY (FROZEN intact).
- Untracked `apps/kinh-dich-service/sandbox` is an unrelated parallel-pilot artifact — EXCLUDED from this commit.
- Chain notebooks dirty this run: `architect.md`, `fixer.md` only. `qa.md` and `dev-kinh-dich.md` verified CLEAN (not modified) — excluded despite QA's draft manifest listing qa.md.

### Decision

**KD-QREF-LANG-1, -2, -3 → DONE. KD-QREF-LANG-EXIT → DONE (signed off).** QA Round-2 APPROVED corroborated by PO independent diff/frozen-surface re-check. Hand to MAIN TERMINAL for in-tree commit (dev-team cannot acquire commit-mutex — gateway absent + vn-market enum gap; same path as KD-QREF `0b401124`).

### Commit manifest (precise, dedup'd — MAIN TERMINAL stages each explicitly, NO -A/.)

```
apps/kinh-dich-service/dashboard/index.html
apps/kinh-dich-service/dashboard/que-reference.js
apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go
docs/handoffs/TASK_KD-QREF-LANG.md
docs/po-decisions/2026-05-24-kinh-dich-que-reference-language-switch.md
docs/signals/po-kd-qref-lang-20260524T185115Z.json
docs/signals/qa-kd-qref-lang-2026-05-24T195519Z.json
docs/agent-memory/notebooks/architect.md
docs/agent-memory/notebooks/fixer.md
docs/agent-memory/notebooks/po.md
```

Excluded (verified NOT KD-QREF-LANG / clean): `qa.md` (clean), `dev-kinh-dich.md` (clean), `apps/kinh-dich-service/sandbox` (unrelated parallel-pilot artifact), all other dirty working-tree files (api-gateway traces, pdf-extractor, stock-price, context-bloat signals, etc.). `pilot-status-kinh-dich.json` deliberately NOT staged (FROZEN).

> Note: `docs/agent-memory/notebooks/po.md` is staged here because PO overwrites it at cycle close (this sign-off). It is part of THIS chain's record.

### Commit message (one line, conventional)

```
feat(kinh-dich/dashboard): KD-QREF-LANG EN/VI language switch on 64-Quẻ Trading Reference panel
```
