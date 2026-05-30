# PO Notebook

## Cycle 2026-05-30T11:43Z — KICKOFF: BCTC-HUMAN-CONFIRM (user-requested sprint)

**New sprint.** User intent (verbatim): *"I need one other layer, manual fix, user can fix where đánh dấu cảnh báo (đỏ/vàng) for make bctc more correct for final confirmed."* = human-in-the-loop correction layer ON TOP of the just-shipped BCTC-AGENTIC-REFINE output. ADDITIVE — does NOT rebuild the refine pipeline (that's AR-FU-DETERMINISM, separate).

**Scope written to SPRINT_GOAL.md:** (1) review surface in `/api/bctc-inspect` listing every red/yellow flagged cell (OCR value, image value, page, label/context); (2) hand-correct per cell; (3) lock report "ĐÃ XÁC NHẬN"; (4) corrected figures flow back into `bctc_table_rows` via parser-with-overrides (keep parser as single point of correctness); (5) survival invariant — cron refine re-run (`0 9,14,20 UTC`) must NOT clobber human confirmation; (6) audit trail who/when/old→new.

**Grounding verified before scoping** (so BA/architect build on it, don't redo): refine output in `bctc_refined_units`; trust prefixes live IN the markdown; `refinedMarkdownParser.ts` maps red→0.2/yellow→0.4/none→1.0 into source_confidence+flag (THE single point of correctness — push corrections through it if possible); UI home = `bctc-inspector.html` + `bctcInspectHandler.ts` + `bctcInspectMdHandler.ts` (NOT Remix); tools #141-144 (`get_bctc_refined`/`get_bctc_pending_refine`/`push_bctc_refined_unit`/`finalize_bctc_refine`); `financial_reports.refine_status` exists — need a SEPARATE human-confirm dimension (architect decides, don't collapse).

**KEY DESIGN QUESTIONS handed to BA/architect (NOT decided by PO — chain decides, user non-technical):** persistence + audit of corrections; flow-back path (re-parse-with-overrides vs row patch); final-confirm lock semantics (block whole report vs only confirmed cells); cron survival precedence (confirmed cell pinned/immutable vs cron re-flags only unconfirmed). The survival invariant is the critical correctness bar.

**Docs:** SPRINT_GOAL.md overwritten (prior AR record archived in brief + TASKS closed-sprints block). TASKS.md → new sprint block + HC-BA task; closed sprints compressed to live-FU-only (72L, under 80 cap). Sprint umbrella lock `task:BCTC-HUMAN-CONFIRM` claimed (TTL 3600).

**NEXT dispatch:** ba | write `docs/REQ_BCTC-HUMAN-CONFIRM.md` from SPRINT_GOAL.md.

## Carry-over
- BCTC-HUMAN-CONFIRM zone `apps/mcp-server/` — viewer + new correction tool + parser overrides. Watch for zone-contention with AR-FU-DETERMINISM (same app) if that gets picked up concurrently.
- Non-negotiables live in SPRINT_GOAL.md § Non-negotiables — carry into EVERY handoff (additive-only, DV RED→GREEN same commit, direct market.db verify, Vietnamese copy, ops rebuild --no-cache).
- AR-FU-DETERMINISM (MED) + DPI FU-C/FU-MON + FF-DEAD (HIGH, vps-scripts/) all OPEN — see TASKS closed-sprints block.
- Scoped `git add <file>` ONLY — tree has MANY unrelated uncommitted files; NEVER `-A`.
- After BA spec returns → review via `po/review-ba-spec.md`. After QA done → `po/sprint-signoff.md`.
