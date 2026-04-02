/**
 * Decode Peach Aggregator swap calldata to identify steps and find zero addresses.
 * Use this to debug TARGET_IS_ZERO errors - pass transaction.data from the error.
 *
 * Usage:
 *   import { decodeSwapCalldata } from './helpers/decode-swap-calldata';
 *   decodeSwapCalldata(error.transaction?.data);
 */

import { ethers } from 'ethers';

const PEACH_SWAP_ABI = [
  'function swap((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params)',
  'function swapETH((address srcToken, address dstToken, uint256 amountIn, uint256 amountOutMin, (address adapter, address pool, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps, address[] intermediateTokens, uint256 deadline, bytes32 quoteId, uint256 expectAmountOut) params) payable',
];

const iface = new ethers.Interface(PEACH_SWAP_ABI);
const ZERO = ethers.ZeroAddress.toLowerCase();

export interface DecodedStep {
  index: number;
  adapter: string;
  pool: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  hasZero: boolean;
  zeroFields: string[];
}

export function decodeSwapCalldata(
  data: string | undefined
): { method: string; params: unknown; steps: DecodedStep[]; zeroSteps: DecodedStep[] } | null {
  if (!data || !data.startsWith('0x')) return null;

  const selector = data.slice(0, 10);
  let decoded: { name: string; args: unknown[] };

  try {
    if (selector === iface.getFunction('swap')!.selector) {
      decoded = iface.parseTransaction({ data }) as { name: string; args: unknown[] };
    } else if (selector === iface.getFunction('swapETH')!.selector) {
      decoded = iface.parseTransaction({ data }) as { name: string; args: unknown[] };
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const params = decoded.args[0] as {
    srcToken: string;
    dstToken: string;
    amountIn: bigint;
    steps: Array<{ adapter: string; pool: string; tokenIn: string; tokenOut: string; amountIn: bigint }>;
  };

  const steps: DecodedStep[] = (params.steps || []).map((s: { adapter: string; pool: string; tokenIn: string; tokenOut: string; amountIn: bigint }, i: number) => {
    const zeroFields: string[] = [];
    if (s.adapter?.toLowerCase() === ZERO) zeroFields.push('adapter');
    if (s.pool?.toLowerCase() === ZERO) zeroFields.push('pool');
    if (s.tokenIn?.toLowerCase() === ZERO) zeroFields.push('tokenIn');
    if (s.tokenOut?.toLowerCase() === ZERO) zeroFields.push('tokenOut');
    return {
      index: i,
      adapter: s.adapter,
      pool: s.pool,
      tokenIn: s.tokenIn,
      tokenOut: s.tokenOut,
      amountIn: s.amountIn,
      hasZero: zeroFields.length > 0,
      zeroFields,
    };
  });

  const zeroSteps = steps.filter((s) => s.hasZero);

  return { method: decoded.name, params, steps, zeroSteps };
}

export function printDecodedSwapCalldata(data: string | undefined): void {
  const r = decodeSwapCalldata(data);
  if (!r) {
    console.log('Could not decode calldata');
    return;
  }
  console.log('Method:', r.method);
  console.log('Steps:');
  for (const s of r.steps) {
    const flag = s.hasZero ? ' [ZERO!]' : '';
    console.log(`  [${s.index}] pool=${s.pool} adapter=${s.adapter} in=${s.tokenIn?.slice(0, 10)}... out=${s.tokenOut?.slice(0, 10)}... amount=${s.amountIn}${flag}`);
    if (s.zeroFields.length) console.log(`       zero fields: ${s.zeroFields.join(', ')}`);
  }
  if (r.zeroSteps.length) {
    console.log('Steps with zero address (likely TARGET_IS_ZERO):', r.zeroSteps.map((s) => s.index));
  }
}
