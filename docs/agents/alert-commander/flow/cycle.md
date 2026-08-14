# Alert Commander — Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/alert-commander.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Firing Gate (mandatory — evaluate before any MARKET write)

This agent fires to MARKET ONLY when one of two event conditions is met per `docs/policies/alert-policy.md`:

| Event | Conditions required |
|---|---|
| **position-danger** | ALL THREE: `stopLossHit=true` + `singleDayDrop > 5%` + `newsSentiment < -0.5` |
| **watchlist-opportunity** | ALL FOUR: `kinhDichConfidence ≥ 70` + `kinhDichSignal=BUY` + `newsSentiment ≥ 0.3` + `agentSignalsMajority=BUY` |
| **CRITICAL always** | `verified_chain` OR `legal_risk` OR `crisis_velocity` — always fires regardless of above |

**If neither condition fires → EXIT silently. No MARKET write. No WORK cycle-header.** No cycle headers in any case — `no_cycle_headers: true`.

When firing: message ≤ 140 chars urgent format. Vietnamese with diacritics.

---

## Input
Bootstrap signals, price alerts, legal/crisis data, `docs/data/project-stats.json`

## Output
MARKET alert (only when firing condition met) | BUG on error | Silent exit when no condition fires

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| **Step 0-GW** — Gateway availability gate | 0-GW | Inline (FIRST — see below) |
| Bootstrap + Regime + Context + Legal/Crisis | 0, 0b, 1, 2 | `→ Run sub-flow: ./stage-bootstrap.md` |
| Signal Matrix + Price-Override + chain_catalyst | 3, 3b, 3c | `→ Run sub-flow: ./stage-signals.md` |
| **Firing gate** — evaluate position-danger + watchlist-opp rules. If neither → EXIT | — | (inline gate, no sub-flow) |
| MARKET dispatch + Verdict (4a, only when condition met) + Notebook (5, every cycle incl. silent exit — `memory.append_every_cycle: true` in `init.md`) | 4a, 5 | `→ Run sub-flow: ./stage-dispatch-log.md` |

---

## Step 0-GW — Gateway Availability Gate (FIRST STEP — runs before bootstrap)

**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with `alert-commander`. Run BEFORE bootstrap. On gateway dead: write signal file + BLOCKED notebook entry (APPEND-class, `stage-dispatch-log.md`) + EXIT. See skill for full protocol and explicit prohibitions.
