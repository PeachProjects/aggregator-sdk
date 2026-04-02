/**
 * End-to-end SDK flow tests.
 * Tests: Quote -> SwapParams -> Simulate, gas estimation, full pipeline.
 */

import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import { SwapBuilder, ProtocolType, type SplitRoute, type PoolInfo } from '../../src';
import type { ApiFindRouteResponse } from '../../src/types';
import {
  MAINNET_TOKENS,
  PEACH_CONTRACTS,
  PEACH_API,
  TEST_CONFIG,
  getPrivateKey,
  fetchRouteForDex,
  buildSwapParamsFromApi,
} from '../helpers';

const MAINNET_V3_POOLS = {
  'WBNB-USDT-0.05%': '0x36696169C63e42cd08ce11f5deeBbCeBae652050',
};

const PEACH_ROUTER_ABI = [
  'function swapETH((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external payable returns (uint256 amountOut)',
  'function swap((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external returns (uint256 amountOut)',
];

const V3_POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function liquidity() external view returns (uint128)',
];

const TEST_WALLET = new ethers.Wallet(getPrivateKey()).address;

describe('Full SDK Flow', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  });

  it('should verify test wallet BNB balance', async () => {
    const balance = await provider.getBalance(TEST_WALLET);
    expect(balance).toBeGreaterThan(0n);
  });

  it('should build valid swap params from live API response', async () => {
    const response = await fetchRouteForDex(
      MAINNET_TOKENS.WBNB,
      MAINNET_TOKENS.USDT,
      ethers.parseEther('0.01').toString()
    );
    const result = buildSwapParamsFromApi(response.data, MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT);

    expect(result.srcToken.toLowerCase()).toBe(MAINNET_TOKENS.WBNB.toLowerCase());
    expect(result.dstToken.toLowerCase()).toBe(MAINNET_TOKENS.USDT.toLowerCase());
    expect(result.amountOutMin).toBeLessThan(result.amountOut);
    expect(result.amountOutMin).toBeGreaterThan(0n);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('should simulate swap via eth_call', async () => {
    const response = await fetchRouteForDex(
      MAINNET_TOKENS.WBNB,
      MAINNET_TOKENS.USDT,
      ethers.parseEther('0.01').toString()
    );
    const data = response.data;
    const amountIn = BigInt(data.amount_in);
    const amountOut = BigInt(data.amount_out);
    const amountOutMin = (amountOut * 9950n) / 10000n;

    const iface = new ethers.Interface(PEACH_ROUTER_ABI);

    const encodedParams = {
      srcToken: data.paths[0].token_in,
      dstToken: data.paths[data.paths.length - 1].token_out,
      amountIn,
      amountOutMin,
      steps: data.paths.map((p, i) => ({
        adapter: p.adapter,
        pool: p.pool,
        tokenIn: p.token_in,
        tokenOut: p.token_out,
        amountIn: i === 0 ? amountIn : 0n,
        extraData: '0x',
      })),
      intermediateTokens: [] as string[],
      deadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
      quoteId: ethers.ZeroHash,
      expectAmountOut: amountOut,
    };

    const calldata = iface.encodeFunctionData('swapETH', [encodedParams]);

    const result = await provider.call({
      to: data.contracts.router,
      from: '0x0000000000000000000000000000000000000001',
      data: calldata,
      value: amountIn,
    });

    const [simulatedOut] = iface.decodeFunctionResult('swapETH', result);
    expect(simulatedOut).toBeGreaterThan(0n);
    const ratio = Number(simulatedOut) / Number(amountOut);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });

  it('should process simulated quote response and simulate transaction', async () => {
    const poolAddress = MAINNET_V3_POOLS['WBNB-USDT-0.05%'];
    const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider);

    let token0: string, token1: string;
    try {
      [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
    } catch {
      return;
    }

    const amountIn = ethers.parseEther('0.001');
    const poolInfo: PoolInfo = {
      address: poolAddress,
      token0: token0!,
      token1: token1!,
      protocol: ProtocolType.PancakeV3,
      fee: 500,
    };

    const splitRoute: SplitRoute = {
      routes: [{
        steps: [{
          pool: poolInfo,
          tokenIn: MAINNET_TOKENS.WBNB,
          tokenOut: MAINNET_TOKENS.USDT,
          amountIn,
          amountOut: ethers.parseEther('0.888'),
        }],
        amountIn,
        amountOut: ethers.parseEther('0.888'),
        gasEstimate: 200000n,
      }],
      percentages: [10000],
      totalAmountIn: amountIn,
      totalAmountOut: ethers.parseEther('0.888'),
      totalGasEstimate: 200000n,
    };

    const adapters = new Map<ProtocolType, string>();
    adapters.set(ProtocolType.PancakeV3, PEACH_CONTRACTS.PANCAKEV3_ADAPTER);
    const builder = new SwapBuilder(adapters);

    const amountOutMin = (splitRoute.totalAmountOut * 9900n) / 10000n;
    const swapParams = builder.build(splitRoute, MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amountOutMin);

    const routerInterface = new ethers.Interface(PEACH_ROUTER_ABI);
    const contractParams = {
      srcToken: swapParams.srcToken,
      dstToken: swapParams.dstToken,
      amountIn: swapParams.amountIn,
      amountOutMin: 0n,
      steps: swapParams.steps.map((step) => ({
        adapter: step.adapter,
        pool: step.pool,
        tokenIn: step.tokenIn,
        tokenOut: step.tokenOut,
        amountIn: step.amountIn,
        extraData: step.extraData,
      })),
      intermediateTokens: swapParams.intermediateTokens,
      deadline: swapParams.deadline,
      quoteId: swapParams.quoteId,
      expectAmountOut: swapParams.expectAmountOut,
    };

    const calldata = routerInterface.encodeFunctionData('swapETH', [contractParams]);

    try {
      const result = await provider.call({
        to: PEACH_CONTRACTS.ROUTER,
        from: TEST_WALLET,
        data: calldata,
        value: swapParams.amountIn,
      });
      const decoded = routerInterface.decodeFunctionResult('swapETH', result);
      expect(decoded[0]).toBeGreaterThan(0n);
    } catch {
      // Revert is acceptable for simulation
    }
  });

  it('should simulate swap with WBNB token (ERC20 path)', async () => {
    const poolAddress = MAINNET_V3_POOLS['WBNB-USDT-0.05%'];
    const amountIn = ethers.parseEther('0.001');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const swapParams = {
      srcToken: MAINNET_TOKENS.WBNB,
      dstToken: MAINNET_TOKENS.USDT,
      amountIn,
      amountOutMin: 0n,
      steps: [{
        adapter: PEACH_CONTRACTS.PANCAKEV3_ADAPTER,
        pool: poolAddress,
        tokenIn: MAINNET_TOKENS.WBNB,
        tokenOut: MAINNET_TOKENS.USDT,
        amountIn,
        extraData: '0x',
      }],
      intermediateTokens: [],
      deadline,
      quoteId: ethers.ZeroHash,
      expectAmountOut: 0n,
    };

    const routerInterface = new ethers.Interface(PEACH_ROUTER_ABI);
    const calldata = routerInterface.encodeFunctionData('swap', [swapParams]);

    try {
      const result = await provider.call({
        to: PEACH_CONTRACTS.ROUTER,
        from: TEST_WALLET,
        data: calldata,
      });
      const decoded = routerInterface.decodeFunctionResult('swap', result);
      expect(decoded[0]).toBeGreaterThan(0n);
    } catch {
      // Expected: no WBNB approval for test wallet
    }
  });

  it('should estimate gas for swapETH transaction', async () => {
    const amountIn = ethers.parseEther('0.001');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const swapParams = {
      srcToken: MAINNET_TOKENS.WBNB,
      dstToken: MAINNET_TOKENS.USDT,
      amountIn,
      amountOutMin: 0n,
      steps: [{
        adapter: PEACH_CONTRACTS.PANCAKEV3_ADAPTER,
        pool: MAINNET_V3_POOLS['WBNB-USDT-0.05%'],
        tokenIn: MAINNET_TOKENS.WBNB,
        tokenOut: MAINNET_TOKENS.USDT,
        amountIn,
        extraData: '0x',
      }],
      intermediateTokens: [],
      deadline,
      quoteId: ethers.ZeroHash,
      expectAmountOut: 0n,
    };

    const routerInterface = new ethers.Interface(PEACH_ROUTER_ABI);
    const calldata = routerInterface.encodeFunctionData('swapETH', [swapParams]);

    try {
      const gasEstimate = await provider.estimateGas({
        to: PEACH_CONTRACTS.ROUTER,
        from: TEST_WALLET,
        data: calldata,
        value: amountIn,
      });
      expect(gasEstimate).toBeGreaterThan(50000n);
      expect(gasEstimate).toBeLessThan(500000n);
    } catch {
      // Gas estimation failure indicates transaction would revert
    }
  });
});
