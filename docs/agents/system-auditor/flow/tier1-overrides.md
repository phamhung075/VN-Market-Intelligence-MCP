<!-- lazy-loaded by tier1-probe.md's Health Endpoints section (bullet 3) —
     read ONLY when PROBE_OUT shows a transport-classified A-12 FAIL
     (CLIENT_TIMEOUT/CONN_REFUSED/DNS_FAIL/EMPTY_REPLY/CURL_ERR_n); never
     read on an OK or real-HTTP-FAIL cycle. size-justification: this is the
     extraction tier1-probe.md's own header note (2026-06-08/2026-07-23)
     already named as the documented fallback once that file crossed
     ~220L — FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE (2026-07-30) is
     the first addition to trigger it and is this file's sole content. -->
# Tier-1 Overrides — A-12 N-Consecutive Transport-Error Debounce

**FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE A3** — the N-consecutive
debounce deferred from the DONE `FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE`
wrapper's own scope item 2. Ships ONLY together with `probe.sh`'s A1
(`--max-time` 3s→5s floor) + A2 (curl exit-code classification, replacing
the old opaque `CURL_ERR` token) — never alone: a debounce with no
exit-code classification would silence a real, worsening latency
regression rather than smooth over a rare blip. The router's 23-sample
2026-07-29T09:05-09:12Z re-measurement showed 26% of live api-gateway
`/health` samples over the 3000ms-era budget — a SUSTAINED condition, not
an occasional transient (`docs/architecture-briefs/2026-07-29-apigw-health-capability-probe-latency.md`
§6a).

**Applies only to transport-classified FAILs** (`CLIENT_TIMEOUT`/
`CONN_REFUSED`/`DNS_FAIL`/`EMPTY_REPLY`/`CURL_ERR_<n>`) — a real HTTP-5xx
FAIL (curl itself succeeded, got a real non-200 status) is stronger
evidence than an opaque transport blip and is NEVER debounced (per the
mint task's own scope text: "require N-consecutive failed probes before
classifying a CURL_ERR ... as a degradation" — CURL_ERR only, explicitly
"not HTTP-5xx").

**State file:** `docs/data/auditor-a12-transport-debounce.json` — flat map
`{"<service_id>": <consecutive_count>}`, tmp+mv atomic write (same pattern
as `docs/data/auditor-dedup-ledger.json`), missing/malformed treated as
empty (self-heal, never fail loud).

```bash
DEBOUNCE_FILE="$PROJECT_ROOT/docs/data/auditor-a12-transport-debounce.json"
[ -f "$DEBOUNCE_FILE" ] && jq -e . "$DEBOUNCE_FILE" >/dev/null 2>&1 || printf '{}' > "$DEBOUNCE_FILE"

_a12_debounce_reset() {
  local svc="$1" tmp
  tmp=$(mktemp "$(dirname "$DEBOUNCE_FILE")/.auditor-a12-debounce-XXXXXXXX.json")
  jq --arg s "$svc" '.[$s] = 0' "$DEBOUNCE_FILE" > "$tmp" && mv "$tmp" "$DEBOUNCE_FILE"
}

_a12_debounce_bump() {
  local svc="$1" tmp count
  count=$(( $(jq -r --arg s "$svc" '.[$s] // 0' "$DEBOUNCE_FILE") + 1 ))
  tmp=$(mktemp "$(dirname "$DEBOUNCE_FILE")/.auditor-a12-debounce-XXXXXXXX.json")
  jq --arg s "$svc" --argjson c "$count" '.[$s] = $c' "$DEBOUNCE_FILE" > "$tmp" && mv "$tmp" "$DEBOUNCE_FILE"
  echo "$count"
}
```

**Per-service protocol, this cycle:**
1. `PROBE_OUT` line for `<svc>` is `OK` or a real HTTP FAIL → `_a12_debounce_reset <svc>` (different failure mode — never continues a transport-flap streak).
2. `PROBE_OUT` line for `<svc>` is a transport-classified FAIL → `count=$(_a12_debounce_bump <svc>)`:
   - `count < 3` → log `[A-12-DEBOUNCE] <svc> transient transport flap ${count}/3 — DEBOUNCED, no signal this cycle` in the notebook `RAW-PROBE` evidence trail. Do **NOT** call `emit-audit-signal.sh` for this service this cycle.
   - `count >= 3` → THRESHOLD MET (3 consecutive Tier-1 cycles observing the same transport failure) — proceed to the normal Emit sequence (`docs/agents/system-auditor/flow/tier1-probe.md` § Emit per failure), citing the classified reason + `curl_exit` verbatim, never "unreachable" for `CLIENT_TIMEOUT`.

N=3 reuses this repo's own A-20 multi-probe convention (3 samples,
`docs/agents/system-auditor/probe.sh`'s pdf-extractor in-container check)
rather than inventing a fourth arbitrary threshold constant. A genuinely
sustained regression (per the 26%-over-budget measurement above) will keep
re-tripping this threshold on subsequent cycles — that is the intended,
honest outcome; the debounce only ever smooths a single flap, it must
never permanently silence a real, ongoing degradation.
