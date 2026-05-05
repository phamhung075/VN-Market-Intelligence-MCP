import { createBunServer } from "./src/interface/mcp/server.js";
import { initDatabase } from "./src/infrastructure/db/schema.js";

async function main() {
  await initDatabase();
  const server = await createBunServer({ port: 3001 });
  console.log(`Server started on port ${server.port}`);

  // Test GET request
  const getRes = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  console.log("GET /mcp response:");
  console.log("  Status:", getRes.status);
  console.log("  Headers:", Object.fromEntries(getRes.headers.entries()));
  const getText = await getRes.text();
  console.log("  Body length:", getText.length);
  console.log("  Body first 200 chars:", getText.substring(0, 200));

  // Test POST request
  const postRes = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    }),
  });

  console.log("\nPOST /mcp response:");
  console.log("  Status:", postRes.status);
  console.log("  Headers:", Object.fromEntries(postRes.headers.entries()));
  const postText = await postRes.text();
  console.log("  Body length:", postText.length);
  console.log("  Body first 200 chars:", postText.substring(0, 200));

  await server.close();
}

main().catch(console.error);
