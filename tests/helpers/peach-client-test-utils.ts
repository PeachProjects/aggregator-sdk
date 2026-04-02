import { ethers } from "ethers";
import { vi } from "vitest";

import {
  BSC_MAINNET_CONFIG,
  NATIVE_TOKEN_ADDRESS,
  PeachClient,
  type Quote,
} from "../../src";
import { PEACH_API, TEST_CONFIG, USDC, WBNB } from "../helpers";

const allowanceInterface = new ethers.Interface([
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    srcToken: WBNB,
    dstToken: USDC,
    amountIn: 1n,
    amountOut: 2n,
    priceImpact: 0,
    gasEstimate: 1n,
    routerAddress: "0x1111111111111111111111111111111111111111",
    route: {
      routes: [],
      percentages: [],
      totalAmountIn: 1n,
      totalAmountOut: 2n,
      totalGasEstimate: 1n,
    },
    params: {
      srcToken: WBNB,
      dstToken: USDC,
      amountIn: 1n,
      amountOutMin: 2n,
      steps: [],
      intermediateTokens: [],
      deadline: 1n,
      quoteId: ethers.ZeroHash,
      expectAmountOut: 2n,
    },
    ...overrides,
  };
}

export function makeNativeQuote(overrides: Partial<Quote> = {}): Quote {
  const amountIn = overrides.amountIn ?? ethers.parseEther("1");
  return makeQuote({
    srcToken: NATIVE_TOKEN_ADDRESS,
    amountIn,
    srcNative: true,
    params: {
      ...makeQuote().params,
      srcToken: BSC_MAINNET_CONFIG.weth,
      amountIn,
    },
    ...overrides,
  });
}

export function makeDstNativeQuote(overrides: Partial<Quote> = {}): Quote {
  return makeQuote({
    dstToken: BSC_MAINNET_CONFIG.weth,
    dstNative: true,
    params: {
      ...makeQuote().params,
      dstToken: BSC_MAINNET_CONFIG.weth,
    },
    ...overrides,
  });
}

export function makeAllowanceProvider(allowance: bigint): ethers.Provider {
  return {
    call: vi.fn().mockImplementation(async ({ data }: { data?: string }) => {
      if (!data?.startsWith(allowanceInterface.getFunction("allowance")!.selector)) {
        throw new Error("Unexpected call");
      }
      return allowanceInterface.encodeFunctionResult("allowance", [allowance]);
    }),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 56n }),
  } as unknown as ethers.Provider;
}

export const integrationProvider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
export const integrationClient = new PeachClient(BSC_MAINNET_CONFIG, integrationProvider, {
  api: { baseUrl: PEACH_API.BASE_URL },
});
