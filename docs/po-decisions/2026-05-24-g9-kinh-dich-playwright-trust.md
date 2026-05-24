# PO Decision — G9 Dashboard-Trust Evidence (kinh-dich, pilot-4) via Playwright Path B

- **Date (UTC):** 2026-05-24T04:35:45Z
- **Task:** P2-KD-L (Phase 2, kinh-dich-service)
- **Handoff:** `docs/handoffs/TASK_P2-KD-L.md` (4 ACs)
- **Decision maker:** PO (full autonomy; no user delegation)
- **Path:** Path B — PO Playwright 1.60.0 + cached headless chromium (Day-0 default per L6)
- **§4.5 binding:** This task produces **G9 EVIDENCE only**. It does NOT flip G9 (terminal-only).
  PM-owned SSOT `docs/data/pilot-status-kinh-dich.json` was **NOT edited**.

---

## Method (HONEST, reproducible)

- Target: `file:///.../apps/kinh-dich-service/dashboard/index.html`
- Throwaway CJS runner (NOT committed; deleted post-run): `require('playwright')` resolved via
  `NODE_PATH=/Users/admin/.npm/_npx/e41f203b7505f1fb/node_modules`,
  `PLAYWRIGHT_BROWSERS_PATH=/Users/admin/Library/Caches/ms-playwright`.
- The first npx module (`0b9ff77…`) expected chromium rev 1179 (absent) and failed launch; the
  `e41f203…` module aligned with the cached 1217/1223 revision and launched headless chromium cleanly.
- **Selectors were inspected from the ACTUAL DOM, not assumed.** The dashboard uses **NO `data-testid`
  attributes** (the handoff's `[data-testid~="card"]` examples are stale). Real selectors used:
  `h2:has-text(...)` panel headers; `.scenario-card`; `.module-card`; `.service-card`;
  `.scenario-status-dot.dot-green/.dot-red/.dot-pending`; `.not-run-badge`; `.group-status`;
  `#prim-notrun-chip` / `#mod-notrun-chip`.
- Cards are JS-rendered into `#primitives-panel-body` / `#module-panel-body` / `#service-panel-body`;
  2.5s settle applied before DOM query. `dotClass()` returns `dot-pending` for any non-`pass`/`fail`
  status, so a cold-open false-green would surface as a `.dot-green` count > 0.

## Raw run result

```json
{
  "panels":   { "primitives": 1, "module": 1, "microservice": 1 },
  "cards":    { "scenario": 15, "module": 2, "service": 1 },
  "dots":     { "green": 0, "red": 0, "pending": 17 },
  "notRunBadges": 3,
  "chips":    { "prim": "15 NOT-RUN", "mod": "2 NOT-RUN" },
  "groupStatusTexts": ["NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN","NOT-RUN"],
  "errors":   { "consoleErrors": [], "pageErrors": [], "requestFailed": [] }
}
```

- **Console errors: 0 · pageerror events: 0 · requestfailed events: 0**
- **3 panels render** (Primitives / Module / Microservice).
- **17 scenario status dots** = 15 primitive + 2 module (matches SSOT 15+2=17), **all `dot-pending`**.
- **0 green dots, 0 red dots** at cold-open → zero false greens.
- All 5 group-status labels read **NOT-RUN** (not "ALL PASS"); NOT-RUN chips show "15 NOT-RUN" / "2 NOT-RUN".

---

## AC Verdicts

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| **AC-1** | Dashboard opens/renders via Playwright headless chromium | **PASS** | `page.goto(file://…)` load OK; all 3 panels + JS-rendered cards present |
| **AC-2** | Zero console errors / page errors / request failures | **PASS** | consoleErrors=0, pageErrors=0, requestFailed=0 |
| **AC-3** | All panels render (5 primitive cards + module + microservice) | **PASS** | 3 panels=1 each; 15 primitive scenario cards + 2 module + 1 service card; 17 status dots |
| **AC-4** | Honest NOT-RUN cold-open (no false greens) | **PASS** | green=0, red=0, pending=17; group labels all NOT-RUN; chips "15/2 NOT-RUN" |

## Overall G9 verdict: **PASS (Path B evidence complete — no RED findings)**

Dashboard is an honest user-facing trust contract: it renders fully, throws zero runtime errors,
and tells the truth on cold open (NOT-RUN everywhere, zero false greens).

---

## Boundary discipline

- Committed: **this decision doc + the done-signal ONLY**.
- NOT committed / NOT touched: `/tmp` runner (deleted), `apps/kinh-dich-service/dashboard/index.html`
  (read-only), `docs/data/pilot-status-kinh-dich.json` (PM SSOT — §4.5 terminal-only), other pilots, SI-2.
- L84 explicit staging; index verified clean of foreign paths pre-stage; no `git reset HEAD` of foreign
  paths; no `--amend` / `--force` / `--no-verify` / `--no-gpg-sign` / `git push`; all on `main`.
- Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor.

## Next

- **next_actor: pm** — verify P2-KD-L (G9 evidence), then sequence **P2-KD-M** (kinh-dich-pre-inject tag + G10 bug injection).
