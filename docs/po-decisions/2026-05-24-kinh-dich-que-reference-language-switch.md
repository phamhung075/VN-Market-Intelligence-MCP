# PO Decision — Kinh-Dich 64-Quẻ Trading Reference: EN/VI Language Switch (KD-QREF-LANG)

**Date:** 2026-05-24T18:51Z
**Author:** PO
**Status:** APPROVED — dispatch dev-team chain (architect → dev-kinh-dich → qa → PO)
**Zone:** `apps/kinh-dich-service/` (single; same boundary as KD-QREF + the closed pilot charter)
**Classification:** FOLLOW-ON to KD-QREF (the bilingual EN-primary panel shipped at `0b401124`, data regenerated `e9608167`). POST-PILOT enhancement #2 on the same panel. The kinh-dich Go-reboot pilot stays DONE 12/12 and FROZEN — `pilot-status-kinh-dich.json` is NOT edited, no goal reopened.

---

## User request (verbatim, routed by main terminal)

> "64 Quẻ — Trading Reference: need version english and version vietnamese switch."

**Intent (main terminal reading, ratified by PO):** the panel that shipped (KD-QREF) is bilingual EN-primary — English trading prose, VN names/glyphs verbatim, bilingual trend labels. The user now wants a real LANGUAGE SWITCH: a full ENGLISH view and a full VIETNAMESE view, toggled by the user. Every textual field (core meaning, market-state interpretation, favorable condition, warning, per-phase action/outcome glosses, trend label) needs both an EN and a VI rendering; a toggle control swaps the whole panel between them.

---

## What KD-QREF shipped (current state, the thing we are extending)

