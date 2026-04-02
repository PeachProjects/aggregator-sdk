/**
 * Unit tests for RouteDiscovery.
 */

import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';

import {
  RouteDiscovery,
  BSC_MAINNET_CONFIG,
} from '../../src';

describe('RouteDiscovery', () => {
  const mockProvider = {
    getNetwork: vi.fn().mockResolvedValue({ chainId: 56n }),
  } as unknown as ethers.Provider;

  describe('constructor', () => {
    it('should create RouteDiscovery instance', () => {
      const discovery = new RouteDiscovery(mockProvider, BSC_MAINNET_CONFIG);
      expect(discovery).toBeInstanceOf(RouteDiscovery);
    });
  });

  describe('clearCache', () => {
    it('should clear pool cache', () => {
      const discovery = new RouteDiscovery(mockProvider, BSC_MAINNET_CONFIG);
      expect(() => discovery.clearCache()).not.toThrow();
    });
  });
});
