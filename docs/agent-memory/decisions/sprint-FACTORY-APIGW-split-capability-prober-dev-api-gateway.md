# Decision Journal — Sprint FACTORY-APIGW-split-capability-prober · dev-api-gateway

**Sprint goal:** FACTORY-MAINTAINABILITY-2026-06 epic — split `capability_prober.go` (377L) by seam into 3 siblings, all `package infrastructure`, no API change; harden the SSE content-type check.
**Agent:** dev-api-gateway
**Started:** 2026-07-24T12:00:00Z

---

### STEP dev-api-gateway-S1 · dev-api-gateway · 2026-07-24T12:24Z
**task-id:** FACTORY-APIGW-split-capability-prober
**what-done:** Split `capability_prober.go` into `capability_manifest.go` (types+loadManifest), `capability_probe.go` (probeHealthEndpoint+mcp types+probeMcpTool), `capability_prober.go` (struct+cache+ProbeAll/capabilityFor/runProbe); swapped `ct[:17]==...` for `strings.HasPrefix`.
**what-considered:**
- Where `cachedCapability` + constructors land: prober file (state-owning) vs manifest file — chose prober file, they mutate `p.cache`/`p.manifest` under `p.mu`, same invariant as ProbeAll/capabilityFor/runProbe.
- Whether to force all 3 files ≤120L by trimming doc comments — rejected; task's own seam spec already groups 3 methods+struct+2 ctors in one file (191L) and 2 probe impls+3 types in another (130L); cutting real documentation to hit a line count is a worse trade than an honest size-justification header (precedent: cmd/sandbox/discover.go).
- Verification method for "probe behavior unchanged": git-stash A/B diff of running probes vs sorted stripped-code (comments/imports/blanks removed) diff of orig-HEAD vs concat(3 new files) — chose the stripped-code diff, it directly proves zero-delta at the statement level (only the intended HasPrefix swap surfaced) without needing a live mcp-server to exercise the probes end-to-end.
**why-decision:** Stripped-code diff is deterministic, catches the sibling-split NBSP-contamination class of bug (grepped separately, clean), and gives byte-level proof rather than behavioral sampling.
**why-change:** No change from plan — approach in the task brief followed as specified; only elaboration was the verification method and the size-justification call.
