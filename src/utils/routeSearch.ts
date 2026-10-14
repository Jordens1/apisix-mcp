export interface RouteSummary {
  id?: string;
  name?: string;
  host?: string;
  hosts?: string[];
  uri?: string;
  uris?: string[];
  status?: number;
}

export interface RouteSearchResult {
  host: string;
  scanned: number;
  total: number;
  routes: RouteSummary[];
}

const PAGE_SIZE = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeValue(node: unknown): Record<string, unknown> | undefined {
  if (!isRecord(node) || !isRecord(node.value)) {
    return undefined;
  }

  return node.value;
}

function matchesConfiguredHost(route: Record<string, unknown>, host: string): boolean {
  if (typeof route.host === "string" && route.host.toLowerCase() === host) {
    return true;
  }

  return Array.isArray(route.hosts) && route.hosts.some(
    (candidate) => typeof candidate === "string" && candidate.toLowerCase() === host
  );
}

function summarizeRoute(route: Record<string, unknown>, node: unknown): RouteSummary {
  const key = isRecord(node) && typeof node.key === "string" ? node.key : undefined;

  return {
    id: typeof route.id === "string" ? route.id : key?.split("/").pop(),
    name: typeof route.name === "string" ? route.name : undefined,
    host: typeof route.host === "string" ? route.host : undefined,
    hosts: Array.isArray(route.hosts) ? route.hosts.filter((item): item is string => typeof item === "string") : undefined,
    uri: typeof route.uri === "string" ? route.uri : undefined,
    uris: Array.isArray(route.uris) ? route.uris.filter((item): item is string => typeof item === "string") : undefined,
    status: typeof route.status === "number" ? route.status : undefined,
  };
}

export async function searchRoutesByConfiguredHost(
  host: string,
  fetchPage: (page: number, pageSize: number) => Promise<unknown>
): Promise<RouteSearchResult> {
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedHost) {
    throw new Error("host must not be empty");
  }

  const routes: RouteSummary[] = [];
  let scanned = 0;
  let page = 1;

  while (true) {
    const response = await fetchPage(page, PAGE_SIZE);
    if (!isRecord(response)) {
      throw new Error("Unexpected APISIX route list response");
    }

    const isV3 = Array.isArray(response.list) && Number.isSafeInteger(response.total) && Number(response.total) >= 0;
    const v2Node = isRecord(response.node) ? response.node : undefined;
    const isV2 = !!v2Node && Array.isArray(v2Node.nodes);
    if (!isV3 && !isV2) {
      throw new Error("Unexpected APISIX route list response: expected v3 list/total or v2 node.nodes");
    }

    const list: unknown[] = isV3 ? response.list as unknown[] : v2Node!.nodes as unknown[];
    for (const node of list) {
      const route = routeValue(node);
      if (route && matchesConfiguredHost(route, normalizedHost)) {
        routes.push(summarizeRoute(route, node));
      }
    }
    scanned += list.length;

    if (isV2 || page * PAGE_SIZE >= Number(response.total)) {
      break;
    }
    if (list.length === 0) {
      throw new Error(`APISIX returned an empty route page before the reported total (page ${page})`);
    }
    page += 1;
  }

  return { host: host.trim(), scanned, total: routes.length, routes };
}
