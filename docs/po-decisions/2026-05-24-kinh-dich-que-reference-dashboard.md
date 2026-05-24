# PO Decision — Kinh Dich 64-Quẻ Trading Reference (dashboard enhancement)

**Date:** 2026-05-24
**Author:** PO
**Status:** APPROVED — dispatched to dev-team chain (architect → dev-kinh-dich → qa → PO)
**Zone:** `apps/kinh-dich-service/` (anti-scope-creep — same boundary as the closed pilot charter)
**Classification:** POST-PILOT ENHANCEMENT. The kinh-dich Go-reboot pilot stays DONE 12/12 and FROZEN. This does NOT reopen any of the 12 goals.

---

## User request (verbatim, routed by main terminal)

> "apps/kinh-dich-service/dashboard/index.html — need list Que of kinhdich and description of que, translated from original (translate Vietnamese for market trading). Original is /Users/admin/Documents/Hung/.../kinhdich_logic/que_convert"

**Intent:** add a browsable reference of all 64 Quẻ (hexagrams) to the kinh-dich dashboard, each with a description reframed for MARKET-TRADING use, derived from the rich Vietnamese source files.

---

## Source survey (read-only, OUTSIDE the repo)

`/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/`
- 64 files `01_kien.md` … `64_vi_te.md` + `SCHEMA.md`. Each is consistently structured (verified across `01_kien`, `29_tap_kham`):
  - Header line = core meaning. `## Quẻ Đơn` = upper/lower trigram + element. `## Phán Đoán` = judgment. `## Đại Tượng` = image/action.
  - `## Phân Tích Trạng Thái` table — **Xu hướng** (THUẬN LỢI / TRUNG TÍNH / BẤT LỢI), Nghề nghiệp, Quan hệ, Sức khỏe, **Cảnh báo**.
  - `## Sáu Hào` — 6 phases, each with type / state / action / outcome (CÁT/HUNG/VÔ CỬU/HỐI/LỆ).
  - `## Chuyển Biến` — pair + sequence-next + per-line transition.

## Target survey (in-repo, dev-kinh-dich zone)

- `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_data.go` — **already the Go SSOT for hexagram data.** Holds `queMetaList` (64 × `{id, name, chinese, upper, lower}`) + `queDataMap` (64 × `{coreMeaning, trend, lines[6]{outcome, action}}`). The new content EXTENDS this asset; it is not hand-typed into HTML.
- `apps/kinh-dich-service/dashboard/index.html` (~70KB, `lang="en"`, "Scenario Trust Dashboard") — file:// load, ZERO fetch / ZERO CDN / ZERO creds, data embedded as `window.__*_DATA__`, 3 panels (Primitives / Module / Microservice). Honest-green under `dashboard/dash-check.mjs`.
- `dashboard/dash-check.mjs` (the trust verifier, G6–G9) gates on: `[class*="dot-"]` colors (any `dot-red` → FAIL), `.category-chip` text (must be one of Valid Input / Edge Case / Bad Input → Error; unknown label → FAIL), JS console errors → FAIL, page errors → FAIL, body text "not wired"/"not_wired".
- `dashboard/sandbox-traces.js` — AUTO-GENERATED real sandbox results; the existing 17 trust dots read from it. MUST NOT be touched by this enhancement.

---

## Ambiguity resolutions (PO authority — final)

### A1. Translation target language → **BILINGUAL, English-primary**

- Dashboard is `lang="en"`, all labels English. User lives in France, monitors the VN market. A pure-Vietnamese panel would clash with the English shell; pure-English would discard the authoritative source nuance and the user's VN-market mental model.
- **Decision:** English is the primary display language for the trading-reframed prose. Vietnamese name + Chinese glyph are preserved verbatim as the que identity (`Kiền 乾`, `Tập Khảm 坎`) — these are proper nouns, never translated. The original Vietnamese trend keyword is preserved in parentheses next to its English label (e.g. `Favorable (THUẬN LỢI)`) so the user can cross-reference the source. Hào outcome tokens (CÁT/HUNG/…) keep their Vietnamese form with an English gloss.
- Rationale: zero information loss, English-readable at a glance, VN source still traceable.

