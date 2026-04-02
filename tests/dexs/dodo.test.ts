/**
 * DODO DEX Tests
 *
 * Test Peach Aggregator's quote and contract functionality for DODO on BSC.
 *
 * Test Cases:
 * 1. getQuote with DODO in mixed providers, verify quote is returned
 * 2. Simulate swap via PeachClient.simulate using Peach Aggregator contract
 *
 * Note: Requires DODO adapter to be deployed and API to support DODO provider.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PeachClient, BSC_MAINNET_CONFIG } from '../../src';
import { PEACH_API, TEST_CONFIG, stringify, WBNB, USDT, NATIVE_TOKEN_ADDRESS, diagnoseRouteFailure } from '../helpers';

const PROVIDER_NAME = 'DODO';

describe('DODO DEX Tests', () => {
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  const client = new PeachClient(BSC_MAINNET_CONFIG, provider, {
    api: { baseUrl: PEACH_API.BASE_URL },
  });

  const testCaller = '0x5c0D693B30D5e494421D0589729A26AB86ed1948';

  describe('Swap Simulation Tests (when DODO in route)', () => {
    it('simulate: WBNB -> USDT swap when API returns DODO path', { timeout: 90000 }, async () => {
      if (TEST_CONFIG.RPC_URL.includes('your_api_key') || !TEST_CONFIG.RPC_URL) {
        return;
      }

      const amountIn = 50000000000000000000n;

      const quote = await client.getQuote({
        srcToken: NATIVE_TOKEN_ADDRESS,
        dstToken: USDT,
        amountIn,
        options: { providers: ['UNISWAPV3', PROVIDER_NAME, 'PANCAKEV3'] },
      });

      console.log('Quote:', stringify(quote));

      // Native BNB — swapETH wraps msg.value, no ERC20 state overrides needed
      const stateOverrides = undefined;

      let simulatedAmountOut: bigint;
      let method: 'swap' | 'swapETH';
      try {
        const r = await client.simulate(quote, 500, testCaller, stateOverrides);
        simulatedAmountOut = r.amountOut;
        method = r.method;
      } catch (err: unknown) {
        console.log('[All steps]', quote.params.steps.map((s, i) => ({
          i,
          tokenIn: s.tokenIn,
          tokenOut: s.tokenOut,
          amountIn: s.amountIn.toString(),
          pool: s.pool,
        })));
        const failing = await client.findFailingStep(quote, 500, testCaller, stateOverrides, err);
        if (failing) {
          console.log('[Failing step] index:', failing.stepIndex, 'pool:', failing.step.pool);
          console.log('[Failing step] step.tokenIn:', failing.step.tokenIn);
          console.log('[Failing step] step.tokenOut:', failing.step.tokenOut);
          console.log('[Failing step] step.amountIn:', failing.step.amountIn.toString());
          console.log('[Failing step] revert (full route):', failing.fullRouteRevertMessage ?? '(none)');
          console.log('[Failing step] revert (this step only):', failing.revertMessage ?? '(no message)');
        }
        await diagnoseRouteFailure(quote, provider, err, {
          simulate: (q) => client.simulate(q, 500, testCaller, stateOverrides).then((r) => r.amountOut),
        });
        throw err;
      }

      console.log('[Swap Simulation] Quote amountIn:', quote.amountIn);
      console.log('[Swap Simulation] Simulation method:', method);
      console.log('[Swap Simulation] Quote amountOut:', quote.amountOut);
      console.log('[Swap Simulation] Simulated amountOut:', simulatedAmountOut);

      expect(method).toBe('swapETH');
      expect(simulatedAmountOut).toBeGreaterThan(0n);
    });
  });
});
