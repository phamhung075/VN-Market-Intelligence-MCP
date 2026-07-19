# PO Notebook

_Last: 2026-07-19T20:31Z (TNB-c114 chef-persist — root-caused to write-AUTHORIZATION cascade gap; review row rejected; ZERO mints)_

## Tick 2026-07-19T20:31Z — chef evening synthesis JSON absent (TNB c114)

TNB c114 reported chef-evening's synthesis JSON "stale / never updated", read it as a worse
manifestation of `F-INTRADAY-SYNTHESIS-STALE-MULTIFIRE`, and asked to broaden the L6 row to
"trace Step 7.6 write reliability". **Ran fully gateway-blind (file-proxy), so I re-verified
everything. Finding CONFIRMED, framing WRONG, recommendation NOT adopted.**

**RAW-verified:** chef-evening fired 19:50:29Z (`cowork-schedule.json .last_fired`), published to
MARKET, wrote NO synthesis JSON — zero files in `docs/data/` carry a 07-19 mtime.

**TNB's framing error:** Step 7.6 writes a NEW date-scoped file per cycle; it never updates a prior
one. `…-2026-07-19-evening.json` legitimately belongs to the **07-18** run (`timestamp_utc=2026-07-18T19:45:00Z`,
mtime 07-18 19:51Z). Today's expected path was `…-2026-07-20-evening.json` (CYCLE_DATE=VN date) —
ABSENT. **Total write absence, not stale overwrite.** TNB's 07-20 glob carried the finding; the
cycle_id comparison was a red herring.

**ROOT CAUSE — un-cascaded capability change, NOT a write bug.** `.claude/agents/unified-agent.md`
L5 **grants** `Write`; L4 (description, 2026-05-19 `807680935`) says *"Writes only to
…/unified-agent.md … No other filesystem writes permitted."* Step 7.6 landed 2026-07-10 (`7320e4f50`)
instructing `Write(docs/data/unified-agent-synthesis-*.json)` without cascading that boundary;
`init.md` declares no `docs/data/` allowlist. Worker is `model: haiku` ⇒ self-contradictory system
prompt resolves **non-deterministically** — uniquely explains the c111–c114 intermittency that 2
auto-cures failed to converge. Tell: agent self-reported in **permission** language
("JSON output attempted (tool limitation)") while its MCP publish path worked the same cycle.

### Disposition (conservation-neutral 546→546, Zod PASS, CAS clean)
- `GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST` (the row that SHIPPED Step 7.6; sat in `review[]` gated on
  live-cycle-verification since 07-11, never signed off) **REVIEW→BACKLOG, P1, next=agent-father**
  with the cascade ACs. Rejecting an unmet review row ≠ minting a new one.
- `FIX-CHEF-L6-TOKEN-PERSISTENCE-RECURRING` → **BLOCKED**, `depends_on` the above. Its isolation
  question is partly answered: on some cycles the persist step never runs, so an L6 absence in a
  persisted JSON cannot be blamed on narrative-gen yet.
- `FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING` (P1) annotated — already covers "chef synthesis:
  date_vn+dish_type", so no mint.
- ACK appended to `docs/handoffs/tnb-audit-latest.md` incl. audit-method correction.

## Carry-over
- **agent-father COORDINATION (do not duplicate):** live pass on `.claude/agents/tran-ngoc-bau.md`
  is a genuinely **MISSING** `tools:` grant (no `mcp__gateway__call_tool`). unified-agent is
  **present-but-forbidden**. Same owner, different mechanism — fold, and do NOT assume one fix covers both.
- **DO NOT flip GAP-CHEF-SYNTHESIS-A DONE_VERIFIED on one good cycle** — defect is intermittent;
  require 3 consecutive dishes with non-empty `conviction_calls[]`+`sector_phases[]`.
- **Audit-plane distrust (STANDING):** notebook `Synthesis: <path>` is NOT a persistence receipt —
  07-17 14:13Z cited a path belonging to the 04:13Z run. Verify by mtime, never by citation.
  Filename convention also inconsistent (07-17=UTC date, 07-18=VN date, 07-14 left 2 files 25s apart).
- **NEXT-TICK TRIPWIRE (STANDING, 07-19 08:24Z):** escalate A-30 to ops ONLY if GC ceiling lost —
  baseline >~93% no-dip, OR peak sustained >97% no-reclaim, OR OOMKilled=true.
- **TRIPWIRE (07-18):** once FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS deploys, further
  OHLCV-BACKFILL report = genuine regression → escalate.
- Session bfa71244-a29a-4d41-872a-c69d5a033043 (po triage). Commit MY scoped paths only; do NOT push.
