/**
 * Task 215 — Telegram webhook registration + security
 *
 * Tests:
 *   1. registerWebhook — returns false when TELEGRAM_WEBHOOK_URL not set (no-op)
 *   2. registerWebhook — returns false when TELEGRAM_BOT_TOKEN not set
 *   3. registerWebhook — calls setWebhook with correct URL, secret_token, allowed_updates
 *   4. registerWebhook — returns true on 200 OK
 *   5. registerWebhook — returns false on non-200 response
 *   6. registerWebhook — returns false on network error (never throws)
 *   7. registerWebhook — uses provided fetchFn (injectable for tests)
 *   8. validateWebhookRequest — returns true on correct secret token
 *   9. validateWebhookRequest — returns false on wrong secret token
 *  10. validateWebhookRequest — returns false on missing header
 *  11. validateWebhookRequest — returns true when no secret configured (dev mode)
 *  12. registerWebhook — passes secret_token in the POST body
 */

import { describe, it, expect } from "bun:test";
import {
  registerWebhook,
  validateWebhookRequest,
  type WebhookFetchFn,
} from "../infrastructure/notifiers/telegramWebhookSetup.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Headers object */
function makeHeaders(entries: Record<string, string> = {}): Headers {
  return new Headers(entries);
}

/** Build a mock fetch that returns the given status */
function mockFetch(status: number, body: unknown = { ok: true }): WebhookFetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

/** Mock fetch that throws a network error */
function throwingFetch(): WebhookFetchFn {
  return async () => {
    throw new Error("Network failure");
  };
}

/** Capture the last request made to fetchFn */
function capturingFetch(): {
  fetchFn: WebhookFetchFn;
  getLastUrl: () => string | null;
  getLastBody: () => unknown;
} {
  let lastUrl: string | null = null;
  let lastBody: unknown = null;
  const fetchFn: WebhookFetchFn = async (url: string, init?: RequestInit) => {
    lastUrl = url;
    lastBody = init?.body ? JSON.parse(init.body as string) : null;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    fetchFn,
    getLastUrl: () => lastUrl,
    getLastBody: () => lastBody,
  };
}

// ─── env teardown helper ──────────────────────────────────────────────────────
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
      saved[k] = Bun.env[k];
      if (v === undefined) {
        delete (Bun.env as Record<string, string | undefined>)[k];
      } else {
        (Bun.env as Record<string, string | undefined>)[k] = v;
      }
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) {
          delete (Bun.env as Record<string, string | undefined>)[k];
        } else {
          (Bun.env as Record<string, string | undefined>)[k] = v;
        }
      }
    }
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("Task 215 — Telegram Webhook Setup", () => {
  // ── registerWebhook ──────────────────────────────────────────────────────

  it(
    "1. returns false (no-op) when TELEGRAM_WEBHOOK_URL is not set",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: undefined,
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        const result = await registerWebhook({ fetchFn: mockFetch(200) });
        expect(result).toBe(false);
      },
    ),
  );

  it(
    "2. returns false when TELEGRAM_BOT_TOKEN is not set",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: undefined,
      },
      async () => {
        const result = await registerWebhook({ fetchFn: mockFetch(200) });
        expect(result).toBe(false);
      },
    ),
  );

  it(
    "3. calls setWebhook endpoint with correct url and allowed_updates",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "abc-123",
      },
      async () => {
        const cap = capturingFetch();
        await registerWebhook({ fetchFn: cap.fetchFn });
        const url = cap.getLastUrl();
        expect(url).toContain("/botabc-123/setWebhook");
        const body = cap.getLastBody() as Record<string, unknown>;
        expect(body.url).toBe("https://myserver.com/webhook");
        expect(Array.isArray(body.allowed_updates)).toBe(true);
        expect((body.allowed_updates as string[]).includes("message")).toBe(true);
      },
    ),
  );

  it(
    "4. returns true on HTTP 200 OK",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        const result = await registerWebhook({ fetchFn: mockFetch(200) });
        expect(result).toBe(true);
      },
    ),
  );

  it(
    "5. returns false on non-200 response",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        const result = await registerWebhook({ fetchFn: mockFetch(400) });
        expect(result).toBe(false);
      },
    ),
  );

  it(
    "6. returns false on network error (never throws)",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        const result = await registerWebhook({ fetchFn: throwingFetch() });
        expect(result).toBe(false);
      },
    ),
  );

  it(
    "7. uses the injected fetchFn (not globalThis.fetch)",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        let called = false;
        const testFetch: WebhookFetchFn = async () => {
          called = true;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        };
        await registerWebhook({ fetchFn: testFetch });
        expect(called).toBe(true);
      },
    ),
  );

  it(
    "12. passes secret_token in the POST body",
    withEnv(
      {
        TELEGRAM_WEBHOOK_URL: "https://myserver.com/webhook",
        TELEGRAM_BOT_TOKEN: "fake-token",
      },
      async () => {
        const cap = capturingFetch();
        const secretToken = "my-secret-abc";
        await registerWebhook({ secretToken, fetchFn: cap.fetchFn });
        const body = cap.getLastBody() as Record<string, unknown>;
        expect(body.secret_token).toBe("my-secret-abc");
      },
    ),
  );

  // ── validateWebhookRequest ───────────────────────────────────────────────

  it("8. returns true when X-Telegram-Bot-Api-Secret-Token header matches", () => {
    const headers = makeHeaders({
      "x-telegram-bot-api-secret-token": "correct-secret",
    });
    expect(validateWebhookRequest(headers, "correct-secret")).toBe(true);
  });

  it("9. returns false when header has wrong value", () => {
    const headers = makeHeaders({
      "x-telegram-bot-api-secret-token": "wrong-secret",
    });
    expect(validateWebhookRequest(headers, "correct-secret")).toBe(false);
  });

  it("10. returns false when header is missing", () => {
    const headers = makeHeaders({});
    expect(validateWebhookRequest(headers, "correct-secret")).toBe(false);
  });

  it("11. returns true when no secret configured (empty string = dev mode)", () => {
    const headers = makeHeaders({});
    expect(validateWebhookRequest(headers, "")).toBe(true);
  });
});
