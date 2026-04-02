/**
 * PeachClient - Peach Aggregator SDK main entry point
 *
 * Uses the aggregator API for route discovery.
 */

import { ethers } from "ethers";
import {
  PeachConfig,
  Quote,
  SwapParams,
  SwapStep,
  SplitRoute,
  ProtocolType,
  BPS_DENOMINATOR,
  DEFAULT_DEADLINE_SECONDS,
  DEFAULT_EXECUTE_TIMEOUT_MS,
  DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS,
  QuoteOptions,
  SwapOptions,
  SwapApprovalRequest,
  SwapRequest,
  SwapTxRequest,
  ExecuteTimeoutError,
  ExecuteOptions,
  API_DEFAULTS,
  ApiFindRouteData,
  ApiRoutePath,
  KnownProvider,
  Provider,
  FindFailingStepResult,
  isNativeTokenAddress,
} from "../types";
import { ApiClient, ApiClientConfig, ApiError } from "./ApiClient";
import { withWalletSendTimeout } from "../utils/wallet";

// PeachRouter ABI (simplified)
const PEACH_ROUTER_ABI = [
  "function swap((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external returns (uint256 amountOut)",
  "function swapETH((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external payable returns (uint256 amountOut)",
  "function isAdapterRegistered(address adapter) external view returns (bool)",
  "function WETH() external view returns (address)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

type EncodedSwapStep = {
  adapter: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  extraData: string;
};

type EncodedSwapParams = {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOutMin: bigint;
  steps: EncodedSwapStep[];
  intermediateTokens: string[];
  deadline: bigint;
  quoteId: string;
  expectAmountOut: bigint;
};

/** BSC CLPoolManager contract address for Pancake Infinity (V4). */
const PANCAKE_INFINITY_CL_POOL_MANAGER = "0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b";

const PROVIDER_TO_PROTOCOL: Record<KnownProvider, ProtocolType> = {
  PANCAKEV3: ProtocolType.PancakeV3,
  PANCAKEV2: ProtocolType.PancakeV2,
  PANCAKE_INFINITY_CL: ProtocolType.PancakeInfinityCl,
  UNISWAPV3: ProtocolType.UniswapV3,
  UNISWAPV4: ProtocolType.UniswapV4,
  DODO: ProtocolType.Dodo,
  THENA: ProtocolType.Thena,
};

export interface PeachClientOptions {
  /** API client configuration. Required for getQuote(). */
  api?: ApiClientConfig;
}

export class PeachClient {
  private provider: ethers.Provider;
  private config: PeachConfig;
  private routerContract: ethers.Contract;
  private apiClient: ApiClient;

  constructor(
    config: PeachConfig,
    provider?: ethers.Provider,
    options?: PeachClientOptions
  ) {
    this.config = config;
    this.provider = provider || new ethers.JsonRpcProvider(config.rpcUrl);
    // routerContract is used for ABI encoding/decoding; address may be overridden per-quote
    this.routerContract = new ethers.Contract(
      config.routerAddress || ethers.ZeroAddress,
      PEACH_ROUTER_ABI,
      this.provider
    );

    // Create API client (uses default API URL if no baseUrl provided)
    this.apiClient = new ApiClient(options?.api);
  }

  /**
   * Get the effective router address for a quote.
   */
  private getRouterAddress(quote: Quote): string {
    const addr = quote.routerAddress || this.config.routerAddress;
    if (!addr || addr === ethers.ZeroAddress) {
      throw new Error("No router address available. Provide routerAddress in config or use API-based getQuote.");
    }
    return addr;
  }

  /**
   * Apply slippage to swap params, returning a new SwapParams with adjusted amountOutMin
   */
  private applySlippage(params: SwapParams, slippageBps: number): SwapParams {
    if (slippageBps < 0 || slippageBps > 10000) {
      throw new Error("slippageBps must be between 0 and 10000");
    }
    const amountOutMin =
      (params.amountOutMin * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
    return { ...params, amountOutMin };
  }

  /**
   * Build transaction requests for an approval (if needed) and the swap itself.
   */
  async swap(
    quote: Quote,
    ownerAddress: string,
    options: SwapOptions
  ): Promise<SwapRequest> {
    const routerAddress = this.getRouterAddress(quote);
    const { tx, method } = this.buildSwapTransactionRequest(quote, options);

    let approval: SwapApprovalRequest | undefined;
    if (!quote.srcNative) {
      approval = await this.buildApprovalRequest(
        quote.srcToken,
        ownerAddress,
        quote.amountIn,
        routerAddress,
        options
      );
    }

    return {
      routerAddress,
      method,
      tx,
      approval,
    };
  }

  /**
   * Execute swap using the legacy signer-managed flow.
   *
   * @deprecated Prefer swap(), then send the returned tx request with your wallet/client.
   */
  async execute(
    quote: Quote,
    signer: ethers.Signer,
    options: ExecuteOptions
  ): Promise<ethers.TransactionResponse> {
    const signerAddress = await signer.getAddress();
    const prepared = await this.swap(quote, signerAddress, options);

    // Preflight: run eth_call before sending to surface clear revert reasons instead of
    // the opaque "cannot estimate gas" error that ethers throws when estimateGas fails.
    // if (!options.skipPreflight) {
    //   await this.simulate(quote, options.slippageBps, signerAddress);
    // }

    try {
      if (prepared.approval) {
        const approvalTx = await this.sendTransactionWithTimeout(
          signer,
          prepared.approval.tx,
          options
        );
        await approvalTx.wait();
      }

      return await this.sendTransactionWithTimeout(signer, prepared.tx, options);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isEstimateGas = /estimateGas/i.test(msg);
      const isMissingRevertData =
        /missing revert data/i.test(msg) ||
        (msg.includes("reason=null") && msg.includes("data=null"));
      if (isEstimateGas && (isMissingRevertData || /reason=null|data=null/.test(msg))) {
        const friendly =
          "Transaction reverted during gas estimation and the RPC did not return a revert reason. Try: 1) Get a fresh quote and confirm immediately 2) Switch network or RPC 3) Increase slippage.";
        const e = new Error(`${friendly} (estimateGas/missing revert data)`) as Error & { cause?: unknown };
        e.cause = err;
        throw e;
      }
      throw err;
    }
  }

  /**
   * Encode parameters to contract format
   */
  private encodeParams(params: SwapParams): EncodedSwapParams {
    return {
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      amountIn: params.amountIn,
      amountOutMin: params.amountOutMin,
      steps: params.steps.map((step) => ({
        adapter: step.adapter,
        pool: step.pool,
        tokenIn: step.tokenIn,
        tokenOut: step.tokenOut,
        amountIn: step.amountIn,
        extraData: step.extraData,
      })),
      intermediateTokens: params.intermediateTokens,
      deadline: params.deadline,
      quoteId: params.quoteId,
      expectAmountOut: params.expectAmountOut,
    };
  }

  private getProtocolForProvider(provider: Provider): ProtocolType {
    if (provider in PROVIDER_TO_PROTOCOL) {
      return PROVIDER_TO_PROTOCOL[provider as KnownProvider];
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }

  /**
   * Encode swap calldata for the Peach Aggregator contract
   * Useful for simulation or building custom transactions
   *
   * @param quote - Quote object from getQuote
   * @param slippageBps - Slippage tolerance in basis points (e.g. 50 = 0.5%). Required.
   * @returns Encoded calldata and transaction info (to address, value)
   */
  encodeSwapCalldata(quote: Quote, slippageBps: number): {
    to: string;
    data: string;
    value: bigint;
    method: 'swap' | 'swapETH';
  } {
    const routerAddress = quote.routerAddress ?? this.config.routerAddress ?? this.routerContract.target as string;
    const swapParams = this.applySlippage(quote.params, slippageBps);
    const useSwapETH = quote.srcNative === true || quote.dstNative === true;
    const encodedParams = this.encodeParams(swapParams);

    if (useSwapETH) {
      const data = this.routerContract.interface.encodeFunctionData('swapETH', [encodedParams]);
      return {
        to: routerAddress,
        data,
        value: quote.srcNative ? quote.amountIn : 0n,
        method: 'swapETH',
      };
    } else {
      const data = this.routerContract.interface.encodeFunctionData('swap', [encodedParams]);
      return {
        to: routerAddress,
        data,
        value: 0n,
        method: 'swap',
      };
    }
  }

  private buildSwapTransactionRequest(
    quote: Quote,
    options: SwapOptions
  ): { tx: SwapTxRequest; method: "swap" | "swapETH" } {
    const { to, data, value, method } = this.encodeSwapCalldata(quote, options.slippageBps);
    return {
      method,
      tx: this.applyTxOverrides({ to, data, value }, options, true),
    };
  }

  private async buildApprovalRequest(
    token: string,
    owner: string,
    amount: bigint,
    spender: string,
    options: SwapOptions
  ): Promise<SwapApprovalRequest | undefined> {
    const allowance = await this.getAllowance(token, owner, spender);
    if (allowance >= amount) {
      return undefined;
    }

    return {
      token,
      owner,
      spender,
      currentAllowance: allowance,
      requiredAmount: amount,
      approveAmount: ethers.MaxUint256,
      tx: this.buildApprovalTransactionRequest(token, spender, options),
    };
  }

  private buildApprovalTransactionRequest(
    token: string,
    spender: string,
    options: SwapOptions
  ): SwapTxRequest {
    const tokenInterface = new ethers.Interface(ERC20_ABI);
    const data = tokenInterface.encodeFunctionData("approve", [spender, ethers.MaxUint256]);
    return this.applyTxOverrides({ to: token, data, value: 0n }, options, false);
  }

  private async getAllowance(
    token: string,
    owner: string,
    spender: string
  ): Promise<bigint> {
    const tokenContract = new ethers.Contract(token, ERC20_ABI, this.provider);
    return tokenContract.allowance(owner, spender);
  }

  private applyTxOverrides(
    tx: SwapTxRequest,
    options: SwapOptions,
    includeGasLimit: boolean
  ): SwapTxRequest {
    const txWithOverrides: SwapTxRequest = { ...tx };
    if (options.gasPrice) {
      txWithOverrides.gasPrice = options.gasPrice;
    }
    if (includeGasLimit && options.gasLimit) {
      txWithOverrides.gasLimit = options.gasLimit;
    }
    return txWithOverrides;
  }

  private async sendTransactionWithTimeout(
    signer: ethers.Signer,
    tx: SwapTxRequest,
    options: Pick<ExecuteOptions, "timeoutMs" | "transactionResponsePollingIntervalsMs">
  ): Promise<ethers.TransactionResponse> {
    const effectiveTimeoutMs = options.timeoutMs ?? DEFAULT_EXECUTE_TIMEOUT_MS;
    if (effectiveTimeoutMs <= 0) {
      return signer.sendTransaction(tx);
    }

    const uncheckedSigner = signer as ethers.Signer & {
      sendUncheckedTransaction?: (tx: ethers.TransactionRequest) => Promise<string>;
      provider?: ethers.Provider | null;
    };

    if (
      typeof uncheckedSigner.sendUncheckedTransaction === "function" &&
      uncheckedSigner.provider
    ) {
      const hash = await withWalletSendTimeout(
        uncheckedSigner.sendUncheckedTransaction(tx),
        effectiveTimeoutMs
      );

      const pollResult = await this.waitForTransactionResponse(
        uncheckedSigner.provider,
        hash,
        effectiveTimeoutMs,
        options.transactionResponsePollingIntervalsMs
      );
      if (pollResult.response) {
        return pollResult.response;
      }

      const failureMode =
        pollResult.rpcErrors > 0
          ? `${pollResult.rpcErrors} transient provider error(s) and ${pollResult.nullResponses} null response(s)`
          : `${pollResult.nullResponses} null response(s)`;
      throw new ExecuteTimeoutError(
        `Transaction was broadcast but provider did not return TransactionResponse within ${effectiveTimeoutMs}ms (${failureMode}).`,
        "provider_index",
        hash
      );
    }

    return withWalletSendTimeout(signer.sendTransaction(tx), effectiveTimeoutMs);
  }

  private async waitForTransactionResponse(
    provider: ethers.Provider,
    hash: string,
    timeoutMs: number,
    pollingIntervalsMs: readonly number[] = DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS
  ): Promise<{
    response: ethers.TransactionResponse | null;
    nullResponses: number;
    rpcErrors: number;
  }> {
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    let nullResponses = 0;
    let rpcErrors = 0;
    while (Date.now() < deadline) {
      try {
        const response = await provider.getTransaction(hash);
        if (response) {
          return { response, nullResponses, rpcErrors };
        }
        nullResponses++;
      } catch {
        // Some wallets/RPCs lag while indexing a just-broadcast tx; keep polling until timeout.
        rpcErrors++;
      }
      const nextDelay = this.getNextPollingDelay(pollingIntervalsMs, attempt);
      attempt++;
      await this.delay(Math.min(nextDelay, Math.max(25, deadline - Date.now())));
    }
    return { response: null, nullResponses, rpcErrors };
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private getNextPollingDelay(
    pollingIntervalsMs: readonly number[],
    attempt: number
  ): number {
    if (pollingIntervalsMs.length === 0) {
      return DEFAULT_TRANSACTION_RESPONSE_POLL_INTERVALS_MS.at(-1) ?? 1200;
    }
    return pollingIntervalsMs[Math.min(attempt, pollingIntervalsMs.length - 1)] ?? 1200;
  }

  /**
   * Get token metadata and, optionally, the balance for a specific owner.
   */
  async getTokenInfo(tokenAddress: string, ownerAddress?: string): Promise<{
    symbol: string;
    decimals: number;
    balance?: bigint;
  }> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const [symbol, decimals, balance] = await Promise.all([
      token.symbol(),
      token.decimals(),
      ownerAddress ? token.balanceOf(ownerAddress) : Promise.resolve(undefined),
    ]);

    return balance === undefined ? { symbol, decimals } : { symbol, decimals, balance };
  }

  /**
   * Get user token balance
   */
  async getBalance(tokenAddress: string, userAddress: string): Promise<bigint> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    return token.balanceOf(userAddress);
  }

  /**
   * Get quote via API
   * @throws Error if API client is not configured
   */
  async getQuote(params: {
    srcToken: string;
    dstToken: string;
    amountIn: bigint;
    options?: QuoteOptions;
  }): Promise<Quote> {
    const { srcToken, dstToken, amountIn, options = {} } = params;

    const {
      byAmountIn = true,
      depth = API_DEFAULTS.depth,
      splitCount = API_DEFAULTS.splitCount,
      providers = API_DEFAULTS.providers,
      deadlineSeconds = DEFAULT_DEADLINE_SECONDS,
    } = options;

    // Detect native token sentinel and convert to WBNB for API
    const srcNative = isNativeTokenAddress(srcToken);
    const dstNative = isNativeTokenAddress(dstToken);
    const apiSrcToken = srcNative ? this.config.weth : srcToken;
    const apiDstToken = dstNative ? this.config.weth : dstToken;

    const apiData = await this.apiClient.findRoutes({
      from: apiSrcToken,
      target: apiDstToken,
      amount: amountIn,
      byAmountIn,
      depth,
      splitCount,
      providers,
    });

    return this.buildQuoteFromApi(apiData, apiSrcToken, apiDstToken, deadlineSeconds, providers, srcNative, dstNative);
  }

  /**
   * Filter paths by allowed providers, removing paths with disallowed providers
   * and cascade-removing orphaned paths that depend on removed paths.
   */
  private filterPathsByProviders(
    paths: ApiRoutePath[],
    allowedProviders: Provider[],
    srcToken: string,
    dstToken: string
  ): ApiRoutePath[] {
    const allowedSet = new Set(allowedProviders.map((p) => p.toUpperCase()));

    // Step 1: Remove paths with disallowed providers
    let filtered = paths.filter((p) => allowedSet.has(p.provider.toUpperCase()));

    if (filtered.length === paths.length) {
      return filtered; // Nothing was removed
    }

    // Step 2: Cascade-remove orphaned paths via reachability analysis
    const srcLower = srcToken.toLowerCase();
    const dstLower = dstToken.toLowerCase();

    // Forward reachability: which tokens can be reached from srcToken?
    const reachableFromSrc = new Set<string>();
    reachableFromSrc.add(srcLower);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of filtered) {
        if (
          reachableFromSrc.has(p.token_in.toLowerCase()) &&
          !reachableFromSrc.has(p.token_out.toLowerCase())
        ) {
          reachableFromSrc.add(p.token_out.toLowerCase());
          changed = true;
        }
      }
    }

    // Backward reachability: which tokens can reach dstToken?
    const reachableToDst = new Set<string>();
    reachableToDst.add(dstLower);
    changed = true;
    while (changed) {
      changed = false;
      for (const p of filtered) {
        if (
          reachableToDst.has(p.token_out.toLowerCase()) &&
          !reachableToDst.has(p.token_in.toLowerCase())
        ) {
          reachableToDst.add(p.token_in.toLowerCase());
          changed = true;
        }
      }
    }

    // Keep only paths on valid src→dst routes
    const beforeOrphan = filtered.length;
    filtered = filtered.filter(
      (p) =>
        reachableFromSrc.has(p.token_in.toLowerCase()) &&
        reachableToDst.has(p.token_out.toLowerCase())
    );

    return filtered;
  }

  /**
   * Build Quote from route data (e.g. from JSON file or API response).
   * Use this to simulate a swap from a pre-computed route without calling the API.
   *
   * @param data - Route data with paths, amount_in, amount_out, contracts, gas
   * @param srcToken - Source token address (first path token_in)
   * @param dstToken - Destination token address (last path token_out)
   * @param deadlineSeconds - Optional deadline in seconds from now (default: 20 min)
   */
  buildQuoteFromRouteData(
    data: ApiFindRouteData,
    srcToken: string,
    dstToken: string,
    deadlineSeconds?: number,
    options?: { srcNative?: boolean; dstNative?: boolean }
  ): Quote {
    const quote = this.buildQuoteFromRouteDataInternal(
      data,
      srcToken,
      dstToken,
      deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS,
      undefined
    );
    if (options?.srcNative) quote.srcNative = true;
    if (options?.dstNative) quote.dstNative = true;
    return quote;
  }

  /**
   * Build Quote from API response
   */
  private buildQuoteFromApi(
    data: ApiFindRouteData,
    srcToken: string,
    dstToken: string,
    deadlineSeconds: number,
    requestedProviders?: Provider[],
    srcNative?: boolean,
    dstNative?: boolean
  ): Quote {
    const quote = this.buildQuoteFromRouteDataInternal(
      data,
      srcToken,
      dstToken,
      deadlineSeconds,
      requestedProviders
    );
    if (srcNative) quote.srcNative = true;
    if (dstNative) quote.dstNative = true;
    return quote;
  }

  private buildQuoteFromRouteDataInternal(
    data: ApiFindRouteData,
    srcToken: string,
    dstToken: string,
    deadlineSeconds: number,
    requestedProviders?: Provider[]
  ): Quote {
    // Filter out zero-amount dead paths (amount_in=0 AND not an entry point)
    const srcTokenLower = srcToken.toLowerCase();
    const originalPathCount = data.paths.length;
    let validPaths = data.paths.filter((p) => {
      const isEntryPoint = p.token_in.toLowerCase() === srcTokenLower;
      if (!isEntryPoint && BigInt(p.amount_in) === 0n && BigInt(p.amount_out) === 0n) {
        return false;
      }
      return true;
    });

    if (validPaths.length === 0) {
      throw new ApiError("All route paths have zero amounts", 4001);
    }

    // Filter by requested providers (defensive check against API returning unwanted providers)
    if (requestedProviders && requestedProviders.length > 0) {
      validPaths = this.filterPathsByProviders(validPaths, requestedProviders, srcToken, dstToken);

      if (validPaths.length === 0) {
        throw new ApiError("No valid route paths remaining after provider filtering", 4001);
      }
    }

    // Recalculate amounts from remaining valid paths
    const dstTokenLower = dstToken.toLowerCase();
    let amountIn = 0n;
    let amountOut = 0n;
    for (const p of validPaths) {
      if (p.token_in.toLowerCase() === srcTokenLower) {
        amountIn += BigInt(p.amount_in);
      }
      if (p.token_out.toLowerCase() === dstTokenLower) {
        amountOut += BigInt(p.amount_out);
      }
    }
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + deadlineSeconds
    );

    // Count how many steps consume each tokenIn.
    // When multiple steps share the same tokenIn, all but the last must use an
    // explicit amountIn (from the API) so the router deducts a fixed amount from
    // transient storage instead of consumeAll-ing the entire balance on the first
    // step and leaving nothing for the rest.  The last consumer keeps amountIn=0
    // so it takes whatever remainder is left (handles rounding).
    const tokenInCount = new Map<string, number>();
    for (const p of validPaths) {
      const key = p.token_in.toLowerCase();
      tokenInCount.set(key, (tokenInCount.get(key) ?? 0) + 1);
    }
    const tokenInSeen = new Map<string, number>();
    const steps: SwapStep[] = validPaths.map((p) => {
      const key = p.token_in.toLowerCase();
      const seen = (tokenInSeen.get(key) ?? 0) + 1;
      tokenInSeen.set(key, seen);
      const total = tokenInCount.get(key)!;
      // Use explicit amountIn when there are multiple consumers of this token
      // AND this is not the last consumer (last one uses consumeAll=0 for remainder).
      const useExplicit = total > 1 && seen < total;
      const isEntryPoint = key === srcTokenLower;
      return {
        adapter: p.adapter,
        pool: p.provider.toUpperCase() === "PANCAKE_INFINITY_CL"
          ? PANCAKE_INFINITY_CL_POOL_MANAGER
          : p.provider.toUpperCase() === "UNISWAPV4"
          ? ethers.ZeroAddress
          : p.pool,
        tokenIn: p.token_in,
        tokenOut: p.token_out,
        amountIn: isEntryPoint || useExplicit ? BigInt(p.amount_in) : 0n,
        extraData: p.extra_data || "0x",
      };
    });

    const intermediateTokenSet = new Set<string>();
    for (const p of validPaths) {
      const out = p.token_out.toLowerCase();
      if (out !== dstTokenLower) {
        intermediateTokenSet.add(p.token_out);
      }
    }
    const intermediateTokens = Array.from(intermediateTokenSet);

    const swapParams: SwapParams = {
      srcToken,
      dstToken,
      amountIn,
      amountOutMin: amountOut,
      steps,
      intermediateTokens,
      deadline,
      quoteId: data.request_id ? ethers.id(data.request_id).slice(0, 66) : ethers.ZeroHash,
      expectAmountOut: amountOut,
    };

    const route: SplitRoute = {
      routes: [
        {
          steps: validPaths.map((p) => ({
            pool: {
              address: p.pool,
              token0: p.token_in,
              token1: p.token_out,
              protocol: this.getProtocolForProvider(p.provider),
              fee: p.fee_rate
                ? Math.round(parseFloat(p.fee_rate) * 1_000_000)
                : undefined,
            },
            tokenIn: p.token_in,
            tokenOut: p.token_out,
            amountIn: BigInt(p.amount_in),
            amountOut: BigInt(p.amount_out),
          })),
          amountIn,
          amountOut,
          gasEstimate: BigInt(data.gas),
        },
      ],
      percentages: [10000],
      totalAmountIn: amountIn,
      totalAmountOut: amountOut,
      totalGasEstimate: BigInt(data.gas),
    };

    if (!data.contracts?.router) {
      throw new ApiError("API response missing contracts.router address", 4002);
    }

    return {
      srcToken,
      dstToken,
      amountIn,
      amountOut,
      priceImpact: parseFloat(data.deviation_ratio || "0"),
      route,
      params: swapParams,
      gasEstimate: BigInt(data.gas),
      routerAddress: data.contracts?.router,
    };
  }

  /**
   * Get available providers from the API
   * @throws Error if API client is not configured
   */
  async getAvailableProviders(): Promise<string[]> {
    return this.apiClient.getAvailableProviders();
  }

  /**
   * Simulate swap via eth_call (no gas, no state change)
   * Useful for testing and verifying quote accuracy
   *
   * @param quote - Quote object from getQuote
   * @param slippageBps - Slippage tolerance in basis points (e.g. 50 = 0.5%). Required.
   * @param fromAddress - Optional caller address for simulation (default: zero address)
   * @param stateOverrides - Optional state overrides for ERC20 balance/allowance
   * @returns Simulated amountOut and method used
   */
  async simulate(
    quote: Quote,
    slippageBps: number,
    fromAddress?: string,
    stateOverrides?: Record<string, { stateDiff: Record<string, string> }>
  ): Promise<{ amountOut: bigint; method: 'swap' | 'swapETH' }> {
    const caller = fromAddress || ethers.ZeroAddress;
    const { to, data, value, method } = this.encodeSwapCalldata(quote, slippageBps);

    if (stateOverrides) {
      // Use JsonRpcProvider for state overrides. Some RPCs (Go hexutil.Big) reject hex with leading zeros.
      const jsonRpcProvider = this.getJsonRpcProviderForStateOverrides();
      const valueHex = value > 0n ? '0x' + value.toString(16) : undefined;
      const result = await jsonRpcProvider.send('eth_call', [
        { from: caller, to, data, value: valueHex },
        'latest',
        stateOverrides,
      ]);
      const [amountOut] = this.routerContract.interface.decodeFunctionResult(method, result);
      return { amountOut, method };
    } else {
      const result = await this.provider.call({
        from: caller,
        to,
        data,
        value: value > 0n ? value : undefined,
      });
      const [amountOut] = this.routerContract.interface.decodeFunctionResult(method, result);
      return { amountOut, method };
    }
  }

  private getJsonRpcProviderForStateOverrides(): ethers.JsonRpcProvider {
    const provider = this.provider as Partial<ethers.JsonRpcProvider>;
    if (typeof provider.send !== "function") {
      throw new Error(
        "stateOverrides require a JsonRpcProvider-compatible provider with send(method, params)."
      );
    }
    return this.provider as ethers.JsonRpcProvider;
  }

  /**
   * Format simulate error with human-readable details
   */
  private formatSimulateError(err: unknown, quote: Quote, method: string, caller: string): Error {
    const original = err instanceof Error ? err : new Error(String(err));
    const errAny = err as Record<string, unknown>;

    // Extract revert reason from ethers CALL_EXCEPTION
    let reason = "unknown";
    if (errAny.reason && typeof errAny.reason === "string") {
      reason = errAny.reason;
    } else if (errAny.revert && typeof errAny.revert === "object") {
      const revert = errAny.revert as Record<string, unknown>;
      if (revert.args && Array.isArray(revert.args)) {
        reason = revert.args.join(", ");
      }
    } else if (original.message) {
      reason = original.message;
    }

    // Build step summary
    const steps = quote.params.steps.map((s, i) =>
      `  Step ${i}: ${s.tokenIn.slice(0, 10)}→${s.tokenOut.slice(0, 10)} via adapter ${s.adapter.slice(0, 10)} pool ${s.pool.slice(0, 10)}`
    ).join("\n");

    const msg = [
      `Simulate ${method} failed: ${reason}`,
      `  Route: ${quote.srcToken} → ${quote.dstToken}`,
      `  AmountIn: ${quote.amountIn}`,
      `  AmountOutMin: ${quote.params.amountOutMin}`,
      `  Router: ${quote.routerAddress}`,
      `  Caller: ${caller}`,
      `  Steps (${quote.params.steps.length}):`,
      steps,
    ].join("\n");

    const e = new Error(msg) as Error & { cause?: unknown; reason?: string };
    e.cause = original;
    e.reason = reason;
    return e;
  }

  /**
   * Find which step in the route causes the same revert as the full route (e.g. MUL_ERROR).
   * Simulates with steps [0..1], [0..2], ... and returns the first step whose revert
   * matches fullRouteError. Ignores steps that revert with a different reason (e.g. unknown custom error).
   *
   * @param quote - Full quote from getQuote (the one that fails when simulated)
   * @param slippageBps - Same as for simulate
   * @param fromAddress - Same as for simulate
   * @param stateOverrides - Same as for simulate (use when simulating ERC20 sell with arbitrary address)
   * @param fullRouteError - The error from simulating the full route. Required so we match by revert reason (e.g. "MUL_ERROR"); only the step that produces the same reason is returned.
   * @returns The step index and step details whose revert matches fullRouteError, or null if none match or full route succeeds
   */
  async findFailingStep(
    quote: Quote,
    slippageBps: number,
    fromAddress?: string,
    stateOverrides?: Record<string, { stateDiff: Record<string, string> }>,
    fullRouteError?: unknown
  ): Promise<FindFailingStepResult | null> {
    const steps = quote.params.steps;
    if (!steps.length) return null;

    const targetReason = fullRouteError != null ? this.normalizeRevertReason(fullRouteError) : undefined;

    for (let n = 1; n <= steps.length; n++) {
      const truncated = this.quoteWithFirstNSteps(quote, n);
      try {
        await this.simulate(truncated, slippageBps, fromAddress, stateOverrides);
      } catch (err: unknown) {
        const stepReason = this.normalizeRevertReason(err);
        const msg =
          (err as { message?: string; reason?: string; shortMessage?: string })?.message ??
          (err as { reason?: string })?.reason ??
          (err as { shortMessage?: string })?.shortMessage;
        const match = targetReason != null ? stepReason === targetReason : true;
        if (match) {
          return {
            stepIndex: n - 1,
            step: steps[n - 1]!,
            error: err,
            revertMessage: typeof msg === 'string' ? msg : undefined,
            fullRouteRevertMessage: targetReason ?? undefined,
          };
        }
        // Revert reason differs (e.g. step 0 gave unknown custom error, we want MUL_ERROR): try next step
      }
    }
    return null;
  }

  /** Extract a comparable revert reason (e.g. "MUL_ERROR") from an error for findFailingStep matching. */
  private normalizeRevertReason(err: unknown): string | undefined {
    if (err == null) return undefined;
    const e = err as { reason?: string; message?: string; shortMessage?: string; data?: string };
    if (typeof e.reason === 'string' && e.reason.length > 0) return e.reason;
    const msg = e.shortMessage ?? e.message;
    if (typeof msg !== 'string') return undefined;
    const reasonMatch = msg.match(/reason="([^"]+)"/);
    if (reasonMatch) return reasonMatch[1];
    const revertedMatch = msg.match(/reverted:\s*"([^"]+)"/);
    if (revertedMatch) return revertedMatch[1];
    const execRevertedMatch = msg.match(/execution reverted:\s*"([^"]+)"/);
    if (execRevertedMatch) return execRevertedMatch[1];
    return undefined;
  }

  /** Build a quote that only includes the first stepCount steps (for findFailingStep). */
  private quoteWithFirstNSteps(quote: Quote, stepCount: number): Quote {
    const steps = quote.params.steps.slice(0, stepCount);
    const dstLower = quote.dstToken.toLowerCase();
    // Deduplicate intermediate tokens: split routes can have the same token as output
    // of multiple parallel steps (e.g. two USDT→tokenX hops both produce tokenX).
    // Passing duplicates to the router causes incorrect intermediate token accounting.
    const seen = new Set<string>();
    const intermediateTokens: string[] = [];
    for (const s of steps) {
      const lower = s.tokenOut.toLowerCase();
      if (lower !== dstLower && !seen.has(lower)) {
        seen.add(lower);
        intermediateTokens.push(s.tokenOut);
      }
    }
    return {
      ...quote,
      params: {
        ...quote.params,
        steps,
        intermediateTokens,
      },
    };
  }

  /**
   * Build state overrides for ERC20 token balance and allowance.
   * Useful for simulating swaps without actual on-chain token balance/approval.
   *
   * Automatically covers multiple storage slot layouts (slots 0-2 for balance,
   * slots 0-7 for allowance) to handle OZ ERC20 (slot 0/1), Ownable+ERC20 (slot 1/2),
   * and other common BSC token implementations.
   *
   * WBNB (native wrap) is skipped automatically — swapETH wraps msg.value
   * internally so no ERC20 approval from the sender is needed.
   *
   * @param tokenAddress - ERC20 token address (WBNB returns empty overrides)
   * @param owner - Address that needs the balance and allowance
   * @param routerAddress - Router address (used as fallback spender)
   * @param balance - Balance to inject (default: 1M tokens with 18 decimals)
   * @param spenderAddress - Spender to approve (default: routerAddress). Pass quote.routerAddress when simulating API quotes.
   */
  buildStateOverrides(
    tokenAddress: string,
    owner: string,
    routerAddress: string,
    balance?: bigint,
    spenderAddress?: string,
    options?: { isNative?: boolean }
  ): Record<string, { stateDiff: Record<string, string> }> {
    // swapETH wraps msg.value natively — no ERC20 override needed for native token
    if (options?.isNative || isNativeTokenAddress(tokenAddress)) {
      return {};
    }

    if (!routerAddress || routerAddress === ethers.ZeroAddress) {
      throw new Error("buildStateOverrides requires a non-zero routerAddress.");
    }

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const tokenBalance = balance || ethers.parseUnits('1000000', 18);
    const spender = spenderAddress ?? routerAddress;
    const balanceHex = ethers.zeroPadValue(ethers.toBeHex(tokenBalance), 32);
    const maxUint256Hex = ethers.zeroPadValue(ethers.toBeHex(ethers.MaxUint256), 32);

    const stateDiff: Record<string, string> = {};

    // Target storage slots covering all common ERC20 layouts:
    //   0-2   : standard OZ ERC20 (balance=0, allowance=1) and Ownable+ERC20 (balance=1, allowance=2)
    //   9-13  : USDC/FiatToken style (balance≈9-11, allowance≈10-12)
    //   50-52 : OZ UpgradeableERC20 v4.x (ContextUpgradeable.__gap[50] pushes balance to slot 50, allowance to slot 51)
    //   100-102: OZ Upgradeable with OwnableUpgradeable (additional 50-slot gap before ERC20 state)
    const SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 50, 51, 52, 100, 101, 102];

    for (const slot of SLOTS) {
      // Balance
      const balKey = ethers.keccak256(abiCoder.encode(['address', 'uint256'], [owner, slot]));
      stateDiff[balKey] = balanceHex;

      // Allowance (nested mapping: allowances[owner][spender] at slot S)
      const inner = ethers.keccak256(abiCoder.encode(['address', 'uint256'], [owner, slot]));
      const allowKey = ethers.keccak256(abiCoder.encode(['address', 'bytes32'], [spender, inner]));
      stateDiff[allowKey] = maxUint256Hex;
    }

    return {
      [tokenAddress.toLowerCase()]: { stateDiff },
    };
  }
}
