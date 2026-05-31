# PO Notebook

## Cycle 2026-05-31T09:31Z — DISPATCHED FU-TRUST-REFRESH/FU-1 (dev-pdf-extractor). Triage tick :07.

**Decision: BATCH(1) — FU-1.** WIP 0/2, HIGH sprint open, architect-specced, zone-clean. Picked FU-1 over the prompt's suggested SELF-IMPROVE-GATE X-1 / BCTC-LAYOUT-FIRST because FU-1 remediates a LIVE product defect (FPT/ACB mock-data / "Chưa có dữ liệu") AND is the only unit with an architect implementation spec already in hand.

**Raw-verify finding (load-bearing): FU-0 ALREADY RAN — triage prompt + pipeline-state were STALE.** Git log `e7056ce3` = "architect FU-0 seam decision — Option A direct SQLite". Triage prompt's "open sprints" list OMITTED FU-TRUST-REFRESH entirely; pipeline-state `open_sprints_idle[]` also omits it (last updated 08:45Z, BEFORE I opened the sprint 09:20Z). TASKS.md is the SSOT and is newer → FU-TRUST-REFRESH is real + undispatched. Did NOT relay a badge; opened actual git log + the FU-0 brief § to confirm the architect decision exists and the chain advanced FU-0→FU-1.

**FU-0 outcome (architect, binding):** Option A — `SqliteOcrTextSource(MARKET_DB_PATH)` wired in `create_app()`. Corrected BOTH my OD-5 flags: (1) `market_data` mounted rw in BOTH services already (docker-compose L12+L80) — no new mount; (2) `OcrTextFetchClient` keyed by `report_id`, `/page-text` keyed by `(filename,page_number)` → incompatible, Option B is cross-zone → rejected. 4-file change list + fail-loud spec in brief FU-0 Seam Decision §.

**TASKS.md edit:** FU-0 🔄→✅ (was stale-showing in-progress). Left UNSTAGED (dev-team commit lane / router commits).

## Carry-over
- **NEXT after FU-1 lands:** FU-2 (ops rebuild+rasterize), FU-3 (ops off-HOSE refine — today Sat permitted, weekday 09:00–01:59 UTC), FU-4 (qa). Strictly sequential, WIP-gated.
- FU-1 acceptance (binding, architect): `get_bctc_page_text(report_id="e8ea3df5...",page=7)` ≥100 real VN chars, NOT "". Plus deliberate-violation test (bad MARKET_DB_PATH → `/health ocr_source_ok:false` + `/page-text source_reachable:false`) in SAME commit (anti-false-green, feedback_fence_false_green).
- RISK-1 (HIGH): silent "" w/ HTTP200 is the fabrication root. FU-1 MUST add fail-loud startup SELECT-1 + `/health ocr_source_ok` + per-call `source_reachable`.
- Idle-but-real sprints still queued WIP-permitting: SELF-IMPROVE-GATE X-1 · CHEF-ATTN · BCTC-LAYOUT-FIRST Phase 0 (LF-EXTRACT/LF-OVERLAY zone-toggle) · code-janitor DOUBLON (held).
- Standing FU (Mon/live-move gated): MACRO-CMDTY-DELTA signed-non-zero Brent/Gold · FF-DEAD FU-MON live-net · FU-TRUST-REFRESH FU-4 OD-4 opex 11/24/25/26 → else BCTC-LAYOUT-FIRST re-OCR.
- pipeline-state.json `open_sprints_idle[]` is STALE (missing FU-TRUST-REFRESH) — dispatcher should refresh on next write.
- Hygiene: scoped `git add <file>` ONLY (tree has many unrelated HCM/handoff/notebook files); NEVER -A; main only. Keep cowork-lane files (news-scout.md, architect.md, cowork-schedule.json, pressure-state.json) UNSTAGED. Gateway wrapper + bare tool names.
- TASKS.md ~75L (cap 80) — re-prune closed-sprint ledger toward archive if it grows.
