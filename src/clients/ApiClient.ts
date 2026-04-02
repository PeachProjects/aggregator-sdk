/**
 * ApiClient - Peach Aggregator API client
 *
 * Route discovery and status access via the aggregator API.
 */

import {
  ApiFindRouteResponse,
  ApiFindRouteData,
  ApiStatusResponse,
  ApiStatusData,
  API_DEFAULTS,
  DEFAULT_API_URL,
  Provider,
} from "../types";

export interface ApiClientConfig {
  /** API base URL (default: https://api.peach.ag) */
  baseUrl?: string;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 10000;

export class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_API_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Find optimal routes via API
   */
  async findRoutes(params: {
    from: string;
    target: string;
    amount: bigint;
    byAmountIn?: boolean;
    depth?: number;
    splitCount?: number;
    providers?: Provider[];
  }): Promise<ApiFindRouteData> {
    const {
      from,
      target,
      amount,
      byAmountIn = true,
      depth = API_DEFAULTS.depth,
      splitCount = API_DEFAULTS.splitCount,
      providers = API_DEFAULTS.providers,
    } = params;

    const queryParams = new URLSearchParams({
      from,
      target,
      amount: amount.toString(),
      by_amount_in: byAmountIn.toString(),
      depth: depth.toString(),
      split_count: splitCount.toString(),
      providers: providers.join(","),
      v: API_DEFAULTS.clientVersion.toString(),
    });

    const url = `${this.baseUrl}/router/find_routes?${queryParams}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ApiError(
          `API request failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const json = (await response.json()) as ApiFindRouteResponse;

      if (json.code !== 200) {
        throw new ApiError(json.msg || "Route not found", json.code);
      }

      if (!json.data || !json.data.paths || json.data.paths.length === 0) {
        throw new ApiError("No routes found", 404);
      }

      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ApiError("API request timeout", 408);
        }
        throw new ApiError(`API request failed: ${error.message}`, 0);
      }

      throw new ApiError("Unknown API error", 0);
    }
  }

  /**
   * Get service status including available providers
   */
  async getStatus(): Promise<ApiStatusData> {
    const url = `${this.baseUrl}/router/status`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ApiError(
          `API request failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }

      const json = (await response.json()) as ApiStatusResponse;

      if (json.code !== 200) {
        throw new ApiError(json.msg || "Failed to get status", json.code);
      }

      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ApiError("API request timeout", 408);
        }
        throw new ApiError(`API request failed: ${error.message}`, 0);
      }

      throw new ApiError("Unknown API error", 0);
    }
  }

  /**
   * Get list of available providers
   */
  async getAvailableProviders(): Promise<string[]> {
    const status = await this.getStatus();
    return status.providers;
  }

  /**
   * Update API base URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Get current API base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * API error class
 */
export class ApiError extends Error {
  public readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}
