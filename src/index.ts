/**
 * Peach Aggregator SDK
 *
 * Lightweight DEX aggregator SDK for API routing and swap execution helpers.
 *
 * @module @peach/aggregator-sdk
 */

// Main client
export { PeachClient, type PeachClientOptions } from "./clients/PeachClient";
export { RouteDiscovery } from "./clients/RouteDiscovery";
export { ApiClient, ApiError, type ApiClientConfig } from "./clients/ApiClient";

// Builders
export { SwapBuilder } from "./builders/SwapBuilder";
export { withWalletSendTimeout } from "./utils/wallet";

// Type exports
export {
  // Constants
  DEFAULT_API_URL,
  DEFAULT_SLIPPAGE_BPS,
  BPS_DENOMINATOR,
  DEFAULT_DEADLINE_SECONDS,
  DEFAULT_EXECUTE_TIMEOUT_MS,
  DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS,
  ERR_ZERO_AMOUNT_PATHS,
  NATIVE_TOKEN_ADDRESS,
  isNativeTokenAddress,
  // Enums
  ProtocolType,
  // Config types
  type AdapterConfig,
  type PeachConfig,
  // Pool types
  type PoolInfo,
  // Route types
  type RouteStep,
  type Route,
  type SplitRoute,
  // Swap types
  type SwapStep,
  type SwapParams,
  // Quote types
  type Quote,
  type SwapResult,
  // Preset configs
  BSC_MAINNET_CONFIG,
  BSC_TESTNET_CONFIG,
  // API request types
  type KnownProvider,
  type Provider,
  type ApiFindRouteRequest,
  type QuoteOptions,
  type SwapOptions,
  type SwapTxRequest,
  type SwapApprovalRequest,
  type SwapRequest,
  type ExecuteTimeoutStage,
  ExecuteTimeoutError,
  type ExecuteOptions,
  type FindFailingStepResult,
  API_DEFAULTS,
  // API response types
  type ApiResponse,
  type ApiContractAddresses,
  type ApiRoutePath,
  type ApiFindRouteData,
  type ApiFindRouteResponse,
  // Status API types
  type ChainflowStatus,
  type ApiStatusData,
  type ApiStatusResponse,
} from "./types";
