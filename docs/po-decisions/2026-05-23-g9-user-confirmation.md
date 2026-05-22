---
title: "G9 User-Verbal-Confirmation Gate — Strategy & Tracking"
date: "2026-05-23"
author: "po"
status: "OPEN — awaiting user reply"
pilot: "technical-analysis"
goal: "G9"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
phase2_plan: "docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md"
---

# G9 — Dashboard-Trust-Contract User Confirmation Gate

## Charter requirement (verbatim)

> "G9. Dashboard is the trust contract — User verifies 'RSI working correctly' from dashboard alone. Confirmed verbally by user at pilot review."

> "Verification method: At pilot review meeting, user is shown only the dashboard (no TypeScript, no test output, no terminal). User is asked: 'Can you tell from this dashboard whether RSI is working correctly?' User answers YES. User can point to the specific card / story that shows it. This goal is confirmed by PO recording user's verbal confirmation in the pilot review summary."

## PO decision — Async, not synchronous

**Mechanism chosen:** Telegram **WORK** channel notification (PO is forbidden from writing MARKET per agent permissions: `channels.market.write: false`) + signal-file inbox. PO does NOT schedule a synchronous meeting.

User reads all three Telegram channels (MARKET / WORK / BUG). WORK is the legitimate PO-authored channel for sprint status notifications, and the G9 gate is a sprint-status event ("Phase 2 of pilot opening, user verbal gate now open").

### Rationale

1. **User constraints.** User is non-technical, lives in France (GMT+1), monitors Vietnam market (GMT+7). Synchronous meeting requires off-hours for either party.
2. **User trust posture per `feedback_po_autonomy.md`.** User is config-admin only, trusts PO to improve product. PO should not interrupt user with meeting requests when async confirm is enough.
3. **Charter wording allows async.** "Verbally confirmed" is interpretable as direct user statement (typed reply counts). Charter does not mandate a meeting format.
4. **Dashboard is already async-friendly.** Per G6 spec it opens at `file://` URL, no server, three plain-language panels. The user can open it on their own time.
5. **Async is reversible.** Failed YES → triage rejection reason into a dashboard polish task. A failed sync meeting is harder to recover from.

## Notification text (PO sends via Telegram WORK)

```
[po] Phase 2 of TA pilot opening. Dashboard ready for trust verification.

Please open this file in any browser (no server needed):
  apps/technical-analysis/dashboard/index.html

You will see three panels: Primitives / Module / Microservice.
Click any RSI card to see the input → output story.

Then reply YES or NO to:

  "Can you tell from this dashboard whether RSI is working correctly,
  without reading any code?"

YES → G9 closes. Phase 2 continues.
NO → tell me what was confusing; I'll loop a dashboard-polish task.

No deadline. Phase 2 dev work proceeds in parallel — G9 does not block.
```

## Tracking

| Event | Status | Timestamp |
|---|---|---|
| PO notification sent (Telegram WORK) | DEFERRED (vn-market MCP not loaded in current PO session — `.mcp.json` shows `command: undefined` warning) | (deferred — see below) |
| Signal file dropped | PENDING | (set on commit) |
| User reply received | PENDING | — |
| `pilot-status.json` G9 updated | PENDING | — |

## On YES response — PO action checklist

1. Append reply timestamp + verbatim text to this file under "## User Reply".
2. Update `pilot-status.json.goals[G9]`:
   - `status: "YES"`
   - `verifiedAt: <ISO timestamp of user reply>`
   - `verifiedBy: "po (user verbal async confirmation, see 2026-05-23-g9-user-confirmation.md)"`
   - Append evidence pointer.
3. Commit: `chore(pilot-status): G9 YES — user verbal async confirmation recorded`
4. Run `/graphify docs --update --no-viz`.
5. Notify Phase 2 main flow.

## On NO response — PO action checklist

1. Append reply timestamp + verbatim text to this file under "## User Reply".
2. Append rejection reason interpretation.
3. Create dashboard-polish FIX task in `docs/TASKS.md` Backlog (zone: `apps/technical-analysis/dashboard/`).
4. Notify dev-frontend or dev-technical-analysis for re-loop.
5. Do NOT update `pilot-status.json.goals[G9]` to NO unless user explicitly says "this approach won't work, give up". Otherwise keep IN-PROGRESS.

## User Reply

_(pending — notification not yet sent; see "MCP send block" below)_

## MCP send block (PO kickoff session)

During PO Phase 2 kickoff (2026-05-23), the vn-market MCP server (`send_telegram` tool host) is not loaded in the session — `claude mcp list` reports `[Warning] [vn-market] mcpServers.vn-market: Skipped — invalid MCP server config for "vn-market": command: expected string, received undefined`.

This means PO could not fire `send_telegram(channel="work", message=<G9 ask>)` in this session. The notification is **deferred** to the next PO cycle that has a working vn-market MCP connection. Per `fail-loud-protocol.md` PO does not investigate the MCP config — that's ops's job.

**Action queued for next PO cycle (when MCP is up):**

```
call_tool(
  server="vn-market",
  tool="send_telegram",
  arguments={
    "channel": "work",
    "message": "[po] Phase 2 of TA pilot OPEN. Dashboard ready for trust verification.\n\nOpen this file in any browser (no server needed):\n  apps/technical-analysis/dashboard/index.html\n\nThree panels: Primitives / Module / Microservice. Click any RSI card.\n\nReply YES or NO to: 'Can you tell from this dashboard whether RSI is working correctly, without reading code?'\n\nNo deadline. Phase 2 dev work proceeds in parallel."
  }
)
```

Until that fires, the signal file `docs/signals/po-20260522T220634Z.json` is the only audit trace of the G9 strategy decision. The signal file is preserved on `main` so the next PO cycle picks up the queued send.

A short-circuit alternative: user (who reads this commit) can self-trigger by opening `apps/technical-analysis/dashboard/index.html` and replying directly — that satisfies the charter §G9 verification method either way ("user verbal YES").

## Decision Matrix Implication

If user reply > 2 weeks (i.e., > 2026-06-06) and other Phase 2 goals all reach terminal state, PO will:
- Either nudge the user one more time via Telegram MARKET, or
- Call the decision matrix on the remaining 11 goals; if 2-YES branch is hit on the other goals, accept charter §Decision Matrix "re-scope" outcome; if 3-YES is forced by counting G9 IN-PROGRESS as "not NO", proceed cautiously to next microservice scoping.

No silent timeout. PO logs the call explicitly in the eventual pilot-review summary.
