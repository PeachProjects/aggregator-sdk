/**
 * Live API route fetching tests.
 * Tests the Peach API independently of specific DEXes.
 */

import { ethers } from 'ethers';
import { describe, it, expect } from 'vitest';
import type { ApiFindRouteResponse, ApiFindRouteData } from '../../src/types';
import { MAINNET_TOKENS, PEACH_CONTRACTS, PEACH_API } from '../helpers';

const BSC_TOKENS = {
  WBNB: MAINNET_TOKENS.WBNB.toLowerCase(),
  USDT: MAINNET_TOKENS.USDT.toLowerCase(),
};

async function fetchRoute(
  from: string,
  target: string,
  amount: string
): Promise<ApiFindRouteResponse> {
  const params = new URLSearchParams({
    from,
    target,
    amount,
    by_amount_in: 'true',
    v: PEACH_API.VERSION,
  });
  const url = `${PEACH_API.BASE_URL}${PEACH_API.FIND_ROUTES}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

describe('Live API Tests', () => {
  describe('Status Endpoint', () => {
    it('should return healthy status', async () => {
      const res = await fetch(`${PEACH_API.BASE_URL}${PEACH_API.STATUS}`);
      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json.code).toBe(200);
      expect(json.data.providers).toContain('PANCAKEV3');
    });
  });

  describe('Find Routes: BNB -> USDT (1 BNB)', () => {
    let response: ApiFindRouteResponse;
    let data: ApiFindRouteData;

    it('should return valid response structure', async () => {
      response = await fetchRoute(
        MAINNET_TOKENS.WBNB,
        MAINNET_TOKENS.USDT,
        ethers.parseEther('1').toString()
      );
      data = response.data;

      expect(response.code).toBe(200);
      expect(response.msg).toBe('Success');
      expect(data).toBeDefined();
      expect(data.request_id).toBeDefined();
      expect(data.request_id.length).toBeGreaterThan(0);
    });

    it('should return correct amounts', () => {
      expect(data.amount_in).toBe(1000000000000000000);
      expect(data.amount_out).toBeGreaterThan(0);
    });

    it('should have valid paths', () => {
      expect(data.paths.length).toBeGreaterThan(0);
      const path = data.paths[0];
      expect(path.pool).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(path.provider).toBe('PANCAKEV3');
      expect(path.adapter).toBe(PEACH_CONTRACTS.PANCAKEV3_ADAPTER);
      expect(path.token_in.toLowerCase()).toBe(BSC_TOKENS.WBNB);
      expect(path.token_out.toLowerCase()).toBe(BSC_TOKENS.USDT);
      expect(parseFloat(path.fee_rate)).toBeGreaterThan(0);
    });

    it('should return correct contract addresses', () => {
      expect(data.contracts.router).toBe(PEACH_CONTRACTS.ROUTER);
      expect(data.contracts.adapters['PANCAKEV3']).toBe(PEACH_CONTRACTS.PANCAKEV3_ADAPTER);
    });

    it('should have consistent path amounts', () => {
      const totalPathIn = data.paths.reduce((sum, p) => sum + p.amount_in, 0);
      const totalPathOut = data.paths.reduce((sum, p) => sum + p.amount_out, 0);
      expect(totalPathIn).toBe(data.amount_in);
      expect(totalPathOut).toBe(data.amount_out);
    });

    it('should have valid gas estimate', () => {
      expect(data.gas).toBeGreaterThan(0);
      expect(data.gas).toBeLessThan(5000000);
    });
  });

  describe('Find Routes: BNB -> USDT (small amount)', () => {
    it('should find route for 0.01 BNB', async () => {
      const response = await fetchRoute(
        MAINNET_TOKENS.WBNB,
        MAINNET_TOKENS.USDT,
        ethers.parseEther('0.01').toString()
      );
      expect(response.code).toBe(200);
      expect(response.data.amount_in).toBe(10000000000000000);
      expect(response.data.amount_out).toBeGreaterThan(0);
      expect(response.data.paths[0].token_in.toLowerCase()).toBe(BSC_TOKENS.WBNB);
      expect(response.data.paths[0].token_out.toLowerCase()).toBe(BSC_TOKENS.USDT);
    });
  });

  describe('Find Routes: BNB -> USDC', () => {
    it('should find BNB to USDC route', async () => {
      const response = await fetchRoute(
        MAINNET_TOKENS.WBNB,
        MAINNET_TOKENS.USDC,
        ethers.parseEther('0.1').toString()
      );
      expect(response.code).toBe(200);
      expect(response.data.amount_out).toBeGreaterThan(0);
      expect(response.data.paths.length).toBeGreaterThan(0);
    });
  });
});
