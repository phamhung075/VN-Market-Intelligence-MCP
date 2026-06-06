> Parent: [./cloudflare-mcp.md](./cloudflare-mcp.md)

# Ops — Cloudflare MCP: Step-by-Step Recovery + Escalation + Notebook

## Step-by-Step Recovery

**Step 1: Diagnose which layer fails**
- Run all 3 curl/inspector commands from `cloudflare-mcp-diagnosis.md`
- Identify: network? server health? protocol?

**Step 2: Fix configuration**
- If Layer 1 (curl) fails → network/tunnel issue (may require ops/sys admin intervention)
- If Layer 2 (health) fails → server may be down → restart Docker
- If Layer 3 (MCP Inspector) fails → likely path prefix or endpoint issue → apply "Issue 1" fix

**Step 3: Verify code has all fixes applied**
```bash
grep "CLOUDFLARE_PATH_PREFIX" docker-compose.yml
grep "pathPrefix" apps/mcp-server/src/interface/mcp/server.ts
grep "this.pathPrefix" apps/mcp-server/src/interface/mcp/transport.ts
```

**Step 4: Rebuild & restart**
> Forbidden patterns (bare `down`/`up -d`) → `docs/agents/ops/flow/docker.md` § FORBIDDEN.
```bash
cd $PROJECT_ROOT
# If code changed: build first
docker compose build mcp-server
# Scoped relaunch — no peer containers touched:
docker compose up -d --no-deps mcp-server
sleep 5
curl https://zenmidi.com/vn-market/health | jq .
```

**Step 5: Validate with MCP Inspector**
```bash
npx @modelcontextprotocol/inspector https://zenmidi.com/vn-market/sse
```

---

## Reference Documentation

- **Design decision record:** `docs/architecture-briefs/2026-05-12-cloudflare-tunnel-api-routing.md`
- **Transport code:** `apps/mcp-server/src/interface/mcp/transport.ts`
- **Server setup:** `apps/mcp-server/src/interface/mcp/server.ts`
- **Docker config:** `docker-compose.yml` (CLOUDFLARE_PATH_PREFIX + HOST)

---

## Escalation Criteria

Do NOT attempt to fix if:
- Cloudflare Tunnel service itself is down (check `cloudflared` systemd service)
- Network partition to Cloudflare (DNS failures, firewall)
- Multiple services crashing (suggests deeper issue)

In these cases:
```
ESCALATION REQUIRED
Issue: [describe] | Root cause: [diagnosis from layers 1-3]
Attempted recovery: [what was tried] | Blocker: [human action needed]
```

---

## Notebook Entry

After successful recovery, append to `docs/agent-memory/notebooks/ops.md`:
```
## Cloudflare MCP Tunnel Path — Fixed <date>
- Layer that failed: [1/2/3]
- Root cause: [Issue 1/2/3/4]
- Fix applied: [configuration change]
- Validation: MCP Inspector OK
- Time to resolution: [minutes]
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
