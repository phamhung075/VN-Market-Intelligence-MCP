# Skill: fb-jargon-gate

## Purpose
Deterministic pre-publish gate for fb-market-poster. Runs the jargon/typo/hexagram/calendar
check script and returns pasted output to the calling flow.

## Invocation (called from STEP 4a of fb-market-poster/flow/main.md)

1. Write the composed post body to a temp file:
   ```bash
   TMPFILE=$(mktemp /tmp/fb-post-gate-XXXXXX.txt)
   printf '%s' "$POST_BODY" > "$TMPFILE"
   ```
2. Run the gate (POST_DATE = YYYY-MM-DD of the post, enables weekday check):
   ```bash
   bash scripts/fb-jargon-gate.sh "$TMPFILE" "$POST_DATE"
   GATE_EXIT=$?
   ```
   Capture full stdout+stderr. Note exit code.
3. Delete temp file: `rm -f "$TMPFILE"`
4. If GATE_EXIT != 0: HARD-FAIL — block STEP 5 write entirely. Fix every [FAIL] line
   in the post body. Re-invoke this skill from scratch (new tmpfile, new gate run).
   Proceed to STEP 5 ONLY when gate exits 0.
   If violations cannot be resolved after one fix round:
   `send_telegram(channel="bug", message="[fb-market-poster] JARGON GATE: unresolvable violations — post NOT written")`
   then EXIT cycle.
5. Paste the full gate stdout into STEP 8 cycle report under "JARGON GATE:".
   A green claim without pasted output is NOT acceptable (feedback_router_verify_raw_not_badges).

## SSOT
Forbidden token set lives exclusively in `scripts/fb-jargon-gate.sh`.
Do NOT re-list tokens in the flow or here — that recreates the drift/false-green problem.

## Smoke-test (run once per gate change to prove non-false-green)
```bash
# Test A — must exit 1 (gate fires)
printf 'VN-Index tăng nhờ sentiment tích cực.\n' > /tmp/smoke-a.txt
bash scripts/fb-jargon-gate.sh /tmp/smoke-a.txt; echo "exit:$?"

# Test B — must exit 0 (clean post)
bash scripts/fb-jargon-gate.sh docs/social/fb-post-2026-06-01.md; echo "exit:$?"

# Test C — must exit 0 (không does not trigger hexagram anchor)
printf 'Thị trường không có tín hiệu rõ ràng hôm nay.\n' > /tmp/smoke-c.txt
bash scripts/fb-jargon-gate.sh /tmp/smoke-c.txt; echo "exit:$?"
```
