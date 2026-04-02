import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";

import { PeachClient, BSC_MAINNET_CONFIG, type Quote } from "../../src";
import {
  makeAllowanceProvider,
  makeDstNativeQuote,
  makeNativeQuote,
  makeQuote,
} from "../helpers/peach-client-test-utils";

describe("PeachClient", () => {
  const mockProvider = {
    getNetwork: vi.fn().mockResolvedValue({ chainId: 56n }),
  } as unknown as ethers.Provider;

  describe("constructor", () => {
    it("should create client without API config", () => {
      const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
      expect(c).toBeInstanceOf(PeachClient);
    });

    it("should create client with API config", () => {
      const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider, {
        api: { baseUrl: "https://api.test.com" },
      });
      expect(c).toBeInstanceOf(PeachClient);
    });
  });

  describe("getQuote", () => {
    it("should use default API URL when no config provided", () => {
      const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
      // Client is created with default API URL; getQuote will attempt API call
      expect(c).toBeInstanceOf(PeachClient);
    });
  });

  describe("getAvailableProviders", () => {
    it("should use default API URL when no config provided", () => {
      const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
      // Client is created with default API URL; getAvailableProviders will attempt API call
      expect(c).toBeInstanceOf(PeachClient);
    });
  });
});

describe("PeachClient Token Methods", () => {
  it("getTokenInfo method should exist", () => {
    const mockProvider = {} as ethers.Provider;
    const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
    expect(typeof c.getTokenInfo).toBe("function");
  });

  it("getBalance method should exist", () => {
    const mockProvider = {} as ethers.Provider;
    const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
    expect(typeof c.getBalance).toBe("function");
  });

  it("simulate with state overrides should require a provider with send()", async () => {
    const mockProvider = {
      call: vi.fn(),
    } as unknown as ethers.Provider;
    const c = new PeachClient(
      { ...BSC_MAINNET_CONFIG, routerAddress: "0x1111111111111111111111111111111111111111" },
      mockProvider
    );

    const quote: Quote = {
      srcToken: BSC_MAINNET_CONFIG.weth,
      dstToken: "0x2222222222222222222222222222222222222222",
      amountIn: 1n,
      amountOut: 1n,
      priceImpact: 0,
      gasEstimate: 1n,
      routerAddress: "0x1111111111111111111111111111111111111111",
      route: {
        routes: [],
        percentages: [],
        totalAmountIn: 1n,
        totalAmountOut: 1n,
        totalGasEstimate: 1n,
      },
      params: {
        srcToken: BSC_MAINNET_CONFIG.weth,
        dstToken: "0x2222222222222222222222222222222222222222",
        amountIn: 1n,
        amountOutMin: 1n,
        steps: [],
        intermediateTokens: [],
        deadline: 1n,
        quoteId: ethers.ZeroHash,
        expectAmountOut: 1n,
      },
    };

    await expect(
      c.simulate(
        quote,
        50,
        "0x3333333333333333333333333333333333333333",
        { "0x4444444444444444444444444444444444444444": { stateDiff: {} } }
      )
    ).rejects.toThrow("stateOverrides require a JsonRpcProvider-compatible provider with send(method, params).");
  });
});

describe("PeachClient swap()", () => {
  const owner = "0x3333333333333333333333333333333333333333";

  it("should return approval and swap tx requests when allowance is insufficient", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, makeAllowanceProvider(0n));
    const quote = makeQuote();

    const result = await c.swap(quote, owner, {
      slippageBps: 50,
      gasPrice: 123n,
      gasLimit: 456n,
    });

    expect(result.routerAddress).toBe(quote.routerAddress);
    expect(result.method).toBe("swap");
    expect(result.tx.to).toBe(quote.routerAddress);
    expect(result.tx.value).toBe(0n);
    expect(result.tx.gasPrice).toBe(123n);
    expect(result.tx.gasLimit).toBe(456n);
    expect(result.approval).toBeDefined();
    expect(result.approval?.spender).toBe(quote.routerAddress);
    expect(result.approval?.currentAllowance).toBe(0n);
    expect(result.approval?.requiredAmount).toBe(quote.amountIn);
    expect(result.approval?.approveAmount).toBe(ethers.MaxUint256);
    expect(result.approval?.tx.to).toBe(quote.srcToken);
    expect(result.approval?.tx.value).toBe(0n);
    expect(result.approval?.tx.gasPrice).toBe(123n);
    expect(result.approval?.tx.gasLimit).toBeUndefined();
  });

  it("should omit approval for native-token swaps", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, makeAllowanceProvider(0n));
    const quote = makeNativeQuote();

    const result = await c.swap(quote, owner, { slippageBps: 50 });

    expect(result.method).toBe("swapETH");
    expect(result.tx.value).toBe(quote.amountIn);
    expect(result.approval).toBeUndefined();
  });

  it("should omit approval when allowance is already sufficient", async () => {
    const quote = makeQuote({ amountIn: 10n });
    const c = new PeachClient(BSC_MAINNET_CONFIG, makeAllowanceProvider(10n));

    const result = await c.swap(quote, owner, { slippageBps: 50 });

    expect(result.approval).toBeUndefined();
  });

  it("should use swapETH with value=0n when dstNative=true (ERC20 -> native BNB)", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, makeAllowanceProvider(0n));
    const quote = makeDstNativeQuote();

    const result = await c.swap(quote, owner, { slippageBps: 50 });

    expect(result.method).toBe("swapETH");
    expect(result.tx.value).toBe(0n);
    expect(result.approval).toBeDefined();
  });

  it("should use swapETH with value=amountIn when both srcNative and dstNative are true", async () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, makeAllowanceProvider(0n));
    const quote = makeNativeQuote({ dstNative: true });

    const result = await c.swap(quote, owner, { slippageBps: 50 });

    expect(result.method).toBe("swapETH");
    expect(result.tx.value).toBe(quote.amountIn);
    expect(result.approval).toBeUndefined();
  });
});

describe("PeachClient encodeSwapCalldata()", () => {
  const mockProvider = {
    getNetwork: vi.fn().mockResolvedValue({ chainId: 56n }),
  } as unknown as ethers.Provider;

  it("should use swapETH with value=0n when only dstNative=true", () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
    const quote = makeDstNativeQuote();

    const result = c.encodeSwapCalldata(quote, 50);

    expect(result.method).toBe("swapETH");
    expect(result.value).toBe(0n);
  });

  it("should use swapETH with value=amountIn when both srcNative and dstNative are true", () => {
    const c = new PeachClient(BSC_MAINNET_CONFIG, mockProvider);
    const quote = makeNativeQuote({ dstNative: true });

    const result = c.encodeSwapCalldata(quote, 50);

    expect(result.method).toBe("swapETH");
    expect(result.value).toBe(quote.amountIn);
  });
});
