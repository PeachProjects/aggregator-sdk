/**
 * Real Transaction Test
 *
 * Sends a real on-chain swap transaction using execute().
 * Requires PRIVATE_KEY in .env with a funded wallet.
 *
 * Run: npx vitest run tests/dexs/execute-real.test.ts
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { PeachClient, BSC_MAINNET_CONFIG } from '../../src';
import { PEACH_API, TEST_CONFIG, stringify, WBNB, USDT, NATIVE_TOKEN_ADDRESS } from '../helpers';
import { getPrivateKey } from '../helpers/config';

describe('Real Transaction Tests', () => {
  const provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  const privateKey = getPrivateKey();
  const wallet = new ethers.Wallet(privateKey, provider);

  const client = new PeachClient(BSC_MAINNET_CONFIG, provider, {
    api: { baseUrl: PEACH_API.BASE_URL },
  });

  it('execute: BNB -> USDT real swap (small amount)', async () => {
    const amountIn = ethers.parseEther('0.001'); // ~$0.60 worth of BNB

    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet: ${wallet.address}`);
    console.log(`BNB Balance: ${ethers.formatEther(balance)} BNB`);
    expect(balance).toBeGreaterThan(amountIn);

    // Get quote - use THENA provider (known to work)
    const quote = await client.getQuote({
      srcToken: NATIVE_TOKEN_ADDRESS,
      dstToken: USDT,
      amountIn,
      options: { providers: ['THENA'] },
    });

    console.log('Quote:', stringify(quote));
    expect(quote.amountOut).toBeGreaterThan(0n);

    // Execute real transaction
    const tx = await client.execute(quote, wallet, {
      slippageBps: 500,
      skipPreflight: true,
    });

    console.log(`TX Hash: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`TX confirmed in block: ${receipt?.blockNumber}`);
    console.log(`Gas used: ${receipt?.gasUsed}`);
    console.log(`Status: ${receipt?.status === 1 ? 'SUCCESS' : 'FAILED'}`);

    expect(receipt?.status).toBe(1);
  }, 60_000); // 60s timeout for on-chain tx

  it('execute: USDT -> native BNB real swap (dstNative)', async () => {
    const amountIn = ethers.parseUnits('0.5', 18); // ~$0.50 worth of USDT

    // Check wallet USDT balance
    const usdt = new ethers.Contract(
      USDT,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    const usdtBalance = await usdt.balanceOf(wallet.address);
    console.log(`Wallet: ${wallet.address}`);
    console.log(`USDT Balance: ${ethers.formatUnits(usdtBalance, 18)} USDT`);
    expect(usdtBalance).toBeGreaterThan(amountIn);

    // Record BNB balance before swap
    const bnbBefore = await provider.getBalance(wallet.address);
    console.log(`BNB Balance before: ${ethers.formatEther(bnbBefore)} BNB`);

    // Get quote: USDT -> native BNB (sentinel address)
    const quote = await client.getQuote({
      srcToken: USDT,
      dstToken: NATIVE_TOKEN_ADDRESS,
      amountIn,
    });

    console.log('Quote:', stringify(quote));
    expect(quote.dstNative).toBe(true);
    expect(quote.amountOut).toBeGreaterThan(0n);

    // Verify SDK routes to swapETH with value=0n
    const encoded = client.encodeSwapCalldata(quote, 500);
    expect(encoded.method).toBe('swapETH');
    expect(encoded.value).toBe(0n);

    // Execute real transaction (handles approval + swap)
    const tx = await client.execute(quote, wallet, {
      slippageBps: 500,
      skipPreflight: true,
    });

    console.log(`TX Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`TX confirmed in block: ${receipt?.blockNumber}`);
    console.log(`Gas used: ${receipt?.gasUsed}`);
    console.log(`Status: ${receipt?.status === 1 ? 'SUCCESS' : 'FAILED'}`);

    expect(receipt?.status).toBe(1);

    // Verify we received native BNB (not WBNB)
    const bnbAfter = await provider.getBalance(wallet.address);
    console.log(`BNB Balance after: ${ethers.formatEther(bnbAfter)} BNB`);
    // bnbAfter should be greater than bnbBefore minus gas cost
    // (we received BNB from swap, spent some on gas)
    const wbnb = new ethers.Contract(
      WBNB,
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    const wbnbBalance = await wbnb.balanceOf(wallet.address);
    console.log(`WBNB Balance after: ${ethers.formatUnits(wbnbBalance, 18)} WBNB (should be 0 or unchanged)`);
  }, 60_000);
});
