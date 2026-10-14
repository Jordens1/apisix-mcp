import axios from "axios";
import {
  APISIX_SERVER_HOST,
  APISIX_ADMIN_API_PORT,
  APISIX_ADMIN_API_PREFIX,
  APISIX_ADMIN_KEY,
} from "../utils/env.js";

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export async function requestAdminAPIData<T>(
  path: string,
  method: string = "GET",
  data?: object
): Promise<T> {
  const baseUrl = `${APISIX_SERVER_HOST}:${APISIX_ADMIN_API_PORT}${APISIX_ADMIN_API_PREFIX}`;
  const url = `${baseUrl}${path}`;

  const response = await axios<T>({
    method,
    url,
    data,
    headers: {
      "X-API-KEY": APISIX_ADMIN_KEY,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

export function adminAPIErrorResult(
  error: unknown,
  method: string,
  path: string
): CallToolResult {
  const url = `${APISIX_SERVER_HOST}:${APISIX_ADMIN_API_PORT}${APISIX_ADMIN_API_PREFIX}${path}`;

  if (axios.isAxiosError(error)) {
    console.error(`Request failed: ${method} ${url}`);
    console.error(`Status: ${error.response?.status}, Error: ${error.message}`);

    if (error.response?.data) {
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }

    return {
      isError: true,
      content: [{
        type: "text",
        text: `Status: ${error.response?.status ?? "unknown"}\nMessage: ${error.message}\nData:\n${JSON.stringify(error.response?.data || {}, null, 2)}`,
      }],
    };
  }

  return {
    isError: true,
    content: [{
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    }],
  };
}

export async function makeAdminAPIRequest(
  path: string,
  method: string = "GET",
  data?: object
): Promise<CallToolResult> {

  try {
    const response = await requestAdminAPIData(path, method, data);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return adminAPIErrorResult(error, method, path);
  }
}

export default makeAdminAPIRequest;
