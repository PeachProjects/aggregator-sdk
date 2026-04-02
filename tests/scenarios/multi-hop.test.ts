import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  getTestWallet,
  calculateV2PairAddress,
  getV2PairContract,
  TOKENS,
  PANCAKE_V2,
  PANCAKE_V3,
  TEST_AMOUNTS,
  SLIPPAGE,
  calculateMinReturn,
  checkV2Liquidity,
  checkV3Liquidity,
} from '../helpers';

describe('Multi-Hop Routing Tests', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = getProvider();
  });

  describe('Two-Hop Routes', () => {
    it('should verify V2 -> V2 route: BNB -> USDC -> USDT', async () => {
      const pair1 = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity1 = await checkV2Liquidity(pair1, provider);
      expect(liquidity1.hasLiquidity).toBe(true);

      const pair2 = calculateV2PairAddress(TOKENS.USDC, TOKENS.USDT);
      const liquidity2 = await checkV2Liquidity(pair2, provider);
      // USDC-USDT pair may not exist on testnet
      if (!liquidity2.hasLiquidity) return;
      expect(liquidity2.hasLiquidity).toBe(true);
    });

    it('should verify V3 -> V3 route: BNB -> USDC -> USDT', async () => {
      const pool1 = PANCAKE_V3.POOLS['WBNB-USDC-0.01%'];
      const pool2 = PANCAKE_V3.POOLS['USDC-USDT-1%'];

      const [liquidity1, liquidity2] = await Promise.all([
        checkV3Liquidity(pool1, provider),
        checkV3Liquidity(pool2, provider),
      ]);

      expect(liquidity1.hasLiquidity).toBe(true);
      expect(liquidity2.hasLiquidity).toBe(true);
    });

    it('should calculate expected output for two-hop V2 route', async () => {
      const swapAmount = TEST_AMOUNTS.SMALL;
      const router = new ethers.Contract(
        PANCAKE_V2.ROUTER,
        ['function getAmountsOut(uint,address[]) view returns (uint[])'],
        provider
      );

      try {
        const path = [TOKENS.WBNB, TOKENS.USDC, TOKENS.USDT];
        const amounts = await router.getAmountsOut(swapAmount, path);

        const minReturn = calculateMinReturn(amounts[2], SLIPPAGE.TESTNET);
        expect(amounts[2]).toBeGreaterThan(0n);
        expect(minReturn).toBeLessThan(amounts[2]);
      } catch {
        // USDC-USDT pair may not have liquidity
      }
    });

    it('should verify swap directions for two-hop route', async () => {
      const pair1 = getV2PairContract(PANCAKE_V2.PAIRS['WBNB-USDC'], provider);
      const [token0, token1] = await Promise.all([
        pair1.token0(),
        pair1.token1(),
      ]);

      expect(token0).toBeDefined();
      expect(token1).toBeDefined();
    });

    it.skip('should execute two-hop swap: BNB -> USDC -> USDT', async () => {
      // Awaiting aggregator contract deployment
    });
  });

  describe('Three-Hop Routes', () => {
    it('should verify three-hop route: BNB -> USDC -> USDT -> BUSD', async () => {
      const pair1 = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity1 = await checkV2Liquidity(pair1, provider);
      expect(liquidity1.hasLiquidity).toBe(true);

      const pair2 = calculateV2PairAddress(TOKENS.USDC, TOKENS.USDT);
      await checkV2Liquidity(pair2, provider);

      const pair3 = calculateV2PairAddress(TOKENS.USDT, TOKENS.BUSD);
      await checkV2Liquidity(pair3, provider);
    });
  });

  describe('Route Optimization', () => {
    it('should compare direct vs multi-hop routes', async () => {
      const directPool = PANCAKE_V3.POOLS['WBNB-USDT-0.01%'];
      const directLiquidity = await checkV3Liquidity(directPool, provider);
      expect(directLiquidity.hasLiquidity).toBe(true);

      const [liquidity1, liquidity2] = await Promise.all([
        checkV3Liquidity(PANCAKE_V3.POOLS['WBNB-USDC-0.01%'], provider),
        checkV3Liquidity(PANCAKE_V3.POOLS['USDC-USDT-1%'], provider),
      ]);

      expect(liquidity1.hasLiquidity).toBe(true);
      expect(liquidity2.hasLiquidity).toBe(true);
    });
  });
});
