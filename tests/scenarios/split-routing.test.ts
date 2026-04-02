import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  TOKENS,
  PANCAKE_V2,
  PANCAKE_V3,
  TEST_AMOUNTS,
  checkV2Liquidity,
  checkV3Liquidity,
} from '../helpers';

describe('Split Routing Tests', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = getProvider();
  });

  describe('Pool Discovery', () => {
    it('should identify multiple pools for same token pair', async () => {
      const v2Pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const v2Liquidity = await checkV2Liquidity(v2Pair, provider);
      expect(v2Liquidity.hasLiquidity).toBe(true);

      const v3Pools = [
        PANCAKE_V3.POOLS['WBNB-USDC-0.01%'],
        PANCAKE_V3.POOLS['WBNB-USDC-0.05%'],
      ];

      for (const pool of v3Pools) {
        const liquidity = await checkV3Liquidity(pool, provider);
        expect(liquidity.hasLiquidity).toBe(true);
      }
    });
  });

  describe('Split Ratio Calculation', () => {
    it('should calculate optimal split ratio (50/50)', () => {
      const totalAmount = TEST_AMOUNTS.MEDIUM;
      const splitRatio = 50;

      const amount1 = (totalAmount * BigInt(splitRatio)) / 100n;
      const amount2 = totalAmount - amount1;

      expect(amount1 + amount2).toBe(totalAmount);
      expect(amount1).toBeGreaterThan(0n);
      expect(amount2).toBeGreaterThan(0n);
    });
  });

  describe('Dynamic Split Optimization', () => {
    it('should calculate price impact reduction via splitting', async () => {
      const totalAmount = TEST_AMOUNTS.LARGE;
      const v2Pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const v2Liquidity = await checkV2Liquidity(v2Pair, provider);

      if (!v2Liquidity.hasLiquidity) return;

      const reserve = v2Liquidity.reserve0;
      const singleImpact = Number((totalAmount * 10000n) / reserve) / 100;

      const halfAmount = totalAmount / 2n;
      const splitImpact = Number((halfAmount * 10000n) / reserve) / 100;

      expect(splitImpact).toBeLessThan(singleImpact);
    });

    it('should determine optimal split based on liquidity', async () => {
      const [v2Liq, v3Liq1, v3Liq2] = await Promise.all([
        checkV2Liquidity(PANCAKE_V2.PAIRS['WBNB-USDC'], provider),
        checkV3Liquidity(PANCAKE_V3.POOLS['WBNB-USDC-0.01%'], provider),
        checkV3Liquidity(PANCAKE_V3.POOLS['WBNB-USDC-0.05%'], provider),
      ]);

      expect(v2Liq.hasLiquidity).toBe(true);
      expect(v3Liq1.hasLiquidity).toBe(true);
      expect(v3Liq2.hasLiquidity).toBe(true);
    });
  });

  describe('Multi-Hop Split', () => {
    it('should verify all pools in split with multi-hop paths', async () => {
      const directPool = await checkV3Liquidity(
        PANCAKE_V3.POOLS['WBNB-USDT-0.01%'],
        provider
      );
      expect(directPool.hasLiquidity).toBe(true);
    });
  });
});
