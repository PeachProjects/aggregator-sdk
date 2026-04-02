/**
 * Unit tests for SwapBuilder.
 */

import { describe, it, expect } from 'vitest';

import {
  SwapBuilder,
  ProtocolType,
  type SplitRoute,
} from '../../src';

describe('SwapBuilder', () => {
  const adapters = new Map<ProtocolType, string>([
    [ProtocolType.PancakeV3, '0xV3Adapter'],
    [ProtocolType.PancakeV2, '0xV2Adapter'],
  ]);

  const builder = new SwapBuilder(adapters);

  describe('build', () => {
    it('should build swap params from single route', () => {
      const splitRoute: SplitRoute = {
        routes: [{
          steps: [{
            pool: {
              address: '0xPool1',
              token0: '0xTokenA',
              token1: '0xTokenB',
              protocol: ProtocolType.PancakeV3,
              fee: 500,
            },
            tokenIn: '0xTokenA',
            tokenOut: '0xTokenB',
            amountIn: 1000000n,
            amountOut: 950000n,
          }],
          amountIn: 1000000n,
          amountOut: 950000n,
          gasEstimate: 150000n,
        }],
        percentages: [10000],
        totalAmountIn: 1000000n,
        totalAmountOut: 950000n,
        totalGasEstimate: 150000n,
      };

      const result = builder.build(
        splitRoute,
        '0xTokenA',
        '0xTokenB',
        900000n
      );

      expect(result.srcToken).toBe('0xTokenA');
      expect(result.dstToken).toBe('0xTokenB');
      expect(result.amountIn).toBe(1000000n);
      expect(result.amountOutMin).toBe(900000n);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].adapter).toBe('0xV3Adapter');
      expect(result.steps[0].pool).toBe('0xPool1');
      expect(result.intermediateTokens).toHaveLength(0);
    });

    it('should build swap params with multi-hop route', () => {
      const splitRoute: SplitRoute = {
        routes: [{
          steps: [
            {
              pool: { address: '0xPool1', token0: '0xTokenA', token1: '0xTokenB', protocol: ProtocolType.PancakeV3, fee: 500 },
              tokenIn: '0xTokenA',
              tokenOut: '0xTokenB',
              amountIn: 1000000n,
              amountOut: 950000n,
            },
            {
              pool: { address: '0xPool2', token0: '0xTokenB', token1: '0xTokenC', protocol: ProtocolType.PancakeV3, fee: 500 },
              tokenIn: '0xTokenB',
              tokenOut: '0xTokenC',
              amountIn: 950000n,
              amountOut: 900000n,
            },
          ],
          amountIn: 1000000n,
          amountOut: 900000n,
          gasEstimate: 300000n,
        }],
        percentages: [10000],
        totalAmountIn: 1000000n,
        totalAmountOut: 900000n,
        totalGasEstimate: 300000n,
      };

      const result = builder.build(
        splitRoute,
        '0xTokenA',
        '0xTokenC',
        850000n
      );

      expect(result.steps).toHaveLength(2);
      expect(result.intermediateTokens).toContain('0xTokenB');
    });

    it('should throw error for unsupported protocol', () => {
      const limitedAdapters = new Map<ProtocolType, string>();
      const limitedBuilder = new SwapBuilder(limitedAdapters);

      const splitRoute: SplitRoute = {
        routes: [{
          steps: [{
            pool: { address: '0xPool', token0: '0xA', token1: '0xB', protocol: ProtocolType.PancakeV3 },
            tokenIn: '0xA',
            tokenOut: '0xB',
            amountIn: 1000n,
            amountOut: 900n,
          }],
          amountIn: 1000n,
          amountOut: 900n,
          gasEstimate: 100000n,
        }],
        percentages: [10000],
        totalAmountIn: 1000n,
        totalAmountOut: 900n,
        totalGasEstimate: 100000n,
      };

      expect(() => limitedBuilder.build(splitRoute, '0xA', '0xB', 800n)).toThrow('No adapter for protocol');
    });
  });
});

describe('SwapBuilder Edge Cases', () => {
  const adapters = new Map<ProtocolType, string>([
    [ProtocolType.PancakeV3, '0xV3Adapter'],
    [ProtocolType.PancakeV2, '0xV2Adapter'],
  ]);

  const builder = new SwapBuilder(adapters);

  it('should handle split routes with multiple percentages', () => {
    const splitRoute: SplitRoute = {
      routes: [
        {
          steps: [{
            pool: { address: '0xPool1', token0: '0xA', token1: '0xB', protocol: ProtocolType.PancakeV3 },
            tokenIn: '0xA',
            tokenOut: '0xB',
            amountIn: 500000n,
            amountOut: 475000n,
          }],
          amountIn: 500000n,
          amountOut: 475000n,
          gasEstimate: 150000n,
        },
        {
          steps: [{
            pool: { address: '0xPool2', token0: '0xA', token1: '0xB', protocol: ProtocolType.PancakeV3 },
            tokenIn: '0xA',
            tokenOut: '0xB',
            amountIn: 500000n,
            amountOut: 480000n,
          }],
          amountIn: 500000n,
          amountOut: 480000n,
          gasEstimate: 150000n,
        },
      ],
      percentages: [5000, 5000],
      totalAmountIn: 1000000n,
      totalAmountOut: 955000n,
      totalGasEstimate: 300000n,
    };

    const result = builder.build(
      splitRoute,
      '0xA',
      '0xB',
      900000n
    );

    expect(result.amountIn).toBe(1000000n);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('should encode extra data correctly for V2', () => {
    const splitRoute: SplitRoute = {
      routes: [{
        steps: [{
          pool: { address: '0xPool', token0: '0xA', token1: '0xB', protocol: ProtocolType.PancakeV2 },
          tokenIn: '0xA',
          tokenOut: '0xB',
          amountIn: 1000n,
          amountOut: 900n,
        }],
        amountIn: 1000n,
        amountOut: 900n,
        gasEstimate: 60000n,
      }],
      percentages: [10000],
      totalAmountIn: 1000n,
      totalAmountOut: 900n,
      totalGasEstimate: 60000n,
    };

    const result = builder.build(splitRoute, '0xA', '0xB', 800n);
    expect(result.steps[0].extraData).toBe('0x');
  });

  it('should set deadline correctly', () => {
    const now = Math.floor(Date.now() / 1000);
    const splitRoute: SplitRoute = {
      routes: [{
        steps: [{
          pool: { address: '0xPool', token0: '0xA', token1: '0xB', protocol: ProtocolType.PancakeV3 },
          tokenIn: '0xA',
          tokenOut: '0xB',
          amountIn: 1000n,
          amountOut: 900n,
        }],
        amountIn: 1000n,
        amountOut: 900n,
        gasEstimate: 120000n,
      }],
      percentages: [10000],
      totalAmountIn: 1000n,
      totalAmountOut: 900n,
      totalGasEstimate: 120000n,
    };

    const result = builder.build(splitRoute, '0xA', '0xB', 800n, 3600);

    expect(Number(result.deadline)).toBeGreaterThan(now);
    expect(Number(result.deadline)).toBeLessThanOrEqual(now + 3600 + 1);
  });
});
