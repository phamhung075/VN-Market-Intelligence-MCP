Bun.env["DB_PATH"] = ":memory:";

// Load real telegram module via absolute-path+query-bust (bypasses Bun mock cache).
const _realMod = await import(
  Bun.resolveSync("../infrastructure/notifiers/telegram.js", import.meta.dir) + "?isolate=1328i"
);

/**
 * Task 1328i — NFC normalization in coreSend()
 *
 * Vietnamese text from macOS RSS feeds arrives in NFD (decomposed) form.
 * coreSend() must normalize to NFC (precomposed) before calling splitMessage()
 * so that all Telegram clients render diacritics consistently.
 *
 * "ă" in NFD = "a" + U+0306 (combining breve) = 2 codepoints
 * "ă" in NFC = U+0103 (ă precomposed)         = 1 codepoint
 */

import { describe, it, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown = { ok: true, result: { message_id: 1 } }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1328i — NFC normalization before Telegram send", () => {
  it("TC-01: NFD input arrives at Telegram API as NFC-normalized text", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID = "55555";

    // "ă" in NFD = "a" + U+0306 (combining breve) — 2 codepoints, 2 chars
    const nfdString = "a\u0306ng ha\u0306ng";   // "ăng hăng" in NFD
    // "ă" in NFC = U+0103 — 1 codepoint, 1 char
    const nfcString = "\u0103ng h\u0103ng";       // "ăng hăng" in NFC

    // Sanity-check the fixture
    expect(nfdString).not.toBe(nfcString);
    expect(nfdString.normalize("NFC")).toBe(nfcString);

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeOkResponse();
    };

    const { sendTelegramWork } = _realMod;
    await sendTelegramWork(nfdString, { fetchFn: mockFetch as typeof fetch });

    // The text sent to Telegram must be NFC
    expect(capturedBody.text).toBe(nfcString);
    expect((capturedBody.text as string).normalize("NFC")).toBe(capturedBody.text as string);
  });

  it("TC-02: NFC input is unchanged after normalization (idempotent)", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID = "55555";

    // Already NFC: full Vietnamese sentence with precomposed diacritics
    const nfcInput = "Gi\u00e1 c\u1ed5 phi\u1ebfu VCB t\u0103ng m\u1ea1nh";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeOkResponse();
    };

    const { sendTelegramWork } = _realMod;
    await sendTelegramWork(nfcInput, { fetchFn: mockFetch as typeof fetch });

    // NFC in → NFC out (unchanged)
    expect(capturedBody.text).toBe(nfcInput);
  });

  it("TC-03: ASCII-only input passes through unchanged", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_WORK_CHANNEL_ID = "55555";

    const ascii = "VCB price +5.3%";

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeOkResponse();
    };

    const { sendTelegramWork } = _realMod;
    await sendTelegramWork(ascii, { fetchFn: mockFetch as typeof fetch });

    expect(capturedBody.text).toBe(ascii);
  });

  it("TC-04: sendTelegramMarket also normalizes NFD to NFC (shares coreSend)", async () => {
    Bun.env.TELEGRAM_BOT_TOKEN = "test-token";
    Bun.env.TELEGRAM_INFO_MARKET_GROUP_ID = "11111";

    // "ơ" in NFD = "o" + U+031B (combining horn) — U+006F + U+031B
    // This two-codepoint sequence differs from the precomposed NFC form U+01A1
    const nfdString = "o\u031B gi\u00e1"; // "ơ giá" in NFD (ơ decomposed)
    const nfcExpected = nfdString.normalize("NFC"); // → U+01A1 + " giá"
    // Guard: the NFD form must actually differ from NFC
    expect(nfdString).not.toBe(nfcExpected);

    let capturedBody: Record<string, unknown> = {};
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
      return makeOkResponse();
    };

    const { sendTelegramMarket } = _realMod;
    await sendTelegramMarket(nfdString, {
      fetchFn: mockFetch as typeof fetch,
      skipPersist: true,
    });

    expect(capturedBody.text).toBe(nfcExpected);
  });
});
