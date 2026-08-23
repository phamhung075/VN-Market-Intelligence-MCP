> Parent: [./main.md](./main.md)

# Tran Ngoc Bau — Phase 1 & 2: Audit MARKET Messages + Agent Notebooks

## Phase 1: Audit MARKET Messages

**Step 1a — MARKET plain-language check (file-proxy — PRIMARY method)**

`read_telegram_reports` has NO `channel` parameter — it silently ignores the argument and always returns the BUG-only `telegram_reports` backlog, regardless of value passed (confirmed c115, 2026-07-21, `F-TNB-READTELEGRAMREPORTS-CHANNEL-PARAM-NOOP`). MARKET dish content is not retrievable this way (chef's MARKET send never sets the internal `persist` param `get_unreviewed_market_messages` would need). **`read_telegram_reports` is NEVER called for MARKET content** — it is not the source for this check.

**Primary method:** read the file-proxy directly — `docs/agent-memory/notebooks/unified-agent.md` (chef's own cycle notes) + `docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT>.json` (per-slot RAW content) — extract the last 10 MARKET-dish message bodies from these.

**Degrade LOUD if absent (mandatory):** if the expected `unified-agent-synthesis-<DATE_VN>-<SLOT>.json` for the audit window's slot does not exist on disk, do not silently skip — log `"[tnb-audit] MARKET proxy file absent for slot={SLOT} date={DATE_VN} — cannot audit plain-language check this cycle"` and set `pipeline_degraded=true` for Phase 7 (this file WAS observed genuinely absent live, 2026-07-21 eod — a confirmed live case, not hypothetical).

For each MARKET message check:
- [ ] Vietnamese diacritics present (no mojibake, no missing marks)
- [ ] Message is plain Vietnamese prose — no inline citations (`#ID`, `price_anomaly_*`), no `[gap:]` markers, no metadata block
- [ ] Message is 3–6 sentences and comprehensible to a non-technical reader
- [ ] Ticker direction + delta % visible (not σ notation)
- [ ] No bullet-point ticker dumps (narrative only)

**Step 1b — WORK layer-walk audit (file-proxy — PRIMARY method)**

WORK-channel messages are explicitly "Not persisted (ephemeral status updates)" per `docs/agents/tools/list/send_telegram.md` — `read_telegram_reports` structurally CANNOT retrieve `[CHEF-DETAIL]` content, with or without a `channel` argument (confirmed c115, same root cause as Step 1a). **`read_telegram_reports` is NEVER called for WORK content** — it is not the source for this check.

**Primary method:** `docs/data/unified-agent-synthesis-<DATE_VN>-<SLOT>.json` (Step 6.5/7 RAW content) is the substitute source for every layer-walk check below — it carries the same per-dish detail the ephemeral `[CHEF-DETAIL]` WORK send would have, captured before that send ever fires.

**Degrade LOUD if absent (mandatory):** same rule as Step 1a — an absent synthesis file for a guaranteed slot in the audit window is a genuine coverage gap, not a skip condition; log and set `pipeline_degraded=true`.

For each `[CHEF-DETAIL]`-equivalent entry (one per dish — Morning / EOD / Evening), check:
- [ ] Message structure follows `docs/standards/alert-message-format.md`
- [ ] Confidence displayed as 0–1 decimal (not percentage, not raw integer)
- [ ] Regime caveat appended when required (TIGHTENING + bullish must have caveat)
- [ ] Ticker symbol valid (in watchlist or known VN stock)
- [ ] No duplicate messages (same ticker + same signal type within 2h)
- [ ] **Pillar coverage** — investment-thesis references ≥3 of {M2, COC, EPS, POL} per `tnb-methodology.md` Layer 4. Score logged for Phase 2.5.
- [ ] Causal-chain sentence from Step 6.5 present in paragraph 2
- [ ] Inline citations present in paragraph 2 (signal ID / source file / source_tier)
- [ ] TNB metadata footer present: "TNB layers walked", "Signal IDs consumed", "source_tier values cited"

**Step 2 — Cross-validate with live data**
For each MARKET alert about a specific ticker:
1. `get_market_snapshot()` → verify current price
2. Check if alert price diverges >5% from current → flag as STALE
3. If alert claims earnings beat/miss → `compare_financials(codes=[ticker])` to verify
4. If alert claims price anomaly → `get_price_history(code=ticker, days=5)` to verify sigma
5. If alert claims sector move → `get_sector_comparison(code=ticker)` to verify

Log: `"[Verify] [TICKER] claim={X} actual={Y} → MATCH|MISMATCH"`

**Step 2 Backstop — CLAIM-TRUTH GATE (flag MISMATCH via TNB emit path)**

→ skill: `.claude/skills/claim-truth-gate/SKILL.md`

After Step 2 verification loop, invoke the claim-truth-gate on each MARKET alert body as a final validation before reporting findings. Any narrative contradiction is flagged and logged for escalation.

Invoke (per each MARKET alert):
```
GATE_EXIT = skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <MARKET alert text>
  agent_id  = "tran-ngoc-bau"
  cache     = <live tool results from this audit cycle, or null>
```

**Exit-code handling:**
- `0` = PASS → alert body is coherent with live data; log and continue.
- `1` = FAIL — contradiction detected. Script emits `narrative_contradiction` signal to `po`. Log the mismatch:
  - `"[TNB-BACKSTOP] MISMATCH detected: [FAIL] dimension=... tool=... ticker=... claim='...' returned='...'"`
  - Append to audit report and Phase 2 findings.
- `2` = config-error → fail-loud: `send_telegram(channel="bug", message="[tran-ngoc-bau] claim-truth-gate CONFIG ERROR")` and EXIT.

**Signal:** Script fires `narrative_contradiction` on FAIL; TNB logs it in audit trail.

---

## Phase 2: Review Agent Notebooks

**Step 3 — Read agent notebooks**
```
Glob: docs/agent-memory/notebooks/*.md
```
For each agent notebook (check the latest appended cycle entry — today's date or most recent):
- Did agent extract REGIME at bootstrap? (check for "REGIME" keyword in log)
- Did agent apply regime thresholds? (check for threshold values)
- Did agent attach regime caveat to MARKET output?
- Did agent log signal outcomes?

Agents to audit: news-scout, market-watcher, alert-commander, bctc-analyst, digest-predict, qa-responder, unified-agent
<!-- SELF-CURE FIX-TNB-AUDITMARKET-STALE-AGENT-NAMES-2026-08-23 (tran-ngoc-bau, c132): "financial-analyst"
     and "report-analyzer" were merged into "bctc-analyst" by commit 3e90e27c6 (2026-05-29,
     "merge financial-analyst + report-analyzer → bctc-analyst (MERGE-OK-v2)") — neither notebook
     has existed since. This list has cited 2 defunct agent IDs for ~3 months, meaning bctc-analyst
     (the live agent producing bctc_signal_* business-context signals central to Layer 4/BIZCTX
     checks) was never on TNB's own Step 3 spot-check roster. Corrected to the live agent ID;
     no output-shape change (still 7 names, was 8 minus the merge). -->


**Step 4 — Validate agent flows**
For agents with quality issues found in Step 3:
1. Read their flow file: `docs/agents/{agent}/flow/cycle.md` or `main.md`
2. Check: does flow reference REGIME extraction?
3. Check: does flow apply regime-conditioned thresholds?
4. Check: does flow attach regime caveat?
5. If systematic gap (same error 3+ cycles in notebook history) → AUTO-CURE (Step 6 in report-cycle.md)
