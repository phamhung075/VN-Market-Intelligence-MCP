/**
 * Infrastructure — Telegram Command Router (Task 214, Task 1063, Task NEWS-CMD)
 *
 * <!-- size-justification: ~180L — thin router (parses text, dispatches, never
 *      throws) PLUS the 3 recap DI-wrapper "handlers" (handleRecap/Week/Month)
 *      kept here to preserve the existing exported test surface untouched
 *      (214-telegram-commands.test.ts imports them directly) — each wrapper
 *      is 6 lines of try/catch+delegate, no business logic. Splitting these
 *      3 tiny wrappers into yet another file would fragment the public
 *      command-handler surface without reducing real complexity. -->
 *
 * Processes incoming Telegram bot commands from webhook updates.
 * Each handler queries SQLite directly (no MCP layer) and returns
 * a plain-text Vietnamese response.
 *
 * Design rules:
 *   - Never throws — all errors wrapped in user-friendly message
 *   - Plain text only (no Markdown to avoid parse errors)
 *   - Returns null when the update has no actionable text
 *
 * Supported commands (task 1063 reduced set, task 1071 additions, task 1073 /ask, NEWS-CMD /news):
 *   /watchlist                  — list watchlist stocks with current prices
 *   /price VCB                  — price snapshot for a single stock
 *   /health                     — system health (uptime, DB size, watchlist count)
 *   /set_position VCB 75000 1000 — buy/sell/clear a position
 *   /check_position             — list all open positions with P/L, stop-loss, TP ladder
 *   /ask <question>             — enqueue a free-form question for the QA Responder agent
 *   /news [N]                   — full digest of today's news from rag_analyses (chunked if > 4096 chars)
 *   /recap /recapw /recapm      — day/week/month synthesis (orchestration injected — see RecapResolvers)
 *   /report <mota>              — report a bug/issue to Dev Team (priority=medium)
 *   /fix   <mota>               — report an urgent bug to Dev Team (priority=high)
 *   /help                       — list all commands
 *
 * Removed in task 1063: /alerts, /briefing, /pnl, /why
 * (fake-AI or low-value commands superseded by scheduler-driven channels).
 * /ask re-added in task 1073 with real queue backend (ask_queue table, task 1072).
 *
 * Split history (FACTORY-INFRA-split-telegramCommands, 1071L → this file):
 *   - Presentation (fmtNum/stripHtml/HELP_TEXT/chunking) → ./telegram/format.ts
 *   - 8 SQL-backed handlers (/help /watchlist /price /health /report /fix
 *     /ask /set_position /check_position) → ./telegram/commandHandlers.ts
 *     (raw SQL moved further into infrastructure/db/{watchlistReadStore,
 *     systemHealthStore,agentFeedbackStore}.ts)
 *   - /news → ./telegram/newsHandler.ts
 *   - /recap* RENDERING (pure, no fetch) → ./telegram/recapRenderer.ts
 *   - /recap* ORCHESTRATION (the fetch step — assembleEveningSummary /
 *     generatePeriodicSummary) → application/usecases/orchestrateRecapCommand.ts,
 *     invoked by the INTERFACE layer (interface/mcp/routes/webhookHandler.ts)
 *     via the RecapResolvers DI contract below. This file — and every module
 *     it imports — has ZERO imports from application/usecases/, restoring the
 *     correct DDD dependency direction (was infra reaching UP into
 *     application to both fetch AND render the recap summaries).
 *
 * @module infrastructure/notifiers/telegramCommands
 */

import type { Database } from "bun:sqlite";
import {
  handleHelp,
  handleWatchlist,
  handlePrice,
  handleHealth,
  handleReport,
  handleAsk,
  handleSetPosition,
  handleCheckPosition,
} from "./telegram/commandHandlers.js";
import { handleNews } from "./telegram/newsHandler.js";
import {
  renderEveningRecap,
  renderPeriodicRecap,
  recapErrorMessage,
  type EveningRecapData,
  type PeriodicRecapData,
} from "./telegram/recapRenderer.js";
import { HELP_TEXT, stripHtml } from "./telegram/format.js";

export { stripHtml };

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal subset of a Telegram Update needed by the router. */
export interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    from?: { first_name?: string; id?: number };
  };
}

/** Result returned by handleTelegramCommand to the webhook handler. */
export interface CommandResult {
  /** Plain text to send back to Telegram (single-message commands). */
  text: string;
  /**
   * Multi-message commands (e.g. /news with a large digest).
   * When present, webhookHandler.ts iterates this array sequentially
   * and ignores `text`. Each element is guaranteed <= 4096 chars.
   */
  texts?: string[];
  /** Telegram chat ID to reply to. */
  chatId: number;
}

