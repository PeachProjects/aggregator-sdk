/**
 * All DEX Tests
 *
 * Test Peach Aggregator's quote and contract functionality with all providers enabled.
 * Tests split routing and best path selection across multiple DEXes.
 *
 * Test Cases:
 * 1. getQuote with all providers, verify quote is returned
 * 2. Simulate swap via PeachClient.simulate using Peach Aggregator contract, analyze difference vs quote
 * 3. Test native BNB and wrapped BNB swaps against USDC/USDT/BTC
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PeachClient, BSC_MAINNET_CONFIG } from '../../src';
import { PEACH_API, TEST_CONFIG, stringify, WBNB, USDT, USDC, BTCB, NATIVE_TOKEN_ADDRESS } from '../helpers';

/**
 * Analyze and print the difference between quote and simulation result.
 */
function analyzeQuoteVsSimulation(
  quoteAmountOut: bigint,
  simulatedAmountOut: bigint,
  label: string = 'Swap',
): {
  quoteAmountOut: bigint;
  simulatedAmountOut: bigint;
  difference: bigint;
  differencePercent: number;
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

  return { quoteAmountOut, simulatedAmountOut, difference, differencePercent };
}

describe('All DEX Tests', () => {
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  const client = new PeachClient(BSC_MAINNET_CONFIG, provider, {
    api: { baseUrl: PEACH_API.BASE_URL },
  });

  // Test caller address for simulation
  const testCaller = '0x1111111111111111111111111111111111111111';

  // ============================================
  // Test 1: getQuote with all providers
  // ============================================
  describe('1. getQuote Tests (All Providers)', () => {
    it('should return valid quote for WBNB -> USDT with all providers', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
      });

      console.log('Quote (WBNB -> USDT):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(USDT);
      expect(quote.amountIn).toBe(amountIn);
      expect(quote.amountOut).toBeGreaterThan(0n);
      expect(quote.params.amountOutMin).toBeGreaterThan(0n);
      expect(quote.gasEstimate).toBeGreaterThan(0n);

      expect(quote.params.steps.length).toBeGreaterThan(0);
      expect(quote.params.steps[0].adapter).toBeTruthy();
      expect(quote.params.deadline).toBeGreaterThan(0n);
    });

    it('should return valid quote for WBNB -> USDC with all providers', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDC,
        amountIn,
      });

      console.log('Quote (WBNB -> USDC):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(USDC);
      expect(quote.amountOut).toBeGreaterThan(0n);
    });

    it('should return valid quote for WBNB -> BTC with all providers', async () => {
      const amountIn = ethers.parseEther('0.5');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: BTCB,
        amountIn,
      });

      console.log('Quote (WBNB -> BTC):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(BTCB);
      expect(quote.amountOut).toBeGreaterThan(0n);
    });

    it('should potentially use split routing for larger amounts', async () => {
      const amountIn = ethers.parseEther('5');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
      });

      console.log('Quote (Large Amount):', stringify(quote));
      console.log('Number of routes:', quote.route.routes.length);
      console.log('Percentages:', quote.route.percentages);

      expect(quote.amountIn).toBe(amountIn);
      expect(quote.amountOut).toBeGreaterThan(0n);
      expect(quote.route.percentages.reduce((a, b) => a + b, 0)).toBe(10000);
    });
  });

  // ============================================
  // Test 2: Simulate swap using PeachClient.simulate
  // ============================================
  describe('2. Swap Simulation Tests (via PeachClient.simulate)', () => {
    it('simulate: WBNB -> USDT swap and analyze difference', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
        options: {},
      });

      // WBNB is ERC20 — needs state overrides for balance/allowance
      const stateOverrides = client.buildStateOverrides(WBNB, testCaller, quote.routerAddress!);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(quote, 500, testCaller, stateOverrides);

      console.log(`Simulation method: ${method}`);
      const analysis = analyzeQuoteVsSimulation(quote.amountOut, simulatedAmountOut, 'WBNB -> USDT');

      expect(method).toBe('swap'); // WBNB as ERC20 uses swap
      expect(simulatedAmountOut).toBeGreaterThan(0n);
      expect(analysis.differencePercent).toBeLessThan(5);
    });

    it('simulate: USDT -> WBNB swap with state overrides', async () => {
      const amountIn = ethers.parseUnits('10', 18);

      const quote = await client.getQuote({
        srcToken: USDT,
        dstToken: WBNB,
        amountIn,
        options: {},
      });

      // Build state overrides for USDT token
      const stateOverrides = client.buildStateOverrides(USDT, testCaller, quote.routerAddress);

      // Use PeachClient.simulate with state overrides
      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
        stateOverrides
      );

      console.log(`Simulation method: ${method}`);
      const analysis = analyzeQuoteVsSimulation(quote.amountOut, simulatedAmountOut, 'USDT -> WBNB');

      expect(method).toBe('swap'); // ERC20 uses swap
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });
  });

  // ============================================
  // Test 3: Native BNB and Wrapped BNB swaps
  // ============================================
  describe('3. Native BNB vs Wrapped BNB Tests', () => {
    it('Native BNB (via NATIVE_TOKEN_ADDRESS) -> USDT', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: NATIVE_TOKEN_ADDRESS,
        dstToken: USDT,
        amountIn,
        options: {},
      });

      const { amountOut: simulatedAmountOut, method } = await client.simulate(quote, 500, testCaller);

      console.log(`Native BNB -> USDT method: ${method}`);
      analyzeQuoteVsSimulation(quote.amountOut, simulatedAmountOut, 'Native BNB -> USDT');

      expect(method).toBe('swapETH');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });

    it('USDT -> WBNB (wrapped BNB as output)', async () => {
      const amountIn = ethers.parseUnits('10', 18);

      const quote = await client.getQuote({
        srcToken: USDT,
        dstToken: WBNB,
        amountIn,
        options: {},
      });

      const stateOverrides = client.buildStateOverrides(USDT, testCaller, quote.routerAddress);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
        stateOverrides
      );

      console.log(`USDT -> WBNB method: ${method}`);
      analyzeQuoteVsSimulation(quote.amountOut, simulatedAmountOut, 'USDT -> WBNB');

      expect(method).toBe('swap');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });

    it('USDC -> WBNB (wrapped BNB as output)', async () => {
      const amountIn = ethers.parseUnits('10', 18);

      const quote = await client.getQuote({
        srcToken: USDC,
        dstToken: WBNB,
        amountIn,
        options: {},
      });

      const stateOverrides = client.buildStateOverrides(USDC, testCaller, quote.routerAddress);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
        stateOverrides
      );

      console.log(`USDC -> WBNB method: ${method}`);
      analyzeQuoteVsSimulation(quote.amountOut, simulatedAmountOut, 'USDC -> WBNB');

      expect(method).toBe('swap');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });
  });
});
