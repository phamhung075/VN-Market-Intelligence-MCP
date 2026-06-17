# Handoff: FIX-FB-POST-DATA-INTEGRITY-GATE

**Role:** Developer
**Date:** 2026-06-17
**Task ID:** FIX-FB-POST-DATA-INTEGRITY-GATE
**Status after this handoff:** REVIEW

---

## [Developer] Implementation Record

### What was built

`scripts/fb-data-integrity-gate.sh` — a reusable plausibility gate that validates a
FB post file against live market reality before relay.

### Files modified

- `scripts/fb-data-integrity-gate.sh` — NEW, 175L executable shell gate
- `docs/policies/dev-standards.md` — Script Persistence section: added CANONICAL pointer for the gate (+8L)
- `docs/data/orch/orch-state.json` — task moved READY → REVIEW

### Files NOT modified (already done by sibling task FIX-FB-POSTER-FABRICATES-STALE-EOD)

- `docs/agents/fb-market-poster/flow/main.md` — STEP 4b already references `scripts/fb-data-integrity-gate.sh` with the correct execution sequence
- `docs/agents/fb-market-poster/init.md` — anti-fabrication rules already in place

---

## Gate design

### Gateway access pattern (DoD §1)

No shell-level MCP gateway access exists (the MCP gateway is a Claude/agent protocol,
not a REST API). The gate fetches live data via the mcp-server REST endpoint that already
serves intraday prices to the frontend:

```
GET http://localhost:3000/mcp/api/prices/batch?tickers=VNINDEX,VIC,VHM,...
→ { "quotes": { "VIC": { "ticker":"VIC", "close":..., "changePct":..., ... }, ... } }
```

This is consistent with how the frontend uses the same endpoint (`/mcp/api/prices/batch`)
for watchlist tiles — no new transport invented. If the API is unavailable (curl timeout 8s),
the gate logs a warning and exits 0 (soft skip, not hard fail on infrastructure error).
An optional third argument `$3` accepts a pre-fetched snapshot JSON file so the poster can
eliminate the network dependency in headless/offline contexts.

### Checks implemented

| Check | Description | Trigger |
|---|---|---|
| A | Per-ticker HOSE move `> ±7%` in post | `[BLOCK]` — daily price limit violation |
| B | Per-ticker `\|post_pct − live_pct\| > 1.0pp` | `[BLOCK]` — fabrication vs live reality |
| C | Affirmative selloff/bán-tháo language when VN-Index mild (`< ±2%`) + post claims 0 floor stocks | `[BLOCK]` — narrative contradiction |
| D1 | VN-Index level: `\|post_level − live_close\| > 5pts` | `[BLOCK]` — index level mismatch |
| D2 | VN-Index `%`: `\|post_pct − live_pct\| > 0.5pp` | `[BLOCK]` — index pct mismatch |

Check C uses negation filtering to avoid false positives on phrases like "không phải bán tháo"
(which is a denial, not a claim of a selloff). Only affirmative selloff lines are counted.

### Exit discipline (DoD §3)

The gate **always exits non-zero on BLOCK** — the `feedback_fb_poster_gate_false_green` trap
(where `fb-jargon-gate.sh` printed `[BLOCK]` but exited 0) is avoided. Structure:
- `exit 0` only when `$VIOLATIONS -eq 0`
- `exit 1` when any violation found
- `exit 2` on usage/file error

`[PASS]` and `[BLOCK]` are mutually exclusive stdout lines.

---

## Self-verify results (DoD §5)

### Test 1: Clean post (PASS expected)

```
$ bash scripts/fb-data-integrity-gate.sh docs/social/fb-post-2026-06-17.md 2026-06-17
[INFO] fb-data-integrity-gate: live snapshot fetched from http://localhost:3000/mcp/api/prices/batch
[PASS] fb-data-integrity-gate: 0 violations
EXIT: 0
```

### Test 2: Injected VRE −9,4% fabrication (BLOCK expected)

```
$ # VRE) giảm 1,75%  →  VRE) giảm 9,4%  injected into temp copy
$ bash scripts/fb-data-integrity-gate.sh /tmp/test-post.md 2026-06-17
[INFO] fb-data-integrity-gate: live snapshot fetched from http://localhost:3000/mcp/api/prices/batch
[BLOCK] Check-A HOSE-price-limit: VRE post=-9.4% exceeds ±7.0% daily limit — FABRICATION SIGNAL
[BLOCK] Check-B live-delta: VRE post=-9.4% live=-1.75% delta=7.65pp > 1.0pp tolerance
[BLOCK] fb-data-integrity-gate: 2 violation(s) — fix ALL before STEP 5 write
EXIT: 1
```

Both checks fire simultaneously: Check-A catches the physical impossibility; Check-B catches
the live-vs-post divergence. This matches the original fabrication evidence (VRE −9.4% vs
live −1.75% on 2026-06-17).

---

## Docs updated

- `docs/policies/dev-standards.md` — § Script Persistence — CANONICAL pointer added
- `docs/agents/fb-market-poster/flow/main.md` — STEP 4b already in place (sibling task)
- This handoff file

---

## tsc status

Not applicable — pure shell script (bash), no TypeScript compiled.

---

## Git commits

See commit record below.

---

## Verification gate (for QA)

1. Run gate against a clean post: `bash scripts/fb-data-integrity-gate.sh docs/social/fb-post-2026-06-17.md 2026-06-17` → must print `[PASS]` and exit 0.
2. Inject a HOSE-limit violation: sed-replace any ticker pct with a value beyond ±7% → must print `[BLOCK] Check-A` and exit 1.
3. Inject a live-delta violation: change VRE's pct in the post to diverge from live by >1pp → must print `[BLOCK] Check-B` and exit 1.
4. Confirm exit is non-zero on BLOCK (run `echo $?` after gate; must NOT be 0).
5. Confirm `docs/policies/dev-standards.md` § Script Persistence contains the CANONICAL pointer.

---

## Next agent

**QA** — verify the gate script: run the three self-verify checks above + confirm dev-standards pointer. No container rebuild required (shell script only).
