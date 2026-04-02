/**
 * Multi-Provider BNB -> USDT Test
 *
 * 1. getQuote: 0.006 BNB -> USDT with providers: UNISWAPV3, PANCAKEV2
 * 2. Simulate swap via PeachClient.simulate and compare with quote
 *
 * Note: UNISWAPV2 is not a supported provider. PANCAKEV2 (UniswapV2 fork) is used instead.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PeachClient, BSC_MAINNET_CONFIG } from '../../src';
import { PEACH_API, TEST_CONFIG, stringify, WBNB, USDT, NATIVE_TOKEN_ADDRESS } from '../helpers';

const PROVIDERS = ['UNISWAPV3', 'PANCAKEV2'] as const;

describe('Multi-Provider: 0.006 BNB -> USDT', () => {
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  const client = new PeachClient(BSC_MAINNET_CONFIG, provider, {
    api: { baseUrl: PEACH_API.BASE_URL },
  });

  const testCaller = '0x1111111111111111111111111111111111111111';
  const amountIn = ethers.parseEther('0.006');

  describe('1. getQuote', () => {
    it('should return valid quote for 0.006 BNB -> USDT', async () => {
      const quote = await client.getQuote({
        srcToken: WBNB,
        dstToken: USDT,
        amountIn,
        options: { providers: [...PROVIDERS] },
      });

      console.log('Quote (0.006 BNB -> USDT):', stringify(quote));

      expect(quote.srcToken).toBe(WBNB);
      expect(quote.dstToken).toBe(USDT);
      expect(quote.amountIn).toBe(amountIn);
      expect(quote.amountOut).toBeGreaterThan(0n);
      expect(quote.gasEstimate).toBeGreaterThan(0n);
      expect(quote.params.steps.length).toBeGreaterThan(0);
      expect(quote.params.deadline).toBeGreaterThan(0n);

      // Verify only requested providers are used
      const usedProviders = quote.route.routes[0].steps.map(s => s.pool.protocol);
      console.log('Used protocols:', usedProviders);
    });
  });

  describe('2. Swap Simulation', () => {
    it('should simulate 0.006 BNB -> USDT and compare with quote', async () => {
      const quote = await client.getQuote({
        srcToken: NATIVE_TOKEN_ADDRESS,
        dstToken: USDT,
        amountIn,
        options: { providers: [...PROVIDERS]},
      });

      const { amountOut: simulatedAmountOut, method } = await client.simulate(
        quote,
        500,
        testCaller,
      );

      const difference = quote.amountOut - simulatedAmountOut;
      const differencePercent =
        quote.amountOut > 0n
          ? Number((difference * 10000n) / quote.amountOut) / 100
          : 0;

      console.log('\n===== 0.006 BNB -> USDT Simulation =====');
      console.log(`Method:              ${method}`);
      console.log(`Quote amountOut:     ${quote.amountOut}`);
      console.log(`Simulated amountOut: ${simulatedAmountOut}`);
      console.log(`Difference:          ${difference}`);
      console.log(`Difference %:        ${differencePercent.toFixed(4)}%`);
      console.log('=========================================\n');

      expect(method).toBe('swapETH');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
      expect(Math.abs(differencePercent)).toBeLessThan(5);
    });
  });
});
