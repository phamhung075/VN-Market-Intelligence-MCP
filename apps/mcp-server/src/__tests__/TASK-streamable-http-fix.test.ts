import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createBunServer, type BunServerInstance } from "../interface/mcp/server.js";
import { initDatabase } from "../infrastructure/db/schema.js";

describe("TASK — Streamable HTTP Transport GET + SSE (broken)", () => {
  let server: BunServerInstance;

  beforeAll(async () => {
    await initDatabase();
    server = await createBunServer({ port: 0 });
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET /mcp should return SSE events (streamable HTTP)", async () => {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/mcp`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
      }
    );

    expect(response.status).not.toBe(405);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("text/event-stream");

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("event:");
    expect(text).toContain("data:");
  });

  it("POST /mcp with initialize request should work", async () => {
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      },
    };

    const response = await fetch(
      `http://127.0.0.1:${server.port}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initRequest),
      }
    );

    expect(response.status).not.toBe(405);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("text/event-stream");

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("GET /mcp should not return 405 Method Not Allowed", async () => {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/mcp`,
      {
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
        },
      }
    );

    expect(response.status).not.toBe(405);
    expect(response.status).toBe(200);
  });
});
