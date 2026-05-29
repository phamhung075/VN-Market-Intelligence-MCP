# BCTC Analyst — Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/bctc-analyst.md`
**Methodology:** `docs/standards/tnb-methodology.md` §Layer-7 §Layer-8

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap (market context 24h, earnings calendar, stored PDFs) | Mode selection via calendar gate

## Output
`bctc_signal_*.json` + `fundamental_validation` signals on bus | WORK status | BCTC deadline flags
`docs/analysis-briefs/{TICKER}.md` ledger append — release mode only

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| **E2 Market-hours guard** | E2 | Inline (FIRST — see below) |
| Bootstrap + Regime | 0, 0b | `→ Run sub-flow: ./stage-bootstrap.md` |
| Calendar gate + Mode | 0c | Inline (mandatory — see below) |
| BCTC + Analyze + Chain validation | 1–4b | `→ Run sub-flow: ./stage-analyze.md` |
| Notebook + WORK + Deadline Watch | 5, 5b | `→ Run sub-flow: ./stage-log-notify.md` |

---

## Step E2 — Market Hours Guard (FIRST STEP — runs before bootstrap)

```
now_utc = current UTC time (hour + minute)
market_window_start = 02:00 UTC   # 09:00 ICT VN market open
market_window_end   = 08:00 UTC   # 15:00 ICT VN market close

IF now_utc >= market_window_start AND now_utc < market_window_end:
  LOG: "Cycle deferred — VN market window active (HH:MM UTC). Next slot: {next_scheduled_slot}"
  Append to notebook: "deferred — market window active at HH:MM UTC"
  EXIT cycle (gracefully — no error, no BUG alert)

→ Proceed to Step 0 (bootstrap) only if guard passes.
```

**In-flight completion rule:** If a pass block has ALREADY STARTED when the agent detects it has crossed into the market window (e.g., long consolidation runs past 02:00 UTC), the currently-running pass MUST complete. Defer remaining passes to the next scheduled slot. Notebook entry: `status=partial, deferred_passes=[list]`.

**Defense-in-depth:** Cron `0 15,18,21,0 * * *` keeps all trigger times outside the market window. This guard is the second line of defense against schedule drift or manual invocations.

---

## Step 0c — Calendar Gate + Mode Selection (MANDATORY, runs every cycle)

Run AFTER stage-bootstrap.md (regime variables set) and BEFORE stage-analyze.md.

```
call get_earnings_calendar()

IF calendar returns tickers with status == "ĐÃ NỘP" that were NOT processed in the previous cycle
  (check notebook last-cycle processed list):
    RELEASE_TICKERS = [newly filed tickers from watchlist only]
    MODE_RELEASE = true
ELSE:
    RELEASE_TICKERS = []
    MODE_RELEASE = false

ROUTINE_TICKERS = get_watchlist() [full watchlist, always populated]
```

**Sequencing rule for mixed cycles:**
- If MODE_RELEASE == true AND ROUTINE_TICKERS non-empty:
  - Process RELEASE_TICKERS first (time-sensitive → stage-analyze.md release branch)
  - Then process ROUTINE_TICKERS (stage-analyze.md routine branch)
  - Each ticker's signal carries its own `mode` field
- If MODE_RELEASE == false:
  - Process ROUTINE_TICKERS only (stage-analyze.md routine branch)

Set session variable `CYCLE_MODE`:
- `release` — only release tickers, no new routine filings
- `routine` — only routine analysis
- `mixed` — both release and routine in same cycle (release processed first)
