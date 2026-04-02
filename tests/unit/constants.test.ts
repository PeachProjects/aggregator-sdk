/**
 * Unit tests for constants, preset configs, and enums.
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_SLIPPAGE_BPS,
  BPS_DENOMINATOR,
  DEFAULT_DEADLINE_SECONDS,
  API_DEFAULTS,
  BSC_MAINNET_CONFIG,
  BSC_TESTNET_CONFIG,
  ProtocolType,
  NATIVE_TOKEN_ADDRESS,
  isNativeTokenAddress,
} from '../../src';

describe('Constants', () => {
  describe('DEFAULT_SLIPPAGE_BPS', () => {
    it('should be 50 (0.5%)', () => {
      expect(DEFAULT_SLIPPAGE_BPS).toBe(50);
    });
  });

  describe('BPS_DENOMINATOR', () => {
    it('should be 10000n', () => {
      expect(BPS_DENOMINATOR).toBe(10000n);
    });
  });

  describe('DEFAULT_DEADLINE_SECONDS', () => {
    it('should be 1200 (20 minutes)', () => {
      expect(DEFAULT_DEADLINE_SECONDS).toBe(1200);
    });
  });

  describe('API_DEFAULTS', () => {
    it('should have correct default depth', () => {
      expect(API_DEFAULTS.depth).toBe(3);
    });

    it('should have correct default splitCount', () => {
      expect(API_DEFAULTS.splitCount).toBe(20);
    });

    it('should have correct default providers', () => {
      expect(API_DEFAULTS.providers).toEqual(['PANCAKEV2', 'PANCAKEV3', 'PANCAKE_INFINITY_CL', 'UNISWAPV3', 'UNISWAPV4', 'DODO', 'THENA']);
    });

    it('should have correct client version', () => {
      expect(API_DEFAULTS.clientVersion).toBe(1001500);
    });
  });
});

describe('Preset Configs', () => {
  describe('BSC_MAINNET_CONFIG', () => {
    it('should have correct chainId', () => {
      expect(BSC_MAINNET_CONFIG.chainId).toBe(56);
    });

    it('should have correct RPC URL', () => {
      expect(BSC_MAINNET_CONFIG.rpcUrl).toBe('https://bsc-dataseed.binance.org');
    });

    it('should not have hardcoded router address (from API)', () => {
      expect(BSC_MAINNET_CONFIG.routerAddress).toBeUndefined();
    });

    it('should have WBNB address', () => {
      expect(BSC_MAINNET_CONFIG.weth).toBe('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
    });

    it('should have empty adapters (from API)', () => {
      expect(BSC_MAINNET_CONFIG.adapters).toHaveLength(0);
    });
  });

  describe('BSC_TESTNET_CONFIG', () => {
    it('should have correct chainId', () => {
      expect(BSC_TESTNET_CONFIG.chainId).toBe(97);
    });

    it('should have testnet WBNB address', () => {
      expect(BSC_TESTNET_CONFIG.weth).toBe('0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd');
    });
  });
});

describe('NATIVE_TOKEN_ADDRESS', () => {
  it('should be the standard sentinel address', () => {
    expect(NATIVE_TOKEN_ADDRESS).toBe('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  });
});

describe('isNativeTokenAddress', () => {
  it('should return true for exact sentinel address', () => {
    expect(isNativeTokenAddress('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(true);
  });

  it('should return true for lowercase sentinel address', () => {
    expect(isNativeTokenAddress('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')).toBe(true);
  });

  it('should return true for uppercase sentinel address', () => {
    expect(isNativeTokenAddress('0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE')).toBe(true);
  });

  it('should return false for WBNB address', () => {
    expect(isNativeTokenAddress('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c')).toBe(false);
  });

  it('should return false for other addresses', () => {
    expect(isNativeTokenAddress('0x55d398326f99059fF775485246999027B3197955')).toBe(false);
  });

  it('should return false for zero address', () => {
    expect(isNativeTokenAddress('0x0000000000000000000000000000000000000000')).toBe(false);
  });
});

describe('ProtocolType', () => {
  it('should have PancakeV2', () => {
    expect(ProtocolType.PancakeV2).toBe('PancakeV2');
  });

  it('should have PancakeV3', () => {
    expect(ProtocolType.PancakeV3).toBe('PancakeV3');
  });

  it('should have UniswapV3', () => {
    expect(ProtocolType.UniswapV3).toBe('UniswapV3');
  });
});
