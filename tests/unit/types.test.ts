/**
 * Unit tests for type export verification.
 */

import { describe, it, expect } from 'vitest';

import {
  BSC_MAINNET_CONFIG,
  ProtocolType,
  type Quote,
  type SwapParams,
  type Provider,
  type PeachConfig,
  type PoolInfo,
} from '../../src';

describe('Type Exports', () => {
  it('should export Quote type', () => {
    const quote: Quote = {
      srcToken: '0xA',
      dstToken: '0xB',
      amountIn: 1000n,
      amountOut: 900n,
      amountOutMin: 850n,
      priceImpact: 0.01,
      route: {
        routes: [],
        percentages: [],
        totalAmountIn: 1000n,
        totalAmountOut: 900n,
        totalGasEstimate: 100000n,
      },
      params: {
        srcToken: '0xA',
        dstToken: '0xB',
        amountIn: 1000n,
        amountOutMin: 850n,
        steps: [],
        intermediateTokens: [],
        deadline: BigInt(Date.now() + 3600),
      },
      gasEstimate: 100000n,
    };
    expect(quote).toBeDefined();
  });

  it('should export SwapParams type', () => {
    const params: SwapParams = {
      srcToken: '0xA',
      dstToken: '0xB',
      amountIn: 1000n,
      amountOutMin: 900n,
      steps: [],
      intermediateTokens: [],
      deadline: BigInt(Date.now() + 3600),
    };
    expect(params).toBeDefined();
  });

  it('should export Provider type', () => {
    const provider: Provider = 'PANCAKEV3';
    expect(provider).toBe('PANCAKEV3');
  });

  it('should export PeachConfig type', () => {
    const config: PeachConfig = BSC_MAINNET_CONFIG;
    expect(config.chainId).toBe(56);
  });

  it('should export PoolInfo type', () => {
    const pool: PoolInfo = {
      address: '0xPool',
      token0: '0xA',
      token1: '0xB',
      protocol: ProtocolType.PancakeV3,
    };
    expect(pool).toBeDefined();
  });
});
