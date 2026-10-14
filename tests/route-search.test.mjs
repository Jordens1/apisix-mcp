import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { searchRoutesByConfiguredHost } from "../dist/utils/routeSearch.js";

test("searches host and hosts across every APISIX v3 page through MCP", async (t) => {
  const nodes = Array.from({ length: 501 }, (_, index) => ({
    key: `/apisix/routes/${index + 1}`,
    value: { id: String(index + 1), uri: `/route-${index + 1}` },
  }));
  nodes[0].value.host = "Api.Example.com";
  nodes[500].value.hosts = ["API.EXAMPLE.COM", "*.example.com"];

  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    requests.push(url.searchParams.get("page"));
    assert.equal(url.pathname, "/apisix/admin/routes");
    assert.equal(request.headers["x-api-key"], "test-key");
    assert.equal(url.searchParams.get("page_size"), "500");
    const page = Number(url.searchParams.get("page"));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ total: nodes.length, list: nodes.slice((page - 1) * 500, page * 500) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const port = server.address().port;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.env.MCP_SERVER_PATH || "dist/index.js"],
    env: {
      ...process.env,
      APISIX_SERVER_HOST: "http://127.0.0.1",
      APISIX_ADMIN_API_PORT: String(port),
      APISIX_ADMIN_KEY: "test-key",
    },
  });
  const client = new Client({ name: "route-search-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());

  const toolNames = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("search_routes_by_host"));

  const result = await client.callTool({ name: "search_routes_by_host", arguments: { host: "api.example.com" } });
  assert.equal(result.isError, undefined);
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.scanned, 501);
  assert.equal(data.total, 2);
  assert.deepEqual(data.routes.map((route) => route.id), ["1", "501"]);
  assert.deepEqual(requests, ["1", "2"]);

  const wildcardResult = await client.callTool({ name: "search_routes_by_host", arguments: { host: "*.example.com" } });
  assert.deepEqual(JSON.parse(wildcardResult.content[0].text).routes.map((route) => route.id), ["501"]);
});

test("accepts the legacy APISIX route list shape", async () => {
  const result = await searchRoutesByConfiguredHost("example.com", async () => ({
    node: { nodes: [{ key: "/apisix/routes/old", value: { host: "example.com", uri: "/old" } }] },
  }));
  assert.equal(result.total, 1);
  assert.equal(result.routes[0].id, "old");
});

test("rejects unknown Admin API response shapes instead of returning incomplete results", async () => {
  await assert.rejects(
    searchRoutesByConfiguredHost("example.com", async () => ({ routes: [] })),
    /Unexpected APISIX route list response/
  );
});