### A2. Depth per que → **single consistent SHAPE for all 64** (one-line summary + structured detail)

Two-level, identical for every que (no per-que variance):
- **List/summary view (one line):** que number + name(VN)+glyph + English core meaning + market-trend chip (Favorable / Neutral / Unfavorable, color-coded) + one-clause warning.
- **Detail view (expand/modal):** trigrams (upper/lower + element), market-state interpretation (from Xu hướng + Nghề nghiệp reframed as position/trade state), favorable-condition line, warning line (from Cảnh báo), and the **6-phase sequence** (each hào → phase label + action TIEN/GIU/CHO/THAN/LUI + outcome token + one-line English gloss).
- Rationale: the 6 hào ARE the market-state progression the service already scores on (`queDataMap.lines[].outcome/action`); surfacing them makes the reference consistent with what the engine produces. One fixed shape keeps the data asset clean and the QA verification mechanical.

### A3. Where the data lives → **structured Go data asset (SSOT), embedded into the dashboard at build/generate time. NOT hand-embedded HTML.**

- The 64-que trading content extends the existing Go asset `hexagram_data.go` (or a sibling `hexagram_reference.go` in the same `reading_composer` package — architect's call). The dashboard receives it the SAME way it already receives traces: an emitted `window.__QUE_REFERENCE__` block (a generated `.js` file like `sandbox-traces.js`, or inlined), produced by a Go command — never authored by hand in HTML.
- This keeps SSOT in Go (the API can serve the same data later via the already-stubbed `/hexagram/{number}/explain` route — out of scope now but the shape must not preclude it), and keeps `index.html` maintainable.
- **Translation/reframe is a one-time human-quality content task** owned by dev-kinh-dich (it reads the 64 source files and writes the reframed English fields into the Go asset). The 64 source files are the input; the Go asset is the output SSOT. No runtime dependency on the external `que_convert/` dir — content is copied into the repo.
- Rejected: hand-embedding 64 × rich descriptions directly in `index.html` (un-maintainable, violates SSOT, can't be served by the API).

### A4. Trust-contract impact → **POST-PILOT ENHANCEMENT, additive panel, MUST stay honest-green**

- The pilot is CLOSED 12/12 and frozen. This enhancement does NOT reopen it. No pilot goal changes.
- The new "64 Quẻ Reference" section is an **additive panel** below the 3 trust panels. It is REFERENCE content, not a trust-scenario, so it MUST NOT introduce any `scenario-status-dot` elements, MUST NOT emit `.category-chip` elements (those are reserved for the verifier), and MUST NOT contain the strings "not wired"/"not_wired".
- **Hard gate (binding DoD):** `node dashboard/dash-check.mjs` must still exit 0 (PASS or WARN, never FAIL) after the change — same green it has today. The existing 17 sandbox dots, `sandbox-traces.js`, the modal, and the edit-rerun handler are FROZEN and untouched.
- Pure static, file:// safe: zero fetch / zero CDN / zero credentials carried into the new panel (same constraint that gates the whole dashboard).

---

## Constraints carried into the spec

1. Stay inside `apps/kinh-dich-service/`. Reading the external `que_convert/` source dir is allowed; all output lands in the repo.
2. Pure Go stack (service on port 5005, `CGO_ENABLED=0`). dev-kinh-dich implements in Go; main terminal does not implement.
3. Dashboard stays static / file:// / zero-creds. dash-check.mjs must stay exit-0.
4. **Commit reality:** the `commit-mutex` task_claim enum lacks the kind, so dev-team agents cannot acquire it. Documented fleet workaround: dev-kinh-dich keeps work IN-TREE (uncommitted), main terminal commits at close-out. Account for this in the close-out — do NOT block on the agent committing.

## Out of scope (explicit)

- Wiring `/hexagram/{number}/explain` to serve the data (future; shape must merely not preclude it).
- Any change to the 3 trust panels, sandbox runner, `sandbox-traces.js`, modal, or edit-rerun handler.
- Any other microservice.
- Re-deriving que line-data scoring (`queDataMap` outcome/action values stay as-is; this enhancement only ADDS reframed descriptive prose + surfaces existing structured fields).
