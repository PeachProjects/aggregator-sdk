/**
 * Contract verification tests.
 * Verifies PeachRouter, adapters deployment and registration on-chain.
 */

import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  MAINNET_TOKENS,
  PEACH_CONTRACTS,
  TEST_CONFIG,
  checkAdapterDeployed,
  checkAdapterRegistered,
} from '../helpers';

describe('Contract Verification', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(TEST_CONFIG.RPC_URL);
  });

  it('should verify PeachRouter is deployed on mainnet', async () => {
    const code = await provider.getCode(PEACH_CONTRACTS.ROUTER);
    expect(code).not.toBe('0x');
    expect(code.length).toBeGreaterThan(2);
  });

  it('should verify PancakeV3Adapter is deployed on mainnet', async () => {
    const deployed = await checkAdapterDeployed(PEACH_CONTRACTS.PANCAKEV3_ADAPTER, provider);
    expect(deployed).toBe(true);
  });

  it('should verify PancakeV2Adapter is deployed on mainnet', async () => {
    const deployed = await checkAdapterDeployed(PEACH_CONTRACTS.PANCAKEV2_ADAPTER, provider);
    expect(deployed).toBe(true);
  });

  it('should verify WETH address in router matches WBNB', async () => {
    const router = new ethers.Contract(
      PEACH_CONTRACTS.ROUTER,
      ['function WETH() external view returns (address)'],
      provider
    );
    const weth = await router.WETH();
    expect(weth.toLowerCase()).toBe(MAINNET_TOKENS.WBNB.toLowerCase());
  });

  it('should verify PancakeV3Adapter is registered', async () => {
    const registered = await checkAdapterRegistered(PEACH_CONTRACTS.PANCAKEV3_ADAPTER, provider);
    expect(registered).toBe(true);
  });

  it('should verify PancakeV2Adapter is registered in router', async () => {
    const registered = await checkAdapterRegistered(PEACH_CONTRACTS.PANCAKEV2_ADAPTER, provider);
    expect(registered).toBe(true);
  });
});
