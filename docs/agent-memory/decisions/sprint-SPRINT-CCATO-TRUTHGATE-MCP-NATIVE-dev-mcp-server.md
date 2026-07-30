# Decision Journal — Sprint SPRINT-CCATO-TRUTHGATE-MCP-NATIVE · dev-mcp-server

**Sprint goal:** Port the CCATO claim-truth-gate engine (`scripts/narrative-truth-gate.sh`) into a native `vn-market` MCP tool so the 5 no-Bash narrative cowork agents can run the mandatory pre-write gate without shell access.
**Agent:** dev-mcp-server
**Started:** 2026-07-30T19:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-30T19:00:00Z
**task-id:** CCATO-MCP-T1-DOMAIN-ENGINE
**what-done:** Ported `scanClaimCandidates`/`classifyVerdict`/`resolveLatestElapsedYoyPeriods` to `domain/services/narrativeTruthGate/*`, zero I/O; added `CCATO-MCP-T1-DOMAIN-ENGINE.test.ts` (28 tests incl. the §5.1 side-by-side parity AC against the real bash engine).
**what-considered:**
- Hand-derive expected candidates from reading the python script vs. actually running the existing bash/python engine (with its live network probe intercepted by a local stub) and diffing its real stdout against the new TS scanner — chose the live-engine diff: it's the literal §5.1 AC wording ("run BOTH... require an identical candidate set"), and R-1's regex-divergence risk can only be closed empirically, not by inspection.
- `classifyVerdict` accepting a T3-shaped `{raw,isError}` wrapper vs. accepting the raw `resp_obj`-like value the python script itself uses (incl. its `{_probe_error}` sentinel) — chose the latter: T1 has no dependency on T3 (not yet built), and this stays a byte-faithful port of script L251-278 rather than inventing a new contract T3 must then conform to.
**why-decision:** The parity harness (fixed-non-null stub gateway forcing every candidate to FAIL so `claim_text` prints) ran cleanly against `docs/social/fb-post-2026-06-30.md` on the first attempt — TS/python candidate sets were byte-identical (2/2), closing R-1 for this fixture without needing a regex rewrite.
**why-change:** No change from the architect brief's §3.2 file layout / §5.1 AC — this operationalizes both exactly as specified.
