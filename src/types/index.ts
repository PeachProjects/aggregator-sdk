/**
 * Peach Aggregator SDK Types
 *
 * Simplified design: only supports linear execution + topological sort + pool merging
 */

// ============ Constants ============

export const DEFAULT_API_URL = "https://api.peach.ag";
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const BPS_DENOMINATOR = 10000n;
export const DEFAULT_DEADLINE_SECONDS = 1200; // 20 minutes
export const DEFAULT_EXECUTE_TIMEOUT_MS = 60_000; // 60 seconds
export const DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS = [50, 100, 200, 400, 800, 1200] as const;

/**
 * Sentinel address indicating native token (e.g. BNB on BSC).
 * Pass this as srcToken/dstToken to distinguish native BNB from WBNB ERC20.
 */
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * Check if an address is the native token sentinel address.
 */
export function isNativeTokenAddress(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

// ============ Error Codes ============

/** API returned route paths where all paths have zero amounts */
export const ERR_ZERO_AMOUNT_PATHS = 4001;

// ============ Protocol Types ============

export enum ProtocolType {
  PancakeV2 = "PancakeV2",
  PancakeV3 = "PancakeV3",
  PancakeInfinityCl = "Pancake_Infinity_Cl",
  UniswapV3 = "UniswapV3",
  UniswapV4 = "UniswapV4",
  Dodo = "Dodo",
  Thena = "Thena",
}

// ============ Configuration ============

export interface AdapterConfig {
  protocol: ProtocolType;
  address: string;
}

export interface PeachConfig {
  chainId: number;
  rpcUrl: string;
  /** Router address override. If not provided, uses the address from API response. */
  routerAddress?: string;
  weth: string;
  adapters: AdapterConfig[];
}

// ============ Pool Info ============

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  protocol: ProtocolType;
  // V2 specific
  reserve0?: bigint;
  reserve1?: bigint;
  // V3 specific
  fee?: number;
  liquidity?: bigint;
  sqrtPriceX96?: bigint;
  tick?: number;
}

// ============ Routes ============

export interface RouteStep {
  pool: PoolInfo;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
}

export interface Route {
  steps: RouteStep[];
  amountIn: bigint;
  amountOut: bigint;
  gasEstimate: bigint;
}

export interface SplitRoute {
  routes: Route[];
  percentages: number[]; // Percentage for each route (BPS, sum = 10000)
  totalAmountIn: bigint;
  totalAmountOut: bigint;
  totalGasEstimate: bigint;
}

// ============ Swap Parameters (Contract Format) ============

export interface SwapStep {
  adapter: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint; // 0 means consume all
  extraData: string;
}

export interface SwapParams {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOutMin: bigint;
  steps: SwapStep[];
  intermediateTokens: string[];
  deadline: bigint;
  quoteId: string;
  expectAmountOut: bigint;
}

// ============ Quote ============

export interface Quote {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  route: SplitRoute;
  params: SwapParams;
  gasEstimate: bigint;
  /** Router contract address from quote API (contracts.router). When set, simulate/execute use this instead of config.routerAddress. */
  routerAddress?: string;
  /** True when the original srcToken was the native token sentinel address */
  srcNative?: boolean;
  /** True when the original dstToken was the native token sentinel address */
  dstNative?: boolean;
}

// ============ Swap Result ============

export interface SwapResult {
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
  gasUsed: bigint;
}

// ============ BSC Mainnet Preset Config ============

export const BSC_MAINNET_CONFIG: PeachConfig = {
  chainId: 56,
  rpcUrl: "https://bsc-dataseed.binance.org",
  weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  adapters: [],
};

// ============ BSC Testnet Preset Config ============

export const BSC_TESTNET_CONFIG: PeachConfig = {
  chainId: 97,
  rpcUrl: "https://bsc-testnet-rpc.publicnode.com",
  weth: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // WBNB Testnet
  adapters: [],
};

// ============ API Request Types ============

/**
 * Known DEX providers supported by the SDK.
 */
export type KnownProvider =
  | "PANCAKEV2"
  | "PANCAKEV3"
  | "PANCAKE_INFINITY_CL"
  | "UNISWAPV3"
  | "UNISWAPV4"
  | "DODO"
  | "THENA";

/**
 * Supported DEX providers.
 * Use getAvailableProviders() to get the list dynamically.
 */
export type Provider = KnownProvider | (string & {});

/**
 * API request parameters for find_routes
 * Note: The following parameters are ignored by SDK:
 * - liquidity_change
 * - apikey
 * - gas
 * - with_sign
 * - cal_path_limit
 */
export interface ApiFindRouteRequest {
  /** Input token address (required) */
  from: string;
  /** Output token address (required) */
  target: string;
  /** Trade amount, cannot be 0 (required) */
  amount: string;
  /** true: calculate output from input; false: calculate input from output (default: true) */
  by_amount_in?: boolean;
  /** Route search depth / max hops (default: 3) */
  depth?: number;
  /** Trade split count for large trades optimization (default: 20) */
  split_count?: number;
  /** DEX providers, comma-separated (default: "PANCAKEV2,PANCAKEV3") */
  providers?: string;
  /** Client version (required >= 1001500 for V3) */
  v?: number;
}

/**
 * SDK-level quote request options
 */
export interface QuoteOptions {
  /** true: calculate output from input; false: calculate input from output (default: true) */
  byAmountIn?: boolean;
  /** Route search depth / max hops (default: 3) */
  depth?: number;
  /** Trade split count for large trades optimization (default: 20) */
  splitCount?: number;
  /** DEX providers to use (default: ["PANCAKEV2", "PANCAKEV3"]) */
  providers?: Provider[];
  /** Transaction deadline in seconds from now (default: 1200 = 20 min) */
  deadlineSeconds?: number;
}

