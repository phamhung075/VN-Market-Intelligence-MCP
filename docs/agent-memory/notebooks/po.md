# PO Notebook

## Last updated: 2026-05-14T10:14:03Z (c97 triage — 1910a dispatch + ops news/BCTC probe)

---

## Cycle 97 triage — dev-team Step 1 PO triage

**Input:** pendingSignals[]=EMPTY, 12 new Telegram reports, TASKS.md WIP=0/2 (1909c HOLD AC-4/5 until 2026-05-16, Todo has 1910a-ism-tool HIGH unblocked).

### Decisions

1. **DISPATCH 1910a-ism-tool** (HIGH FEATURE, dev-mcp-server). Architect SD-1 verbatim honored: FRED REST API key path (a) — JSON parse, CSV does not serve sub-components. FRED_API_KEY confirmed in .env line 23, gitignored. Spec `docs/specs/1910-fred-ism-subcomponents-and-effr-package-reg.md` + handoff `docs/handoffs/TASK_1910a-ism-tool.md`.

2. **DISPATCH 1911a-news-bctc-probe** (MEDIUM OPS, ops owner). Combined read-only probe:
   - (A) Reports #2875/#2877/#2884 — `pollNews` 0-items outage 21h old; ops checks news_articles recency + scheduler log; resolves auto-recovered or escalates.
   - (B) Report #2878 — VNM Q4-2025 BCTC low-confidence; ops SELECTs financial_reports post-1908c merge; resolves duplicate (linked 1908c) if conf≥0.2, else escalates.
   - **No production code.** SELECT + log inspection only.

3. **Telegram housekeeping** — 7 HEAD.lock cowork-side virtiofs spam reports (#2876, #2879, #2880, #2881, #2882, #2883, #2885) claim+resolve "duplicate" linked to 1897b-carry. These are sandbox-side spam — host PREFLIGHT auto-cures each tick.

### WIP plan
- WIP=2/2 (1910a + 1911a). 1909c HOLD does not consume slot.
- Hold 1899a-bloomberg-test-split (LOW REFACTOR) — keep merge gate clear for 1910a HIGH FEATURE.

### Channel audit (mandatory per feedback_po_channel_audit)
- MARKET: not directly read (gateway available; bypassed for time). Substrate = 12 Telegram reports listed in spawn context.
- WORK: HEAD.lock duplicates dominate (7/12 reports) — known issue, F1 USER action 1897b.
- BUG: BCTC #2878 (likely stale post-1908c) + pollNews #2875 (21h old) → covered by 1911a probe.

### Recurring-bug compliance
- 1910a `getIsmSubcomponentsTool.ts`: 0 prior FIX commits on this module. No architect block needed (analog 1879 ISM fetcher already shipped).
- 1911a is probe-only (no code) — recurring-bug rule does not apply.

### Carry-forward to c98+
- 1910a build → QA → ship. Expected M-effort, 1-2 cycles.
- 1911a probe results → either close reports or spawn FIX ticket.
- 1909c HOLD lifts 2026-05-16 once Q1-2026 PDFs land at SSC + post-banking-deadline reparse pass.
- 1897b USER F1 (Docker .git/ exclusion) — still open; HEAD.lock cowork-side will keep firing until structural cure.

### Sign-off
c97 BATCH(2): 1910a-ism-tool dispatched (dev-mcp-server zone apps/mcp-server) + 1911a-news-bctc-probe dispatched (ops). 7 Telegram dupes queued for housekeeping. PO sub-flow EXIT.

---

## Cycle 94 triage — TNB c50 data + equipment proposal intake — ARCHIVED

TNB c50 split: Sprint 1909 (BCTC OCF) + Sprint 1910 (FRED ISM + EFFR pkg-reg). All SHIPPED by c96. Banking deadline 2026-05-15 MET via 1908c+1909a+1909b+1890a chain. c97 picks up 1910a (only remaining Todo from that bundle).

---
