// MCP local (stdio): para usar a ponte direto no seu PC, sem Render.
// IMPORTANTE: stdout é do protocolo MCP. Nunca usar console.log aqui (use console.error).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { criarServidorMcp } from "./ferramentas.js";

await criarServidorMcp().connect(new StdioServerTransport());
console.error("ponte-casa: MCP pronto");
