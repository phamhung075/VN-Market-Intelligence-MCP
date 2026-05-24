# PO Notebook

**Cycle:** c295 (news-fetch SCALE Phase-2) — P2-NF-F G9 Path-B verification.
**Last update:** 2026-05-24
**Status:** news-fetch Phase-2 OPEN. P2-NF-F G9 verdict = **FAIL** (honest). Dashboard CORS-blocked under file://. NEW dev task P2-NF-F1 needed before G9 can grade PASS. G9 NOT flipped (TBD); decisionMatrix untouched (§4.5). Commit a0ae2c58.

---

## c295 · 2026-05-24T08:49Z — P2-NF-F G9 Path-B (PO headless capture)

### What I did
- Ran G9 NOW in clean all-green pre-injection state (sandbox 13/13 PASS regenerated first).
- No dash-check.mjs existed for news-fetch → CREATED apps/news-fetch/dashboard/dash-check.mjs (mirrors fleet precedent apps/kinh-dich-service/dashboard/dash-check.mjs; adapted to news-fetch DOM: badge classes + panel/card IDs; asserts 3 panels, 6 cards, badge honesty, ≥1 green primitive story, console_errors, external network calls). playwright-core local; node v22.22.2; chromium in ~/Library/Caches/ms-playwright.

### VERDICT = FAIL (honest, NOT false-green)
- Structure PASSES: 3 panels (primitives/module/microservice), 6 cards (4/1/1), honest NOT-RUN, 0 external net, 0 page errors. Screenshot apps/news-fetch/dashboard/render-check.png confirms clean layout.
- BLOCKER: loader uses synchronous XMLHttpRequest('results.json'). Headless Chromium (and ALL modern browsers) BLOCK it by CORS under origin 'null' (file://→file:// is cross-origin). 2 console errors. Result: all 6 badges STUCK at NOT-RUN despite valid 13/13 PASS results.json in same dir; footer 'Last run: not yet'. HTML comment 'works from file:// zero network' + 'status 0 = file:// success' is FALSE for Chromium.
- G8 honesty intact (shows NOT-RUN, not fake green) BUT G9 fails: cannot point to a green card proving a primitive works from dashboard alone via canonical file:// method.

### ROOT CAUSE vs precedent (key learning)
- kinh-dich PASSED G9 because index.html INLINES trace (window.__PRIMITIVES_DATA__ = [...] <script>) — zero XHR, renders green headlessly, no flags. news-fetch diverged to external XHR-fetch → CORS-blocked. Fix = inline-trace pattern (developer, zone apps/news-fetch/). PO does NOT write the fix.

### Actions (SSOT pilot-status-news-fetch.json)
- goals[G9].phase2 = full trustContractVerdict + blocker + fixOwner/fixDispatch. phase2.progressNotes appended. G9 status STAYS TBD; decisionMatrix all TBD (verified via node JSON.parse). goalsEarned still 0.
- Signal docs/signals/po-20260524T084949Z.json (type g9-verdict, recommends NEW task P2-NF-F1 → developer).

### GOTCHA / carry-over
- **G6 retro-flag**: G6 was EARNED-PENDING via static analysis + results.json inspection, NOT headless render. G9 just proved the headless render path is broken — re-confirm G6 after P2-NF-F1 fix.
- **Fleet commit-race LIVE**: index repeatedly picked up foreign staged files mid-cycle (kinh-dich _deprecated batch, then pdf-extractor confidence_scorer). Had to `git reset HEAD <dir>` twice + restage my 5 files immediately before commit. Verify `git show --stat HEAD` = only my files. docs/data is gitignored → pilot-status needs `git add -f` (file is tracked).
- **NEXT**: dispatch P2-NF-F1 (developer) to fix dashboard file:// rendering (inline-trace), then PO re-runs P2-NF-F via dash-check.mjs to earn G9 PASS. P2-NF-Z close-gate blocks on P2-NF-F + P2-NF-I.
