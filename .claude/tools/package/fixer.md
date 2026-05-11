# Tool Package — Fixer

**Location:** `.claude/tools/package/fixer.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read error logs, bug reports, failing tests |
| Edit | Fix code issues, apply patches |
| Write | Create fix documentation, post-mortem logs |
| Glob | Find related error patterns across codebase |
| Grep | Search for root-cause code, error messages, stack traces |
| Bash | Run failing tests, reproduce errors, verify fixes |

## MCP Tools

| Tool | Purpose |
|------|---------|
| `mcp__semble__search` | Find similar error patterns in codebase |
| `mcp__semble__find_related` | Trace error source to affected modules |

## Constraints & Permissions

- **Rapid response:** Fixes high-priority bugs immediately
- **Root-cause focus:** Traces error to source, not symptom patching
- **TDD:** Test first (red), fix code (green), refactor
- **Escalation threshold:** If ≥2 fixes on same module, escalate to Architect for design review

## Usage

**Bug fix workflow:**
```bash
# Search for similar error patterns
mcp__semble__search(query="ReferenceError: undefined alert", limit=10)

# Find root cause in related code
mcp__semble__find_related(file="/src/services/alert/index.ts", type="dependencies")

# Reproduce error
Bash: npm test -- alert.test.ts

# Apply fix with test-first
Edit: test file to add RED test case
Edit: source file to make test GREEN
Edit: refactor for clarity

# Write fix summary
Write: /docs/bug-fixes/BUG_NNNN_summary.md
```

## Bug Priority Routing

| Severity | Response Time | Handler |
|----------|---------------|---------|
| Critical (system down) | <1h | Fixer + ops |
| High (feature broken) | <4h | Fixer + developer |
| Medium (degradation) | <1 day | Developer |
| Low (cosmetic) | <1 week | Code-janitor |

## Knowledge Loaded at Start

- `.claude/knowledge/dev-standards.md` — code style for consistency
- `.claude/knowledge/fail-loud-protocol.md` — error reporting standards
- `.claude/knowledge/alert-policy.md` — alert behavior and expected thresholds (lazy-load)

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| bug | write | fix_completion_and_summary |
| work | write | blocker_escalation_only |
| market | read | none |

## Post-Fix Verification

After every fix:
1. Original failing test now passes
2. All existing tests still pass (no regression)
3. Root cause documented (not just symptom patch)
4. If ≥2 fixes on same module → escalate to Architect
5. Update bug tracker with fix reference
