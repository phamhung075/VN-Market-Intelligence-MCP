/**
 * Interface — Telegram webhook route handler
 *
 * Extracted from server.ts (1406c). Handles POST /webhook:
 *   1. Validate webhook secret (TELEGRAM_WEBHOOK_SECRET env var)
 *   2. BUG-channel branch — persist to telegram_reports via insertReport
 *   3. Standard command dispatch — handleTelegramCommand + sendTelegramMarket
 *
 * DI contract: db and log are injected by the caller (handleRequest in server.ts)
 * so unit tests can pass in-memory DB directly.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { type createLogger } from "../../../infrastructure/logger.js";
import { validateWebhookRequest } from "../../../infrastructure/notifiers/telegramWebhookSetup.js";
import { insertReport } from "../../../infrastructure/db/telegramReportStore.js";
import { handleTelegramCommand } from "../../../infrastructure/notifiers/telegramCommands.js";
import { sendTelegramMarket } from "../../../infrastructure/notifiers/telegram.js";

export async function handleWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  // Validate webhook secret (skip if not configured — dev mode)
  const webhookSecret = Bun.env["TELEGRAM_WEBHOOK_SECRET"] ?? "";
  const reqHeaders = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") reqHeaders.set(name, value);
    else if (Array.isArray(value)) reqHeaders.set(name, value.join(", "));
  }
  if (!validateWebhookRequest(reqHeaders, webhookSecret)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden" }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  // ── BUG Channel branch ───────────────────────────────────────────────
  // If the message originates from TELEGRAM_REPORT_BUG_CHANNEL_ID (the BUG channel),
  // persist it in the telegram_reports table and return 200 immediately
  // without dispatching to the command router.
  const bugChatId = Bun.env["TELEGRAM_REPORT_BUG_CHANNEL_ID"] ?? "";
  const update = body as {
    message?: { chat?: { id?: number }; text?: string };
  };
  const incomingChatId = String(update?.message?.chat?.id ?? "");

  if (bugChatId && incomingChatId === bugChatId) {
    const text = update?.message?.text ?? "";
    try {
      insertReport(db, text, "human", 0, "normal");
    } catch (err) {
      log.warn("[webhook] failed to insert report from BUG Channel", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  // ── Standard command dispatch (MARKET channel — user replies) ────────
  try {
    const result = await handleTelegramCommand(
      body as Parameters<typeof handleTelegramCommand>[0],
      db,
    );
    if (result) {
      // Multi-message commands (e.g. /news) return texts[]; single-message commands use text.
      const chunks = result.texts ?? [result.text];
      for (const chunk of chunks) {
        await sendTelegramMarket(chunk, {
          parseMode: "",
          chatId: result.chatId,
          persist: { from_agent: "mcp-user", message_type: "user_ask_reply" },
        });
      }
    }
  } catch (err) {
    log.warn("[webhook] command handling failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
}
