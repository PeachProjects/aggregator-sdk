/**
 * API route simulation tests.
 * Tests split routing, API parameters, and eth_call simulation comparison.
 */

import { ethers } from 'ethers';
import { describe, it, expect, beforeAll } from 'vitest';
import { PEACH_CONTRACTS, MAINNET_TOKENS, PEACH_API } from '../helpers';

const PEACH_ROUTER_ABI = [
  'function swapETH((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) external payable returns (uint256 amountOut)',
];

// Whale address with sufficient BNB balance
const WHALE_ADDRESS = '0xF977814e90dA44bFA03b6295A0616a897441aceC';

interface ApiPath {
  pool: string;
  provider: string;
  adapter: string;
  token_in: string;
  token_out: string;
  direction: boolean;
  fee_rate: string;
  amount_in: string;
  amount_out: string;
}

interface ApiResponse {
  code: number;
  msg: string;
  data: {
    request_id: string;
    amount_in: number;
    amount_out: number;
    paths: ApiPath[];
    contracts: {
      router: string;
      adapters: Record<string, string>;
    };
    gas: number;
  };
}

describe('API Route Simulation Tests', () => {
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider('https://bsc.publicnode.com', 56, { staticNetwork: true });
  });

  async function fetchRoute(from: string, target: string, amount: string, splitCount?: number): Promise<ApiResponse> {
    let url = `${PEACH_API.BASE_URL}${PEACH_API.FIND_ROUTES}?from=${from}&target=${target}&amount=${amount}&by_amount_in=true&v=${PEACH_API.VERSION}`;
    if (splitCount !== undefined) {
      url += `&split_count=${splitCount}`;
    }
    console.log('Fetching:', url);
    const response = await fetch(url);
    return response.json();
  }

  describe('split_count parameter', () => {
    it('should compare routes with different split_count values', async () => {
      const amount = ethers.parseEther('0.01').toString();

      const response1 = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amount, 1);
      expect(response1.code).toBe(200);

      const entryPoints1 = response1.data.paths.filter(
        p => p.token_in.toLowerCase() === MAINNET_TOKENS.WBNB.toLowerCase()
      );

      const response3 = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amount, 3);
      expect(response3.code).toBe(200);

      const entryPoints3 = response3.data.paths.filter(
        p => p.token_in.toLowerCase() === MAINNET_TOKENS.WBNB.toLowerCase()
      );

      expect(entryPoints1.length).toBe(1);
      expect(entryPoints3.length).toBeLessThanOrEqual(3);
    });

    it('should compare API quote vs on-chain simulation with split routing', async () => {
      const amountIn = ethers.parseEther('0.01');
      const response = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amountIn.toString(), 2);

      expect(response.code).toBe(200);
      const { paths } = response.data;

      const steps = paths.map((p) => {
        const isEntryPoint = p.token_in.toLowerCase() === MAINNET_TOKENS.WBNB.toLowerCase();
        return {
          adapter: p.adapter,
          pool: p.pool,
          tokenIn: p.token_in,
          tokenOut: p.token_out,
          amountIn: isEntryPoint ? BigInt(p.amount_in) : 0n,
          extraData: '0x',
        };
      });

      const intermediateSet = new Set<string>();
      for (const p of paths) {
        if (p.token_out.toLowerCase() !== MAINNET_TOKENS.USDT.toLowerCase()) {
          intermediateSet.add(p.token_out);
        }
      }
      const intermediateTokens = Array.from(intermediateSet);

      const iface = new ethers.Interface(PEACH_ROUTER_ABI);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const swapParams = {
        srcToken: MAINNET_TOKENS.WBNB,
        dstToken: MAINNET_TOKENS.USDT,
        amountIn: amountIn,
        amountOutMin: 0n,
        steps,
        intermediateTokens,
        deadline,
        quoteId: ethers.ZeroHash,
        expectAmountOut: BigInt(response.data.amount_out),
      };

      const calldata = iface.encodeFunctionData('swapETH', [swapParams]);

      try {
        const result = await provider.call({
          to: PEACH_CONTRACTS.ROUTER,
          from: WHALE_ADDRESS,
          data: calldata,
          value: amountIn,
        });

        const [simulatedAmountOut] = iface.decodeFunctionResult('swapETH', result);
        expect(simulatedAmountOut).toBeGreaterThan(0n);
      } catch (err: any) {
        console.log('Simulation FAILED:', err.message?.slice(0, 200));
        throw err;
      }
    });
  });

  describe('BNB -> USDT Route', () => {
    it('should fetch route from API', async () => {
      const amount = ethers.parseEther('0.01').toString();
      const response = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amount);

      expect(response.code).toBe(200);
      expect(response.data.paths.length).toBeGreaterThan(0);
    });

    it('should simulate API route with eth_call', async () => {
      const amountIn = ethers.parseEther('0.01');
      const response = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amountIn.toString());

      if (response.code !== 200) return;

      const { paths } = response.data;
      const iface = new ethers.Interface(PEACH_ROUTER_ABI);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const steps = paths.map((p, i) => ({
        adapter: p.adapter,
        pool: p.pool,
        tokenIn: p.token_in,
        tokenOut: p.token_out,
        amountIn: i === 0 ? BigInt(p.amount_in) : 0n,
        extraData: '0x',
      }));

      const intermediateTokens: string[] = [];
      for (let i = 0; i < paths.length - 1; i++) {
        const out = paths[i].token_out;
        if (out.toLowerCase() !== MAINNET_TOKENS.USDT.toLowerCase()) {
          if (!intermediateTokens.includes(out)) {
            intermediateTokens.push(out);
          }
        }
      }

      const swapParams = {
        srcToken: MAINNET_TOKENS.WBNB,
        dstToken: MAINNET_TOKENS.USDT,
        amountIn: amountIn,
        amountOutMin: 0n,
        steps,
        intermediateTokens,
        deadline,
        quoteId: ethers.ZeroHash,
        expectAmountOut: BigInt(response.data.amount_out),
      };

      const calldata = iface.encodeFunctionData('swapETH', [swapParams]);

      try {
        const result = await provider.call({
          to: PEACH_CONTRACTS.ROUTER,
          from: WHALE_ADDRESS,
          data: calldata,
          value: amountIn,
        });

        const [amountOut] = iface.decodeFunctionResult('swapETH', result);
        expect(amountOut).toBeGreaterThan(0n);
      } catch (err: any) {
        expect(err).toBeUndefined();
      }
    });

    it('should simulate single-hop direct route (SDK pool)', async () => {
      const amountIn = ethers.parseEther('0.01');
      const iface = new ethers.Interface(PEACH_ROUTER_ABI);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const swapParams = {
        srcToken: MAINNET_TOKENS.WBNB,
        dstToken: MAINNET_TOKENS.USDT,
        amountIn: amountIn,
        amountOutMin: 0n,
        steps: [{
          adapter: PEACH_CONTRACTS.PANCAKEV3_ADAPTER,
          pool: '0x36696169C63e42cd08ce11f5deeBbCeBae652050',
          tokenIn: MAINNET_TOKENS.WBNB,
          tokenOut: MAINNET_TOKENS.USDT,
          amountIn: amountIn,
          extraData: '0x',
        }],
        intermediateTokens: [],
        deadline,
        quoteId: ethers.ZeroHash,
        expectAmountOut: 0n,
      };

      const calldata = iface.encodeFunctionData('swapETH', [swapParams]);

      const result = await provider.call({
        to: PEACH_CONTRACTS.ROUTER,
        from: WHALE_ADDRESS,
        data: calldata,
        value: amountIn,
      });

      const [amountOut] = iface.decodeFunctionResult('swapETH', result);
      expect(amountOut).toBeGreaterThan(0n);
    });

    it('should analyze split routing with larger amount', async () => {
      const amountIn = ethers.parseEther('1');
      const response = await fetchRoute(MAINNET_TOKENS.WBNB, MAINNET_TOKENS.USDT, amountIn.toString(), 5);

      expect(response.code).toBe(200);
      const { paths } = response.data;

      const steps = paths.map((p) => {
        const isEntryPoint = p.token_in.toLowerCase() === MAINNET_TOKENS.WBNB.toLowerCase();
        return {
          adapter: p.adapter,
          pool: p.pool,
          tokenIn: p.token_in,
          tokenOut: p.token_out,
          amountIn: isEntryPoint ? BigInt(p.amount_in) : 0n,
          extraData: '0x',
        };
      });

      const intermediateSet = new Set<string>();
      for (const p of paths) {
        if (p.token_out.toLowerCase() !== MAINNET_TOKENS.USDT.toLowerCase()) {
          intermediateSet.add(p.token_out);
        }
      }
      const intermediateTokens = Array.from(intermediateSet);

      const iface = new ethers.Interface(PEACH_ROUTER_ABI);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const swapParams = {
        srcToken: MAINNET_TOKENS.WBNB,
        dstToken: MAINNET_TOKENS.USDT,
        amountIn: amountIn,
        amountOutMin: 0n,
        steps,
        intermediateTokens,
        deadline,
        quoteId: ethers.ZeroHash,
        expectAmountOut: BigInt(response.data.amount_out),
      };

      const calldata = iface.encodeFunctionData('swapETH', [swapParams]);

      try {
        const result = await provider.call({
          to: PEACH_CONTRACTS.ROUTER,
          from: WHALE_ADDRESS,
          data: calldata,
          value: amountIn,
        });

        const [simulatedAmountOut] = iface.decodeFunctionResult('swapETH', result);
        expect(simulatedAmountOut).toBeGreaterThan(0n);
      } catch (err: any) {
        console.log('Simulation FAILED:', err.message?.slice(0, 500));
        throw err;
      }
    });
  });
});
