# PO Notebook

**Cycle:** NF-LD-5 OPENED — "Refresh / Load latest" button on the served news-fetch live panel (MVP). New user feature request.
**Last update:** 2026-05-24T21:20:00Z
**Status:** PLANNED + dispatched. PIPELINE: developer (NF-LD-5-dev-B) first → dev-mcp-server → qa → PO close → ops PROVE.

---

## 2026-05-24T21:20Z — NF-LD-5: "see new feed" button (scope ruled Option A — MVP)

User (verbatim): *"need button to see new feed on http://localhost:3000/dashboards/news-fetch/"*. Small follow-on to CLOSED NF-LD-4 (served dashboard). PO verified live this cycle: served URL → 200, live endpoint `?source=all&limit=5` → 200 (running container already has the NF-LD-4 route).

**Current state (read, not re-derived):** live panel `#panel-live-data` already shows REAL `rag_analyses` rows but fetches ONCE on load via IIFE `initLivePanel()` (`apps/news-fetch/dashboard/index.html:314`), relative `GET /api/news-fetch/live?source=all&limit=20`, 4 honest states (FILE_DEGRADE/LOADING/EMPTY/ERROR). NO button — only a full reload pulls fresh rows. That's the gap.

**SCOPE RULING — Option (A) MVP** (PO owns it, didn't bounce to non-technical user): Refresh button re-calls the EXISTING endpoint + re-renders. Zero backend change, zero new endpoint, zero new security surface, **NO new architect design** (reuses NF-LD-4 Option-B same-origin contract). Optional source selector reuses `source=` param. **Option (B) on-demand re-scrape DEFERRED** — needs new POST trigger into stateless news-fetch + touches Security Clause; user didn't ask for scraping. If later confirmed → NF-LD-6 + spawn architect first.

**Chain (WIP=1 sequential):** developer NF-LD-5-dev-B (canonical `apps/news-fetch/dashboard/index.html`: button + refactor one-shot fetch → callable `loadLiveData()` wired to click, keep file:// degrade + EMPTY/ERROR honest states) → dev-mcp-server NF-LD-5-dev-A (regenerate served copy via `sync-news-fetch-dashboard.sh`, prove committed==generated + idempotent md5, NO hand-edits) → qa (button works, no drift, 0 creds, honest states, frozen surfaces, tests) → fixer if CHANGES_REQUESTED → PO NF-LD-5-EXIT → ops rebuild + PROVE button live.

**Anti-drift gate carried from NF-LD-4 round 1:** served copy MUST equal sync-script output. If source gains markup the script can't reproduce → fix the SCRIPT, not the served copy.

OUTPUTS: TASKS.md `## Sprint NF-LD-5` block (5 rows + scope ruling + DONE def + notes); handoff `# TASK NF-LD-5` (scope ruling + Security Clause + per-task ACs dev-B 8 / dev-A 8 / QA 8 + EXIT + OPS + constraints); this notebook. NO pilot-status edit (frozen 12/12). NO send_telegram (not PO surface — WORK summary handed to main terminal in RETURN).

**Carry-over:** NF-LD-4-OPS may still be the prior chain's open terminal gate, but served URL returns 200 this cycle → likely already rebuilt; if NF-LD-5 ops rebuild runs, it supersedes. NF-LD-5 is dispatch-ready: developer goes FIRST.