// ============ Execute Options ============

export type ExecuteTimeoutStage = "wallet_send" | "provider_index";

export class ExecuteTimeoutError extends Error {
  readonly txHash?: string;
  readonly stage: ExecuteTimeoutStage;

  constructor(message: string, stage: ExecuteTimeoutStage, txHash?: string) {
    super(message);
    this.name = "ExecuteTimeoutError";
    this.stage = stage;
    this.txHash = txHash;
  }
}

export interface SwapOptions {
  /** Slippage tolerance in basis points (e.g. 50 = 0.5%). Required. */
  slippageBps: number;
  /** Gas price in wei. Applied to the swap tx and, if present, the approval tx. */
  gasPrice?: bigint;
  /** Gas limit for the swap tx. */
  gasLimit?: bigint;
}

export interface SwapTxRequest {
  to: string;
  data: string;
  value: bigint;
  gasPrice?: bigint;
  gasLimit?: bigint;
}

export interface SwapApprovalRequest {
  token: string;
  owner: string;
  spender: string;
  currentAllowance: bigint;
  requiredAmount: bigint;
  approveAmount: bigint;
  tx: SwapTxRequest;
}

export interface SwapRequest {
  routerAddress: string;
  method: "swap" | "swapETH";
  tx: SwapTxRequest;
  approval?: SwapApprovalRequest;
}

export interface ExecuteOptions extends SwapOptions {
  /** Skip the preflight eth_call simulation before sending (default: false).
   *  Set to true only if you've already called simulate() and confirmed the route is valid. */
  skipPreflight?: boolean;
  /** Timeout in milliseconds for the wallet to sign & broadcast the transaction.
   *  If the wallet does not settle the Promise within this duration, execute() rejects
   *  with a timeout error so the caller is not stuck on "Pending Wallet Signature" forever.
   *  Default: 60_000 (60 seconds). Set to 0 to disable. */
  timeoutMs?: number;
  /** Polling intervals for getTransaction(hash) after the wallet returns a tx hash.
   *  Defaults to [50, 100, 200, 400, 800, 1200]ms and then repeats the last value. */
  transactionResponsePollingIntervalsMs?: readonly number[];
}

/** Result of findFailingStep: which step index and step caused the revert */
export interface FindFailingStepResult {
  stepIndex: number;
  step: SwapStep;
  error: unknown;
  /** Revert reason when simulating only up to this step (may differ from full route) */
  revertMessage?: string;
  /** Revert reason from the full-route simulation, if fullRouteError was passed */
  fullRouteRevertMessage?: string;
}

/**
 * Default values for API parameters
 */
export const API_DEFAULTS = {
  /** Default route search depth */
  depth: 3,
  /** Default trade split count */
  splitCount: 20,
  /** Default DEX providers */
  providers: ["PANCAKEV2", "PANCAKEV3", "PANCAKE_INFINITY_CL", "UNISWAPV3", "UNISWAPV4", "DODO", "THENA"] as Provider[],
  /** Default client version for V3 API */
  clientVersion: 1001500,
} as const;

// ============ API Response Types ============

/**
 * Aggregator API response wrapper
 */
export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

/**
 * Chainflow sync status for a provider
 */
export interface ChainflowStatus {
  /** Provider name (e.g., "PANCAKEV3") */
  provider: string;
  /** Current sync transaction cursor (tx hash) */
  tx_cursor: string | null;
  /** Sync version info */
  version: {
    /** Latest synced block number */
    latest_block_number: number;
    /** Latest synced transaction index in that block */
    latest_transaction_index: number;
  };
  /** Last update timestamp in milliseconds */
  update_at: number;
}

/**
 * Status API response data
 */
export interface ApiStatusData {
  /** Available liquidity providers */
  providers: string[];
  /** Chain sync status for each provider */
  chainflows: ChainflowStatus[];
}

/**
 * Full status response
 */
export type ApiStatusResponse = ApiResponse<ApiStatusData>;

/**
 * Contract addresses for EVM
 */
export interface ApiContractAddresses {
  /** PeachAggregator router address */
  router: string;
  /** Adapter addresses by provider name */
  adapters: Record<string, string>;
}

/**
 * Route path from aggregator API (EVM format)
 */
export interface ApiRoutePath {
  /** Pool contract address */
  pool: string;
  /** Provider name (e.g., "PANCAKEV3") */
  provider: Provider;
  /** Adapter contract address */
  adapter: string;
  /** Input token address */
  token_in: string;
  /** Output token address */
  token_out: string;
  /** Swap direction (true = token0 -> token1) */
  direction: boolean;
  /** Fee rate (e.g., "0.0005" for 0.05%) */
  fee_rate: string;
  /** Input amount (string to support u128) */
  amount_in: string;
  /** Output amount (string to support u128) */
  amount_out: string;
  /** Extra data for adapter (hex encoded) */
  extra_data?: string;
}

/**
 * Find route response data
 */
export interface ApiFindRouteData {
  request_id: string;
  /** Total input amount (string to support u128) */
  amount_in: string;
  /** Total output amount (string to support u128) */
  amount_out: string;
  deviation_ratio: string;
  paths: ApiRoutePath[];
  /** Contract addresses for building transactions */
  contracts: ApiContractAddresses;
  /** Estimated gas */
  gas: number;
}

/**
 * Full find route response
 */
export type ApiFindRouteResponse = ApiResponse<ApiFindRouteData>;
