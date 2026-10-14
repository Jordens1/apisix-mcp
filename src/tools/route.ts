import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import makeAdminAPIRequest, { adminAPIErrorResult, requestAdminAPIData } from "../utils/adminAPI.js";
import { CreateRouteSchema, SearchRoutesByHostSchema, UpdateRouteSchema } from "../schemas/route.js";
import { searchRoutesByConfiguredHost } from "../utils/routeSearch.js";

const setupRouteTools = (server: McpServer) => {
  server.tool(
    "search_routes_by_host",
    "Find routes with an exact configured host or hosts entry, ignoring case. Searches every route page; wildcard entries are literal values.",
    SearchRoutesByHostSchema.shape,
    async ({ host }) => {
      try {
        const result = await searchRoutesByConfiguredHost(host, (page, pageSize) =>
          requestAdminAPIData(`/routes?page=${page}&page_size=${pageSize}`)
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return adminAPIErrorResult(error, "GET", "/routes");
      }
    }
  );

  server.tool("create_route", "Create a route", CreateRouteSchema.shape, async (args) => {
    const routeId = args.id;

    if (routeId) {
      return await makeAdminAPIRequest(`/routes/${routeId}`, "PUT", args.route);
    } else {
      return await makeAdminAPIRequest(`/routes`, "POST", args.route);
    }
  });

  server.tool("update_route", "Update specific attributes of an existing route", UpdateRouteSchema.shape, async (args) => {
    return await makeAdminAPIRequest(`/routes/${args.id}`, "PATCH", args.route);
  });
};

export default setupRouteTools;
