# BCTC Analyst — Main Dispatcher

Universal entry. BCTC Analyst has a single sub-flow (`cycle.md`); this dispatcher keeps the entry uniform with the rest of the team.

## Dispatch

Always → `docs/agents/bctc-analyst/flow/cycle.md`

## Steps

1. Read and execute `docs/agents/bctc-analyst/flow/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.

Extend the table here if new sub-flows are added (e.g. earnings-week deep dive).

---

## BCTC Citation Trust Protocol (cross-cutting — applies before citing any BCTC figure)

Before citing any BCTC figure in analysis or signals, call:
```
GET /api/bctc-eval/{report_id}   ← check schema_version field before parsing
```

Status semantics (consistent across all agent consumers):
- `overall_status = "red"` → DEMOTE citation. Prefix every cited figure with:
  `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]`
  where `giai đoạn N` is the lowest-numbered red stage from `stages[*].stage_no`. Do NOT hard-block analysis — imperfect signal is more honest than silence. Log which stages are red.
- `overall_status = "yellow"` → inline flag next to each cited number:
  `[độ tin cậy thấp]`
- `overall_status = "green"` → cite normally, no flag.

If endpoint unavailable (non-200) → cite normally and log `[BCTC-EVAL] endpoint unavailable for {report_id}`.

Note: All trust protocol messaging uses Vietnamese per `feedback_market_report_plain_vietnamese` policy.
