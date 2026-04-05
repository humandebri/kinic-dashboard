# Kinic MCP (memory.search only)

Minimal MCP server that exposes a single tool, `memory.search`, and delegates to `kinic-cli` on mainnet.

## Install

```bash
cd mcp
npm install
npm run build
```

## MCP config (paste into your client)

```json
{
  "mcpServers": {
    "kinic": {
      "command": "/abs/path/to/node",
      "args": ["/abs/path/to/kinic-cli/mcp/dist/server.js"]
    }
  }
}
```

Replace the paths above with your local Node binary and `server.js` path.
Codex and Claude Code can both use the same config entry.

## Tool

- `memory.search`
  - Required args: `memory_id`, `query`
  - `identity_mode` ("dfx" | "ii" | "anonymous") and `identity` can be provided per call
  - If omitted, defaults are read from `~/.config/kinic/mcp.json` (see below)
  - The server calls `kinic-cli search-json` and expects JSON output.

## Tool args example (II)

```json
{
  "memory_id": "zontd-iaaaa-aaaak-apg2q-cai",
  "query": "CONTRIBUTING",
  "identity_mode": "ii",
  "identity": "/abs/path/to/.config/kinic/identity.json"
}
```

## Defaults via config file

Create `~/.config/kinic/mcp.json` to avoid passing identity args every time:

```json
{
  "identity_mode": "ii",
  "identity": "/abs/path/to/.config/kinic/identity.json"
}
```

`identity_mode` can be `dfx`, `ii`, or `anonymous`. When set to `anonymous`, `identity` is ignored.
