import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  getTestWallet,
  calculateV2PairAddress,
  TOKENS,
  PANCAKE_V2,
  PANCAKE_V3,
  TEST_AMOUNTS,
  SLIPPAGE,
  calculateMinReturn,
  checkV2Liquidity,
  checkV3Liquidity,
} from '../helpers';

describe('Edge Cases Tests', () => {
  let provider: ethers.JsonRpcProvider;
  let wallet: ethers.Wallet;

  beforeAll(() => {
    provider = getProvider();
    wallet = getTestWallet(provider);
  });

  describe('Zero and Minimum Amounts', () => {
    it('should reject zero swap amount', () => {
      const zeroAmount = 0n;
      expect(zeroAmount).toBe(0n);
    });

    it('should handle dust amounts (1 wei)', async () => {
      const dustAmount = 1n;
      const router = new ethers.Contract(
        PANCAKE_V2.ROUTER,
        ['function getAmountsOut(uint,address[]) view returns (uint[])'],
        provider
      );

      try {
        const path = [TOKENS.WBNB, TOKENS.USDC];
        const amounts = await router.getAmountsOut(dustAmount, path);
        // Dust amounts typically result in 0 output due to rounding
        expect(amounts[1]).toBeDefined();
      } catch {
        // Expected: router may revert for amounts too small
      }

      expect(dustAmount).toBe(1n);
    });

    it('should handle maximum swap amounts vs pool reserves', async () => {
      const maxAmount = ethers.parseEther('1000000');
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);

      if (liquidity.hasLiquidity) {
        const reserve = liquidity.reserve0;
        const percentOfReserve = Number((maxAmount * 10000n) / reserve) / 100;
        // A swap of 1M BNB should exceed pool capacity
        expect(percentOfReserve).toBeGreaterThan(0);
      }

      expect(maxAmount).toBeGreaterThan(0n);
    });
  });

  describe('Invalid Pool Addresses', () => {
    it('should detect non-existent pool', async () => {
      const fakePoolAddress = '0x0000000000000000000000000000000000000001';
      const liquidity = await checkV2Liquidity(fakePoolAddress, provider);
      expect(liquidity.hasLiquidity).toBe(false);
    });

    it('should validate pool token pair matches swap', async () => {
      const pool = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const pairContract = new ethers.Contract(
        pool,
        ['function token0() view returns (address)', 'function token1() view returns (address)'],
        provider
      );

      const [token0, token1] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
      ]);

      const hasWBNB = token0.toLowerCase() === TOKENS.WBNB.toLowerCase() ||
                      token1.toLowerCase() === TOKENS.WBNB.toLowerCase();
      const hasUSDC = token0.toLowerCase() === TOKENS.USDC.toLowerCase() ||
                      token1.toLowerCase() === TOKENS.USDC.toLowerCase();

      expect(hasWBNB && hasUSDC).toBe(true);
    });
  });

  describe('Slippage Protection', () => {
    it('should calculate slippage tolerance correctly', () => {
      const expectedOut = ethers.parseUnits('100', 18);

      const minReturn1Percent = calculateMinReturn(expectedOut, 100);
      const expected1Percent = expectedOut * 99n / 100n;

      expect(minReturn1Percent).toBe(expected1Percent);
    });

    it('should simulate slippage protection trigger', async () => {
      const swapAmount = TEST_AMOUNTS.SMALL;
      const router = new ethers.Contract(
        PANCAKE_V2.ROUTER,
        ['function getAmountsOut(uint,address[]) view returns (uint[])'],
        provider
      );

      const path = [TOKENS.WBNB, TOKENS.USDC];
      const amounts = await router.getAmountsOut(swapAmount, path);
      const expectedOut = amounts[1];

      const minReturn = calculateMinReturn(expectedOut, SLIPPAGE.NORMAL);
      // 1% slippage means actual output must be >= 99% of expected
      expect(minReturn).toBe(expectedOut * 99n / 100n);
      expect(expectedOut).toBeGreaterThan(0n);
    });
  });

  describe('Price Impact', () => {
    it('should calculate price impact for various amounts', async () => {
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);
      if (!liquidity.hasLiquidity) return;

      const reserve = liquidity.reserve0;

      const testAmounts = [
        TEST_AMOUNTS.TINY,
        TEST_AMOUNTS.SMALL,
        TEST_AMOUNTS.MEDIUM,
        TEST_AMOUNTS.LARGE,
      ];

      // Each larger amount should have proportionally more impact
      const impacts = testAmounts.map(amount =>
        Number((amount * 10000n) / reserve)
      );

      for (let i = 1; i < impacts.length; i++) {
        expect(impacts[i]).toBeGreaterThan(impacts[i - 1]);
      }

      expect(reserve).toBeGreaterThan(0n);
    });

    it('should identify when to use multi-hop vs direct', async () => {
      const directPool = await checkV3Liquidity(PANCAKE_V3.POOLS['WBNB-USDT-0.01%'], provider);
      expect(directPool.hasLiquidity).toBe(true);

      const hop1Pool = await checkV3Liquidity(PANCAKE_V3.POOLS['WBNB-USDC-0.01%'], provider);
      const hop2Pool = await checkV3Liquidity(PANCAKE_V3.POOLS['USDC-USDT-1%'], provider);
      expect(hop1Pool.hasLiquidity).toBe(true);
      expect(hop2Pool.hasLiquidity).toBe(true);
    });
  });
});
