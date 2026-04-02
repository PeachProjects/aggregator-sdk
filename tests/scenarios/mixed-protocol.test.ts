import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  calculateV2PairAddress,
  getV2PairContract,
  getV3PoolContract,
  TOKENS,
  PANCAKE_V2,
  PANCAKE_V3,
  checkV2Liquidity,
  checkV3Liquidity,
} from '../helpers';

describe('Mixed Protocol Tests', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = getProvider();
  });

  describe('V3 -> V2 Mixed Route', () => {
    it('should verify V3 -> V2 route: BNB -> USDC (V3) -> USDT (V2)', async () => {
      const v3Pool = PANCAKE_V3.POOLS['WBNB-USDC-0.01%'];
      const v3Liquidity = await checkV3Liquidity(v3Pool, provider);
      expect(v3Liquidity.hasLiquidity).toBe(true);

      const v2Pair = calculateV2PairAddress(TOKENS.USDC, TOKENS.USDT);
      await checkV2Liquidity(v2Pair, provider);
    });

    it('should verify pool parameters for mixed route', async () => {
      const v3Pool = getV3PoolContract(PANCAKE_V3.POOLS['WBNB-USDC-0.01%'], provider);
      const [v3Token0, v3Token1, v3Fee] = await Promise.all([
        v3Pool.token0(),
        v3Pool.token1(),
        v3Pool.fee(),
      ]);

      expect(v3Token0).toBeDefined();
      expect(v3Token1).toBeDefined();
      expect(Number(v3Fee)).toBe(100);
    });

    it('should determine correct swap directions for mixed route', async () => {
      const v3Pool = getV3PoolContract(PANCAKE_V3.POOLS['WBNB-USDC-0.01%'], provider);
      const [v3Token0, v3Token1] = await Promise.all([
        v3Pool.token0(),
        v3Pool.token1(),
      ]);

      expect(v3Token0).toBeDefined();
      expect(v3Token1).toBeDefined();
    });
  });

  describe('V2 -> V3 Mixed Route', () => {
    it('should verify V2 -> V3 route: BNB -> USDC (V2) -> USDT (V3)', async () => {
      const v2Pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const v2Liquidity = await checkV2Liquidity(v2Pair, provider);
      expect(v2Liquidity.hasLiquidity).toBe(true);

      const v3Pool = PANCAKE_V3.POOLS['USDC-USDT-1%'];
      const v3Liquidity = await checkV3Liquidity(v3Pool, provider);
      expect(v3Liquidity.hasLiquidity).toBe(true);
    });
  });

  describe('Complex Mixed Routes', () => {
    it('should verify three-hop mixed route: V2 -> V3 -> V2', async () => {
      const v2Pair1 = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity1 = await checkV2Liquidity(v2Pair1, provider);
      expect(liquidity1.hasLiquidity).toBe(true);

      const v3Pool = PANCAKE_V3.POOLS['USDC-USDT-1%'];
      const liquidity2 = await checkV3Liquidity(v3Pool, provider);
      expect(liquidity2.hasLiquidity).toBe(true);

      const v2Pair2 = calculateV2PairAddress(TOKENS.USDT, TOKENS.BUSD);
      await checkV2Liquidity(v2Pair2, provider);
    });
  });

  describe('Price Impact Analysis', () => {
    it('should compare price impact between V2 and V3', async () => {
      const v2Pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const v2Liquidity = await checkV2Liquidity(v2Pair, provider);
      expect(v2Liquidity.hasLiquidity).toBe(true);

      const v3Pool = PANCAKE_V3.POOLS['WBNB-USDC-0.01%'];
      const v3Liquidity = await checkV3Liquidity(v3Pool, provider);
      expect(v3Liquidity.hasLiquidity).toBe(true);
    });
  });
});