- **Data SSOT:** `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go` — `queReference` (64 entries) + `phaseReference`. Today carries EN-only prose fields (`CoreMeaningEn`, `StateInterpretationEn`, `FavorableEn`, `WarningEn`, phase `GlossEn`) plus the bilingual `MarketTrendLabel` ("Favorable (THUẬN LỢI)") and VN `Name`/`Chinese` glyph kept verbatim. Phase `Action`/`Outcome` tokens (TIEN/GIU/CHO/THAN/LUI, CAT/HUNG/VO CUU/HOI/LE) are reused from `queDataMap` — language-neutral codes.
- **Emit:** `cmd/sandbox/main.go -emit-reference` → `dashboard/que-reference.js` (`window.__QUE_REFERENCE__`). AUTO-GENERATED; never hand-edited.
- **Render:** additive `#que-reference-section` / `.qref-*` panel in `dashboard/index.html`, below the 3 trust panels. `renderQueReference()` + `toggleQueDetail()` + outcome/trend class helpers. Inline expand/collapse per row.
- **Trust gate:** `dashboard/dash-check.mjs` (headless Chromium, file://). FAILs on: any `dot-red`, any JS console error, any page error, any `.category-chip` text outside the valid set, body text "not wired"/"not_wired". Currently exit-0 / PASS (17 green sandbox dots, 0 red, 0 errors). The `.qref-*` panel emits NO `dot-*` / NO `.category-chip` — that is why it stays green.

---

## Authoritative VI content source (read-only, OUTSIDE the repo)

`/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/` — 64 files `01_kien.md`…`64_vi_te.md`. **Verified consistent schema** across files 01 + 29 + SCHEMA.md. Each carries the exact VI counterparts of the existing EN fields:

| EN field (shipped) | VI source location (verbatim/light-trim) |
|---|---|
| `coreMeaningEn` | header blockquote (line 3) — core meaning sentence |
| `stateInterpretationEn` | `## Phán Đoán` → **Luận giải** + `## Phân Tích Trạng Thái` → **Nghề nghiệp** row |
| `favorableEn` | `## Phân Tích Trạng Thái` → **Xu hướng** condition clause (after the trend keyword) |
| `warningEn` | `## Phân Tích Trạng Thái` → **Cảnh báo** row |
| `marketTrendLabel` | the **Xu hướng** keyword: THUẬN LỢI / TRUNG TÍNH / BẤT LỢI |
| phase `glossEn` (×6) | each `### Hào N` → **Hành động** clause (and/or **Luận giải** one-liner) |

The VI view reuses this text **verbatim or lightly trimmed** — NOT a machine round-trip of the English back into Vietnamese. The source is the input; the Go asset is the output SSOT (content copied into the repo; no runtime dependency on the external dir).

---

## Design decisions (PO authority — FINAL, no user approval sought)

### D1. Default language on load → **ENGLISH**

The dashboard shell is `lang="en"`, all surrounding labels English; the user is France-based. EN is the least-surprising default that matches the existing shell. The richer VI source is one click away. (The user's choice, once made, persists — see D2 — so a VI-preferring user pays the toggle cost exactly once.)

### D2. Persistence → **localStorage, panel-scoped key**

Remember the user's choice across reloads. Key `kd-qref-lang` (values `"en"` | `"vi"`), read on init, written on toggle. **file:// safe** — `localStorage` works under `file://` (no cookies, no fetch, no network). On first load (no stored value) → default per D1 (EN). Wrap reads/writes in `try/catch` so a storage-disabled context degrades silently to the D1 default and **never throws a JS error** (a thrown error = dash-check FAIL).

### D3. Toggle SCOPE → **this `.qref-*` panel ONLY** (CONFIRMED)

The 3 trust panels (Primitives / Module / Microservice), the sandbox runner, `sandbox-traces.js`, the modal, and the edit-rerun handler stay FROZEN and English. Touching them risks the `dash-check.mjs` gate and the pilot freeze. The toggle reads/writes only `.qref-*` DOM and re-renders only `#qref-grid`. Whole-dashboard i18n is explicitly REJECTED (scope creep + gate risk + no user need expressed).

### D4. Data shape → **nested `{en, vi}` sub-struct per textual field, carried in the Go SSOT, emitted to `que-reference.js`**

Principle (PO-binding; exact Go type is the architect's call): BOTH languages are carried in the `hexagram_reference.go` data asset and emitted to `que-reference.js`. Language text is NEVER fetched at runtime and NEVER hand-typed in HTML. PO's recommended shape (architect may refine the Go idiom):

```
type localized struct { En string `json:"en"`; Vi string `json:"vi"` }

queReference:
  coreMeaning        localized   // was coreMeaningEn
  stateInterpretation localized  // was stateInterpretationEn
  favorable          localized   // was favorableEn
  warning            localized   // was warningEn
  marketTrendLabel   localized   // was the single bilingual string → split into clean EN + clean VI
  // language-neutral, UNCHANGED: id, name (VN proper noun), chinese, upper, lower, *Element, marketTrend enum
phaseReference:
  action  string   // UNCHANGED language-neutral token
  outcome string   // UNCHANGED language-neutral token
  gloss   localized // was glossEn
```

- `name` (e.g. "Kien"/"Kiền") and `chinese` glyph are PROPER NOUNS — shown in BOTH views verbatim, never translated.
- `action`/`outcome` are language-neutral CODES — the SAME token shows in both views; only their **gloss/legend label** is localized (EN "advance"/"auspicious" vs VI "TIẾN"/"CÁT (cát lành)"). The architect decides whether outcome-gloss localization lives in the data (preferred — one SSOT) or in two small JS lookup maps (acceptable for the 5 fixed tokens, since they are a closed enum, not per-que content). PO accepts either as long as the VI gloss is authentic VN, not a re-translation.
- `marketTrend` (the `favorable|neutral|unfavorable` enum that drives chip color) stays language-neutral — color is the same in both views; only the chip's text label localizes.

Whether the JSON key migration is a breaking rename of the emitted shape (`coreMeaningEn` → `coreMeaning.en`) or additive (`coreMeaningEn` kept + `coreMeaningVi` added) is the architect's call; PO's only constraint is that the FINAL render reads the chosen shape and `dash-check.mjs` stays exit-0. Since `que-reference.js` is AUTO-GENERATED and `index.html`'s `renderQueReference()` is the sole consumer, a clean nested shape is preferred (no legacy-field debt). The render must regenerate the emitted file (`-emit-reference`) so the shipped `que-reference.js` matches the new struct.

### D5. Toggle control UI → **inside the `.qref-*` namespace, in the panel header, trust-gate safe**

- A small segmented EN | VI control (two `<button class="qref-lang-btn">` or a labelled toggle) lives in `.qref-header`, top-right, beside the "64 Quẻ — Trading Reference" title.
- It MUST stay inside the `.qref-*` namespace: **no `.dot-*`, no `.category-chip`, no `.scenario-status-*`, no body text "not wired"/"not_wired", no fetch, no CDN, no external font/script.** Active state styled via a `.qref-lang-btn.active` class (a benign class — dash-check only inspects `[class*="dot-"]` and `.category-chip`).
- Static section labels inside the panel ("Trigrams", "Favorable Condition", "Market State Interpretation", "Six Phases", and the phase-table column headers, and the panel `<h2>`/`.qref-desc`) ALSO localize on toggle — a "Vietnamese view" with English section chrome is not a real VI view. These static strings live in a tiny in-`renderQueReference()` label map keyed by the active lang (EN/VI), not fetched. The trend-chip legend text localizes too.

---

## Acceptance criteria (binding DoD)

1. **Toggle present + functional:** EN | VI control in `.qref-header`; clicking VI re-renders the whole `.qref-*` panel in Vietnamese (every textual field: core meaning, market-state interpretation, favorable, warning, trend label, all 6 phase glosses, AND the static section labels/column headers/legend); clicking EN restores English. Default = EN (D1).
2. **Persistence:** choice stored in `localStorage["kd-qref-lang"]`, restored on reload; storage-disabled context silently falls back to EN with NO thrown error (D2).
3. **All 64 × both languages, no gaps:** every one of the 64 entries has BOTH a non-empty EN and a non-empty VI value for EVERY textual field (coreMeaning, stateInterpretation, favorable, warning, trendLabel, and all 6 phase glosses). NO placeholder, NO "TODO translate", NO empty string, NO English text sitting in a VI field. VI content is reused/lightly-trimmed from `que_convert/*.md`, not machine-retranslated from the English.
4. **Proper nouns preserved:** `name` (VN) + `chinese` glyph show verbatim in BOTH views. `action`/`outcome` tokens identical in both views; only their gloss/legend localizes with authentic VN.
5. **SSOT + emit discipline:** both languages live in `hexagram_reference.go`; `que-reference.js` is regenerated via `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` and the regenerated file is in-tree; HTML carries NO hand-typed que content.
6. **Trust gate green (HARD):** `node dashboard/dash-check.mjs` stays **exit-0** with the toggle present, in BOTH the EN and VI states (run the check, toggle to VI in the page if the check supports it, or at minimum confirm exit-0 with the toggle wired and default-EN; the toggle introduces no `dot-*`/`.category-chip`/"not wired"/JS error in either state). The 3 trust panels + 17 sandbox dots + modal + `sandbox-traces.js` + edit-rerun handler are byte-for-byte UNCHANGED (verify via `git diff --stat` scope: only `hexagram_reference.go`, `cmd/sandbox/main.go` if emit shape touched, `dashboard/que-reference.js`, `dashboard/index.html`).
7. **Zero JS errors in both views:** no console error / page error on load OR after toggling (dash-check enforces; a `localStorage` throw or an undefined-field access would FAIL it).

## Constraints carried into the spec

1. Stay inside `apps/kinh-dich-service/`. Reading external `que_convert/` is allowed; all output lands in the repo. Pure Go (port 5005, `CGO_ENABLED=0`); dev-kinh-dich implements, main terminal does not.
2. `pilot-status-kinh-dich.json` is FROZEN (12/12, verdict=scale). This enhancement does NOT touch it / does NOT reopen any goal. Tracked as the KD-QREF-LANG follow-on chain in `docs/TASKS.md`.
3. Dashboard stays static / file:// / zero-creds / zero-fetch / zero-CDN. `dash-check.mjs` exit-0 is the binding gate.
4. **Commit reality:** dev-team agents cannot acquire commit-mutex (MCP gateway absent + vn-market `task_claim` enum lacks `commit-mutex`). All work stays IN-TREE; the chain produces a commit manifest at EXIT; **MAIN TERMINAL commits** (as it did for KD-QREF at `0b401124`). Do NOT block on the agent committing.

## Out of scope (explicit)

- Whole-dashboard i18n / translating the 3 trust panels / modal / sandbox chrome (D3 — panel only).
- A 3rd language, machine-translation pipeline, or runtime language fetch.
- Wiring `/hexagram/{number}/explain` to serve the localized data (future; the `{en,vi}` shape merely must not preclude it).
- Re-deriving any que line-data scoring; `queDataMap` action/outcome values stay as-is.

## Architect hop — REQUIRED (DECIDED)

PO routes through the architect for ONE design call before dev: the exact Go i18n shape (nested `localized{en,vi}` vs paired `*En`/`*Vi` fields) + whether the emitted JSON key migration is breaking-rename or additive + where outcome-token gloss localization lives (data vs closed-enum JS map) + the render contract for the toggle (init order, `localStorage` guard, label map) so `renderQueReference()` reads the new shape and `dash-check.mjs` stays exit-0. This is a small but real i18n-shape decision that affects both the Go struct and the JS render; getting it right once avoids a rename-churn cycle. The architect appends design notes + per-task ACs to the handoff; dev-kinh-dich then implements.
