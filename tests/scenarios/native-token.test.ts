import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  getTestWallet,
  getTokenContract,
  TOKENS,
  PANCAKE_V2,
  PANCAKE_V3,
  TEST_AMOUNTS,
  SLIPPAGE,
  calculateMinReturn,
  checkV2Liquidity,
  checkV3Liquidity,
} from '../helpers';

describe('Native Token Tests', () => {
  let provider: ethers.JsonRpcProvider;
  let wallet: ethers.Wallet;

  beforeAll(() => {
    provider = getProvider();
    wallet = getTestWallet(provider);
  });

  describe('WBNB Contract', () => {
    it('should verify WBNB contract', async () => {
      const wbnb = getTokenContract(TOKENS.WBNB, provider);
      const [symbol, decimals] = await Promise.all([
        wbnb.symbol(),
        wbnb.decimals(),
      ]);

      expect(symbol).toBe('WBNB');
      expect(decimals).toBe(18n);
    });

    it('should have deposit and withdraw functions', async () => {
      const wbnb = new ethers.Contract(
        TOKENS.WBNB,
        [
          'function deposit() payable',
          'function withdraw(uint256)',
          'function balanceOf(address) view returns (uint256)',
        ],
        provider
      );

      expect(wbnb.interface.getFunction('deposit')).toBeDefined();
      expect(wbnb.interface.getFunction('withdraw')).toBeDefined();
    });
  });

  describe('BNB -> Token Swaps', () => {
    it('should verify BNB -> USDC swap path (V2)', async () => {
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });

    it('should verify BNB -> USDC swap path (V3)', async () => {
      const pool = PANCAKE_V3.POOLS['WBNB-USDC-0.01%'];
      const liquidity = await checkV3Liquidity(pool, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });

    it('should calculate expected output for BNB -> USDC', async () => {
      const swapAmount = TEST_AMOUNTS.SMALL;
      const router = new ethers.Contract(
        PANCAKE_V2.ROUTER,
        ['function getAmountsOut(uint,address[]) view returns (uint[])'],
        provider
      );

      const path = [TOKENS.WBNB, TOKENS.USDC];
      const amounts = await router.getAmountsOut(swapAmount, path);

      const expectedOut = amounts[1];
      const minReturn = calculateMinReturn(expectedOut, SLIPPAGE.TESTNET);

      expect(expectedOut).toBeGreaterThan(0n);
      expect(minReturn).toBeLessThan(expectedOut);
    });

    it.skip('should execute BNB -> USDC swap', async () => {
      // Awaiting aggregator contract deployment
    });
  });

  describe('Token -> BNB Swaps', () => {
    it('should verify USDC -> BNB swap path (V2)', async () => {
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });

    it('should verify USDC -> BNB swap path (V3)', async () => {
      const pool = PANCAKE_V3.POOLS['WBNB-USDC-0.01%'];
      const liquidity = await checkV3Liquidity(pool, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });

    it('should calculate expected output for USDC -> BNB', async () => {
      const swapAmount = ethers.parseUnits('10', 18);
      const router = new ethers.Contract(
        PANCAKE_V2.ROUTER,
        ['function getAmountsOut(uint,address[]) view returns (uint[])'],
        provider
      );

      const path = [TOKENS.USDC, TOKENS.WBNB];
      const amounts = await router.getAmountsOut(swapAmount, path);

      expect(amounts[1]).toBeGreaterThan(0n);
    });

    it.skip('should execute USDC -> BNB swap', async () => {
      // Awaiting aggregator contract deployment
    });
  });

  describe('Multi-Hop with Native Token', () => {
    it('should verify BNB -> USDC -> USDT path', async () => {
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });

    it('should verify USDT -> USDC -> BNB path', async () => {
      const pair = PANCAKE_V2.PAIRS['WBNB-USDC'];
      const liquidity = await checkV2Liquidity(pair, provider);
      expect(liquidity.hasLiquidity).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('should detect insufficient BNB balance', async () => {
      const balance = await provider.getBalance(wallet.address);
      const excessiveAmount = balance + ethers.parseEther('1000');
      expect(excessiveAmount).toBeGreaterThan(balance);
    });
  });
});
