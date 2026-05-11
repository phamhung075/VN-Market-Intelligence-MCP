/**
 * Alert Engine — Telegram Client
 *
 * Concrete implementation of TelegramPort.
 * Wraps the Telegram Bot API send-message call.
 */

import type { TelegramPort } from '../domain/repositories.js';
import type { TelegramChannel } from '../domain/models.js';
import type { ServiceConfig } from './config.js';

export class TelegramClient implements TelegramPort {
  constructor(private readonly config: ServiceConfig) {}

  async send(channel: TelegramChannel, text: string): Promise<boolean> {
    const chatId = this.resolveChatId(channel);
    if (!chatId || !this.config.telegramBotToken) {
      // No token/id configured — skip silently (dev/test environment)
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private resolveChatId(channel: TelegramChannel): string {
    switch (channel) {
      case 'market': return this.config.telegramMarketId;
      case 'work':   return this.config.telegramWorkId;
      case 'bug':    return this.config.telegramBugId;
    }
  }
}
