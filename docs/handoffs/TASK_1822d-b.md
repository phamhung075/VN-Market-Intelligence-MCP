# TASK 1822d-b — Remove VPS Playwright scripts and bctc-discover handler

**Sprint:** 1822d
**Created:** 2026-05-02
**Agent:** developer
**Priority:** HIGH
**Type:** chore
**Estimate:** ~1h
**Branch:** `task/1822d-b-remove-vps-playwright`
**Blocked by:** TASK 1822d-a (must be merged and green first)

---

## Context

After Task 1822d-a ships the local Playwright BCTC discovery in mcp-server Docker,
the VPS-side Playwright scripts and the `/proxy/bctc-discover/` endpoint in
`vps-proxy-server.js` are dead code. This task removes them cleanly.

**Do not start this task until Task 1822d-a is merged to main and the test suite is
green.**

---

## Files to modify

### 1. Delete: `vps-scripts/discover-bctc-urls-browser.py`

The entire Python script is dead. Remove it.

### 2. Edit: `vps-scripts/vps-proxy-server.js`

Remove the `BCTC_DISCOVER_PREFIX` handler block:

- Remove constant `BCTC_DISCOVER_PREFIX = "/proxy/bctc-discover/"` (line ~75)
- Remove the entire `if (url.startsWith(BCTC_DISCOVER_PREFIX))` handler block
  (lines ~281–325)
- Remove the `runBctcDiscoverScript` helper function (wherever it is defined —
  search for `runBctcDiscoverScript`)
- Remove the `BCTC_DISCOVER_SCRIPT` constant and any env var reference to it
- Update the startup log line that mentions `bctc-discover` endpoint
- Keep: `BCTC_FILES_PREFIX` handler (`/bctc-files/`) — this still serves cached
  PDFs pulled by the local mcp-server Docker (it writes to the VPS cache dir via
  the existing PULL pipeline)

**Verify:** after edits, `node --check vps-scripts/vps-proxy-server.js` passes
(syntax valid).

### 3. Scan for backup files

Check for any backup copies of the Python script:

```bash
ls vps-scripts/discover-bctc-urls-browser*.py
ls vps-scripts/*.bak vps-scripts/*.orig 2>/dev/null
```

Remove any that exist.

### 4. Update `vps-scripts/README.md` (if it mentions discover-bctc-urls-browser.py)

Remove or update the reference. If no README exists, skip.

---

## Acceptance criteria

- [ ] AC-1: `vps-scripts/discover-bctc-urls-browser.py` does not exist.
- [ ] AC-2: `vps-proxy-server.js` contains no reference to `bctc-discover`,
  `BCTC_DISCOVER_PREFIX`, `runBctcDiscoverScript`, or `discover-bctc-urls-browser`.
- [ ] AC-3: `vps-proxy-server.js` still contains the `/bctc-files/` handler
  (static PDF serving — must not be removed).
- [ ] AC-4: `node --check vps-scripts/vps-proxy-server.js` exits 0.
- [ ] AC-5: `grep -r "discover-bctc-urls-browser" vps-scripts/` returns no matches.
- [ ] AC-6: Full mcp-server test suite passes (no regressions — this is a VPS-only
  change but verify).
- [ ] AC-7: After merge, `./scripts/maybe-deploy-vps.sh` is run (per dev-standards
  branch hygiene rule — VPS scripts changed).

---

## Key references

- `vps-scripts/vps-proxy-server.js` — handler at lines ~277–325, constants at ~70–95
- `vps-scripts/discover-bctc-urls-browser.py` — full file deleted
- `apps/mcp-server/src/application/usecases/discoverBctcPdfUrlBrowser.ts` —
  confirm no remaining import or call references to the VPS endpoint after 1822d-a

---

## Out of scope

- Modifying `/bctc-files/` serving logic in `vps-proxy-server.js`
- Removing `/proxy/ssc-iboard/` proxy (separate, unrelated endpoint)
- Any mcp-server TypeScript changes (all done in 1822d-a)
