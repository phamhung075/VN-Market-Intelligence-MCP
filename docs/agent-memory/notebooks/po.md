# PO Notebook

## c266 · 2026-05-23 — Phase 2 of Go pilot OPEN (technical-analysis)

### Trigger
User direct prompt: Phase 1 closed at QA verdict PASS (commit `9564f6ee`). Phase 2 kickoff request with 6 remaining goals (G4, G5, G9, G10, G11, G12), deadline 2026-07-03.

### Authored
1. **Skeleton plan** — `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md`. Mirrors Phase 1 structure. 6 buckets P2-A..P2-F. Architect to expand into atomic per-task specs; PM to atomize into handoffs.
2. **G9 decision doc** — `docs/po-decisions/2026-05-23-g9-user-confirmation.md`. Async mechanism via Telegram WORK (MARKET write forbidden by PO permissions). Send DEFERRED — vn-market MCP not loaded in this kickoff session (`.mcp.json` warning: `command: undefined`). Template queued.
3. **pilot-status.json updated** — `status: PHASE-2`, `phase: 2`. `phase1.status: ARCHIVED` with closure metadata. New `phase2` block with 6 buckets, owners, blockers, next-task-for-router routing to architect.
4. **Architect dispatch signal** — `docs/signals/po-20260522T220634Z.json`. Payload: full Phase 2 brief pointer + 6 bucket summary + constraints (security clause, scope-creep, NO BRANCHES, token economy, atomic commit format).

### Bucket plan
- **P2-A (G4)** fence: Go linter pick (go-arch-lint / golangci-lint depguard / custom). Three rules: Fence-A primitive ↛ module/app/interface, Fence-B module ↛ application/interface, Fence-C no New*Repo outside cmd/server/main.go. QA proves with 1 deliberate violation → CI red.
- **P2-B (G5)** delete old TS TA code in `apps/mcp-server/src/.../technical*`. Brownfield scan FIRST. Rollback tag before delete. Highest-risk Phase 2 task.
- **P2-C (G9)** PO-owned async. Notification queued (MCP send block).
- **P2-D (G10)** AI-fix proof ≤2 cycles. Depends on P0-1 bug-inventory.json (architect verify status).
- **P2-E (G11)** regression alarm — scenario pair (primary + canary sharing input shape). Gates on P2-F.
- **P2-F (G12)** flow rule for dev-technical-analysis DoD = sandbox green. Architect briefs → agent-father implements (NEVER direct agent .md edit per agent-md-factory rule). Streak 1/3 → close at 3.

### G9 strategy verdict
**Async WORK + signal, no meeting.** Rationale: user is non-technical / France-tz GMT+1 / market GMT+7; `feedback_po_autonomy.md` says user is config admin only; charter wording "verbally confirmed" is interpretable as direct user statement (typed reply counts); dashboard is already async-friendly (file:// URL, no source-code exposure); async is reversible. Send DEFERRED because MCP gateway lost vn-market — next PO cycle picks up the queued template.

### Decisions made
- Phase 2 dev work does NOT block on G9 (parallel async track).
- P2-F architect→agent-father chain locked (not direct edit).
- P0-1 bug-inventory.json status check pushed to architect at P2-D expansion.
- WORK not MARKET for the G9 ask (PO permissions: `channels.market.write: false`).

### Constraints honored
- Token economy active.
- Stay on `main` (NO BRANCHES).
- Atomic commit `chore(pilot): Phase 2 kickoff by PO`.
- Verbatim user problem + security clause preserved in Phase 2 plan.

### Carry-over
- Next PO cycle (when MCP up): fire `send_telegram(channel="work", message=<G9 ask>)` per decision doc §MCP send block.
- Architect picks up signal `po-20260522T220634Z.json` to expand Phase 2 plan.
- PM downstream from architect: handoff files + TASKS.md Backlog update.
- Deadline budget: ~5 sprints slack on 2026-07-03 (Phase 1 = 1 sprint consumed).
- G12 streak = 1/3. P2-D + P2-E fix-work will accrue tasks #2 + #3 once flow rule lands.

### Lessons
- **L76 (NEW c266)**: When PO permissions block a channel (`market.write: false`) but the goal text says "user verbal confirm", route via the next-allowed channel (WORK) — the user reads all 3, and WORK is correct semantically (sprint-status event). Don't try to send to MARKET and don't escalate as blocked — just pick the right channel.
- **L75/L74/L73/L72/L70 retained from c265** (sprint-1974 context — unrelated to pilot; carry-over for next non-pilot cycle).
