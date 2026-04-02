/**
 * Shared DEX test utilities.
 * Provides reusable functions for per-DEX standardized tests.
 */

import { ethers } from 'ethers';
import { PEACH_API, PEACH_CONTRACTS } from './constants';

// Peach Aggregator Router ABI
const PEACH_ROUTER_ABI = [
  // Swap ERC20 tokens
  'function swap((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external returns (uint256 amountOut)',
  // Swap native BNB (srcToken = WBNB address)
  'function swapETH((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external payable returns (uint256 amountOut)',
  'function isAdapterRegistered(address adapter) external view returns (bool)',
  'function WETH() external view returns (address)',
];

// ERC20 ABI for state override
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
];

export interface ApiFindRouteResponse {
  code: number;
  msg: string;
  data: {
    request_id: string;
    amount_in: number;
    amount_out: number;
    deviation_ratio?: string;
    paths: Array<{
      pool: string;
      provider: string;
      adapter: string;
      token_in: string;
      token_out: string;
      direction: boolean;
      fee_rate: string;
      amount_in: number;
      amount_out: number;
      extra_data?: string;
    }>;
    contracts: {
      router: string;
      adapters: Record<string, string>;
    };
    gas: number;
  };
}

/**
 * Fetch route from Peach API with optional provider filter.
 */
