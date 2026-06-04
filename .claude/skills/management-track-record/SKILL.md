---
name: management-track-record
description: >
  Management capability and integrity check (T-7, T-13 digital, T-14). Validates
  revenue-plan accuracy, ROE trend under CEO tenure, capital deployment, public record,
  and IR transparency. Invoke when governance score = YELLOW or four-factor-synthesis
  returns Scenario 2 or 3. Operationalises the TNB foundational philosophy on management.
---

## Management Track Record (SKILL-5)

**Source techniques:** T-7 (Trung + Báu), T-13 digital scuttlebutt (Trung + Báu), T-14 (Thành)
**Cap:** 120L | **Ref brief:** docs/architecture-briefs/2026-06-04-expert-rapid-analysis-skills.md § SKILL-5

**Trigger:** governance_score = YELLOW (SKILL-4) OR four-factor-synthesis scenario IN [2, 3]

### Step 1 — Revenue-plan accuracy (T-7)

```
call_tool(server="vn-market", tool="get_agm_plan", arguments={"ticker": "<ticker>"})
```

Returns AGM plan rev/PBT targets + actuals across reported years. Extract `revenue_target`, `revenue_actual` per year.

```
accuracy_score_yr = |actual_revenue - target_revenue| / target_revenue
PLAN-DRIFT flag if accuracy_score > 30% in 2+ of last 3 years
```

Revenue preferred over profit (Trung + Thành): revenue is harder to manipulate.
SOE caveat: sandbagged targets → beat by 200-300%; weight revenue accuracy for non-SOEs only.
Cyclical caveat: look for directional accuracy, not exact match.

### Step 2 — ROE trend under CEO tenure

Identify current CEO start date from public filings or `get_company_profile` officers[] (arg `code`).

```
roe_pre_tenure_avg  = avg(ROE, 3 years before CEO start)
roe_post_tenure_avg = avg(ROE, 3 years after CEO start, or all available)

roe_delta = roe_post_tenure_avg - roe_pre_tenure_avg
```

```
ROE-IMPROVEMENT signal if roe_delta ≥ +3 percentage points
ROE-DECLINE     flag   if roe_delta ≤ -3 percentage points (no signal below, flag concern)
```

Soccer coach analogy (Trung): did the team win rate change when coach changed? Improvement = capable CEO.

### Step 3 — Capital deployment check (T-7 steps 2-3)

From prospectus (IPO date) or fundraising announcements: compare stated earmark vs. BCTC actuals.

```
CAPITAL-MISDEPLOYMENT flag if:
  receivables inflated post-fundraise, OR
  suspended real-estate projects grew, OR
  cash parked in deposits > 12 months with no productive deployment stated
```

### Step 4 — Public record search (T-13 digital scuttlebutt)

Search terms (VN): `<founder_name> bị bắt | sai phạm | vi phạm | xử phạt`, `<company_name> bị phạt | vi phạm`

```
PUBLIC-RECORD-RISK flag if any legal proceedings, regulatory sanctions, or fraud convictions found
```

Guardrail: information input only — maintain independent judgment. No single source is definitive.

### Step 5 — IR transparency check (T-11)

```
IR-OPAQUE flag if:
  no quarterly IR reports published, OR
  IR frequency DECREASED after negative news (transparency regression)
  PNJ example: monthly → quarterly = regression signal
```

AGM quality check: direct answers to adverse questions = good governance; suppression = risk signal.

### Step 6 — Output

```json
{
  "ticker": "<ticker>",
  "plan_accuracy": {
    "years_assessed": <number>,
    "years_with_drift": <number>,
    "avg_deviation_pct": <number>
  },
  "roe_trend": {
    "pre_tenure_avg": <number>,
    "post_tenure_avg": <number>,
    "delta_pp": <number>,
    "signal": "ROE-IMPROVEMENT | ROE-DECLINE | NEUTRAL"
  },
  "capital_deployment_flag": "CAPITAL-MISDEPLOYMENT | CLEAN | UNKNOWN",
  "public_record_flag": "PUBLIC-RECORD-RISK | CLEAN | UNKNOWN",
  "ir_transparency": "IR-OPAQUE | TRANSPARENT | PARTIAL",
  "management_verdict": "RELIABLE | QUESTIONABLE | RED"
}
```

Verdict rules:
- `RED` if PUBLIC-RECORD-RISK OR CAPITAL-MISDEPLOYMENT + PLAN-DRIFT both present
- `QUESTIONABLE` if PLAN-DRIFT OR ROE-DECLINE OR IR-OPAQUE
- `RELIABLE` if no flags

### Usage in flow files

```
Step 5a: management-track-record (plan-accuracy check)
  skill: .claude/skills/management-track-record/SKILL.md
  invoke when: governance_score = YELLOW OR scenario IN [2, 3]
  pass management_verdict → four-factor-synthesis (refine Factor G from YELLOW to RED or GREEN)
  on RED → upgrade governance_score to RED → scenario becomes 4a
```
