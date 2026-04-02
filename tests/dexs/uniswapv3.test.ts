/**
 * UniswapV3 DEX Tests
 *
 * Test Peach Aggregator's quote and contract functionality for UniswapV3 on BSC.
 *
 * Test Cases:
 * 1. getQuote with provider=UNISWAPV3 only, verify quote is returned
 * 2. Simulate swap via PeachClient.simulate using Peach Aggregator contract
 * 3. Test native BNB and wrapped BNB swaps against USDC/USDT/BTC
 *
 * Note: UniswapV3 on BSC may have limited liquidity compared to PancakeSwap.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PeachClient, BSC_MAINNET_CONFIG, ProtocolType } from '../../src';
import { PEACH_API, TEST_CONFIG, stringify, WBNB, USDT, USDC, BTCB, NATIVE_TOKEN_ADDRESS } from '../helpers';

// UniswapV3 Adapter on BSC
const UNISWAPV3_ADAPTER = '0x431753669c9082615038bff353204D0ACc4fb915';

const PROVIDER_NAME = 'UNISWAPV3';

describe('UniswapV3 DEX Tests', () => {
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  const client = new PeachClient(BSC_MAINNET_CONFIG, provider, {
    api: { baseUrl: PEACH_API.BASE_URL },
  });

  const testCaller = '0x1111111111111111111111111111111111111111';

  // ============================================
  // Test 1: getQuote with provider=UNISWAPV3 only
  // ============================================
  describe('1. getQuote Tests (UNISWAPV3 only)', () => {
    it('should return valid quote for WBNB -> USDT', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
        options: { providers: [PROVIDER_NAME] },
      });

      console.log('Quote (WBNB -> USDT):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(USDT);
      expect(quote.amountIn).toBe(amountIn);
      expect(quote.amountOut).toBeGreaterThan(0n);
      expect(quote.params.amountOutMin).toBeGreaterThan(0n);
      expect(quote.gasEstimate).toBeGreaterThan(0n);

      expect(quote.params.steps.length).toBeGreaterThan(0);
      expect(quote.params.steps[0].adapter).toBe(UNISWAPV3_ADAPTER);
      expect(quote.params.deadline).toBeGreaterThan(0n);

      const protocols = quote.route.routes[0].steps.map(s => s.pool.protocol);
      expect(protocols).toContain(ProtocolType.UniswapV3);
    });

    it('should return valid quote for WBNB -> USDC', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDC,
        amountIn,
        options: { providers: [PROVIDER_NAME] },
      });

      console.log('Quote (WBNB -> USDC):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(USDC);
      expect(quote.amountOut).toBeGreaterThan(0n);
    });

    it('should return valid quote for WBNB -> BTC', async () => {
      const amountIn = ethers.parseEther('0.5');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: BTCB,
        amountIn,
        options: { providers: [PROVIDER_NAME] },
      });

      console.log('Quote (WBNB -> BTC):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(BTCB);
      expect(quote.amountOut).toBeGreaterThan(0n);
    });
  });

  // ============================================
  // Test 2: Simulate swap using PeachClient.simulate
  // ============================================
  describe('2. Swap Simulation Tests (via PeachClient.simulate)', () => {
    it('simulate: WBNB -> USDT swap via PeachClient.simulate', async () => {
      const amountIn = ethers.parseEther('0.1');

      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
        options: { providers: [PROVIDER_NAME], },
      });

      const stateOverrides = client.buildStateOverrides(WBNB, testCaller, quote.routerAddress!);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(quote, 500, testCaller, stateOverrides);

      console.log(`Simulation method: ${method}`);
      console.log(`Quote amountOut: ${quote.amountOut}`);
      console.log(`Simulated amountOut: ${simulatedAmountOut}`);

      expect(method).toBe('swap');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });

    it('simulate: USDT -> WBNB swap with state overrides', async () => {
      const amountIn = ethers.parseUnits('10', 18);

      const quote = await client.getQuote({
        srcToken: USDT,
        dstToken: WBNB,
        amountIn,
        options: { providers: [PROVIDER_NAME], },
      });

      const stateOverrides = client.buildStateOverrides(USDT, testCaller, quote.routerAddress);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
        stateOverrides
      );

      console.log(`Simulation method: ${method}`);
      console.log(`Quote amountOut: ${quote.amountOut}`);
      console.log(`Simulated amountOut: ${simulatedAmountOut}`);

      expect(method).toBe('swap');
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
        options: { providers: [PROVIDER_NAME], },
      });

      const { amountOut: simulatedAmountOut, method } = await client.simulate(quote, 500, testCaller);

      console.log(`Native BNB -> USDT method: ${method}`);
      console.log(`Simulated amountOut: ${simulatedAmountOut}`);

      expect(method).toBe('swapETH');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });

    it('USDT -> WBNB (wrapped BNB as output)', async () => {
      const amountIn = ethers.parseUnits('10', 18);

      const quote = await client.getQuote({
        srcToken: USDT,
        dstToken: WBNB,
        amountIn,
        options: { providers: [PROVIDER_NAME], },
      });

      const stateOverrides = client.buildStateOverrides(USDT, testCaller, quote.routerAddress);
      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
        stateOverrides
      );

      console.log(`USDT -> WBNB method: ${method}`);
      console.log(`Simulated amountOut: ${simulatedAmountOut}`);

      expect(method).toBe('swap');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });
  });
});
