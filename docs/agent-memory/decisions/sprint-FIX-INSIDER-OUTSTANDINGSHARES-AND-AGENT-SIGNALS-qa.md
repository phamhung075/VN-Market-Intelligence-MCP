<!-- size-justification: 40L — dual-task QA verdict journal; compact per flow. -->

# Decision Journal — QA cycle-300 (2026-06-19)

**task-id:** FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC + FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT

## Entry 1 — FIX-INSIDER-OUTSTANDINGSHARES-SCHEMA-DOC (commit e4905b49)

- **what-considered:** schema optionality (outstandingShares? interface + z.number().optional()); handler ?? 0 default; description text; 3 new tests (code-only no crash, honest no-signal, mass_insider_buy sans shares); doc Required→No Default=0 no auto-fetch claim; DDD (no infra imports in leadershipTools.ts); security (no process.env, no secrets, no hardcoded creds); mock-guard exit 0.
- **checks-run:** bun test 251-mcp-tools.test.ts → 16 pass / 0 fail; pnpm check exit 0; DDD PASS; security PASS; mock-guard PASS.
- **why-change:** no change from plan — all checks green.
- **verdict:** APPROVED

## Entry 2 — FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT (commit 8a6b798c)

- **what-considered:** schema z.string().optional() live at L461-463; Path-C guard at L527 (from_agent undefined && !agent → user-readable error, no DB query); args.agent ?? "" guard at L535/543; 5 ACs: AC-1 inbox-no-agent error, AC-2 sender-history no-agent signals, AC-3 all-producers no-agent, AC-4 backward-compat inbox+agent, AC-5 Zod safeParse × 4 shapes; doc==schema (get_agent_signals.md Required→Conditional, news-scout.md, alert-commander.md, tran-ngoc-bau.md all updated); DDD: infra imports in agentSignalTools.ts are pre-existing (sprint-038 feat commit 70736fb3, not introduced by this fix); security PASS; mock-guard exit 0.
- **checks-run:** bun test FIX-AGENT-SIGNALS-AGENT-PARAM-CONTRACT.test.ts → 5 pass / 0 fail; pnpm check exit 0; DDD pre-existing (not introduced); security PASS; mock-guard PASS.
- **why-change:** no change from plan — all checks green. DDD pattern is pre-existing and consistent with entire agentSignalTools.ts file which predates this fix by many sprints.
- **verdict:** APPROVED
