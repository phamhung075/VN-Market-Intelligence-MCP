// Schema-only live probe: validates docs/data/orch/orch-state.json against
// OrchStateSchema (structural/enum/lane shape; ref-integrity deliberately excluded).
// Usage: bun run scripts/agents-flow/orch-schema-live-probe.mjs  (run from repo root)
import { OrchStateSchema } from "../../apps/mcp-server/src/infrastructure/orchStateSchema.ts";
import { readFileSync } from "fs";
const live = JSON.parse(readFileSync("docs/data/orch/orch-state.json", "utf8"));
const r = OrchStateSchema.safeParse(live);
if (r.success) { console.log("LIVE SCHEMA-ONLY PARSE: PASSED"); process.exit(0); }
console.log("LIVE SCHEMA-ONLY PARSE: FAILED");
console.log(r.error.issues.slice(0,10).map(i=>`${i.path.join(".")}: ${i.message}`).join("\n"));
process.exit(2);
