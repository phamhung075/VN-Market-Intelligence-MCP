# Task Report — 1833k: TE Chromium Executable Path Config Investigation

**Branch:** `task/1833k-te-chromium-path`
**Date:** 2026-05-03
**Status:** CLOSED — no production code change required; AC-8 test added to lock invariant.

---

## Findings

### Step 1 — Fetcher (`tradingEconomicsChromium.ts`)

`buildChromiumLaunchConfig()` at line 87–88 explicitly sets:

```typescript
executablePath:
  Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium",
```

The env var is read via `Bun.env` (correct per dev-standards — never `process.env` in this codebase).
The fallback `/usr/bin/chromium` matches the Debian `chromium` apt package install location.

### Step 2 — Docker config

**Dockerfile (`apps/mcp-server/Dockerfile`, line 52):**
```dockerfile
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
```

The Debian trixie base image (`oven/bun:1-debian`) installs `chromium` via `apt-get install chromium`, which places the binary at `/usr/bin/chromium`. The Dockerfile comment (line 16) explicitly confirms: "Debian trixie ships chromium 147.x at /usr/bin/chromium".

**docker-compose.yml:**
No `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` override in the `mcp-server` service environment block — it inherits the `ENV` value from the Dockerfile.

### Step 3 — Assessment

**Scenario A** (executablePath NOT set) — does NOT apply. It is set.

**Scenario B** (verify path string matches Dockerfile ENV) — MATCH confirmed:
- Dockerfile `ENV`: `/usr/bin/chromium`
- Code fallback: `/usr/bin/chromium`
- apt package `chromium` on Debian trixie: installs at `/usr/bin/chromium`

**Scenario C** (`chromium` vs `chromium-browser` binary name):
The Dockerfile installs the `chromium` package (not `chromium-browser`). On Debian, the `chromium` package places the binary at `/usr/bin/chromium`. There is no `chromium-browser` symlink involved. The name is consistent end-to-end.

**Verdict: Path config is correct. No production code change needed.**

The 114 consecutive CB failures prior to Sprint 1834b were caused by anti-bot detection (no stealth args, fixed viewport, unblocked analytics trackers), NOT by a missing/wrong executable path. Sprint 1834b addressed the root cause.

---

## Action Taken

Added AC-8 to `apps/mcp-server/src/__tests__/1834b-te-chromium-antibot.test.ts` to lock the `executablePath` invariant against future regressions:

```typescript
it("AC-8: executablePath equals Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'", () => {
  const config = buildChromiumLaunchConfig();
  const expected = Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium";
  expect(config.executablePath).toBe(expected);
});
```

**Test result:** 8 pass, 0 fail (7 pre-existing AC-1..7 + new AC-8).

---

## Definition of Done

- [x] Path config verified correct (no mismatch between fetcher, Dockerfile ENV, and installed binary)
- [x] No production code change required
- [x] AC-8 added and passing
- [x] Full 1834b test file: 8 pass, 0 fail
- [x] Task report written
