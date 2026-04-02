import { describe, it, expect } from "vitest";
import { ethers } from "ethers";

import { BSC_MAINNET_CONFIG, NATIVE_TOKEN_ADDRESS } from "../../src";
import { USDC, USDT, WBNB } from "../helpers";
import { integrationClient } from "../helpers/peach-client-test-utils";

describe("PeachClient getQuote (real API)", () => {
  const amountIn = ethers.parseEther("0.289");

  it("should return a valid quote for WBNB -> USDC", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: WBNB,
      dstToken: USDC,
      amountIn,
    });

    expect(quote.srcToken).toBe(WBNB);
    expect(quote.dstToken).toBe(USDC);
    expect(quote.amountIn).toBe(amountIn);
    expect(quote.amountOut).toBeGreaterThan(0n);
    expect(quote.params.amountOutMin).toBeGreaterThan(0n);
    expect(quote.params.steps.length).toBeGreaterThan(0);
    expect(quote.params.intermediateTokens).toBeDefined();

    const now = BigInt(Math.floor(Date.now() / 1000));
    expect(quote.params.deadline).toBeGreaterThan(now);

    expect(quote.gasEstimate).toBeGreaterThan(0n);
    expect(quote.route.routes).toHaveLength(1);
    expect(quote.route.percentages).toEqual([10000]);
    expect(quote.route.totalAmountIn).toBe(amountIn);
    expect(quote.route.totalAmountOut).toBe(quote.amountOut);
    expect(quote.routerAddress).toBeDefined();
  });

  it("should return a valid quote for WBNB -> USDT", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: WBNB,
      dstToken: USDT,
      amountIn,
    });

    expect(quote.srcToken).toBe(WBNB);
    expect(quote.dstToken).toBe(USDT);
    expect(quote.amountOut).toBeGreaterThan(0n);
    expect(quote.params.steps.length).toBeGreaterThan(0);
  });
});

describe("PeachClient Native Token Sentinel (real API)", () => {
  const amountIn = ethers.parseEther("1");

  it("getQuote with sentinel srcToken should set srcNative=true", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: NATIVE_TOKEN_ADDRESS,
      dstToken: USDC,
      amountIn,
    });

    expect(quote.srcNative).toBe(true);
    expect(quote.dstNative).toBeUndefined();
    expect(quote.amountOut).toBeGreaterThan(0n);
    expect(quote.routerAddress).toBeDefined();
  });

  it("getQuote with WBNB srcToken should NOT set srcNative", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: WBNB,
      dstToken: USDC,
      amountIn,
    });

    expect(quote.srcNative).toBeUndefined();
    expect(quote.amountOut).toBeGreaterThan(0n);
  });

  it("encodeSwapCalldata should use swapETH when srcNative=true", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: NATIVE_TOKEN_ADDRESS,
      dstToken: USDC,
      amountIn,
    });

    const result = integrationClient.encodeSwapCalldata(quote, 50);
    expect(result.method).toBe("swapETH");
    expect(result.value).toBe(amountIn);
  });

  it("encodeSwapCalldata should use swap when srcNative is not set (WBNB as ERC20)", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: WBNB,
      dstToken: USDC,
      amountIn,
    });

    const result = integrationClient.encodeSwapCalldata(quote, 50);
    expect(result.method).toBe("swap");
    expect(result.value).toBe(0n);
  });

  it("buildStateOverrides should return empty for sentinel address", () => {
    const overrides = integrationClient.buildStateOverrides(
      NATIVE_TOKEN_ADDRESS,
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
    );
    expect(overrides).toEqual({});
  });

  it("buildStateOverrides should return empty when options.isNative=true", () => {
    const overrides = integrationClient.buildStateOverrides(
      WBNB,
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
      undefined,
      undefined,
      { isNative: true },
    );
    expect(overrides).toEqual({});
  });

  it("buildStateOverrides should return non-empty for WBNB (treated as ERC20)", () => {
    const overrides = integrationClient.buildStateOverrides(
      WBNB,
      "0x2222222222222222222222222222222222222222",
      "0x1111111111111111111111111111111111111111",
    );
    expect(overrides).not.toEqual({});
  });

  it("native quote should still encode against the configured wrapped token", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: NATIVE_TOKEN_ADDRESS,
      dstToken: USDC,
      amountIn,
    });

    expect(quote.params.srcToken).toBe(BSC_MAINNET_CONFIG.weth);
  });

  it("getQuote with sentinel dstToken should set dstNative=true", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: USDC,
      dstToken: NATIVE_TOKEN_ADDRESS,
      amountIn: ethers.parseUnits("1", 18),
    });

    expect(quote.dstNative).toBe(true);
    expect(quote.srcNative).toBeUndefined();
    expect(quote.params.dstToken).toBe(BSC_MAINNET_CONFIG.weth);
    expect(quote.amountOut).toBeGreaterThan(0n);
  });

  it("encodeSwapCalldata should use swapETH with value=0n for dstNative quotes", async () => {
    const quote = await integrationClient.getQuote({
      srcToken: USDC,
      dstToken: NATIVE_TOKEN_ADDRESS,
      amountIn: ethers.parseUnits("1", 18),
    });

    const result = integrationClient.encodeSwapCalldata(quote, 50);
    expect(result.method).toBe("swapETH");
    expect(result.value).toBe(0n);
  });
});
