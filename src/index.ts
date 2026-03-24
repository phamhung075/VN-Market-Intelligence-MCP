/**
 * VN Market Intelligence MCP — Bun Entry Point
 * ─────────────────────────────────────────────────────────────────────────
 * Runs a MCP server over HTTP + SSE using:
 *   - Bun's native node:http compatibility
 *   - @modelcontextprotocol/sdk SSEServerTransport
 *   - McpServer with all registered tools
 *
 * Start:
 *   bun run src/index.ts
 *   bun --watch src/index.ts    ← development with hot reload
 *
 * Claude Desktop config (~/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "vn-market": {
 *         "url": "http://localhost:3000/sse"
 *       }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createMcpServer } from './server.js'
import { initDatabase } from './db/schema.js'
import { startScheduler } from './scheduler/jobs.js'

// ── Config ────────────────────────────────────────────────────────────────

const PORT  = Number(Bun.env.PORT  ?? 3000)
const HOST  = Bun.env.HOST  ?? '127.0.0.1'
const LOG   = Bun.env.LOG_LEVEL ?? 'info'

function log(level: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString()
  const line = data ? `${msg} ${JSON.stringify(data)}` : msg
  console.log(`[${ts}] [${level.toUpperCase()}] ${line}`)
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

log('info', 'Initialising VN Market Intelligence MCP...')

// 1. SQLite tables
await initDatabase()
log('info', 'Database ready')

// 2. MCP server (registers all tools)
const mcpServer = createMcpServer()
log('info', 'McpServer created — tools registered')

// 3. Active SSE sessions: sessionId → transport
const sessions = new Map<string, SSEServerTransport>()

// ── HTTP Request Handler ──────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url  = new URL(req.url ?? '/', `http://${HOST}`)
  const path = url.pathname
  const method = req.method ?? 'GET'

  // ── CORS headers (allow Claude Desktop / web clients) ──────────────────
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // ── GET /sse — Claude connects here, receives server-sent events ────────
  if (method === 'GET' && path === '/sse') {
    log('info', 'New SSE connection')

    const transport = new SSEServerTransport('/messages', res)

    sessions.set(transport.sessionId, transport)
    log('debug', `Session created: ${transport.sessionId}`)

    res.on('close', () => {
      sessions.delete(transport.sessionId)
      log('debug', `Session closed: ${transport.sessionId}`)
    })

    // Connect this transport to the MCP server
    await mcpServer.connect(transport)
    return
  }

  // ── POST /messages — Claude sends tool calls / responses here ──────────
  if (method === 'POST' && path === '/messages') {
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing sessionId query param' }))
      return
    }

    const transport = sessions.get(sessionId)

    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Session not found: ${sessionId}` }))
      return
    }

    await transport.handlePostMessage(req, res)
    return
  }

  // ── GET /health — liveness probe ────────────────────────────────────────
  if (method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status:   'ok',
      name:     'vn-market-intelligence-mcp',
      version:  '1.0.0',
      sessions: sessions.size,
      uptime:   process.uptime(),
    }))
    return
  }

  // ── GET / — info ─────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      name:      'VN Market Intelligence MCP',
      endpoints: {
        sse:      'GET  /sse      — connect Claude here',
        messages: 'POST /messages?sessionId=<id>',
        health:   'GET  /health',
      }
    }))
    return
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found', path }))
}

// ── HTTP Server ───────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    log('error', 'Unhandled request error', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })
})

httpServer.listen(PORT, HOST, () => {
  log('info', `✓ MCP server listening on http://${HOST}:${PORT}`)
  log('info', `  SSE endpoint : http://${HOST}:${PORT}/sse`)
  log('info', `  Health check : http://${HOST}:${PORT}/health`)
})

// 4. Start cron scheduler
startScheduler()
log('info', 'Scheduler started')

// ── Graceful Shutdown ─────────────────────────────────────────────────────

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

function shutdown() {
  log('info', 'Shutting down...')
  httpServer.close(() => {
    log('info', 'HTTP server closed')
    process.exit(0)
  })
}