export async function fetchRouteForDex(
  from: string,
  target: string,
  amount: string,
  providerFilter?: string,
): Promise<ApiFindRouteResponse> {
  const params = new URLSearchParams({
    from,
    target,
    amount,
    by_amount_in: 'true',
    v: PEACH_API.VERSION,
  });
  if (providerFilter) {
    params.set('providers', providerFilter);
  }
  const url = `${PEACH_API.BASE_URL}${PEACH_API.FIND_ROUTES}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Simulate swapETH via eth_call on PeachRouter.
 */
export async function simulateSwapETH(
  provider: ethers.JsonRpcProvider,
  swapParams: {
    srcToken: string;
    dstToken: string;
    amountIn: bigint;
    amountOutMin: bigint;
    steps: Array<{
      adapter: string;
      pool: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: bigint;
      extraData: string;
    }>;
    intermediateTokens: string[];
    deadline: bigint;
  },
  fromAddress: string = '0x0000000000000000000000000000000000000001',
): Promise<bigint> {
  const iface = new ethers.Interface(PEACH_ROUTER_ABI);
  const calldata = iface.encodeFunctionData('swapETH', [swapParams]);

  const result = await provider.call({
    to: PEACH_CONTRACTS.ROUTER,
    from: fromAddress,
    data: calldata,
    value: swapParams.amountIn,
  });

  const [amountOut] = iface.decodeFunctionResult('swapETH', result);
  return amountOut;
}

/**
 * Check if adapter contract is deployed (has bytecode).
 */
export async function checkAdapterDeployed(
  adapterAddress: string,
  provider: ethers.JsonRpcProvider,
): Promise<boolean> {
  const code = await provider.getCode(adapterAddress);
  return code !== '0x' && code.length > 2;
}

/**
 * Check if adapter is registered in PeachRouter.
 */
export async function checkAdapterRegistered(
  adapterAddress: string,
  provider: ethers.JsonRpcProvider,
): Promise<boolean> {
  const router = new ethers.Contract(
    PEACH_CONTRACTS.ROUTER,
    PEACH_ROUTER_ABI,
    provider,
  );
  return router.isAdapterRegistered(adapterAddress);
}

/**
 * Build SwapParams from API response data.
 */
export function buildSwapParamsFromApi(
  data: ApiFindRouteResponse['data'],
  srcToken: string,
  dstToken: string,
  slippageBps: number = 50,
) {
  const amountIn = BigInt(data.amount_in);
  const amountOut = BigInt(data.amount_out);
  const amountOutMin = (amountOut * BigInt(10000 - slippageBps)) / 10000n;

  const steps = data.paths.map((p) => {
    const isEntryPoint = p.token_in.toLowerCase() === srcToken.toLowerCase();
    return {
      adapter: p.adapter,
      pool: p.pool,
      tokenIn: p.token_in,
      tokenOut: p.token_out,
      amountIn: isEntryPoint ? BigInt(p.amount_in) : 0n,
      extraData: p.extra_data || '0x',
    };
  });

  const intermediateTokens: string[] = [];
  for (const p of data.paths) {
    if (p.token_out.toLowerCase() !== dstToken.toLowerCase()) {
      if (!intermediateTokens.includes(p.token_out)) {
        intermediateTokens.push(p.token_out);
      }
    }
  }

  return {
    srcToken,
    dstToken,
    amountIn,
    amountOut,
    amountOutMin,
    steps,
    intermediateTokens,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
    quoteId: ethers.ZeroHash,
    expectAmountOut: amountOut,
  };
}

/**
 * Check if the V2 provider is synced on the API.
 */
export async function checkProviderSynced(providerName: string): Promise<boolean> {
  try {
    const res = await fetch(`${PEACH_API.BASE_URL}${PEACH_API.STATUS}`);
    if (!res.ok) return false;
    const json = await res.json();
    return json.data.chainflows.some(
      (cf: { provider: string }) => cf.provider.toUpperCase() === providerName.toUpperCase(),
    );
  } catch {
    return false;
  }
}

/**
 * Swap params type
 */
export interface SwapParamsInput {
  srcToken: string;
  dstToken: string;
  amountIn: bigint;
  amountOutMin: bigint;
  steps: Array<{
    adapter: string;
    pool: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    extraData: string;
  }>;
  intermediateTokens: string[];
  deadline: bigint;
  quoteId: string;
  expectAmountOut: bigint;
}

/**
 * Simulate swap via eth_call with state overrides.
 * Works for both ERC20 tokens and native BNB.
 *
 * For ERC20: sets caller's balance and allowance via state override
 * For native BNB (srcToken = WBNB): uses swapETH with msg.value
 */
export async function simulateSwap(
  provider: ethers.JsonRpcProvider,
  swapParams: SwapParamsInput,
  options?: {
    fromAddress?: string;
    wbnbAddress?: string;
    srcNative?: boolean;
  },
): Promise<{ amountOut: bigint; method: 'swap' | 'swapETH' }> {
  const {
    fromAddress = '0x1111111111111111111111111111111111111111',
    wbnbAddress = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    srcNative,
  } = options || {};

  const iface = new ethers.Interface(PEACH_ROUTER_ABI);
  const isNativeBNB = srcNative === true || swapParams.srcToken.toLowerCase() === wbnbAddress.toLowerCase();

  if (isNativeBNB) {
    // Native BNB swap - use swapETH
    const calldata = iface.encodeFunctionData('swapETH', [swapParams]);
    const result = await provider.call({
      to: PEACH_CONTRACTS.ROUTER,
      from: fromAddress,
      data: calldata,
      value: swapParams.amountIn,
    });
    const [amountOut] = iface.decodeFunctionResult('swapETH', result);
    return { amountOut, method: 'swapETH' };
  } else {
    // ERC20 swap - use swap with state override
    const calldata = iface.encodeFunctionData('swap', [swapParams]);

    // Compute state override for srcToken balance and allowance
    // Standard ERC20: balanceOf at slot 1, allowance at slot 2 (varies by token)
    // We use a generic approach that works for most BEP20 tokens
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const BALANCE_SLOT = 1; // Most common slot for balanceOf
    const ALLOWANCE_SLOT = 2; // Most common slot for allowance

    const balanceKey = ethers.keccak256(
      abiCoder.encode(['address', 'uint256'], [fromAddress, BALANCE_SLOT]),
    );
    const allowanceBase = ethers.keccak256(
      abiCoder.encode(['address', 'uint256'], [fromAddress, ALLOWANCE_SLOT]),
    );
    const allowanceKey = ethers.keccak256(
      abiCoder.encode(['address', 'bytes32'], [PEACH_CONTRACTS.ROUTER, allowanceBase]),
    );

    // Give caller large balance and max allowance
    const largeBalance = ethers.parseUnits('1000000', 18); // 1M tokens
    const stateOverrides = {
      [swapParams.srcToken]: {
        stateDiff: {
          [balanceKey]: ethers.zeroPadValue(ethers.toBeHex(largeBalance), 32),
          [allowanceKey]: ethers.zeroPadValue(ethers.toBeHex(ethers.MaxUint256), 32),
        },
      },
    };

    const result = await provider.send('eth_call', [
      { from: fromAddress, to: PEACH_CONTRACTS.ROUTER, data: calldata },
      'latest',
      stateOverrides,
    ]);

    const [amountOut] = iface.decodeFunctionResult('swap', result);
    return { amountOut, method: 'swap' };
  }
}

/**
 * Analyze and print the difference between quote and simulation result.
 */
export function analyzeQuoteVsSimulation(
  quoteAmountOut: bigint,
  simulatedAmountOut: bigint,
  label: string = 'Swap',
): {
  quoteAmountOut: bigint;
  simulatedAmountOut: bigint;
  difference: bigint;
  differencePercent: number;
  isWithinSlippage: boolean;
} {
  const difference = quoteAmountOut - simulatedAmountOut;
  const differencePercent =
    quoteAmountOut > 0n
      ? Number((difference * 10000n) / quoteAmountOut) / 100
      : 0;

  console.log(`\n===== ${label} Analysis =====`);
  console.log(`Quote amountOut:      ${quoteAmountOut.toString()}`);
  console.log(`Simulated amountOut:  ${simulatedAmountOut.toString()}`);
  console.log(`Difference:           ${difference.toString()}`);
  console.log(`Difference %:         ${differencePercent.toFixed(4)}%`);
  console.log(`==============================\n`);

  return {
    quoteAmountOut,
    simulatedAmountOut,
    difference,
    differencePercent,
    isWithinSlippage: differencePercent < 5, // Within 5% is acceptable
  };
}