/**
 * Injectable /recap* resolvers — the ORCHESTRATION half of each recap
 * command (the fetch step). Production default is wired by the INTERFACE
 * layer (webhookHandler.ts → application/usecases/orchestrateRecapCommand.ts).
 * When a resolver is omitted, the router degrades to the friendly
 * Vietnamese error text — never throws, never silently no-ops.
 */
export interface RecapResolvers {
  evening?: (db: Database) => Promise<EveningRecapData>;
  weekly?: (db: Database) => Promise<PeriodicRecapData>;
  monthly?: (db: Database) => Promise<PeriodicRecapData>;
}

// ─────────────────────────────────────────────────────────────────────────────
// /recap, /recapw, /recapm — orchestrate (injected resolver) → render (pure)
// ─────────────────────────────────────────────────────────────────────────────

/** /recap — exported for direct unit testing with an injected resolver. */
export async function handleRecap(
  db: Database,
  assembleFn?: (db: Database) => Promise<EveningRecapData>,
): Promise<{ texts: string[] }> {
  try {
    if (!assembleFn) return { texts: [recapErrorMessage("day")] };
    return renderEveningRecap(await assembleFn(db));
  } catch {
    return { texts: [recapErrorMessage("day")] };
  }
}

/** /recapw — exported for direct unit testing with an injected resolver. */
export async function handleRecapWeek(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicRecapData>,
): Promise<{ texts: string[] }> {
  try {
    if (!assembleFn) return { texts: [recapErrorMessage("week")] };
    return renderPeriodicRecap(await assembleFn(db), "week");
  } catch {
    return { texts: [recapErrorMessage("week")] };
  }
}

/** /recapm — exported for direct unit testing with an injected resolver. */
export async function handleRecapMonth(
  db: Database,
  assembleFn?: (db: Database) => Promise<PeriodicRecapData>,
): Promise<{ texts: string[] }> {
  try {
    if (!assembleFn) return { texts: [recapErrorMessage("month")] };
    return renderPeriodicRecap(await assembleFn(db), "month");
  } catch {
    return { texts: [recapErrorMessage("month")] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route an incoming Telegram update to the appropriate command handler.
 *
 * Returns null when the update has no actionable message (no text, no message).
 * Never throws — errors are caught and wrapped in a user-friendly Vietnamese message.
 */
export async function handleTelegramCommand(
  update: TelegramUpdate,
  db: Database,
  recapResolvers?: RecapResolvers,
): Promise<CommandResult | null> {
  const message = update.message;
  if (!message) return null;

  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  if (!text) return null;

  // Parse command and arguments
  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = (rawCmd ?? "").toLowerCase();

  // Telegram user id — stringify for DB storage (ask_queue.user_id is TEXT)
  const userId = message.from?.id != null ? String(message.from.id) : "default";

  try {
    // /news returns { texts: string[] } — handle separately from single-text commands
    if (cmd === "/news") {
      const newsResult = handleNews(db, args);
      return { text: newsResult.texts[0] ?? "", texts: newsResult.texts, chatId };
    }

    // Recap commands — async handlers returning { texts: string[] }
    if (cmd === "/recap") {
      const r = await handleRecap(db, recapResolvers?.evening);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }
    if (cmd === "/recapw") {
      const r = await handleRecapWeek(db, recapResolvers?.weekly);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }
    if (cmd === "/recapm") {
      const r = await handleRecapMonth(db, recapResolvers?.monthly);
      return { text: r.texts[0] ?? "", texts: r.texts, chatId };
    }

    let responseText: string;

    switch (cmd) {
      case "/help":
        responseText = handleHelp();
        break;

      case "/watchlist":
        responseText = handleWatchlist(db);
        break;

      case "/price":
        responseText = handlePrice(db, args);
        break;

      case "/health":
        responseText = handleHealth(db);
        break;

      case "/set_position":
        responseText = handleSetPosition(db, args);
        break;

      case "/check_position":
        responseText = handleCheckPosition(db);
        break;

      case "/ask":
        responseText = handleAsk(db, args, userId);
        break;

      case "/report":
        responseText = handleReport(db, args, "medium");
        break;

      case "/fix":
        responseText = handleReport(db, args, "high");
        break;

      default:
        // Unknown command or plain text — show help
        responseText = `Lệnh không hợp lệ: "${rawCmd ?? text}"\n\n${HELP_TEXT}`;
        break;
    }

    return { text: responseText, chatId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      text: `Lỗi xử lý lệnh "${rawCmd ?? text}": ${errMsg.slice(0, 100)}`,
      chatId,
    };
  }
}
